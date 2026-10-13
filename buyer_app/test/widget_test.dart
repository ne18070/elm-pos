// Nom imposé : `flutter create` (lancé en CI) génère test/widget_test.dart s'il n'existe pas.
import 'package:elm_boutique/models/boutique.dart';
import 'package:elm_boutique/state/cart.dart';
import 'package:elm_boutique/utils/format.dart';
import 'package:flutter_test/flutter_test.dart';

BoutiqueProduct _product({
  String id = 'p1',
  double price = 1000,
  bool trackStock = false,
  int? stock,
  List<Map<String, Object?>> variants = const [],
}) =>
    BoutiqueProduct.fromJson({
      'id': id,
      'name': 'Savon',
      'price': price,
      'track_stock': trackStock,
      'stock': stock,
      'variants': variants,
    });

void main() {
  group('formatCurrency', () {
    test('XOF sans décimales, espaces fr-FR, libellé FCFA', () {
      expect(formatCurrency(12500, 'XOF'), '12 500 FCFA');
      expect(formatCurrency(0, 'XOF'), '0 FCFA');
      expect(formatCurrency(1234567, 'XOF'), '1 234 567 FCFA');
    });

    test('devise à décimales', () {
      expect(formatCurrency(1234.5, 'EUR'), '1 234,50 EUR');
    });
  });

  group('parseBoutiqueRef', () {
    test('lien complet partagé', () {
      expect(
        parseBoutiqueRef('https://www.elm-app.click/boutique/31418c23-c413-4271-b20a-7869e9618628'),
        '31418c23-c413-4271-b20a-7869e9618628',
      );
      expect(parseBoutiqueRef('elm-app.click/boutique/ma-boutique?utm=wa'), 'ma-boutique');
    });

    test('code seul ou saisie invalide', () {
      expect(parseBoutiqueRef('  ma-boutique  '), 'ma-boutique');
      expect(parseBoutiqueRef(''), isNull);
      expect(parseBoutiqueRef('pas un lien !'), isNull);
    });
  });

  test('slugify suit slugifyBusinessName du web', () {
    expect(slugify('Boutique Chez Fatou & Fils'), 'boutique-chez-fatou-fils');
    expect(slugify('Épicerie Élégance'), 'epicerie-elegance');
  });

  group('Cart', () {
    test('ajout, total et retrait', () {
      final cart = Cart();
      final product = _product();
      cart.add(product);
      cart.add(product);
      expect(cart.count, 2);
      expect(cart.total, 2000);
      cart.decrement(cartKey(product.id));
      expect(cart.count, 1);
      cart.decrement(cartKey(product.id));
      expect(cart.isEmpty, isTrue);
    });

    test('variante : prix ajusté et ligne distincte', () {
      final cart = Cart();
      final product = _product(variants: [
        {'id': 'v1', 'name': 'Grand', 'price_modifier': 500},
      ]);
      cart.add(product, product.variants.first);
      cart.add(product);
      expect(cart.lines.length, 2);
      expect(cart.total, 2500);
      expect(cart.toOrderItems().first['variant_id'], 'v1');
    });

    test('stock suivi : impossible de dépasser la quantité disponible', () {
      final cart = Cart();
      final product = _product(trackStock: true, stock: 1);
      expect(cart.add(product), isTrue);
      expect(cart.add(product), isFalse);
      expect(cart.count, 1);
      expect(cart.add(_product(id: 'p2', trackStock: true, stock: 0)), isFalse);
    });
  });
}
