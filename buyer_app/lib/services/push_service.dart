import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../config.dart';
import '../data/boutique_repository.dart';
import '../data/local_store.dart';

/// Notifications push (Firebase Cloud Messaging) des demandes suivies.
///
/// Le serveur (/api/client-push/notify) envoie une notification à chaque changement de
/// statut d'un ordre de service, aux téléphones enregistrés pour son jeton de suivi
/// (register_push_device, migration 159). Le toucher d'une notification ouvre le suivi.
/// Sans configuration Firebase (AppConfig.isPushConfigured), tout est désactivé sans erreur.
///
/// Jetons : getToken()/onTokenRefresh (jeton d'enregistrement FCM), adressé par
/// renderer/lib/fcm.ts via l'API HTTP v1 (`message.token`). firebase_messaging 17 les
/// marque obsolètes au profit de register()/onRegistered, qui renvoient un identifiant
/// d'installation pour un autre mode d'envoi (« direct send ») : à migrer avec le serveur.
// ignore_for_file: deprecated_member_use
class PushService {
  PushService(this._repository, this._store, this._messengerKey);

  /// Instance de l'app (créée dans main.dart)
  static late PushService instance;

  final BoutiqueRepository _repository;
  final LocalStore _store;
  final GlobalKey<ScaffoldMessengerState> _messengerKey;

  bool _ready = false;
  String? _deviceToken;
  ValueChanged<Uri>? _openLink;
  Uri? _pendingLink;

  bool get isAvailable => _ready;

  String get _platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  Future<void> init() async {
    if (!AppConfig.isPushConfigured) return;
    try {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: AppConfig.firebaseApiKey,
          appId: AppConfig.firebaseAppId,
          messagingSenderId: AppConfig.firebaseSenderId,
          projectId: AppConfig.firebaseProjectId,
          iosBundleId: 'com.elmapp.mobile',
        ),
      );
      final messaging = FirebaseMessaging.instance;
      await messaging.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

      FirebaseMessaging.onMessage.listen(_showInApp);
      FirebaseMessaging.onMessageOpenedApp.listen(_openFromMessage);
      messaging.onTokenRefresh.listen((token) {
        _deviceToken = token;
        _registerAllTracked();
      });
      final initial = await messaging.getInitialMessage();
      if (initial != null) _openFromMessage(initial);

      _ready = true;

      // Permission déjà accordée : on réabonne les suivis (nouveau jeton, réinstallation…)
      final settings = await messaging.getNotificationSettings();
      if (_isAuthorized(settings.authorizationStatus)) await _registerAllTracked();
    } catch (error) {
      debugPrint('Notifications indisponibles : $error');
    }
  }

  /// Gestionnaire d'ouverture des liens (/track/…) : défini par l'écran d'accueil.
  /// Un lien reçu avant (app lancée par une notification) est rejoué à ce moment.
  set onOpenLink(ValueChanged<Uri> handler) {
    _openLink = handler;
    final pending = _pendingLink;
    if (pending != null) {
      _pendingLink = null;
      handler(pending);
    }
  }

  /// Abonne ce téléphone aux notifications d'un suivi. La permission est demandée ici,
  /// au moment où elle a du sens (juste après une demande), pas au lancement de l'app.
  Future<bool> subscribe(String trackingToken) async {
    if (!_ready) return false;
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      if (!_isAuthorized(settings.authorizationStatus)) return false;
      final token = _deviceToken ??= await FirebaseMessaging.instance.getToken();
      if (token == null) return false;
      await _repository.registerPushDevice(trackingToken, token, _platform);
      return true;
    } catch (error) {
      debugPrint('Abonnement aux notifications impossible : $error');
      return false;
    }
  }

  Future<void> _registerAllTracked() async {
    final token = _deviceToken ??= await FirebaseMessaging.instance.getToken();
    if (token == null) return;
    for (final request in await _store.trackedRequests()) {
      try {
        await _repository.registerPushDevice(request.token, token, _platform);
      } catch (_) {
        // Lien expiré : rien à faire, le suivi reste consultable s'il est encore valide
      }
    }
  }

  bool _isAuthorized(AuthorizationStatus status) =>
      status == AuthorizationStatus.authorized || status == AuthorizationStatus.provisional;

  void _openFromMessage(RemoteMessage message) {
    final uri = Uri.tryParse('${message.data['url'] ?? ''}');
    if (uri == null || uri.path.isEmpty) return;
    final handler = _openLink;
    if (handler == null) {
      _pendingLink = uri;
    } else {
      handler(uri);
    }
  }

  /// App ouverte : Android n'affiche pas la notification système, on la montre dans l'app.
  void _showInApp(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;
    _messengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 6),
          content: Text(
            [notification.title, notification.body].whereType<String>().join('\n'),
          ),
          action: SnackBarAction(label: 'Voir', onPressed: () => _openFromMessage(message)),
        ),
      );
  }
}
