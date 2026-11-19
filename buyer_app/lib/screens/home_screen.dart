import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../models/directory.dart';
import '../partner/partner_screen.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/contact_sheet.dart';
import '../widgets/moderation.dart';
import '../services/push_service.dart';
import '../services/update_service.dart';
import '../theme.dart';
import 'blocked_screen.dart';
import 'boutique_screen.dart';
import 'client_account_screen.dart';
import 'my_tracking_screen.dart';
import 'tracking_screen.dart';
import 'service_screen.dart';
import 'terms_screen.dart';

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

  /// Boutiques bloquées sur ce téléphone : masquées de l'annuaire et des récents
  Set<String> _blockedIds = {};

  /// Liens https://www.elm-app.click/boutique|services/… (QR codes, WhatsApp) :
  /// le flux émet aussi le lien qui a lancé l'app.
  StreamSubscription<Uri>? _linkSubscription;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _loadRecents();
    _loadBlocked();
    _reload();
    sendPendingBlockReports(widget.repository, widget.store);
    _linkSubscription = AppLinks().uriLinkStream.listen(_handleIncomingLink);
    // Toucher d'une notification de suivi → écran de suivi
    PushService.instance.onOpenLink = _handleIncomingLink;
    // Android (APK hors Play Store) : nouvelle version publiée ?
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) UpdateService.checkForUpdate(context);
    });
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

  Future<void> _loadBlocked() async {
    final blocked = await widget.store.blockedBusinesses();
    if (mounted) setState(() => _blockedIds = {for (final b in blocked) b.id});
  }

  List<DirectoryEntry> get _visibleEntries =>
      _entries.where((e) => !_blockedIds.contains(e.id)).toList();

  List<RecentBoutique> get _visibleRecents =>
      _recents.where((r) => !_blockedIds.contains(r.id)).toList();

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
    // Un blocage depuis la fiche la retire aussitôt de l'annuaire
    await _loadBlocked();
    await _loadRecents();
  }

  Future<void> _openBlocked() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => BlockedScreen(store: widget.store)),
    );
    await _loadBlocked();
  }

  void _onMenu(String value) {
    switch (value) {
      case 'contact':
        showContactSheet(context);
      case 'client':
        Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => ClientAccountScreen(store: widget.store)),
        );
      case 'partner':
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PartnerScreen()));
      case 'terms':
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const TermsScreen()));
      case 'blocked':
        _openBlocked();
      case 'privacy':
        launchUrl(Uri.parse(AppConfig.privacyUrl), mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _openTracking(String token) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TrackingScreen(token: token, repository: widget.repository, store: widget.store),
      ),
    );
  }

  Future<void> _openMyTracking() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MyTrackingScreen(repository: widget.repository, store: widget.store),
      ),
    );
  }

  Future<void> _handleIncomingLink(Uri uri) async {
    // Lien de suivi (/track/<jeton>) : WhatsApp, QR code ou notification
    final trackingToken = parseTrackingToken(uri.toString());
    if (trackingToken != null) {
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
      await _openTracking(trackingToken);
      return;
    }
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
    final theme = Theme.of(context);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      // Icônes de la barre d'état en clair sur le bandeau marine
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: RefreshIndicator(
          onRefresh: () async {
            await _loadRecents();
            await _reload();
          },
          child: CustomScrollView(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              // Bande marine sous la barre d'état, toujours visible au défilement
              SliverAppBar(
                pinned: true,
                toolbarHeight: 0,
                backgroundColor: _bandColor(theme),
                systemOverlayStyle: SystemUiOverlayStyle.light,
                shape: const Border(),
              ),
              SliverToBoxAdapter(
                child: _HomeHeader(
                  searchController: _searchController,
                  onSearchChanged: _onSearchChanged,
                  onOpenTracking: _openMyTracking,
                  onOpenLink: _openLinkSheet,
                  onMenu: _onMenu,
                ),
              ),
              SliverPersistentHeader(
                pinned: true,
                delegate: _KindTabsDelegate(
                  selected: _kind,
                  onSelected: _setKind,
                  background: theme.colorScheme.surface,
                ),
              ),
              if (_query.isEmpty && _visibleRecents.isNotEmpty)
                SliverToBoxAdapter(
                  child: _RecentStrip(
                    recents: _visibleRecents,
                    onOpen: (visit) => _open(visit.id, visit.kind),
                    onForget: _forget,
                  ),
                ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: SectionTitle(
                    _query.isEmpty ? 'Toutes les boutiques' : 'Résultats pour « $_query »',
                  ),
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
      return [
        SliverList.builder(itemCount: 6, itemBuilder: (_, __) => const _DirectoryTileSkeleton()),
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
    final entries = _visibleEntries;
    if (entries.isEmpty) {
      final theme = Theme.of(context);
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(32, 32, 32, 64),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.search_off_rounded, size: 40, color: theme.colorScheme.outline),
                const SizedBox(height: 12),
                Text(
                  _query.isEmpty
                      ? 'Aucune boutique en ligne pour le moment.'
                      : 'Rien ne correspond à « $_query ».',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  _query.isEmpty
                      ? 'Revenez bientôt, ou ouvrez le lien reçu d’une boutique.'
                      : 'Essayez le nom de la boutique ou un quartier.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ),
      ];
    }
    return [
      SliverList.separated(
        itemCount: entries.length,
        separatorBuilder: (_, __) => const Divider(indent: 84),
        itemBuilder: (context, index) => _DirectoryTile(
          entry: entries[index],
          onTap: () => _openEntry(entries[index]),
          menu: ModerationMenuButton(
            repository: widget.repository,
            store: widget.store,
            subject: ModerationSubject(
              businessId: entries[index].id,
              businessName: entries[index].name,
              logoUrl: entries[index].logoUrl,
            ),
            onBlocked: _loadBlocked,
          ),
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 24),
          child: Center(
            child: _loadingMore
                ? const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2.5))
                : const SizedBox.shrink(),
          ),
        ),
      ),
    ];
  }
}

