import 'package:flutter/material.dart';

import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../utils/format.dart';
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
    if (!mounted) return;
    setState(() => _requests = next);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('${request.label} retiré de vos suivis')));
  }

  @override
  Widget build(BuildContext context) {
    final requests = _requests;
    return Scaffold(
      appBar: AppBar(title: const Text('Mes suivis')),
      body: requests == null
          ? const Center(child: CircularProgressIndicator())
          : requests.isEmpty
              ? const _EmptyTracking()
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: requests.length,
                  itemBuilder: (context, index) {
                    final request = requests[index];
                    return Card(
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
                    );
                  },
                ),
    );
  }
}

class _EmptyTracking extends StatelessWidget {
  const _EmptyTracking();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.assignment_outlined, size: 48, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(
              'Vos demandes de service apparaîtront ici, avec leur avancement.\n'
              'Un lien de suivi reçu par WhatsApp s’ouvre aussi directement dans l’app.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
