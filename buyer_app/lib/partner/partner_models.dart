// Modèles de l'espace partenaire — colonnes de public.products / categories.

import '../utils/format.dart';

double _toDouble(Object? value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

int? _toIntOrNull(Object? value) =>
    value == null ? null : (value is num ? value.toInt() : int.tryParse('$value'));

/// Rôles autorisés à écrire dans products (RLS products_manage, migration 118).
const productManagerRoles = {'owner', 'admin', 'manager'};

class PartnerBusiness {
  const PartnerBusiness({
    required this.id,
    required this.name,
    required this.role,
    this.currency = 'XOF',
    this.logoUrl,
    this.publicSlug,
    this.types = const {},
    this.features = const {},
  });

  factory PartnerBusiness.fromJson(Map<String, dynamic> json) => PartnerBusiness(
        id: json['id'] as String,
        name: (json['name'] as String?) ?? 'Établissement',
        role: (json['member_role'] as String?) ?? '',
        currency: (json['currency'] as String?) ?? 'XOF',
        logoUrl: json['logo_url'] as String?,
        publicSlug: json['public_slug'] as String?,
        types: _stringSet(json['types']),
        features: _stringSet(json['features']),
      );

  final String id;
  final String name;
  final String role;
  final String currency;
  final String? logoUrl;
  final String? publicSlug;
  final Set<String> types;
  final Set<String> features;

  bool get canManageProducts => productManagerRoles.contains(role);

  /// Catégories produits : RLS categories_manage réservée à admin / owner (migration 002)
  bool get canManageCategories => role == 'owner' || role == 'admin';

  /// Module Prestations / Ateliers (hasFeature(business, 'service') côté web)
  bool get hasServices => features.contains('service') || types.contains('service');

  /// Référence publique, même règle que buildPublicBusinessRef du web
  String get publicRef {
    final slug = (publicSlug ?? '').trim();
    if (slug.isNotEmpty) return slug;
    final fromName = slugify(name);
    return fromName.isEmpty ? id : fromName;
  }
}

Set<String> _stringSet(Object? value) =>
    value is List ? value.map((e) => '$e').toSet() : const {};

class PartnerCategory {
  const PartnerCategory({required this.id, required this.name});

  factory PartnerCategory.fromJson(Map<String, dynamic> json) =>
      PartnerCategory(id: json['id'] as String, name: json['name'] as String);

  final String id;
  final String name;
}

class PartnerProduct {
  const PartnerProduct({
    required this.id,
    required this.name,
    required this.price,
    required this.isActive,
    this.description,
    this.imageUrl,
    this.categoryId,
    this.categoryName,
    this.trackStock = false,
    this.stock,
    this.variantCount = 0,
  });

  factory PartnerProduct.fromJson(Map<String, dynamic> json) {
    final rawCategory = json['category'] is List
        ? ((json['category'] as List).isEmpty ? null : (json['category'] as List).first)
        : json['category'];
    final variants = json['variants'];
    return PartnerProduct(
      id: json['id'] as String,
      name: json['name'] as String,
      price: _toDouble(json['price']),
      isActive: json['is_active'] != false,
      description: json['description'] as String?,
      imageUrl: json['image_url'] as String?,
      categoryId: json['category_id'] as String?,
      categoryName: rawCategory is Map ? rawCategory['name'] as String? : null,
      trackStock: json['track_stock'] == true,
      stock: _toIntOrNull(json['stock']),
      variantCount: variants is List ? variants.length : 0,
    );
  }

  final String id;
  final String name;
  final double price;
  final bool isActive;
  final String? description;
  final String? imageUrl;
  final String? categoryId;
  final String? categoryName;
  final bool trackStock;
  final int? stock;

  /// Variantes (tailles, couleurs…) : modifiables sur le web uniquement
  final int variantCount;

  bool get outOfStock => trackStock && (stock ?? 0) <= 0;
}

/// Champs modifiables depuis l'app (les variantes, code-barres, prix de gros… restent intacts).
class ProductDraft {
  const ProductDraft({
    required this.name,
    required this.price,
    required this.trackStock,
    this.description,
    this.imageUrl,
    this.categoryId,
    this.stock,
  });

  final String name;
  final double price;
  final String? description;
  final String? imageUrl;
  final String? categoryId;
  final bool trackStock;
  final int? stock;

  Map<String, Object?> toJson() => {
        'name': name,
        'price': price,
        'description': (description ?? '').trim().isEmpty ? null : description!.trim(),
        'image_url': imageUrl,
        'category_id': categoryId,
        'track_stock': trackStock,
        'stock': trackStock ? (stock ?? 0) : stock,
      };
}

// ── Code client scanné au comptoir (migration 178) ─────────────────────────

/// Le nom déclaré dans l'app ressemble-t-il à celui de l'ordre ? Au moins un mot
/// en commun (casse et accents ignorés) — « Awa Diop » / « DIOP Awa » oui,
/// « Awa Diop » / « Moussa Fall » non. Simple alerte pour le technicien.
bool namesLookAlike(String a, String b) {
  Set<String> words(String s) {
    const accents = {
      'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ç': 'c', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
      'î': 'i', 'ï': 'i', 'í': 'i', 'ô': 'o', 'ö': 'o', 'ó': 'o', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ú': 'u',
      'ÿ': 'y', 'ñ': 'n',
    };
    final plain = s.toLowerCase().split('').map((c) => accents[c] ?? c).join();
    return plain.split(RegExp(r'[^a-z0-9]+')).where((w) => w.length >= 2).toSet();
  }

  final wa = words(a);
  final wb = words(b);
  if (wa.isEmpty || wb.isEmpty) return true;
  return wa.intersection(wb).isNotEmpty;
}

class OpenServiceOrder {
  const OpenServiceOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    this.clientName,
    this.clientPhone,
    this.phoneNormalized,
    this.subject,
  });

  factory OpenServiceOrder.fromJson(Map<String, dynamic> json) => OpenServiceOrder(
        id: '${json['id']}',
        orderNumber: _toIntOrNull(json['order_number']) ?? 0,
        status: '${json['status'] ?? ''}',
        clientName: json['client_name'] as String?,
        clientPhone: json['client_phone'] as String?,
        phoneNormalized: json['phone_normalized'] as String?,
        subject: (json['subject_info'] ?? json['subject_ref']) as String?,
      );

  final String id;
  final int orderNumber;
  final String status;
  final String? clientName;
  final String? clientPhone;

  /// Numéro de l'ordre normalisé par le serveur (public.normalize_phone) : la
  /// règle n'existe qu'en SQL, l'app compare seulement
  final String? phoneNormalized;
  final String? subject;

  String get reference => 'OT-${orderNumber.toString().padLeft(4, '0')}';

  String get statusLabel => switch (status) {
        'attente' => 'En attente',
        'en_cours' => 'En cours',
        'pause' => 'En pause',
        'termine' => 'Terminé',
        _ => status,
      };
}

