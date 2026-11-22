import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import 'partner_models.dart';

/// Gestion des produits par un partenaire connecté — mêmes tables, RPC et règles
/// que la page Produits du web (services/supabase/products.ts, storage.ts).
///
/// La RLS `products_manage` (migration 118) s'appuie sur l'établissement ACTIF de
/// l'utilisateur (users.business_id) et son rôle (manager, admin, owner) :
/// [activate] bascule dessus avant toute écriture.
/// Refus renvoyé par une RPC partenaire (`{error, message}`) au lieu d'une
/// exception SQL — code client inconnu/expiré, trop d'essais, numéro à vérifier.
class PartnerActionError implements Exception {
  const PartnerActionError(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => message;
}

class PartnerRepository {
  PartnerRepository(this._db);

  /// Les RPC du code client renvoient leurs refus au lieu de les lever : une
  /// exception annulerait le compteur anti force brute côté serveur.
  static Map<String, dynamic> _checked(dynamic data) {
    final map = Map<String, dynamic>.from(data as Map);
    final code = map['error'];
    if (code != null) {
      throw PartnerActionError('$code', '${map['message'] ?? 'Action refusée.'}');
    }
    return map;
  }

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

  /// Crée la boutique du compte inscrit depuis l'app — mêmes RPC que l'onboarding web
  /// (secteur « boutique »), sans données de démonstration : la boutique part vide,
  /// rien de fictif n'apparaît dans l'annuaire public.
  Future<void> createBoutique(String name) async {
    final businessId = await _db.rpc('create_business_v2', params: {'p_name': name.trim(), 'p_sector': 'boutique'});
    await _db.rpc('activate_trial_v2', params: {'p_biz_id': businessId});
    // Finalise l'onboarding : déclenche l'email de bienvenue, comme sur le web
    await _db.from('businesses').update({'onboarding_done': true}).eq('id', '$businessId');
    await _db.auth.refreshSession();
  }

