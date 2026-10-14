import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../models/directory.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import 'boutique_screen.dart';
import 'service_screen.dart';

/// Accueil : annuaire des boutiques et services ELM avec recherche,
/// fiches récemment visitées, ouverture par lien partagé.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.repository, required this.store});

  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _searchController = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;

  String _query = '';
  DirectoryKind _kind = DirectoryKind.all;
  List<DirectoryEntry> _entries = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;
  // Ignore les réponses d'une recherche dépassée (frappe rapide)
  int _requestId = 0;

  List<RecentBoutique> _recents = [];

  /// Liens https://www.elm-app.click/boutique|services/… (QR codes, WhatsApp) :
  /// le flux émet aussi le lien qui a lancé l'app.
  StreamSubscription<Uri>? _linkSubscription;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _loadRecents();
    _reload();
    _linkSubscription = AppLinks().uriLinkStream.listen(_handleIncomingLink);
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    _debounce?.cancel();
    _searchController.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadRecents() async {
    final recents = await widget.store.recentBoutiques();
    if (mounted) setState(() => _recents = recents);
  }

  Future<void> _reload() async {
    final id = ++_requestId;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await widget.repository.directory(search: _query, kind: _kind);
      if (id != _requestId || !mounted) return;
      setState(() {
        _entries = page;
        _hasMore = page.length == BoutiqueRepository.directoryPageSize;
      });
    } catch (_) {
      if (id == _requestId && mounted) {
        setState(() => _error = 'Impossible de charger les boutiques. Vérifiez votre connexion.');
      }
    } finally {
      if (id == _requestId && mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    final id = _requestId;
    setState(() => _loadingMore = true);
    try {
      final page = await widget.repository.directory(
        search: _query,
        kind: _kind,
        offset: _entries.length,
      );
      if (id != _requestId || !mounted) return;
      setState(() {
        _entries = [..._entries, ...page];
        _hasMore = page.length == BoutiqueRepository.directoryPageSize;
      });
    } catch (_) {
      // Silencieux : un nouveau défilement relancera le chargement
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _onScroll() {
    if (_loading || _loadingMore || !_hasMore || _error != null) return;
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400) _loadMore();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (value.trim() == _query) return;
      _query = value.trim();
      _reload();
    });
  }

  void _setKind(DirectoryKind kind) {
    if (kind == _kind) return;
    setState(() => _kind = kind);
    _reload();
  }

  Future<void> _open(String businessId, VisitKind kind) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => kind == VisitKind.service
            ? ServiceScreen(businessId: businessId, repository: widget.repository, store: widget.store)
            : BoutiqueScreen(boutiqueId: businessId, repository: widget.repository, store: widget.store),
      ),
    );
    await _loadRecents();
  }

  Future<void> _handleIncomingLink(Uri uri) async {
    final target = parseBusinessLink(uri.toString());
    if (target == null || !mounted) return;
    try {
      final info = await widget.repository.findBoutique(target.ref);
      if (!mounted) return;
      if (info == null) {
        _showMessage('Ce lien de boutique n’est plus valide.');
        return;
      }
      // Fiche liée ouverte depuis l'accueil, quel que soit l'écran affiché
      Navigator.of(context).popUntil((route) => route.isFirst);
      await _open(info.id, target.kind);
    } catch (_) {
      if (mounted) _showMessage('Impossible d’ouvrir ce lien. Vérifiez votre connexion.');
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _openEntry(DirectoryEntry entry) async {
    if (entry.hasProducts && entry.hasServices) {
      final kind = await showModalBottomSheet<VisitKind>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: Text(entry.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: const Text('Que souhaitez-vous faire ?'),
              ),
              ListTile(
                leading: const Icon(Icons.shopping_bag_outlined),
                title: const Text('Voir les produits'),
                subtitle: const Text('Commander en retrait ou en livraison'),
                onTap: () => Navigator.of(context).pop(VisitKind.boutique),
              ),
              ListTile(
                leading: const Icon(Icons.build_outlined),
                title: const Text('Demander un service'),
                subtitle: const Text('Choisir des prestations et être recontacté'),
                onTap: () => Navigator.of(context).pop(VisitKind.service),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      );
      if (kind != null && mounted) await _open(entry.id, kind);
      return;
    }
    await _open(entry.id, entry.hasProducts ? VisitKind.boutique : VisitKind.service);
  }

  Future<void> _forget(RecentBoutique visit) async {
    final next = await widget.store.forgetBoutique(visit);
    if (!mounted) return;
    setState(() => _recents = next);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('${visit.name} retirée de la liste')));
  }

  Future<void> _openLinkSheet() async {
    final target = await showModalBottomSheet<_ResolvedLink>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _OpenLinkSheet(repository: widget.repository),
    );
    if (target != null && mounted) await _open(target.businessId, target.kind);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.asset('assets/logo.png', width: 32, height: 32),
            ),
            const SizedBox(width: 12),
            const Text('ELM Boutique'),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Ouvrir un lien de boutique',
            icon: const Icon(Icons.link),
            onPressed: _openLinkSheet,
          ),
          PopupMenuButton<String>(
            onSelected: (_) => launchUrl(
              Uri.parse(AppConfig.privacyUrl),
              mode: LaunchMode.externalApplication,
            ),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'privacy', child: Text('Politique de confidentialité')),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await _loadRecents();
            await _reload();
          },
          child: CustomScrollView(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  child: TextField(
                    controller: _searchController,
                    onChanged: _onSearchChanged,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Boutique, service, quartier…',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: ListenableBuilder(
                        listenable: _searchController,
                        builder: (context, _) => _searchController.text.isEmpty
                            ? const SizedBox.shrink()
                            : IconButton(
                                tooltip: 'Effacer',
                                icon: const Icon(Icons.close),
                                onPressed: () {
                                  _searchController.clear();
                                  _onSearchChanged('');
                                },
                              ),
                      ),
                    ),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: 56,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    children: [
                      for (final kind in DirectoryKind.values) ...[
                        ChoiceChip(
                          label: Text(kind.label),
                          selected: _kind == kind,
                          onSelected: (_) => _setKind(kind),
                        ),
                        const SizedBox(width: 8),
                      ],
                    ],
                  ),
                ),
              ),
              if (_query.isEmpty && _recents.isNotEmpty)
                SliverToBoxAdapter(
                  child: _RecentStrip(
                    recents: _recents,
                    onOpen: (visit) => _open(visit.id, visit.kind),
                    onForget: _forget,
                  ),
                ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: SectionTitle(_query.isEmpty ? 'Boutiques et services' : 'Résultats'),
                ),
              ),
              ..._buildDirectory(),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildDirectory() {
    if (_loading) {
      return const [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
    }
    if (_error != null) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: ErrorView(message: _error!, onRetry: _reload),
        ),
      ];
    }
    if (_entries.isEmpty) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                _query.isEmpty
                    ? 'Aucune boutique ni service pour le moment.'
                    : 'Aucun résultat pour « $_query ». Essayez un autre nom ou un quartier.',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ];
    }
    return [
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        sliver: SliverList.builder(
          itemCount: _entries.length,
          itemBuilder: (context, index) => _DirectoryTile(
            entry: _entries[index],
            onTap: () => _openEntry(_entries[index]),
          ),
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 24),
          child: Center(
            child: _loadingMore
                ? const CircularProgressIndicator()
                : const SizedBox.shrink(),
          ),
        ),
      ),
    ];
  }
}

