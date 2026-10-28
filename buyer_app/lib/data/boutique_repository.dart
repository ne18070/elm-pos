import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/boutique.dart';
import '../models/directory.dart';
import '../models/service.dart';
import '../models/tracking.dart';
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

  static const directoryPageSize = 30;

  /// Annuaire public (RPC list_directory_businesses, migration 156).
  Future<List<DirectoryEntry>> directory({
    String search = '',
    DirectoryKind kind = DirectoryKind.all,
    int offset = 0,
  }) async {
    final rows = await _db.rpc(
      'list_directory_businesses',
      params: {
        'p_search': search.trim().isEmpty ? null : search.trim(),
        'p_kind': kind.apiValue,
        'p_limit': directoryPageSize,
        'p_offset': offset,
      },
    );
    return (rows as List)
        .whereType<Map>()
        .map((r) => DirectoryEntry.fromJson(Map<String, dynamic>.from(r)))
        .toList();
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

  Future<List<ServiceItem>> serviceCatalog(String businessId) async {
    final rows = await _db
        .from('service_catalog')
        .select(
          'id, name, description, price, duration_min, category_id, '
          'category:service_categories(id, name)',
        )
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('sort_order', ascending: true)
        .order('name', ascending: true);
    return rows.map(ServiceItem.fromJson).toList();
  }

  /// Même RPC que la page web /services/[id].
  Future<ServiceRequestResult> createServiceRequest({
    required String businessId,
    required String clientName,
    required String clientPhone,
    required List<Map<String, Object?>> items,
    String? subjectRef,
    String? subjectInfo,
    String? notes,
  }) async {
    final data = await _db.rpc(
      'create_public_service_order',
      params: {
        'p_business_id': businessId,
        'p_client_name': clientName,
        'p_client_phone': clientPhone,
        'p_subject_ref': subjectRef,
        'p_subject_type': 'autre',
        'p_subject_info': subjectInfo,
        'p_notes': notes,
        'p_items': items,
      },
    );
    return ServiceRequestResult.fromJson(Map<String, dynamic>.from(data as Map));
  }

  /// Suivi public (`/track/<jeton>`). Lève [TrackingException] si le lien est invalide.
  Future<TrackingData> tracking(String token) async {
    final data = await _db.rpc('get_public_tracking', params: {'p_token': token});
    if (data is! Map) throw TrackingException(trackingErrorMessage(null));
    final json = Map<String, dynamic>.from(data);
    if (json['error'] != null) throw TrackingException(trackingErrorMessage('${json['error']}'));
    return TrackingData.fromJson(json);
  }

  Future<void> submitFeedback(String token, int rating, String? feedback) => _db.rpc(
        'submit_service_order_feedback',
        params: {'p_token': token, 'p_rating': rating, 'p_feedback': feedback},
      );

  /// Abonne ce téléphone aux notifications du suivi (table client_push_devices).
  Future<void> registerPushDevice(String trackingToken, String fcmToken, String platform) => _db.rpc(
        'register_push_device',
        params: {
          'p_tracking_token': trackingToken,
          'p_fcm_token': fcmToken,
          'p_platform': platform,
        },
      );

  /// Signalement (et/ou blocage) d'une boutique, d'un produit ou d'une prestation —
  /// RPC report_content (migration 164), traité dans /backoffice/moderation.
  Future<void> reportContent({
    required String businessId,
    required ReportTarget target,
    String? targetId,
    String? reason,
    String? details,
    bool blocked = false,
    required String deviceId,
    required String platform,
  }) =>
      _db.rpc(
        'report_content',
        params: {
          'p_business_id': businessId,
          'p_target_type': target.name,
          'p_target_id': targetId,
          'p_reason': reason,
          'p_details': details,
          'p_blocked': blocked,
          'p_device_id': deviceId,
          'p_platform': platform,
        },
      );

  Future<BoutiqueOrderDetail?> order(String token) async {
    final data = await _db.rpc('get_boutique_order', params: {'p_token': token});
    if (data is! Map) return null;
    return BoutiqueOrderDetail.fromJson(Map<String, dynamic>.from(data));
  }
}

/// Contenu signalé (valeur envoyée en p_target_type).
enum ReportTarget { business, product, service }

class TrackingException implements Exception {
  const TrackingException(this.message);

  final String message;

  @override
  String toString() => message;
}
