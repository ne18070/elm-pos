import 'package:elm_boutique/data/client_account.dart';
import 'package:elm_boutique/partner/partner_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('namesLookAlike (alerte nom déclaré / nom de l’ordre)', () {
    test('même personne, ordre des mots, casse et accents différents', () {
      expect(namesLookAlike('Awa Diop', 'DIOP Awa'), isTrue);
      expect(namesLookAlike('Aïssatou Ndiaye', 'aissatou'), isTrue);
    });

    test('personnes différentes', () {
      expect(namesLookAlike('Awa Diop', 'Moussa Fall'), isFalse);
    });

    test('nom absent : pas d’alerte', () {
      expect(namesLookAlike('Awa Diop', ''), isTrue);
    });
  });

  group('PairingCode', () {
    test('QR reconnu par le scanner et code lisible', () {
      final code = PairingCode(code: 'ABCD2345', expiresAt: DateTime(2030));
      expect(code.qrData, 'elm-client:ABCD2345');
      expect(code.display, 'ABCD-2345');
    });
  });

  test('ClientOrder : libellé OT + objet', () {
    final order = ClientOrder.fromJson({
      'id': '1',
      'order_number': 42,
      'status': 'en_cours',
      'subject': 'iPhone 12',
      'business_name': 'Atelier',
      'tracking_token': 'abc',
      'created_at': '2026-11-19T10:00:00Z',
    });
    expect(order.label, 'OT-0042 · iPhone 12');
  });
}
