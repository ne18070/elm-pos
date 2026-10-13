import 'package:flutter/foundation.dart';

import '../models/boutique.dart';

class CartLine {
  CartLine({
    required this.productId,
    required this.name,
    required this.unitPrice,
    required this.quantity,
    this.variantId,
    this.maxQuantity,
  });

  final String productId;
  final String? variantId;
  final String name;
  final double unitPrice;
  final int? maxQuantity;
  int quantity;

  String get key => cartKey(productId, variantId);
  double get total => unitPrice * quantity;
  bool get atMax => maxQuantity != null && quantity >= maxQuantity!;
}

String cartKey(String productId, [String? variantId]) =>
    variantId == null ? productId : '$productId:$variantId';

/// Panier d'une boutique (un panier par écran boutique, comme sur le web).
class Cart extends ChangeNotifier {
  final Map<String, CartLine> _lines = {};

  List<CartLine> get lines => _lines.values.toList(growable: false);
  bool get isEmpty => _lines.isEmpty;
  int get count => _lines.values.fold(0, (sum, line) => sum + line.quantity);
  double get total => _lines.values.fold(0.0, (sum, line) => sum + line.total);

  int quantityOf(BoutiqueProduct product, [BoutiqueVariant? variant]) =>
      _lines[cartKey(product.id, variant?.id)]?.quantity ?? 0;

  /// Quantité totale d'un produit, toutes variantes confondues.
  int quantityOfProduct(String productId) => _lines.values
      .where((line) => line.productId == productId)
      .fold(0, (sum, line) => sum + line.quantity);

  /// Retourne false si le stock disponible est atteint.
  bool add(BoutiqueProduct product, [BoutiqueVariant? variant]) {
    final key = cartKey(product.id, variant?.id);
    final existing = _lines[key];
    if (existing != null) {
      if (existing.atMax) return false;
      existing.quantity++;
    } else {
      final max = product.maxQuantity(variant);
      if (max != null && max <= 0) return false;
      _lines[key] = CartLine(
        productId: product.id,
        variantId: variant?.id,
        name: variant == null ? product.name : '${product.name} — ${variant.name}',
        unitPrice: product.priceFor(variant),
        quantity: 1,
        maxQuantity: max,
      );
    }
    notifyListeners();
    return true;
  }

  bool increment(String key) {
    final line = _lines[key];
    if (line == null || line.atMax) return false;
    line.quantity++;
    notifyListeners();
    return true;
  }

  void decrement(String key) {
    final line = _lines[key];
    if (line == null) return;
    if (line.quantity <= 1) {
      _lines.remove(key);
    } else {
      line.quantity--;
    }
    notifyListeners();
  }

  void clear() {
    _lines.clear();
    notifyListeners();
  }

  /// Format attendu par la RPC create_boutique_order.
  List<Map<String, Object?>> toOrderItems() => _lines.values
      .map(
        (line) => {
          'product_id': line.productId,
          'variant_id': line.variantId,
          'name': line.name,
          'price': line.unitPrice,
          'quantity': line.quantity,
        },
      )
      .toList();
}
