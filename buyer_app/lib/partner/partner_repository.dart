import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'partner_models.dart';

/// Gestion des produits par un partenaire connecté — mêmes tables, RPC et règles
/// que la page Produits du web (services/supabase/products.ts, storage.ts).
///
/// La RLS `products_manage` (migration 118) s'appuie sur l'établissement ACTIF de
/// l'utilisateur (users.business_id) et son rôle (manager, admin, owner) :
/// [activate] bascule dessus avant toute écriture.
class PartnerRepository {
  PartnerRepository(this._db);

  final SupabaseClient _db;

  static const _productColumns =
      'id, name, description, price, image_url, category_id, track_stock, stock, '
      'is_active, variants, category:categories(id, name)';

  /// Établissements où l'utilisateur peut gérer les produits.
  Future<List<PartnerBusiness>> myBusinesses() async {
    final rows = await _db.rpc('get_my_businesses');
    return (rows as List)
        .whereType<Map>()
        .map((r) => PartnerBusiness.fromJson(Map<String, dynamic>.from(r)))
        .toList();
  }

  /// Rend [businessId] actif pour la RLS (switch_business), seulement s'il ne l'est pas
  /// déjà : le changement s'applique aussi au web et à la caisse de ce compte.
  Future<void> activate(String businessId) async {
    final uid = _db.auth.currentUser?.id;
    if (uid == null) throw const AuthException('Session expirée');
    final row = await _db.from('users').select('business_id').eq('id', uid).maybeSingle();
    if (row?['business_id'] == businessId) return;
    await _db.rpc('switch_business', params: {'p_business_id': businessId});
  }

  /// Tous les produits, y compris ceux masqués de la boutique.
  Future<List<PartnerProduct>> products(String businessId) async {
    final rows = await _db
        .from('products')
        .select(_productColumns)
        .eq('business_id', businessId)
        .order('name', ascending: true);
    return rows.map(PartnerProduct.fromJson).toList();
  }

  Future<List<PartnerCategory>> categories(String businessId) async {
    final rows = await _db
        .from('categories')
        .select('id, name')
        .eq('business_id', businessId)
        .order('sort_order', ascending: true);
    return rows.map(PartnerCategory.fromJson).toList();
  }

  Future<PartnerProduct> create(String businessId, ProductDraft draft) async {
    final row = await _db
        .from('products')
        .insert({...draft.toJson(), 'business_id': businessId})
        .select(_productColumns)
        .single();
    final created = PartnerProduct.fromJson(row);
    _log(businessId, 'product.created', created.id, {'name': created.name, 'price': created.price});
    return created;
  }

  /// Met à jour le produit ; une correction de stock d'un produit déjà suivi passe
  /// aussi en comptabilité (record_stock_adjustment), comme sur le web.
  Future<PartnerProduct> update(String businessId, PartnerProduct before, ProductDraft draft) async {
    final rows = await _db
        .from('products')
        .update({...draft.toJson(), 'updated_at': DateTime.now().toUtc().toIso8601String()})
        .eq('id', before.id)
        .select(_productColumns);
    if (rows.isEmpty) {
      throw const PartnerException('Modification refusée : vérifiez vos droits sur cette boutique.');
    }
    final updated = PartnerProduct.fromJson(rows.first);

    final changes = <String, Object?>{};
    if (before.price != updated.price) changes['price'] = {'from': before.price, 'to': updated.price};
    if (before.stock != updated.stock) changes['stock'] = {'from': before.stock, 'to': updated.stock};
    if (before.trackStock != updated.trackStock) {
      changes['track_stock'] = {'from': before.trackStock, 'to': updated.trackStock};
    }
    _log(businessId, 'product.updated', updated.id, {
      'name': updated.name,
      'fields': draft.toJson().keys.toList(),
      'changes': changes,
      'source': 'elm_boutique_app',
    });

    // Premier renseignement du stock = solde d'ouverture, pas une variation
    final adjusted = before.trackStock && before.stock != null && before.stock != updated.stock;
    if (adjusted) {
      try {
        await _db.rpc('record_stock_adjustment', params: {
          'p_product_id': updated.id,
          'p_qty_before': before.stock ?? 0,
          'p_qty_after': updated.stock ?? 0,
          'p_reason': 'Correction depuis l’app ELM Boutique',
        });
      } catch (_) {
        // Le produit est enregistré ; l'écriture comptable manquante reste visible côté web
      }
    }
    return updated;
  }

  /// Masquer / réafficher dans la boutique (is_active, comme l'archivage du web).
  Future<void> setVisible(String businessId, PartnerProduct product, bool visible) async {
    final rows = await _db
        .from('products')
        .update({'is_active': visible, 'updated_at': DateTime.now().toUtc().toIso8601String()})
        .eq('id', product.id)
        .select('id');
    if (rows.isEmpty) {
      throw const PartnerException('Modification refusée : vérifiez vos droits sur cette boutique.');
    }
    _log(
      businessId,
      visible ? 'product.updated' : 'product.deleted',
      product.id,
      {
        'name': product.name,
        if (visible) 'fields': ['is_active'],
        if (visible) 'changes': {'is_active': {'from': false, 'to': true}},
      },
    );
  }

  /// Photo produit dans le bucket public product-images, même chemin que le web.
  Future<String> uploadImage(String businessId, Uint8List bytes, String extension) async {
    final ext = extension.toLowerCase().replaceAll('jpeg', 'jpg');
    final path = '$businessId/${DateTime.now().millisecondsSinceEpoch}.$ext';
    await _db.storage.from('product-images').uploadBinary(
          path,
          bytes,
          fileOptions: FileOptions(upsert: true, contentType: ext == 'png' ? 'image/png' : 'image/jpeg'),
        );
    return _db.storage.from('product-images').getPublicUrl(path);
  }

  /// Journal d'activité (activity_logs), sans jamais bloquer l'écran.
  void _log(String businessId, String action, String entityId, Map<String, Object?> metadata) {
    final user = _db.auth.currentUser;
    _db
        .from('activity_logs')
        .insert({
          'business_id': businessId,
          'user_id': user?.id,
          'user_name': user?.userMetadata?['full_name'],
          'action': action,
          'entity_type': 'product',
          'entity_id': entityId,
          'metadata': metadata,
        })
        .then((_) {}, onError: (_) {});
  }
}

class PartnerException implements Exception {
  const PartnerException(this.message);

  final String message;

  @override
  String toString() => message;
}
