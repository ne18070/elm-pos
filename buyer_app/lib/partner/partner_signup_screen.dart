import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import '../widgets/contact_sheet.dart';
import 'partner_repository.dart';
import 'partner_session.dart';

/// Nom de boutique saisi à l'inscription, repris à la première connexion si l'email
/// devait d'abord être confirmé (pas de session pour créer la boutique tout de suite).
const pendingBusinessNameKey = 'partner_pending_business_name';

/// Inscription d'une nouvelle boutique : compte + boutique en essai gratuit.
class PartnerSignupScreen extends StatefulWidget {
  const PartnerSignupScreen({super.key, required this.session});

  final PartnerSession session;

  @override
  State<PartnerSignupScreen> createState() => _PartnerSignupScreenState();
}

class _PartnerSignupScreenState extends State<PartnerSignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _businessName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;

  /// Email à confirmer : l'écran affiche alors la marche à suivre
  String? _awaitingConfirmation;

  @override
  void dispose() {
    _businessName.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final email = _email.text.trim().toLowerCase();
    final name = _businessName.text.trim();
    try {
      if (await widget.session.emailExists(email)) {
        setState(() => _error = 'Un compte existe déjà avec cet email. Connectez-vous plutôt.');
        return;
      }
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(pendingBusinessNameKey, name);

      final signedIn = await widget.session.signUp(email, _password.text);
      if (!signedIn) {
        if (mounted) setState(() => _awaitingConfirmation = email);
        return;
      }
      await PartnerRepository(widget.session.client).createBoutique(name);
      await prefs.remove(pendingBusinessNameKey);
      // La session est ouverte : PartnerScreen affiche la gestion des produits
      if (mounted) Navigator.of(context).pop();
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = _authMessage(e));
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Inscription impossible. Vérifiez votre connexion et réessayez.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _authMessage(AuthException e) {
    final message = e.message.toLowerCase();
    if (message.contains('already registered') || message.contains('already been registered')) {
      return 'Un compte existe déjà avec cet email. Connectez-vous plutôt.';
    }
    if (message.contains('password')) return 'Mot de passe refusé : 6 caractères minimum.';
    if (message.contains('email')) return 'Adresse email refusée. Vérifiez-la, ex. boutique@mail.com.';
    return 'Inscription refusée : ${e.message}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant);

    if (_awaitingConfirmation != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Créer ma boutique')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 40, 20, 24),
            children: [
              Icon(Icons.mark_email_unread_outlined, size: 48, color: theme.colorScheme.primary),
              const SizedBox(height: 16),
              Text('Confirmez votre email', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                'Nous avons envoyé un lien à $_awaitingConfirmation. Ouvrez-le, puis revenez ici et '
                'connectez-vous : votre boutique « ${_businessName.text.trim()} » sera créée à ce moment-là.',
                style: muted,
              ),
              const SizedBox(height: 28),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(_awaitingConfirmation),
                child: const Text('J’ai confirmé, me connecter'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Créer ma boutique')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
            children: [
              Text('Vendez en ligne avec ELM', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                'Créez votre boutique, ajoutez vos produits : les clients de l’app commandent '
                'en retrait ou en livraison. Le même compte sert sur elm-app.click et à la caisse.',
                style: muted,
              ),
              const SizedBox(height: 28),
              TextFormField(
                controller: _businessName,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Nom de la boutique',
                  hintText: 'Ex : Boutique Ndèye Mode',
                ),
                validator: (v) {
                  final name = (v ?? '').trim();
                  if (name.isEmpty) return 'Donnez le nom affiché aux clients.';
                  if (name.length < 2) return 'Nom trop court : 2 caractères minimum.';
                  return null;
                },
              ),
              const SizedBox(height: 14),
              AutofillGroup(
                child: Column(
                  children: [
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch((v ?? '').trim())
                          ? null
                          : 'Saisissez un email valide, ex. boutique@mail.com.',
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _password,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.newPassword],
                      onFieldSubmitted: (_) => _busy ? null : _submit(),
                      decoration: InputDecoration(
                        labelText: 'Mot de passe',
                        helperText: '6 caractères minimum',
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Afficher le mot de passe' : 'Masquer le mot de passe',
                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) => (v ?? '').length < 6 ? 'Mot de passe trop court : 6 caractères minimum.' : null,
                    ),
                  ],
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 14),
                Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              ],
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                    : const Text('Créer ma boutique'),
              ),
              const SizedBox(height: 12),
              Text(
                'En créant un compte, vous acceptez les conditions d’utilisation d’ELM '
                'et sa politique de confidentialité.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall,
              ),
              Wrap(
                alignment: WrapAlignment.center,
                children: [
                  TextButton(
                    onPressed: () => launchUrl(Uri.parse(AppConfig.termsUrl), mode: LaunchMode.externalApplication),
                    child: const Text('Conditions'),
                  ),
                  TextButton(
                    onPressed: () => launchUrl(Uri.parse(AppConfig.privacyUrl), mode: LaunchMode.externalApplication),
                    child: const Text('Confidentialité'),
                  ),
                  TextButton(
                    onPressed: () => showContactSheet(context),
                    child: const Text('Nous contacter'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