class ScannedClient {
  const ScannedClient({
    required this.code,
    required this.name,
    required this.phone,
    required this.phoneNormalized,
    required this.hasPush,
    required this.linkedPhones,
    required this.orders,
  });

  factory ScannedClient.fromJson(String code, Map<String, dynamic> json) => ScannedClient(
        code: code,
        name: '${json['name'] ?? ''}',
        phone: '${json['phone'] ?? ''}',
        phoneNormalized: '${json['phone_normalized'] ?? ''}',
        hasPush: json['has_push'] == true,
        linkedPhones: ((json['linked_phones'] as List?) ?? []).map((e) => '$e').toSet(),
        orders: ((json['orders'] as List?) ?? [])
            .whereType<Map>()
            .map((e) => OpenServiceOrder.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );

  final String code;
  final String name;

  /// Numéro déclaré dans l'app (non vérifié)
  final String phone;
  final String phoneNormalized;

  /// Notifications autorisées sur le téléphone du client
  final bool hasPush;

  /// Numéros déjà liés à cet appareil dans la boutique
  final Set<String> linkedPhones;

  /// Ordres ouverts avec le numéro déclaré
  final List<OpenServiceOrder> orders;

  bool get alreadyLinked => linkedPhones.contains(phoneNormalized);
}

class ClientLinkResult {
  const ClientLinkResult({
    required this.linkId,
    required this.hasPush,
    required this.openOrders,
  });

  factory ClientLinkResult.fromJson(Map<String, dynamic> json) => ClientLinkResult(
        linkId: '${json['link_id']}',
        hasPush: json['has_push'] == true,
        openOrders: _toIntOrNull(json['open_orders']) ?? 0,
      );

  final String linkId;
  final bool hasPush;
  final int openOrders;
}

// ── Commandes en ligne (orders.source = 'boutique', migration 013/162) ──────

class PartnerOrderItem {
  const PartnerOrderItem({required this.name, required this.quantity, required this.total});

  factory PartnerOrderItem.fromJson(Map<String, dynamic> json) => PartnerOrderItem(
        name: '${json['name'] ?? 'Article'}',
        quantity: _toIntOrNull(json['quantity']) ?? 1,
        total: _toDouble(json['total'] ?? (_toDouble(json['price']) * (_toIntOrNull(json['quantity']) ?? 1))),
      );

  final String name;
  final int quantity;
  final double total;
}

class PartnerOrder {
  const PartnerOrder({
    required this.id,
    required this.createdAt,
    required this.status,
    required this.total,
    required this.amountPaid,
    required this.deliveryType,
    required this.deliveryStatus,
    required this.items,
    this.customerName,
    this.customerPhone,
    this.deliveryAddress,
    this.notes,
  });

