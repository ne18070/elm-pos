import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';

/// Session de l'espace partenaire, sur un client Supabase DISTINCT de la vitrine.
///
/// La lecture publique des boutiques (products_public_read, categories_public_read…)
/// est réservée au rôle `anon` : si l'acheteur partageait le client du partenaire
/// connecté, il ne verrait plus que les produits de sa propre boutique. La vitrine
/// reste donc anonyme ; seul ce client porte le jeton du partenaire.
class PartnerSession extends ChangeNotifier {
  PartnerSession._(this.client);

  static PartnerSession? _instance;

  /// Créée à la première ouverture de l'espace partenaire, puis réutilisée.
  static PartnerSession get instance => _instance ??= PartnerSession._(
        SupabaseClient(
          AppConfig.supabaseUrl,
          AppConfig.supabaseAnonKey,
          authOptions: const AuthClientOptions(authFlowType: AuthFlowType.implicit),
        ),
      );

  static const _storageKey = 'partner_session_v1';

  final SupabaseClient client;
  StreamSubscription<AuthState>? _subscription;
  bool _restored = false;

  User? get user => client.auth.currentUser;
  bool get isSignedIn => client.auth.currentSession != null;

  /// Restaure la session enregistrée (rafraîchit le jeton s'il a expiré).
  Future<void> restore() async {
    if (_restored) return;
    _restored = true;
    _subscription = client.auth.onAuthStateChange.listen(_persist);
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_storageKey);
    if (saved == null) return;
    try {
      await client.auth.recoverSession(saved);
    } catch (_) {
      // Jeton révoqué ou expiré depuis trop longtemps : nouvelle connexion
      await prefs.remove(_storageKey);
    }
    notifyListeners();
  }

  Future<void> _persist(AuthState state) async {
    final prefs = await SharedPreferences.getInstance();
    final session = state.session;
    if (state.event == AuthChangeEvent.signedOut || session == null) {
      await prefs.remove(_storageKey);
    } else {
      await prefs.setString(_storageKey, jsonEncode(session.toJson()));
    }
    notifyListeners();
  }

  /// Mêmes identifiants que sur elm-app.click (email + mot de passe).
  Future<void> signIn(String email, String password) async {
    await client.auth.signInWithPassword(email: email.trim().toLowerCase(), password: password);
  }

  /// Email déjà utilisé par un compte ELM (même contrôle que /signup sur le web).
  Future<bool> emailExists(String email) async {
    final result = await client.rpc('check_email_exists', params: {'p_email': email.trim().toLowerCase()});
    return result == true;
  }

  /// Crée le compte. Renvoie false si Supabase exige d'abord la confirmation de l'email
  /// (pas de session tant que le lien reçu n'a pas été ouvert).
  Future<bool> signUp(String email, String password) async {
    final normalized = email.trim().toLowerCase();
    final response = await client.auth.signUp(
      email: normalized,
      password: password,
      emailRedirectTo: '${AppConfig.siteUrl}/login',
      data: {'full_name': normalized.split('@').first},
    );
    return response.session != null;
  }

  /// Lien de réinitialisation envoyé par email, ouvert sur le site (page /reset-password).
  Future<void> sendPasswordReset(String email) async {
    await client.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      redirectTo: '${AppConfig.siteUrl}/reset-password',
    );
  }

  /// Déconnexion de ce téléphone seulement (le web et la caisse restent connectés).
  Future<void> signOut() async {
    try {
      await client.auth.signOut(scope: SignOutScope.local);
    } finally {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_storageKey);
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
