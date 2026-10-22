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

  static String get firebaseApiKey => _isIos ? firebaseIosApiKey : firebaseAndroidApiKey;

  static String get firebaseAppId => _isIos ? firebaseIosAppId : firebaseAndroidAppId;

  /// Sans configuration Firebase, l'app fonctionne normalement, sans notifications.
  static bool get isPushConfigured =>
      !kIsWeb &&
      firebaseApiKey.isNotEmpty &&
      firebaseProjectId.isNotEmpty &&
      firebaseSenderId.isNotEmpty &&
      firebaseAppId.isNotEmpty;
}
