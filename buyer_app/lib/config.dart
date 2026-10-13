/// Configuration injectée au build :
///   flutter run --dart-define=SUPABASE_URL=… --dart-define=SUPABASE_ANON_KEY=…
/// En CI, les valeurs viennent des secrets NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
/// (les mêmes que le renderer web).
class AppConfig {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  static const siteUrl = 'https://www.elm-app.click';
  static const privacyUrl = '$siteUrl/privacy';

  static bool get isConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
}
