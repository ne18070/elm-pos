import 'package:flutter/material.dart';

import '../data/boutique_repository.dart';
import '../data/client_account.dart';
import '../data/local_store.dart';
import '../services/push_service.dart';
import '../utils/format.dart';
import 'client_account_screen.dart';
import 'tracking_screen.dart';

/// Demandes suivies depuis ce téléphone (créées dans l'app ou ouvertes par un lien /track).
class MyTrackingScreen extends StatefulWidget {
  const MyTrackingScreen({super.key, required this.repository, required this.store});

  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  State<MyTrackingScreen> createState() => _MyTrackingScreenState();
}

class _MyTrackingScreenState extends State<MyTrackingScreen> {
  List<TrackedRequest>? _requests;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final requests = await widget.store.trackedRequests();
    if (mounted) setState(() => _requests = requests);
    // Ordres des boutiques liées au compte client : ajoutés à la liste
    if (!ClientAccount.instance.hasAccount) return;
    try {
      await ClientAccount.instance.overview();
      final synced = await widget.store.trackedRequests();
      if (mounted) setState(() => _requests = synced);
    } catch (_) {
      // Hors ligne : la liste locale reste affichée
    }
  }

  Future<void> _openClientAccount() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => ClientAccountScreen(store: widget.store)),
    );
    if (mounted) setState(() {});
    await _load();
  }

  Future<void> _open(TrackedRequest request) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TrackingScreen(
          token: request.token,
          repository: widget.repository,
          store: widget.store,
        ),
      ),
    );
    await _load();
  }

  Future<void> _forget(TrackedRequest request) async {
    final next = await widget.store.forgetTracking(request.token);
    // Retiré = plus notifié : abonnement du suivi et ordre lié au compte client
    PushService.instance.unsubscribe(request.token);
    ClientAccount.instance.forgetOrder(request.token);
    if (!mounted) return;
    setState(() => _requests = next);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('${request.label} retiré de vos suivis')));
  }

  @override
  Widget build(BuildContext context) {
    final requests = _requests;
    final hasAccount = ClientAccount.instance.hasAccount;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes suivis'),
        actions: [
          if (hasAccount)
            IconButton(
              tooltip: 'Mon code client',
              icon: const Icon(Icons.qr_code_2_rounded),
              onPressed: _openClientAccount,
            ),
        ],
      ),
      body: requests == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  if (!hasAccount) _ClientCodeBanner(onOpen: _openClientAccount),
                  if (requests.isEmpty)
                    const _EmptyTracking()
                  else
                    for (final request in requests)
                      Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          contentPadding: const EdgeInsets.only(left: 16, right: 4),
                          leading: const Icon(Icons.assignment_outlined),
                          title: Text(request.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text('${request.businessName} · ${formatDateTime(request.createdAt)}'),
                          onTap: () => _open(request),
                          trailing: IconButton(
                            tooltip: 'Retirer de mes suivis',
                            icon: const Icon(Icons.close),
                            onPressed: () => _forget(request),
                          ),
                        ),
                      ),
                ],
              ),
            ),
    );
  }
}

/// Invitation à créer le compte client : les ordres arrivent alors sans lien.
class _ClientCodeBanner extends StatelessWidget {
  const _ClientCodeBanner({required this.onOpen});

  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      color: scheme.primaryContainer,
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.qr_code_2_rounded, size: 36, color: scheme.onPrimaryContainer),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Vos ordres de travail, sans lien',
                      style: theme.textTheme.titleMedium?.copyWith(color: scheme.onPrimaryContainer),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Créez votre code client et montrez-le au comptoir : vous serez prévenu ici à chaque étape.',
                      style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onPrimaryContainer),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: scheme.onPrimaryContainer),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyTracking extends StatelessWidget {
  const _EmptyTracking();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.assignment_outlined, size: 48, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(height: 12),
          Text(
            'Vos demandes et ordres de travail apparaîtront ici, avec leur avancement.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