  /// Demande de suppression du compte (migration 176), traitée par l'équipe ELM.
  Future<void> requestAccountDeletion(String? reason) async {
    await _db.rpc('request_account_deletion', params: {'p_reason': reason});
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

  // ── Code client scanné au comptoir (migration 178) ─────────────────────────

  /// Code scanné ou saisi → client déclaré et ordres ouverts avec son numéro.
  Future<ScannedClient> resolveClientCode(String businessId, String code) async {
    final data = await _db.rpc('partner_resolve_client_code', params: {'p_business_id': businessId, 'p_code': code});
    return ScannedClient.fromJson(code, _checked(data));
  }

  /// Ordres ouverts par numéro d'OT, nom, téléphone ou référence.
  Future<List<OpenServiceOrder>> searchServiceOrders(String businessId, String query) async {
    final data = await _db.rpc('partner_search_service_orders', params: {'p_business_id': businessId, 'p_query': query});
    return (data as List).whereType<Map>().map((e) => OpenServiceOrder.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  /// Lie l'app du client à (boutique, [phone]). [fixOrderIds] : ordres dont le
  /// numéro est corrigé en [phone]. [identityChecked] : le technicien confirme avoir
  /// vérifié l'identité du client — toujours exigé par le serveur (un ordre ouvert
  /// à ce numéro ne prouve rien, le numéro est déclaré). Envoie ensuite la
  /// notification « App liée ».
  Future<ClientLinkResult> linkClientApp(
    String businessId,
    String code,
    String phone, {
    List<String> fixOrderIds = const [],
    bool identityChecked = false,
  }) async {
    final data = await _db.rpc('partner_link_client_app', params: {
      'p_business_id': businessId,
      'p_code': code,
      'p_phone': phone,
      'p_fix_order_ids': fixOrderIds,
      'p_identity_checked': identityChecked,
    });
    final result = ClientLinkResult.fromJson(_checked(data));
    await _notifyLinked(result.linkId);
    return result;
  }

  Future<void> _notifyLinked(String linkId) async {
    final token = _db.auth.currentSession?.accessToken;
    if (token == null) return;
    try {
      await http
          .post(
            Uri.parse('${AppConfig.siteUrl}/api/client-app/linked'),
            headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
            body: jsonEncode({'linkId': linkId}),
          )
          .timeout(const Duration(seconds: 10));
    } catch (_) {
      // La liaison est faite ; seule la notification de confirmation manque
    }
  }

  // ── Catégories ──────────────────────────────────────────────────────────

  /// Nouvelle catégorie en fin de liste (RLS : admin / owner de l'établissement actif).
  Future<PartnerCategory> createCategory(String businessId, String name, int sortOrder) async {
    final rows = await _db
        .from('categories')
        .insert({'business_id': businessId, 'name': name.trim(), 'sort_order': sortOrder})
        .select('id, name');
    if (rows.isEmpty) {
      throw const PartnerException('Création refusée : seul le propriétaire ou un administrateur peut ajouter une catégorie.');
    }
    return PartnerCategory.fromJson(rows.first);
  }

  // ── Commandes en ligne (boutique web + app) ────────────────────────────────

  static const _orderColumns =
      'id, created_at, status, total, amount_paid, customer_name, customer_phone, '
      'delivery_address, delivery_type, delivery_status, notes, '
      'items:order_items(name, quantity, price, total)';

  /// Commandes passées sur la boutique en ligne, les plus récentes d'abord —
  /// même filtre que l'onglet « En ligne » de /orders (source = boutique).
  Future<List<PartnerOrder>> boutiqueOrders(String businessId, {int limit = 100}) async {
    final rows = await _db
        .from('orders')
        .select(_orderColumns)
        .eq('business_id', businessId)
        .eq('source', 'boutique')
        .order('created_at', ascending: false)
        .limit(limit);
    return rows.map(PartnerOrder.fromJson).toList();
  }

  Future<PartnerOrder?> boutiqueOrder(String orderId) async {
    final row = await _db.from('orders').select(_orderColumns).eq('id', orderId).maybeSingle();
    return row == null ? null : PartnerOrder.fromJson(row);
  }

  /// Encaisse le solde (complete_order_payment, migration 174) : la commande passe
  /// « payée » quand le total est atteint.
  Future<void> collectOrderPayment(PartnerOrder order, String method) async {
    await _db.rpc('complete_order_payment', params: {
      'p_order_id': order.id,
      'p_method': method,
      'p_amount': order.balanceDue,
    });
  }

  /// Remise au client : retirée en boutique ou livrée (confirm_order_delivery).
  Future<void> confirmHandOver(String orderId) async {
    final uid = _db.auth.currentUser?.id;
    if (uid == null) throw const AuthException('Session expirée');
    await _db.rpc('confirm_order_delivery', params: {'p_order_id': orderId, 'p_delivered_by': uid});
  }

  /// Annulation : stock restitué, coupons libérés (cancel_order, migration 174).
  Future<void> cancelOrder(String orderId) async {
    await _db.rpc('cancel_order', params: {'p_order_id': orderId});
  }

  // ── Ordres de travail (module Prestations) ─────────────────────────────────

  /// Ordres non clôturés (ni payés ni annulés), plus anciens d'abord : la file d'attente.
  Future<List<PartnerServiceOrder>> openServiceOrders(String businessId) async {
    final rows = await _db
        .from('service_orders')
        .select('*, items:service_order_items(name, quantity)')
        .eq('business_id', businessId)
        .inFilter('status', ['attente', 'en_cours', 'pause', 'termine'])
        .order('created_at', ascending: true)
        .limit(200);
    return rows.map(PartnerServiceOrder.fromJson).toList();
  }

  /// Change le statut (horodatage par le trigger SQL), journalise et prévient le
  /// client (Web Push + app liée), comme OrderDetailPanel sur le web.
  Future<void> setServiceOrderStatus(String businessId, PartnerServiceOrder order, String status) async {
    final rows = await _db.from('service_orders').update({'status': status}).eq('id', order.id).select('id');
    if (rows.isEmpty) {
      throw const PartnerException('Modification refusée : vérifiez vos droits sur cet établissement.');
    }
    _log(
      businessId,
      status == 'annule' ? 'service_order.cancelled' : 'service_order.status_updated',
      order.id,
      {'order_number': order.orderNumber, 'status': status, 'source': 'elm_boutique_app'},
      entityType: 'service_order',
    );
    unawaited(_notifyServiceOrderClient(order.id));
  }

  Future<void> _notifyServiceOrderClient(String serviceOrderId) async {
    final token = _db.auth.currentSession?.accessToken;
    if (token == null) return;
    try {
      await http
          .post(
            Uri.parse('${AppConfig.siteUrl}/api/client-push/notify'),
            headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
            body: jsonEncode({'serviceOrderId': serviceOrderId}),
          )
          .timeout(const Duration(seconds: 10));
    } catch (_) {
      // Notification au mieux : le statut est enregistré
    }
  }

  // ── Boutique en ligne ──────────────────────────────────────────────────────

  /// Présence dans l'annuaire de l'app (businesses.directory_listed, migration 156).
  Future<bool> directoryListed(String businessId) async {
    final row = await _db.from('businesses').select('directory_listed').eq('id', businessId).maybeSingle();
    return row?['directory_listed'] != false;
  }

  Future<void> setDirectoryListed(String businessId, bool listed) async {
    final rows = await _db
        .from('businesses')
        .update({'directory_listed': listed})
        .eq('id', businessId)
        .select('id');
    if (rows.isEmpty) {
      throw const PartnerException('Modification refusée : vérifiez vos droits sur cette boutique.');
    }
  }

  /// Journal d'activité (activity_logs), sans jamais bloquer l'écran.
  void _log(
    String businessId,
    String action,
    String entityId,
    Map<String, Object?> metadata, {
    String entityType = 'product',
  }) {
    final user = _db.auth.currentUser;
    _db
        .from('activity_logs')
        .insert({
          'business_id': businessId,
          'user_id': user?.id,
          'user_name': user?.userMetadata?['full_name'],
          'action': action,
          'entity_type': entityType,
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