class _DirectoryTile extends StatelessWidget {
  const _DirectoryTile({required this.entry, required this.onTap});

  final DirectoryEntry entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        leading: BoutiqueLogo(url: entry.logoUrl, size: 48),
        title: Text(
          entry.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if ((entry.address ?? '').isNotEmpty)
              Text(entry.address!, maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              children: [
                if (entry.hasProducts) _Badge(label: 'Boutique', color: theme.colorScheme.primaryContainer),
                if (entry.hasServices) _Badge(label: 'Services', color: theme.colorScheme.tertiaryContainer),
              ],
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}

class _RecentStrip extends StatelessWidget {
  const _RecentStrip({required this.recents, required this.onOpen, required this.onForget});

  final List<RecentBoutique> recents;
  final ValueChanged<RecentBoutique> onOpen;
  final ValueChanged<RecentBoutique> onForget;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: SectionTitle('Récemment visitées'),
        ),
        SizedBox(
          height: 112,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: recents.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final visit = recents[index];
              return SizedBox(
                width: 84,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => onOpen(visit),
                  onLongPress: () => onForget(visit),
                  child: Column(
                    children: [
                      const SizedBox(height: 4),
                      BoutiqueLogo(url: visit.logoUrl, size: 56),
                      const SizedBox(height: 6),
                      Text(
                        visit.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ResolvedLink {
  const _ResolvedLink(this.businessId, this.kind);

  final String businessId;
  final VisitKind kind;
}

/// Ouvrir une boutique ou un service à partir du lien reçu (WhatsApp, SMS…).
class _OpenLinkSheet extends StatefulWidget {
  const _OpenLinkSheet({required this.repository});

  final BoutiqueRepository repository;

  @override
  State<_OpenLinkSheet> createState() => _OpenLinkSheetState();
}

class _OpenLinkSheetState extends State<_OpenLinkSheet> {
  final _controller = TextEditingController();
  bool _opening = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final target = parseBusinessLink(_controller.text);
    if (target == null) {
      setState(() => _error = 'Collez le lien complet reçu de la boutique, ou son code.');
      return;
    }
    setState(() {
      _opening = true;
      _error = null;
    });
    try {
      final info = await widget.repository.findBoutique(target.ref);
      if (!mounted) return;
      if (info == null) {
        setState(() {
          _opening = false;
          _error = 'Aucune boutique ne correspond à ce lien. Vérifiez-le auprès de la boutique.';
        });
        return;
      }
      Navigator.of(context).pop(_ResolvedLink(info.id, target.kind));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _opening = false;
        _error = 'Connexion impossible. Vérifiez votre accès à internet et réessayez.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Ouvrir un lien', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            keyboardType: TextInputType.url,
            autocorrect: false,
            textInputAction: TextInputAction.go,
            onSubmitted: (_) => _submit(),
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
            onPressed: _opening ? null : _submit,
            child: _opening
                ? const SizedBox.square(
                    dimension: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  )
                : const Text('Ouvrir'),
          ),
        ],
      ),
    );
  }
}
