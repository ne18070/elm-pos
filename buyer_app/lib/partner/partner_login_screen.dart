import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../widgets/contact_sheet.dart';
import 'partner_session.dart';
import 'partner_signup_screen.dart';

/// Connexion à l'espace partenaire avec le compte de la boutique (le même que sur le web).
/// Aucune inscription ici : les comptes se créent sur elm-app.click.
class PartnerLoginScreen extends StatefulWidget {
  const PartnerLoginScreen({super.key, required this.session});

  final PartnerSession session;

  @override
  State<PartnerLoginScreen> createState() => _PartnerLoginScreenState();
}

class _PartnerLoginScreenState extends State<PartnerLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.signIn(_email.text, _password.text);
      // PartnerScreen bascule sur la gestion via la notification de session
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _error = _authMessage(e));
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Connexion impossible. Vérifiez votre accès à internet et réessayez.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _forgotPassword() async {
    final email = _email.text.trim();
    if (!email.contains('@')) {
      setState(() => _error = 'Saisissez d’abord l’email de votre compte, puis touchez « Mot de passe oublié ».');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.sendPasswordReset(email);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text('Lien de réinitialisation envoyé à $email.')));
    } catch (_) {
      if (mounted) setState(() => _error = 'Envoi impossible. Vérifiez l’email et votre connexion.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openSignup() async {
    final email = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => PartnerSignupScreen(session: widget.session)),
    );
    // Email à confirmer : retour ici avec l'email déjà saisi
    if (email != null && mounted) {
      _email.text = email;
      setState(() => _error = null);
    }
  }

  String _authMessage(AuthException e) {
    final message = e.message.toLowerCase();
    if (message.contains('invalid login') || message.contains('invalid credentials')) {
      return 'Email ou mot de passe incorrect.';
    }
    if (message.contains('email not confirmed')) {
      return 'Confirmez d’abord votre email avec le lien reçu à l’inscription.';
    }
    return 'Connexion refusée : ${e.message}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Espace partenaire')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
            children: [
              Text('Gérez votre boutique', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                'Connectez-vous avec le compte de votre boutique ELM pour ajouter des produits, '
                'changer les prix et mettre à jour le stock.',
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 28),
              AutofillGroup(
                child: Column(
                  children: [
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email, AutofillHints.username],
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (v) =>
                          (v ?? '').contains('@') ? null : 'Saisissez l’email de votre compte, ex. boutique@mail.com.',
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _password,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.go,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _busy ? null : _signIn(),
                      decoration: InputDecoration(
                        labelText: 'Mot de passe',
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Afficher le mot de passe' : 'Masquer le mot de passe',
                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) => (v ?? '').isEmpty ? 'Saisissez votre mot de passe.' : null,
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
                onPressed: _busy ? null : _signIn,
                child: _busy
                    ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                    : const Text('Se connecter'),
              ),
              const SizedBox(height: 8),
              Center(
                child: TextButton(
                  onPressed: _busy ? null : _forgotPassword,
                  child: const Text('Mot de passe oublié'),
                ),
              ),
              const SizedBox(height: 20),
              const Divider(),
              const SizedBox(height: 20),
              Text('Pas encore de compte ?', style: theme.textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                'Créez votre boutique en une minute, avec une période d’essai gratuite.',
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 14),
              OutlinedButton(
                onPressed: _busy ? null : _openSignup,
                child: const Text('Créer ma boutique'),
              ),
              const SizedBox(height: 16),
              Center(
                child: TextButton(
                  onPressed: () => showContactSheet(context),
                  child: const Text('Besoin d’aide ? Nous contacter'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
