import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import 'boutique_screen.dart';

/// Écran d'accueil : ouvrir une boutique par son lien, retrouver celles déjà visitées.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.repository, required this.store});

  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _linkController = TextEditingController();
  List<RecentBoutique> _recents = [];
  bool _opening = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadRecents();
  }

  @override
  void dispose() {
    _linkController.dispose();
    super.dispose();
  }

  Future<void> _loadRecents() async {
    final recents = await widget.store.recentBoutiques();
    if (mounted) setState(() => _recents = recents);
  }

  Future<void> _openFromLink() async {
    FocusScope.of(context).unfocus();
    final ref = parseBoutiqueRef(_linkController.text);
    if (ref == null) {
      setState(() => _error = 'Collez le lien complet reçu de la boutique, ou son code.');
      return;
    }
    setState(() {
      _opening = true;
      _error = null;
    });
    try {
      final info = await widget.repository.findBoutique(ref);
      if (!mounted) return;
      if (info == null) {
        setState(() {
          _opening = false;
          _error = 'Aucune boutique ne correspond à ce lien. Vérifiez-le auprès de la boutique.';
        });
        return;
      }
      setState(() => _opening = false);
      _linkController.clear();
      await _openBoutique(info.id);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _opening = false;
        _error = 'Connexion impossible. Vérifiez votre accès à internet et réessayez.';
      });
    }
  }

  Future<void> _openBoutique(String id) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BoutiqueScreen(
          boutiqueId: id,
          repository: widget.repository,
          store: widget.store,
        ),
      ),
    );
    await _loadRecents();
  }

  Future<void> _forget(RecentBoutique boutique) async {
    final next = await widget.store.forgetBoutique(boutique.id);
    if (!mounted) return;
    setState(() => _recents = next);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('${boutique.name} retirée de la liste')));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.asset('assets/logo.png', width: 32, height: 32),
            ),
            const SizedBox(width: 12),
            const Text('Mes boutiques'),
          ],
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Ouvrir une boutique', style: theme.textTheme.titleMedium),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _linkController,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      textInputAction: TextInputAction.go,
                      onSubmitted: (_) => _openFromLink(),
                      onChanged: (_) {
                        if (_error != null) setState(() => _error = null);
                      },
                      decoration: InputDecoration(
                        labelText: 'Lien ou code de la boutique',
                        hintText: 'elm-app.click/boutique/…',
                        prefixIcon: const Icon(Icons.link),
                        helperText: 'Le lien reçu par WhatsApp, SMS ou sur les réseaux sociaux.',
                        helperMaxLines: 2,
                        errorText: _error,
                        errorMaxLines: 3,
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _opening ? null : _openFromLink,
                      child: _opening
                          ? const SizedBox.square(
                              dimension: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.5),
                            )
                          : const Text('Voir la boutique'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 28),
            const SectionTitle('Récemment visitées'),
            if (_recents.isEmpty)
              const _EmptyRecents()
            else
              for (final boutique in _recents)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    contentPadding: const EdgeInsets.only(left: 12, right: 4),
                    leading: BoutiqueLogo(url: boutique.logoUrl),
                    title: Text(
                      boutique.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    onTap: () => _openBoutique(boutique.id),
                    trailing: IconButton(
                      tooltip: 'Retirer de la liste',
                      icon: const Icon(Icons.close),
                      onPressed: () => _forget(boutique),
                    ),
                  ),
                ),
            const SizedBox(height: 24),
            Center(
              child: TextButton(
                onPressed: () => launchUrl(
                  Uri.parse(AppConfig.privacyUrl),
                  mode: LaunchMode.externalApplication,
                ),
                child: const Text('Politique de confidentialité'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyRecents extends StatelessWidget {
  const _EmptyRecents();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        children: [
          Icon(Icons.storefront_outlined, size: 40, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(height: 12),
          Text(
            'Les boutiques que vous ouvrez s’affichent ici : '
            'vous les retrouverez en un geste pour commander à nouveau.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
