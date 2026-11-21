import 'package:elm_boutique/partner/partner_models.dart';
import 'package:elm_boutique/utils/format.dart';
import 'package:flutter_test/flutter_test.dart';

PartnerOrder order({String status = 'pending', String delivery = 'pending', num paid = 0}) =>
    PartnerOrder.fromJson({
      'id': 'a1b2c3d4-0000-4000-8000-000000000000',
      'created_at': '2026-11-20T10:00:00Z',
      'status': status,
      'total': 5000,
      'amount_paid': paid,
      'delivery_type': 'delivery',
      'delivery_status': delivery,
      'items': [
        {'name': 'Thiouraye', 'quantity': 2, 'price': 1500, 'total': 3000},
        {'name': 'Encens', 'quantity': 1, 'price': 2000},
      ],
    });

void main() {
  test('Commande en ligne : à traiter tant qu’elle n’est ni payée ni remise', () {
    final fresh = order();
    expect(fresh.needsAction, isTrue);
    expect(fresh.canCollect, isTrue);
    expect(fresh.balanceDue, 5000);
    expect(fresh.articleCount, 3);
    expect(fresh.items.last.total, 2000);
    expect(fresh.reference, '#A1B2C3D4');

    final paidNotDelivered = order(status: 'paid', paid: 5000);
    expect(paidNotDelivered.needsAction, isTrue);
    expect(paidNotDelivered.canCollect, isFalse);
    expect(paidNotDelivered.canHandOver, isTrue);

    expect(order(status: 'paid', paid: 5000, delivery: 'delivered').needsAction, isFalse);
    expect(order(status: 'cancelled').needsAction, isFalse);
    expect(order(status: 'cancelled').canCancel, isFalse);
  });

  test('Ordre de travail : étapes suivantes selon le statut', () {
    PartnerServiceOrder ot(String status) => PartnerServiceOrder.fromJson({
          'id': 'x',
          'order_number': 7,
          'status': status,
          'total': 10000,
          'created_at': '2026-11-20T10:00:00Z',
          'subject_ref': 'DK-1234-A',
          'subject_info': 'Toyota Corolla',
          'items': [
            {'name': 'Vidange', 'quantity': 1},
            {'name': 'Filtre', 'quantity': 2},
          ],
        });
    expect(ot('attente').nextStatuses, ['en_cours']);
    expect(ot('en_cours').nextStatuses, ['termine', 'pause']);
    expect(ot('pause').nextStatuses, ['en_cours']);
    expect(ot('termine').nextStatuses, isEmpty);
    expect(ot('attente').reference, 'OT-0007');
    expect(ot('attente').subject, 'DK-1234-A · Toyota Corolla');
    expect(ot('attente').itemNames, ['Vidange', 'Filtre ×2']);
    expect(ot('paye').isClosed, isTrue);
  });

  test('Boutique : module atelier et lien public', () {
    final shop = PartnerBusiness.fromJson({
      'id': 'b1',
      'name': 'Boutique Ndèye Mode',
      'member_role': 'manager',
      'types': ['retail'],
      'features': ['service'],
    });
    expect(shop.hasServices, isTrue);
    expect(shop.canManageCategories, isFalse);
    expect(shop.publicRef, 'boutique-ndeye-mode');

    final withSlug = PartnerBusiness.fromJson({'id': 'b2', 'name': 'X', 'member_role': 'owner', 'public_slug': 'ndeye'});
    expect(withSlug.publicRef, 'ndeye');
    expect(withSlug.hasServices, isFalse);
    expect(withSlug.canManageCategories, isTrue);
  });

  test('Numéro WhatsApp : indicatif 221 pour un numéro local', () {
    expect(whatsAppNumber('77 123 45 67'), '221771234567');
    expect(whatsAppNumber('+221 77 123 45 67'), '221771234567');
    expect(whatsAppNumber('0612345678'), '221612345678');
    expect(whatsAppNumber('+33 6 12 34 56 78'), '33612345678');
  });
}
