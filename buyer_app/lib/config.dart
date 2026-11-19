import 'package:flutter/foundation.dart';

/// Configuration injectée au build :
///   flutter run --dart-define=SUPABASE_URL=… --dart-define=SUPABASE_ANON_KEY=…
/// En CI, les valeurs viennent des secrets NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
/// (les mêmes que le renderer web) et des variables FIREBASE_* (notifications push).
class AppConfig {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  static const siteUrl = 'https://www.elm-app.click';
  static const privacyUrl = '$siteUrl/privacy';
  static const termsUrl = '$siteUrl/conditions';

  /// Support ELM (« Nous contacter ») — le WhatsApp vient de payment_settings
  static const contactEmail = 'contact@elm-app.click';

  /// Version des conditions d'utilisation (renderer/app/(marketing)/conditions) :
  /// l'incrémenter redemande l'acceptation au prochain lancement.
  static const termsVersion = 1;
  static const downloadPageUrl = '$siteUrl/telecharger';

  static bool get isConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  /// APK Android publié hors Play Store (bucket app-releases, migration 159)
  static String get androidReleaseManifestUrl =>
      '$supabaseUrl/storage/v1/object/public/app-releases/android/latest.json';

  // ── Firebase Cloud Messaging (notifications push) ────────────────────────
  // Firebase crée une clé API par plateforme (« Android key » / « iOS key »), chacune
  // restreinte à son app : google-services.json → api_key.current_key,
  // GoogleService-Info.plist → API_KEY.
  static const firebaseAndroidApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const firebaseIosApiKey = String.fromEnvironment('FIREBASE_IOS_API_KEY');
  static const firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const firebaseSenderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const firebaseAndroidAppId = String.fromEnvironment('FIREBASE_ANDROID_APP_ID');
  static const firebaseIosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');

  static bool get _isIos => defaultTargetPlatform == TargetPlatform.iOS;

  // trim() : une valeur collée avec un espace ou un retour à la ligne (secret GitHub)
  static String get firebaseApiKey =>
      (_isIos ? firebaseIosApiKey : firebaseAndroidApiKey).trim();

  static String get firebaseAppId => (_isIos ? firebaseIosAppId : firebaseAndroidAppId).trim();

  static String get firebaseProjectIdValue => firebaseProjectId.trim();

  static String get firebaseSenderIdValue => firebaseSenderId.trim();

  /// Sans configuration Firebase VALIDE, l'app fonctionne normalement, sans notifications.
  /// Le format est vérifié avant Firebase.initializeApp : sur iOS, le SDK natif fait
  /// planter l'app (NSException, hors d'atteinte d'un try/catch Dart) quand l'App ID
  /// est invalide — ex. celui de l'app Android, ou un identifiant d'un autre projet.
  static bool get isPushConfigured {
    if (kIsWeb) return false;
    final appId = RegExp(r'^1:(\d+):(ios|android):[0-9a-f]+$').firstMatch(firebaseAppId);
    return appId != null &&
        appId.group(2) == (_isIos ? 'ios' : 'android') &&
        appId.group(1) == firebaseSenderIdValue &&
        RegExp(r'^AIza[0-9A-Za-z_\-]{35}$').hasMatch(firebaseApiKey) &&
        RegExp(r'^[a-z0-9][a-z0-9\-]{3,}$').hasMatch(firebaseProjectIdValue);
  }
}