Color _bandColor(ThemeData theme) =>
    theme.brightness == Brightness.dark ? ElmColors.navyDeep : ElmColors.navy;

/// Bandeau marine de l'accueil : marque, actions et recherche.
class _HomeHeader extends StatelessWidget {
  const _HomeHeader({
    required this.searchController,
    required this.onSearchChanged,
    required this.onOpenTracking,
    required this.onOpenLink,
    required this.onMenu,
  });

  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onOpenTracking;
  final VoidCallback onOpenLink;
  final ValueChanged<String> onMenu;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const onBand = Colors.white;
    return Container(
      color: _bandColor(theme),
      padding: const EdgeInsets.fromLTRB(20, 4, 8, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(9)),
                child: Image.asset('assets/logo.png', width: 28, height: 28),
              ),
              const SizedBox(width: 10),
              Text(
                'ELM Boutique',
                style: theme.textTheme.titleMedium?.copyWith(color: onBand, fontWeight: FontWeight.w800),
              ),
              const Spacer(),
              IconButton(
                tooltip: 'Mes suivis',
                color: onBand,
                icon: const Icon(Icons.receipt_long_outlined),
                onPressed: onOpenTracking,
              ),
              IconButton(
                tooltip: 'Ouvrir un lien de boutique',
                color: onBand,
                icon: const Icon(Icons.link_rounded),
                onPressed: onOpenLink,
              ),
              PopupMenuButton<String>(
                iconColor: onBand,
                onSelected: onMenu,
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'client', child: Text('Mon code client')),
                  PopupMenuItem(value: 'partner', child: Text('Espace partenaire')),
                  PopupMenuDivider(),
                  PopupMenuItem(value: 'blocked', child: Text('Boutiques bloquées')),
                  PopupMenuItem(value: 'terms', child: Text('Conditions d’utilisation')),
                  PopupMenuItem(value: 'privacy', child: Text('Politique de confidentialité')),
                  PopupMenuDivider(),
                  PopupMenuItem(value: 'contact', child: Text('Nous contacter')),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Text(
              'Trouvez une boutique,\ncommandez en quelques secondes.',
              style: theme.textTheme.headlineSmall?.copyWith(color: onBand),
            ),
          ),
          const SizedBox(height: 18),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: TextField(
              controller: searchController,
              onChanged: onSearchChanged,
              textInputAction: TextInputAction.search,
              style: theme.textTheme.bodyLarge?.copyWith(color: ElmColors.ink),
              cursorColor: ElmColors.blue,
              decoration: InputDecoration(
                fillColor: Colors.white,
                hintText: 'Nom, service ou quartier',
                hintStyle: const TextStyle(color: ElmColors.inkMuted),
                prefixIcon: const Icon(Icons.search_rounded, color: ElmColors.inkMuted),
                focusedBorder: const OutlineInputBorder(
                  borderRadius: BorderRadius.all(Radius.circular(10)),
                  borderSide: BorderSide(color: ElmColors.sun, width: 2),
                ),
                suffixIcon: ListenableBuilder(
                  listenable: searchController,
                  builder: (context, _) => searchController.text.isEmpty
                      ? const SizedBox.shrink()
                      : IconButton(
                          tooltip: 'Effacer',
                          color: ElmColors.inkMuted,
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () {
                            searchController.clear();
                            onSearchChanged('');
                          },
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Onglets Tout / Boutiques / Services, épinglés sous la bande de statut.
class _KindTabsDelegate extends SliverPersistentHeaderDelegate {
  _KindTabsDelegate({
    required this.selected,
    required this.onSelected,
    required this.background,
  });

  final DirectoryKind selected;
  final ValueChanged<DirectoryKind> onSelected;
  final Color background;

  static const _barHeight = 52.0;

  @override
  double get minExtent => _barHeight;

  @override
  double get maxExtent => _barHeight;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      color: background,
      alignment: Alignment.bottomLeft,
      child: Container(
        height: _barHeight,
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: scheme.outlineVariant))),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(
          children: [
            for (final kind in DirectoryKind.values)
              InkWell(
                onTap: () => onSelected(kind),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: kind == selected ? scheme.primary : Colors.transparent,
                        width: 3,
                      ),
                    ),
                  ),
                  child: Text(
                    kind.label,
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontSize: 15,
                      color: kind == selected ? scheme.onSurface : scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(_KindTabsDelegate old) =>
      old.selected != selected || old.background != background;
}

class _DirectoryTile extends StatelessWidget {
  const _DirectoryTile({required this.entry, required this.onTap, required this.menu});

  final DirectoryEntry entry;
  final VoidCallback onTap;

  /// Signaler / bloquer
  final Widget menu;

  String get _offer => switch ((entry.hasProducts, entry.hasServices)) {
        (true, true) => 'Produits et services',
        (false, true) => 'Services',
        _ => 'Produits',
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 0, 12),
        child: Row(
          children: [
            BoutiqueLogo(url: entry.logoUrl, size: 54),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium,
                  ),
                  if ((entry.address ?? '').isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      entry.address!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                  const SizedBox(height: 4),
                  Text(
                    _offer,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            menu,
          ],
        ),
      ),
    );
  }
}

class _DirectoryTileSkeleton extends StatelessWidget {
  const _DirectoryTileSkeleton();

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.surfaceContainerHighest;
    Widget bar(double width, double height) => Container(
          width: width,
          height: height,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
          ),
          const SizedBox(width: 14),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              bar(160, 14),
              const SizedBox(height: 8),
              bar(110, 10),
              const SizedBox(height: 8),
              bar(70, 10),
            ],
          ),
        ],
      ),
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
          padding: EdgeInsets.fromLTRB(16, 20, 16, 0),
          child: SectionTitle('Vos boutiques récentes'),
        ),
        SizedBox(
          height: 108,
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
                      BoutiqueLogo(url: visit.logoUrl, size: 60),
                      const SizedBox(height: 8),
                      Text(
                        visit.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface,
                          fontWeight: FontWeight.w600,
                        ),
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
