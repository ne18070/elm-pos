// Point d'entrée des captures App Store : l'app réelle, ouverte sur un écran précis.
//   flutter build web -t store/screenshot_main.dart --dart-define=SUPABASE_URL=… --dart-define=SUPABASE_ANON_KEY=…
//   puis ouvrir ?screen=home|catalogue|commande|confirmation&id=<boutique>
// Données réelles de la boutique ; seule la confirmation utilise une commande d'exemple
// (pour ne pas créer de vraie commande).
import 'package:elm_boutique/app.dart';
import 'package:elm_boutique/config.dart';
import 'package:elm_boutique/data/boutique_repository.dart';
import 'package:elm_boutique/data/local_store.dart';
import 'package:elm_boutique/models/boutique.dart';
import 'package:elm_boutique/screens/boutique_screen.dart';
import 'package:elm_boutique/screens/checkout_screen.dart';
import 'package:elm_boutique/screens/confirmation_screen.dart';
import 'package:elm_boutique/services/push_service.dart';
import 'package:elm_boutique/state/cart.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const _demoBoutique = 'demo-boutique';
const _demoCustomer = CustomerDetails(
  name: 'Aïssatou Diop',
  phone: '77 123 45 67',
  address: 'Sacré-Cœur 3, Dakar',
);

class _DemoOrderRepository extends BoutiqueRepository {
  _DemoOrderRepository(super.db, this.sample);

  final BoutiqueOrderDetail sample;

  @override
  Future<BoutiqueOrderDetail?> order(String token) async => sample;
}

NavigatorState? _findNavigator() {
  NavigatorState? found;
  void visit(Element element) {
    if (found != null) return;
    if (element is StatefulElement && element.state is NavigatorState) {
      found = element.state as NavigatorState;
      return;
    }
    element.visitChildren(visit);
  }

  WidgetsBinding.instance.rootElement?.visitChildren(visit);
  return found;
}

Future<Cart> _demoCart(BoutiqueRepository repository, String businessId) async {
  final products = await repository.products(businessId);
  final cart = Cart();
  final simple =
      products.where((p) => !p.outOfStock && !p.hasVariants).take(3).toList();
  for (final (index, product) in simple.indexed) {
    cart.add(product);
    if (index == 0) cart.add(product);
  }
  return cart;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
      url: AppConfig.supabaseUrl, anonKey: AppConfig.supabaseAnonKey);

  final params = Uri.base.queryParameters;
  final screen = params['screen'] ?? 'home';
  final repository = BoutiqueRepository(Supabase.instance.client);
  final store = LocalStore();
  // Captures : pas de notifications (Firebase non configuré en web)
  PushService.instance = PushService(repository, store, scaffoldMessengerKey);

  final info = await repository.findBoutique(params['id'] ?? _demoBoutique);
  if (info != null) await store.rememberBoutique(info);
  await store.saveCustomerDetails(_demoCustomer);

  // Écran cible préparé AVANT le premier rendu (données chargées), puis ouvert juste après
  Widget? target;
  if (info != null) {
    switch (screen) {
      case 'catalogue':
        target = BoutiqueScreen(
            boutiqueId: info.id, repository: repository, store: store);
      case 'commande':
        final cart = await _demoCart(repository, info.id);
        target = CheckoutScreen(
            info: info, cart: cart, repository: repository, store: store);
      case 'confirmation':
        final cart = await _demoCart(repository, info.id);
        final sample = BoutiqueOrderDetail(
          id: 'a3f9c2e1-5b7d-4e2a-9c1f-2d8e6b4a7c90',
          status: 'pending',
          total: cart.total,
          items: [
            for (final line in cart.lines)
              BoutiqueOrderItem(
                name: line.name,
                price: line.unitPrice,
                quantity: line.quantity,
                total: line.total,
              ),
          ],
          customerName: _demoCustomer.name,
          customerPhone: _demoCustomer.phone,
          deliveryType: DeliveryType.delivery.apiValue,
          deliveryAddress: _demoCustomer.address,
        );
        target = ConfirmationScreen(
          token: 'demo',
          info: info,
          paymentMethod: PaymentMethod.mobileMoney,
          repository: _DemoOrderRepository(Supabase.instance.client, sample),
        );
    }
  }
  runApp(ElmBoutiqueApp(repository: repository, store: store));
  final screenWidget = target;
  if (info == null || screenWidget == null) return;

  WidgetsBinding.instance.addPostFrameCallback((_) {
    _findNavigator()
        ?.push(MaterialPageRoute<void>(builder: (_) => screenWidget));
  });
  WidgetsBinding.instance.scheduleFrame();
}
