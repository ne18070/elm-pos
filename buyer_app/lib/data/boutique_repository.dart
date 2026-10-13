import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/boutique.dart';
import '../utils/format.dart';

/// Accès Supabase de la vitrine — mêmes requêtes et RPC que le renderer web
/// (services/supabase/boutique.ts), avec la clé anon et la RLS publique.
class BoutiqueRepository {
  BoutiqueRepository(this._db);

  final SupabaseClient _db;

  static const _infoColumns = 'id, name, logo_url, currency, phone, address';

  /// Résout un identifiant, un public_slug ou un slug de nom
  /// (même ordre que findPublicBusinessByRef côté web).
  Future<BoutiqueInfo?> findBoutique(String rawRef) async {
    final ref = rawRef.trim().replaceAll(RegExp(r'^/+|/+$'), '');
    if (ref.isEmpty) return null;

    if (isUuid(ref)) {
      final row = await _db.from('businesses').select(_infoColumns).eq('id', ref).maybeSingle();
      return row == null ? null : BoutiqueInfo.fromJson(row);
    }

    final bySlug =
        await _db.from('businesses').select(_infoColumns).eq('public_slug', ref).maybeSingle();
    if (bySlug != null) return BoutiqueInfo.fromJson(bySlug);

    final guess = ref.replaceAll('-', ' ');
    final rows = await _db.from('businesses').select(_infoColumns).ilike('name', '%$guess%');
    for (final row in rows) {
      if (slugify('${row['name']}') == ref) return BoutiqueInfo.fromJson(row);
    }
    return null;
  }

  Future<List<BoutiqueProduct>> products(String businessId) async {
    final rows = await _db
        .from('products')
        .select(
          'id, name, description, price, image_url, stock, track_stock, variants, '
          'category_id, category:categories(id, name, color, sort_order)',
        )
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name', ascending: true);
    return rows.map(BoutiqueProduct.fromJson).toList();
  }

  /// Retourne le payment_token de la commande (sert à afficher la confirmation).
  Future<String> createOrder({
    required String businessId,
    required String customerName,
    required String customerPhone,
    required DeliveryType deliveryType,
    required PaymentMethod paymentMethod,
    required List<Map<String, Object?>> items,
    String? deliveryAddress,
    String? notes,
  }) async {
    final data = await _db.rpc(
      'create_boutique_order',
      params: {
        'order_data': {
          'business_id': businessId,
          'customer_name': customerName,
          'customer_phone': customerPhone,
          'delivery_address': deliveryAddress,
          'delivery_type': deliveryType.apiValue,
          'payment_method': paymentMethod.apiValue,
          'notes': notes,
          'items': items,
        },
      },
    );
    return '${(data as Map)['payment_token']}';
  }

  Future<BoutiqueOrderDetail?> order(String token) async {
    final data = await _db.rpc('get_boutique_order', params: {'p_token': token});
    if (data is! Map) return null;
    return BoutiqueOrderDetail.fromJson(Map<String, dynamic>.from(data));
  }
}
