// Point d'entrée des captures App Store : l'app réelle, ouverte sur un écran précis.
//   flutter build web -t store/screenshot_main.dart --dart-define=SUPABASE_URL=… --dart-define=SUPABASE_ANON_KEY=…
//   puis ouvrir ?screen=home|catalogue|commande|confirmation|code-client|suivis|suivi&id=<boutique>
// Données réelles de la boutique ; la confirmation utilise une commande d'exemple
// (pour ne pas créer de vraie commande), et les écrans du compte client (code
// client, suivis, détail d'un ordre de travail) un compte et des ordres d'exemple :
// aucun compte n'est créé côté serveur.
import 'package:elm_boutique/app.dart';
import 'package:elm_boutique/config.dart';
import 'package:elm_boutique/data/boutique_repository.dart';
import 'package:elm_boutique/data/client_account.dart';
import 'package:elm_boutique/data/local_store.dart';
import 'package:elm_boutique/models/boutique.dart';
import 'package:elm_boutique/models/tracking.dart';
import 'package:elm_boutique/screens/boutique_screen.dart';
import 'package:elm_boutique/screens/checkout_screen.dart';
import 'package:elm_boutique/screens/client_account_screen.dart';
import 'package:elm_boutique/screens/confirmation_screen.dart';
import 'package:elm_boutique/screens/my_tracking_screen.dart';
import 'package:elm_boutique/screens/tracking_screen.dart';
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

// ── Compte client d'exemple (écrans code client, suivis, détail) ─────────────

const _demoAtelier = 'Atelier Diallo Électronique';
const _demoGarage = 'Garage Ndiaye Auto';

/// Ordres de travail d'exemple : (jeton, boutique, libellé, ancienneté)
final _demoOrders = [
  ('demo-ot-1', _demoAtelier, 'OT-0142 · Samsung Galaxy A54 — écran cassé', const Duration(hours: 3)),
  ('demo-ot-2', _demoGarage, 'OT-0087 · Toyota Corolla — vidange et freins', const Duration(days: 2)),
  ('demo-ot-3', _demoAtelier, 'OT-0131 · HP ProBook — batterie', const Duration(days: 9)),
];

/// Compte client sans serveur : profil, code et boutiques liées fixes.
class _DemoClientAccount extends ClientAccount {
  _DemoClientAccount(super.db, super.store);

  static const _profile = ClientProfile(name: 'Aïssatou Diop', phone: '77 123 45 67');

  @override
  ClientProfile? get profile => _profile;

  @override
  bool get hasAccount => true;

  @override
  Future<void> load() async {}

  @override
  Future<void> updatePushToken(String fcmToken, String platform) async {}

  @override
  Future<PairingCode> pairingCode() async =>
      PairingCode(code: 'K7MQ3XPA', expiresAt: DateTime.now().add(const Duration(minutes: 9, seconds: 42)));

  @override
  Future<({Set<String> ids, bool codeUsed})> linkIds() async =>
      (ids: {'demo-link-1', 'demo-link-2'}, codeUsed: false);

  @override
  Future<ClientOverview> overview() async {
    final now = DateTime.now();
    return ClientOverview(
      links: [
        ClientLink(id: 'demo-link-1', businessName: _demoAtelier, createdAt: now.subtract(const Duration(days: 12))),
        ClientLink(id: 'demo-link-2', businessName: _demoGarage, createdAt: now.subtract(const Duration(days: 30))),
      ],
      orders: const [],
    );
  }

  @override
  Future<void> forgetOrder(String trackingToken) async {}
}

/// Détail d'un ordre de travail d'exemple (aucun appel get_public_tracking).
class _DemoTrackingRepository extends BoutiqueRepository {
  _DemoTrackingRepository(super.db);

  @override
  Future<TrackingData> tracking(String token) async {
    final now = DateTime.now();
    return TrackingData(
      isService: true,
      business: const TrackingBusiness(name: _demoAtelier, phone: '33 820 45 12', address: 'Liberté 6, Dakar'),
      reference: 'Demande n° 142',
      status: ServiceStatus.enCours,
      statusLabel: ServiceStatus.enCours.label,
      subject: 'Samsung Galaxy A54 · Écran cassé, tactile inactif',
      items: const [
        TrackingItem(name: 'Remplacement écran AMOLED', quantity: 1, total: 45000),
        TrackingItem(name: "Main d'œuvre", quantity: 1, total: 5000),
      ],
      total: 50000,
      paid: 10000,
      events: [
        TrackingEvent(label: 'Prise en charge par le technicien', actorName: 'Moussa', createdAt: now.subtract(const Duration(minutes: 40))),
        TrackingEvent(label: 'Acompte reçu : 10 000 FCFA', createdAt: now.subtract(const Duration(hours: 2, minutes: 50))),
        TrackingEvent(label: 'Ordre de travail enregistré', createdAt: now.subtract(const Duration(hours: 3))),
      ],
    );
  }
}

Future<void> _seedDemoTrackings(LocalStore store) async {
  final now = DateTime.now();
  await store.syncAccountTrackings([
    for (final (token, business, label, age) in _demoOrders)
      TrackedRequest(token: token, businessName: business, label: label, createdAt: now.subtract(age), fromAccount: true),
  ]);
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
  // Compte client d'exemple pour ses écrans ; ailleurs, l'app sans compte
  const accountScreens = {'code-client', 'suivis', 'suivi'};
  ClientAccount.instance = accountScreens.contains(screen)
      ? _DemoClientAccount(Supabase.instance.client, store)
      : ClientAccount(Supabase.instance.client, store);
  await ClientAccount.instance.load();
  if (accountScreens.contains(screen)) await _seedDemoTrackings(store);

  final info = await repository.findBoutique(params['id'] ?? _demoBoutique);
  if (info != null) await store.rememberBoutique(info);
  await store.saveCustomerDetails(_demoCustomer);
  // Captures de l'app déjà acceptée (l'écran des conditions n'est pas photographié)
  await store.acceptTerms(AppConfig.termsVersion);

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
      case 'code-client':
        target = ClientAccountScreen(store: store);
      case 'suivis':
        target = MyTrackingScreen(repository: repository, store: store);
      case 'suivi':
        target = TrackingScreen(
          token: _demoOrders.first.$1,
          repository: _DemoTrackingRepository(Supabase.instance.client),
          store: store,
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
