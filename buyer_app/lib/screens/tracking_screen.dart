import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../models/tracking.dart';
import '../services/push_service.dart';
import '../utils/format.dart';
import '../widgets/common.dart';

/// Suivi d'une demande — équivalent de la page web /track/[token].
class TrackingScreen extends StatefulWidget {
  const TrackingScreen({
    super.key,
    required this.token,
    required this.repository,
    required this.store,
  });

  final String token;
  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  TrackingData? _data;
  bool _loading = true;
  String? _error;
  bool _notificationsOn = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool showSpinner = true}) async {
    setState(() {
      _loading = showSpinner;
      _error = null;
    });
    try {
      final data = await widget.repository.tracking(widget.token);
      await widget.store.rememberTracking(
        TrackedRequest(
          token: widget.token,
          businessName: data.business.name,
          label: data.reference,
          createdAt: DateTime.now(),
        ),
      );
      if (mounted) setState(() => _data = data);
    } on TrackingException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Impossible de charger le suivi. Vérifiez votre connexion.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _enableNotifications() async {
    final ok = await PushService.instance.subscribe(widget.token);
    if (!mounted) return;
    setState(() => _notificationsOn = ok);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? 'Vous serez prévenu à chaque étape de votre demande.'
              : 'Notifications refusées. Vous pouvez les autoriser dans les réglages du téléphone.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_data?.business.name ?? 'Suivi')),
      body: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final data = _data;
    if (data == null) {
      return ErrorView(message: _error ?? 'Suivi introuvable.', onRetry: _load);
    }
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: () => _load(showSpinner: false),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  BoutiqueLogo(url: data.business.logoUrl, size: 52),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(data.reference, style: theme.textTheme.titleMedium),
                        if (data.subject != null)
                          Text(data.subject!, style: theme.textTheme.bodySmall),
                        const SizedBox(height: 6),
                        _StatusChip(data: data),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (data.isService) ...[
            const SizedBox(height: 16),
            _Progress(status: data.status),
          ],
          if (data.items.isNotEmpty) ...[
            const SizedBox(height: 24),
            const SectionTitle('Prestations'),
            _ItemsCard(data: data),
          ],
          if (data.events.isNotEmpty) ...[
            const SizedBox(height: 24),
            const SectionTitle('Historique'),
            Card(
              margin: EdgeInsets.zero,
              child: Column(
                children: [
                  for (final event in data.events.reversed)
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.history),
                      title: Text(event.label),
                      subtitle: Text(
                        [formatDateTime(event.createdAt), event.actorName]
                            .whereType<String>()
                            .join(' · '),
                      ),
                    ),
                ],
              ),
            ),
          ],
          if (data.isService && PushService.instance.isAvailable) ...[
            const SizedBox(height: 24),
            _notificationsOn
                ? const ListTile(
                    leading: Icon(Icons.notifications_active),
                    title: Text('Notifications activées'),
                    subtitle: Text('Vous serez prévenu à chaque étape.'),
                  )
                : OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                    onPressed: _enableNotifications,
                    icon: const Icon(Icons.notifications_outlined),
                    label: const Text('Me prévenir à chaque étape'),
                  ),
          ],
          if (data.canRate) ...[
            const SizedBox(height: 24),
            _FeedbackCard(
              onSubmit: (rating, comment) async {
                await widget.repository.submitFeedback(widget.token, rating, comment);
                await _load(showSpinner: false);
              },
            ),
          ] else if (data.rating != null) ...[
            const SizedBox(height: 24),
            Center(child: Text('Merci pour votre avis : ${'★' * data.rating!}${'☆' * (5 - data.rating!)}')),
          ],
          if ((data.business.phone ?? '').isNotEmpty) ...[
            const SizedBox(height: 24),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: () => launchUrl(
                Uri.parse('https://wa.me/${digitsOnly(data.business.phone!)}'),
                mode: LaunchMode.externalApplication,
              ),
              icon: const Icon(Icons.chat_outlined),
              label: Text('Contacter ${data.business.name}'),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.data});

  final TrackingData data;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (background, foreground) = switch (data.status) {
      ServiceStatus.termine || ServiceStatus.paye => (Colors.green.shade100, Colors.green.shade900),
      ServiceStatus.annule => (scheme.errorContainer, scheme.onErrorContainer),
      ServiceStatus.enCours => (scheme.primaryContainer, scheme.onPrimaryContainer),
      _ => (Colors.amber.shade100, Colors.brown.shade900),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
      child: Text(
        data.statusLabel,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(color: foreground, fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// Frise attente → en cours → terminé → payé (comme la page web).
class _Progress extends StatelessWidget {
  const _Progress({required this.status});

  final ServiceStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (status == ServiceStatus.annule) {
      return Card(
        margin: EdgeInsets.zero,
        color: scheme.errorContainer,
        child: const ListTile(leading: Icon(Icons.cancel_outlined), title: Text('Demande annulée')),
      );
    }
    final current = ServiceStatus.steps.indexOf(status);
    return Row(
      children: [
        for (final (index, step) in ServiceStatus.steps.indexed) ...[
          Expanded(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: index <= current ? scheme.primary : scheme.surfaceContainerHighest,
                  child: Icon(
                    index < current ? Icons.check : Icons.circle,
                    size: index < current ? 16 : 8,
                    color: index <= current ? scheme.onPrimary : scheme.outline,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  step.label,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: index == current ? FontWeight.w700 : FontWeight.w400,
                      ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ItemsCard extends StatelessWidget {
  const _ItemsCard({required this.data});

  final TrackingData data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final remaining = data.total - data.paid;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            for (final item in data.items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Expanded(child: Text(item.quantity > 1 ? '${item.name} × ${item.quantity}' : item.name)),
                    Text(formatCurrency(item.total)),
                  ],
                ),
              ),
            const Divider(height: 24),
            Row(
              children: [
                Text('Total', style: theme.textTheme.titleMedium),
                const Spacer(),
                Text(
                  formatCurrency(data.total),
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            if (data.paid > 0) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  const Text('Déjà payé'),
                  const Spacer(),
                  Text(formatCurrency(data.paid)),
                ],
              ),
              if (remaining > 0)
                Row(
                  children: [
                    const Text('Reste à payer'),
                    const Spacer(),
                    Text(formatCurrency(remaining), style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FeedbackCard extends StatefulWidget {
  const _FeedbackCard({required this.onSubmit});

  final Future<void> Function(int rating, String? comment) onSubmit;

  @override
  State<_FeedbackCard> createState() => _FeedbackCardState();
}

class _FeedbackCardState extends State<_FeedbackCard> {
  final _comment = TextEditingController();
  int _rating = 0;
  bool _sending = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _sending = true);
    try {
      await widget.onSubmit(_rating, _comment.text.trim().isEmpty ? null : _comment.text.trim());
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Votre avis n’a pas pu être envoyé. Réessayez.')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Votre avis', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var star = 1; star <= 5; star++)
                  IconButton(
                    tooltip: '$star sur 5',
                    onPressed: () => setState(() => _rating = star),
                    icon: Icon(
                      star <= _rating ? Icons.star : Icons.star_border,
                      color: Colors.amber.shade700,
                      size: 32,
                    ),
                  ),
              ],
            ),
            TextField(
              controller: _comment,
              maxLines: 2,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Commentaire (optionnel)'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _rating == 0 || _sending ? null : _send,
              child: _sending
                  ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                  : const Text('Envoyer mon avis'),
            ),
          ],
        ),
      ),
    );
  }
}
