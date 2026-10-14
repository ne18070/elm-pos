import 'package:flutter/foundation.dart';

import '../models/service.dart';

class ServiceCartLine {
  ServiceCartLine({required this.item, this.quantity = 1});

  final ServiceItem item;
  int quantity;

  double get total => item.price * quantity;
}

/// Prestations choisies pour une demande de service (une par écran services).
class ServiceCart extends ChangeNotifier {
  final Map<String, ServiceCartLine> _lines = {};

  List<ServiceCartLine> get lines => _lines.values.toList(growable: false);
  bool get isEmpty => _lines.isEmpty;
  int get count => _lines.values.fold(0, (sum, line) => sum + line.quantity);
  double get total => _lines.values.fold(0.0, (sum, line) => sum + line.total);

  int quantityOf(ServiceItem item) => _lines[item.id]?.quantity ?? 0;

  void add(ServiceItem item) {
    final line = _lines[item.id];
    if (line == null) {
      _lines[item.id] = ServiceCartLine(item: item);
    } else {
      line.quantity++;
    }
    notifyListeners();
  }

  void decrement(ServiceItem item) {
    final line = _lines[item.id];
    if (line == null) return;
    if (line.quantity <= 1) {
      _lines.remove(item.id);
    } else {
      line.quantity--;
    }
    notifyListeners();
  }

  void clear() {
    _lines.clear();
    notifyListeners();
  }

  /// Format attendu par p_items de create_public_service_order (comme la page web).
  List<Map<String, Object?>> toRequestItems() => _lines.values
      .map(
        (line) => {
          'service_id': line.item.id,
          'name': line.item.name,
          'price': line.item.price,
          'quantity': line.quantity,
        },
      )
      .toList();
}
