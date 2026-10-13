// Modèles de la vitrine — miroir de services/supabase/boutique.ts (renderer web).

double _toDouble(Object? value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

int? _toIntOrNull(Object? value) =>
    value == null ? null : (value is num ? value.toInt() : int.tryParse('$value'));

class BoutiqueInfo {
  const BoutiqueInfo({
    required this.id,
    required this.name,
    required this.currency,
    this.logoUrl,
    this.phone,
    this.address,
  });

  factory BoutiqueInfo.fromJson(Map<String, dynamic> json) => BoutiqueInfo(
        id: json['id'] as String,
        name: json['name'] as String,
        currency: (json['currency'] as String?) ?? 'XOF',
        logoUrl: json['logo_url'] as String?,
        phone: json['phone'] as String?,
        address: json['address'] as String?,
      );

  final String id;
  final String name;
  final String currency;
  final String? logoUrl;
  final String? phone;
  final String? address;
}

class BoutiqueCategory {
  const BoutiqueCategory({required this.id, required this.name, this.sortOrder = 0});

  factory BoutiqueCategory.fromJson(Map<String, dynamic> json) => BoutiqueCategory(
        id: json['id'] as String,
        name: json['name'] as String,
        sortOrder: _toIntOrNull(json['sort_order']) ?? 0,
      );

  final String id;
  final String name;
  final int sortOrder;
}

class BoutiqueVariant {
  const BoutiqueVariant({
    required this.id,
    required this.name,
    this.priceModifier = 0,
    this.stock,
  });

  factory BoutiqueVariant.fromJson(Map<String, dynamic> json) => BoutiqueVariant(
        id: '${json['id']}',
        name: '${json['name']}',
        priceModifier: _toDouble(json['price_modifier']),
        stock: _toIntOrNull(json['stock']),
      );

  final String id;
  final String name;
  final double priceModifier;
  final int? stock;
}

class BoutiqueProduct {
  const BoutiqueProduct({
    required this.id,
    required this.name,
    required this.price,
    this.description,
    this.imageUrl,
    this.stock,
    this.trackStock = false,
    this.variants = const [],
    this.categoryId,
    this.category,
  });

  factory BoutiqueProduct.fromJson(Map<String, dynamic> json) {
    final rawVariants = json['variants'];
    // Jointure many-to-one : PostgREST renvoie un objet (parfois une liste selon la relation)
    final rawCategory = json['category'] is List
        ? ((json['category'] as List).isEmpty ? null : (json['category'] as List).first)
        : json['category'];
    return BoutiqueProduct(
      id: json['id'] as String,
      name: json['name'] as String,
      price: _toDouble(json['price']),
      description: json['description'] as String?,
      imageUrl: json['image_url'] as String?,
      stock: _toIntOrNull(json['stock']),
      trackStock: json['track_stock'] == true,
      variants: rawVariants is List
          ? rawVariants
              .whereType<Map>()
              .map((v) => BoutiqueVariant.fromJson(Map<String, dynamic>.from(v)))
              .toList()
          : const [],
      categoryId: json['category_id'] as String?,
      category: rawCategory is Map
          ? BoutiqueCategory.fromJson(Map<String, dynamic>.from(rawCategory))
          : null,
    );
  }

  final String id;
  final String name;
  final double price;
  final String? description;
  final String? imageUrl;
  final int? stock;
  final bool trackStock;
  final List<BoutiqueVariant> variants;
  final String? categoryId;
  final BoutiqueCategory? category;

  bool get hasVariants => variants.isNotEmpty;

  bool get outOfStock => trackStock && (stock ?? 0) <= 0;

  bool variantOutOfStock(BoutiqueVariant variant) =>
      trackStock && (variant.stock ?? stock ?? 0) <= 0;

  /// Quantité maximale commandable (null = stock non suivi).
  int? maxQuantity([BoutiqueVariant? variant]) =>
      trackStock ? (variant?.stock ?? stock ?? 0) : null;

  double priceFor([BoutiqueVariant? variant]) => price + (variant?.priceModifier ?? 0);
}

enum DeliveryType {
  pickup('pickup'),
  delivery('delivery');

  const DeliveryType(this.apiValue);
  final String apiValue;
}

enum PaymentMethod {
  cash('cash'),
  mobileMoney('mobile_money'),
  paymentLink('lien_paiement');

  const PaymentMethod(this.apiValue);
  final String apiValue;
}

class BoutiqueOrderItem {
  const BoutiqueOrderItem({
    required this.name,
    required this.price,
    required this.quantity,
    required this.total,
  });

  factory BoutiqueOrderItem.fromJson(Map<String, dynamic> json) => BoutiqueOrderItem(
        name: '${json['name']}',
        price: _toDouble(json['price']),
        quantity: _toIntOrNull(json['quantity']) ?? 0,
        total: _toDouble(json['total']),
      );

  final String name;
  final double price;
  final int quantity;
  final double total;
}

class BoutiqueOrderDetail {
  const BoutiqueOrderDetail({
    required this.id,
    required this.status,
    required this.total,
    required this.items,
    this.customerName,
    this.customerPhone,
    this.deliveryAddress,
    this.deliveryType,
    this.notes,
  });

  factory BoutiqueOrderDetail.fromJson(Map<String, dynamic> json) => BoutiqueOrderDetail(
        id: '${json['id']}',
        status: (json['status'] as String?) ?? 'pending',
        total: _toDouble(json['total']),
        items: json['items'] is List
            ? (json['items'] as List)
                .whereType<Map>()
                .map((i) => BoutiqueOrderItem.fromJson(Map<String, dynamic>.from(i)))
                .toList()
            : const [],
        customerName: json['customer_name'] as String?,
        customerPhone: json['customer_phone'] as String?,
        deliveryAddress: json['delivery_address'] as String?,
        deliveryType: json['delivery_type'] as String?,
        notes: json['notes'] as String?,
      );

  final String id;
  final String status;
  final double total;
  final List<BoutiqueOrderItem> items;
  final String? customerName;
  final String? customerPhone;
  final String? deliveryAddress;
  final String? deliveryType;
  final String? notes;

  bool get isDelivery => deliveryType == DeliveryType.delivery.apiValue;
}
