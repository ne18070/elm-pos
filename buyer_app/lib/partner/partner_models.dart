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