  factory PartnerOrder.fromJson(Map<String, dynamic> json) => PartnerOrder(
        id: '${json['id']}',
        createdAt: DateTime.tryParse('${json['created_at']}')?.toLocal() ?? DateTime.now(),
        status: '${json['status'] ?? 'pending'}',
        total: _toDouble(json['total']),
        amountPaid: _toDouble(json['amount_paid']),
        deliveryType: '${json['delivery_type'] ?? 'pickup'}',
        deliveryStatus: '${json['delivery_status'] ?? 'pending'}',
        items: ((json['items'] as List?) ?? [])
            .whereType<Map>()
            .map((e) => PartnerOrderItem.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        customerName: json['customer_name'] as String?,
        customerPhone: json['customer_phone'] as String?,
        deliveryAddress: json['delivery_address'] as String?,
        notes: json['notes'] as String?,
      );

  final String id;
  final DateTime createdAt;

  /// pending (non soldée) · paid · cancelled · refunded
  final String status;
  final double total;
  final double amountPaid;

  /// pickup (retrait) · delivery (livraison)
  final String deliveryType;

  /// pending · picking · delivered
  final String deliveryStatus;
  final List<PartnerOrderItem> items;
  final String? customerName;
  final String? customerPhone;
  final String? deliveryAddress;
  final String? notes;

  bool get isDelivery => deliveryType == 'delivery';
  bool get isCancelled => status == 'cancelled' || status == 'refunded';
  bool get isPaid => status == 'paid';
  bool get isHandedOver => deliveryStatus == 'delivered';

  double get balanceDue => (total - amountPaid).clamp(0, double.infinity).toDouble();

  /// Encore une action à faire : encaisser ou remettre au client
  bool get needsAction => !isCancelled && (!isPaid || !isHandedOver);

  bool get canCollect => status == 'pending' && balanceDue > 0.005;
  bool get canHandOver => (status == 'pending' || status == 'paid') && !isHandedOver;
  bool get canCancel => status == 'pending' || status == 'paid';

  String get reference => '#${shortOrderId(id)}';

  int get articleCount => items.fold(0, (sum, i) => sum + i.quantity);
}

// ── Ordres de travail (service_orders, migration 024) ───────────────────────

class PartnerServiceOrder {
  const PartnerServiceOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.total,
    required this.paidAmount,
    required this.createdAt,
    required this.itemNames,
    this.clientName,
    this.clientPhone,
    this.subjectRef,
    this.subjectInfo,
    this.assignedName,
    this.notes,
  });

  factory PartnerServiceOrder.fromJson(Map<String, dynamic> json) => PartnerServiceOrder(
        id: '${json['id']}',
        orderNumber: _toIntOrNull(json['order_number']) ?? 0,
        status: '${json['status'] ?? 'attente'}',
        total: _toDouble(json['total']),
        paidAmount: _toDouble(json['paid_amount']),
        createdAt: DateTime.tryParse('${json['created_at']}')?.toLocal() ?? DateTime.now(),
        itemNames: ((json['items'] as List?) ?? [])
            .whereType<Map>()
            .map((e) {
              final qty = _toIntOrNull(e['quantity']) ?? 1;
              return qty > 1 ? '${e['name']} ×$qty' : '${e['name']}';
            })
            .toList(),
        clientName: json['client_name'] as String?,
        clientPhone: json['client_phone'] as String?,
        subjectRef: json['subject_ref'] as String?,
        subjectInfo: json['subject_info'] as String?,
        assignedName: json['assigned_name'] as String?,
        notes: json['notes'] as String?,
      );

  final String id;
  final int orderNumber;

  /// attente → en_cours ⇄ pause → termine → paye (annule à tout moment avant paye)
  final String status;
  final double total;
  final double paidAmount;
  final DateTime createdAt;
  final List<String> itemNames;
  final String? clientName;
  final String? clientPhone;
  final String? subjectRef;
  final String? subjectInfo;
  final String? assignedName;
  final String? notes;

  String get reference => 'OT-${orderNumber.toString().padLeft(4, '0')}';

  String get subject => [subjectRef, subjectInfo].whereType<String>().where((s) => s.trim().isNotEmpty).join(' · ');

  bool get isClosed => status == 'paye' || status == 'annule';

  String get statusLabel => serviceStatusLabel(status);

  /// Étapes accessibles depuis le statut actuel (l'encaissement reste à la caisse / sur le web)
  List<String> get nextStatuses => switch (status) {
        'attente' => ['en_cours'],
        'en_cours' => ['termine', 'pause'],
        'pause' => ['en_cours'],
        _ => const [],
      };
}

String serviceStatusLabel(String status) => switch (status) {
      'attente' => 'En attente',
      'en_cours' => 'En cours',
      'pause' => 'En pause',
      'termine' => 'Terminé',
      'paye' => 'Payé',
      'annule' => 'Annulé',
      _ => status,
    };

/// Libellé du bouton qui fait passer l'ordre à [status]
String serviceActionLabel(String status) => switch (status) {
      'en_cours' => 'Démarrer',
      'pause' => 'Mettre en pause',
      'termine' => 'Marquer terminé',
      _ => serviceStatusLabel(status),
    };
