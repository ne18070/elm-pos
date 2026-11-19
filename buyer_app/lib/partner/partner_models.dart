// Modèles de l'espace partenaire — colonnes de public.products / categories.

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
  });

  factory PartnerBusiness.fromJson(Map<String, dynamic> json) => PartnerBusiness(
        id: json['id'] as String,
        name: (json['name'] as String?) ?? 'Établissement',
        role: (json['member_role'] as String?) ?? '',
        currency: (json['currency'] as String?) ?? 'XOF',
        logoUrl: json['logo_url'] as String?,
      );

  final String id;
  final String name;
  final String role;
  final String currency;
  final String? logoUrl;

  bool get canManageProducts => productManagerRoles.contains(role);
}

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
