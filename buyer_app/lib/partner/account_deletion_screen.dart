import 'package:flutter/material.dart';

import 'partner_repository.dart';
import 'partner_session.dart';

/// Demande de suppression du compte (App Store, règle 5.1.1(v)).
/// La demande est traitée par l'équipe ELM sous 30 jours : un compte peut porter
/// une boutique avec ventes et caisse, rien n'est effacé sans vérification.
class AccountDeletionScreen extends StatefulWidget {
  const AccountDeletionScreen({super.key, required this.session});

  final PartnerSession session;

  @override
  State<AccountDeletionScreen> createState() => _AccountDeletionScreenState();
}

class _AccountDeletionScreenState extends State<AccountDeletionScreen> {
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer votre compte ?'),
        content: const Text(
          'Votre compte et les boutiques dont vous êtes propriétaire seront supprimés sous 30 jours. '
          'Cette action ne pourra pas être annulée une fois traitée.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Annuler')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
            child: const Text('Demander la suppression'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await PartnerRepository(widget.session.client).requestAccountDeletion(_reason.text);
      await widget.session.signOut();
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Demande de suppression enregistrée : votre compte sera supprimé sous 30 jours.'),
        ),
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Demande impossible. Vérifiez votre connexion et réessayez.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant);
    Widget point(String text) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 7, right: 10),
                child: Container(width: 5, height: 5, decoration: BoxDecoration(color: scheme.onSurfaceVariant, shape: BoxShape.circle)),
              ),
              Expanded(child: Text(text, style: muted)),
            ],
          ),
        );

    return Scaffold(
      appBar: AppBar(title: const Text('Supprimer mon compte')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          children: [
            Text(widget.session.user?.email ?? 'Votre compte', style: theme.textTheme.titleLarge),
            const SizedBox(height: 16),
            point('Votre demande est traitée par l’équipe ELM sous 30 jours.'),
            point('Votre compte sera supprimé, ainsi que les boutiques dont vous êtes propriétaire : produits, ventes, clients et caisse.'),
            point('Les factures d’abonnement sont conservées, comme l’exige la loi.'),
            point('Le compte est aussi supprimé sur elm-app.click et à la caisse ELM.'),
            const SizedBox(height: 12),
            TextField(
              controller: _reason,
              minLines: 2,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Pourquoi partez-vous ? (optionnel)',
                alignLabelWithHint: true,
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Text(_error!, style: TextStyle(color: scheme.error)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError),
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                  : const Text('Demander la suppression'),
            ),
          ],
        ),
      ),
    );
  }
}
