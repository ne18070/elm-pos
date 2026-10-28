import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../data/boutique_repository.dart';
import '../data/local_store.dart';

/// Signaler et bloquer (App Store, règle 1.2) : les fiches, produits et prestations sont
/// publiés par les commerçants. Les signalements arrivent dans /backoffice/moderation ;
/// un blocage masque la boutique tout de suite sur ce téléphone et prévient l'équipe ELM.

/// Motif envoyé en p_reason (contrainte de content_reports, migration 164).
enum ReportReason {
  offensive('Contenu choquant, haineux ou violent'),
  fraud('Arnaque ou fausse boutique'),
  illegal('Produit ou service illégal'),
  spam('Spam ou informations trompeuses'),
  other('Autre problème');

  const ReportReason(this.label);
  final String label;
}

enum ReportOutcome { reported, blocked }

String get _platform => switch (defaultTargetPlatform) {
      TargetPlatform.iOS => 'ios',
      TargetPlatform.android => 'android',
      _ => 'web',
    };

void _toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// La boutique à signaler ou bloquer.
class ModerationSubject {
  const ModerationSubject({required this.businessId, required this.businessName, this.logoUrl});

  final String businessId;
  final String businessName;
  final String? logoUrl;
}

Future<bool> _sendBlockReport(
  BoutiqueRepository repository,
  LocalStore store,
  String businessId, {
  ReportTarget target = ReportTarget.business,
  String? targetId,
  ReportReason? reason,
  String? details,
}) async {
  try {
    await repository.reportContent(
      businessId: businessId,
      target: target,
      targetId: targetId,
      reason: reason?.name,
      details: details,
      blocked: true,
      deviceId: await store.deviceId(),
      platform: _platform,
    );
    await store.markBlockReported(businessId);
    return true;
  } catch (_) {
    return false;
  }
}

/// Blocages faits hors connexion : transmis à l'équipe ELM au lancement suivant.
Future<void> sendPendingBlockReports(BoutiqueRepository repository, LocalStore store) async {
  for (final b in await store.blockedBusinesses()) {
    if (!b.reported) await _sendBlockReport(repository, store, b.id);
  }
}

/// Demande confirmation puis bloque la boutique. Retourne true si elle est bloquée.
Future<bool> confirmAndBlock(
  BuildContext context, {
  required BoutiqueRepository repository,
  required LocalStore store,
  required ModerationSubject subject,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      icon: const Icon(Icons.block),
      title: Text('Bloquer ${subject.businessName} ?'),
      content: const Text(
        'Elle disparaîtra immédiatement de votre annuaire et de vos visites récentes. '
        'L’équipe ELM sera prévenue et examinera ses contenus sous 24 h.\n\n'
        'Vous pourrez la débloquer depuis le menu « Boutiques bloquées ».',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Annuler')),
        FilledButton(
          style: FilledButton.styleFrom(
            minimumSize: const Size(0, 44),
            backgroundColor: Theme.of(context).colorScheme.error,
            foregroundColor: Theme.of(context).colorScheme.onError,
          ),
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('Bloquer'),
        ),
      ],
    ),
  );
  if (confirmed != true || !context.mounted) return false;

  await store.blockBusiness(BlockedBusiness(
    id: subject.businessId,
    name: subject.businessName,
    logoUrl: subject.logoUrl,
    blockedAt: DateTime.now(),
  ));
  if (context.mounted) _toast(context, '${subject.businessName} est bloquée. L’équipe ELM a été prévenue.');
  // Envoi en arrière-plan : le blocage local ne dépend pas du réseau
  _sendBlockReport(repository, store, subject.businessId);
  return true;
}

