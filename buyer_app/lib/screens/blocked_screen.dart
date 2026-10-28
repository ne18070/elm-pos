import 'package:flutter/material.dart';

import '../data/local_store.dart';
import '../utils/format.dart';
import '../widgets/common.dart';

/// Boutiques bloquées sur ce téléphone, avec possibilité de les débloquer.
class BlockedScreen extends StatefulWidget {
  const BlockedScreen({super.key, required this.store});

  final LocalStore store;

  @override
  State<BlockedScreen> createState() => _BlockedScreenState();
}

class _BlockedScreenState extends State<BlockedScreen> {
  List<BlockedBusiness>? _blocked;

  @override
  void initState() {
    super.initState();
    widget.store.blockedBusinesses().then((list) {
      if (mounted) setState(() => _blocked = list);
    });
  }

  Future<void> _unblock(BlockedBusiness business) async {
    final next = await widget.store.unblockBusiness(business.id);
    if (!mounted) return;
    setState(() => _blocked = next);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('${business.name} est débloquée.')));
  }

  @override
  Widget build(BuildContext context) {
    final blocked = _blocked;
    return Scaffold(
      appBar: AppBar(title: const Text('Boutiques bloquées')),
      body: SafeArea(
        child: blocked == null
            ? const Center(child: CircularProgressIndicator())
            : blocked.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text(
                        'Aucune boutique bloquée.\n\nPour bloquer une boutique, ouvrez son menu ⋮ '
                        'puis « Bloquer » : elle disparaîtra de votre annuaire.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: blocked.length,
                    itemBuilder: (context, index) {
                      final business = blocked[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: BoutiqueLogo(url: business.logoUrl),
                          title: Text(business.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                          subtitle: Text('Bloquée le ${formatDateTime(business.blockedAt)}'),
                          trailing: TextButton(
                            onPressed: () => _unblock(business),
                            child: const Text('Débloquer'),
                          ),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
