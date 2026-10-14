// Catalogue de prestations — miroir de services/supabase/services-public.ts (page /services/[id]).

double _toDouble(Object? value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

class ServiceCategory {
  const ServiceCategory({required this.id, required this.name});

  final String id;
  final String name;
}

class ServiceItem {
  const ServiceItem({
    required this.id,
    required this.name,
    required this.price,
    this.description,
    this.durationMin,
    this.categoryId,
    this.category,
  });

  factory ServiceItem.fromJson(Map<String, dynamic> json) {
    final rawCategory = json['category'] is List
        ? ((json['category'] as List).isEmpty ? null : (json['category'] as List).first)
        : json['category'];
    return ServiceItem(
      id: json['id'] as String,
      name: json['name'] as String,
      price: _toDouble(json['price']),
      description: json['description'] as String?,
      durationMin: json['duration_min'] is num ? (json['duration_min'] as num).toInt() : null,
      categoryId: json['category_id'] as String?,
      category: rawCategory is Map
          ? ServiceCategory(id: '${rawCategory['id']}', name: '${rawCategory['name']}')
          : null,
    );
  }

  final String id;
  final String name;
  final double price;
  final String? description;
  final int? durationMin;
  final String? categoryId;
  final ServiceCategory? category;

  /// « 45 min », « 1 h 30 »
  String? get durationLabel {
    final d = durationMin;
    if (d == null || d <= 0) return null;
    if (d < 60) return '$d min';
    final h = d ~/ 60;
    final m = d % 60;
    return m == 0 ? '$h h' : '$h h ${m.toString().padLeft(2, '0')}';
  }
}

/// Résultat de la RPC create_public_service_order.
class ServiceRequestResult {
  const ServiceRequestResult({required this.id, this.orderNumber});

  factory ServiceRequestResult.fromJson(Map<String, dynamic> json) => ServiceRequestResult(
        id: '${json['id']}',
        orderNumber: json['order_number'] is num ? (json['order_number'] as num).toInt() : null,
      );

  final String id;
  final int? orderNumber;
}