/// Feuille « Signaler » : motif, précisions, et option de bloquer la boutique.
Future<ReportOutcome?> showReportSheet(
  BuildContext context, {
  required BoutiqueRepository repository,
  required LocalStore store,
  required ModerationSubject subject,
  ReportTarget target = ReportTarget.business,
  String? targetId,
  String? targetName,
}) async {
  final outcome = await showModalBottomSheet<ReportOutcome>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ReportSheet(
      repository: repository,
      store: store,
      subject: subject,
      target: target,
      targetId: targetId,
      targetName: targetName ?? subject.businessName,
    ),
  );
  if (!context.mounted) return outcome;
  switch (outcome) {
    case ReportOutcome.reported:
      _toast(context, 'Merci. Votre signalement a été envoyé à l’équipe ELM.');
    case ReportOutcome.blocked:
      _toast(context, '${subject.businessName} est bloquée. L’équipe ELM a été prévenue.');
    case null:
      break;
  }
  return outcome;
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet({
    required this.repository,
    required this.store,
    required this.subject,
    required this.target,
    required this.targetId,
    required this.targetName,
  });

  final BoutiqueRepository repository;
  final LocalStore store;
  final ModerationSubject subject;
  final ReportTarget target;
  final String? targetId;
  final String targetName;

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  final _details = TextEditingController();
  ReportReason? _reason;
  bool _block = false;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  String? get _detailsText => _details.text.trim().isEmpty ? null : _details.text.trim();

  Future<void> _submit() async {
    final reason = _reason;
    if (reason == null) return;
    setState(() {
      _sending = true;
      _error = null;
    });

    if (_block) {
      // Masquée tout de suite ; le signalement part dès que le réseau le permet
      await widget.store.blockBusiness(BlockedBusiness(
        id: widget.subject.businessId,
        name: widget.subject.businessName,
        logoUrl: widget.subject.logoUrl,
        blockedAt: DateTime.now(),
      ));
      await _sendBlockReport(
        widget.repository,
        widget.store,
        widget.subject.businessId,
        target: widget.target,
        targetId: widget.targetId,
        reason: reason,
        details: _detailsText,
      );
      if (mounted) Navigator.of(context).pop(ReportOutcome.blocked);
      return;
    }

    try {
      await widget.repository.reportContent(
        businessId: widget.subject.businessId,
        target: widget.target,
        targetId: widget.targetId,
        reason: reason.name,
        details: _detailsText,
        deviceId: await widget.store.deviceId(),
        platform: _platform,
      );
      if (mounted) Navigator.of(context).pop(ReportOutcome.reported);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = 'Le signalement n’a pas pu être envoyé. Vérifiez votre connexion et réessayez.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Signaler « ${widget.targetName} »', style: theme.textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                'Votre signalement est anonyme. L’équipe ELM l’examine sous 24 h.',
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              for (final reason in ReportReason.values)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    _reason == reason ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                    color: _reason == reason ? theme.colorScheme.primary : null,
                  ),
                  title: Text(reason.label),
                  onTap: _sending ? null : () => setState(() => _reason = reason),
                ),
              const SizedBox(height: 8),
              TextField(
                controller: _details,
                enabled: !_sending,
                maxLength: 1000,
                minLines: 2,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Précisions (optionnel)'),
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _block,
                onChanged: _sending ? null : (value) => setState(() => _block = value ?? false),
                title: Text('Bloquer aussi ${widget.subject.businessName}'),
                subtitle: const Text('Elle n’apparaîtra plus dans votre app.'),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              ],
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _reason == null || _sending ? null : _submit,
                child: _sending
                    ? const SizedBox.square(
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5),
                      )
                    : Text(_reason == null ? 'Choisissez un motif' : 'Envoyer le signalement'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Menu ⋮ des fiches boutique / services : signaler ou bloquer.
class ModerationMenuButton extends StatelessWidget {
  const ModerationMenuButton({
    super.key,
    required this.repository,
    required this.store,
    required this.subject,
    required this.onBlocked,
  });

  final BoutiqueRepository repository;
  final LocalStore store;
  final ModerationSubject subject;

  /// Appelé une fois la boutique bloquée (signalement avec blocage, ou blocage direct).
  final VoidCallback onBlocked;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<ReportOutcome>(
      tooltip: 'Signaler ou bloquer',
      icon: const Icon(Icons.more_vert),
      onSelected: (action) async {
        final blocked = action == ReportOutcome.blocked
            ? await confirmAndBlock(context, repository: repository, store: store, subject: subject)
            : await showReportSheet(context, repository: repository, store: store, subject: subject) ==
                ReportOutcome.blocked;
        if (blocked) onBlocked();
      },
      itemBuilder: (_) => const [
        PopupMenuItem(
          value: ReportOutcome.reported,
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.flag_outlined),
            title: Text('Signaler'),
          ),
        ),
        PopupMenuItem(
          value: ReportOutcome.blocked,
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.block),
            title: Text('Bloquer'),
          ),
        ),
      ],
    );
  }
}

/// Fiche d'une boutique bloquée ouverte par un lien (QR code, WhatsApp, notification).
class BlockedBusinessView extends StatelessWidget {
  const BlockedBusinessView({super.key, required this.name, required this.onUnblock});

  final String name;
  final VoidCallback onUnblock;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.block, size: 48, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 16),
            Text(
              'Vous avez bloqué $name',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            const Text(
              'Ses produits et services sont masqués. Débloquez-la pour les afficher à nouveau.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            OutlinedButton(
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
              onPressed: onUnblock,
              child: const Text('Débloquer'),
            ),
            const SizedBox(height: 8),
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Retour')),
          ],
        ),
      ),
    );
  }
}
