import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../utils/format.dart';
import '../widgets/common.dart';
import 'partner_login_screen.dart';
import 'partner_models.dart';
import 'partner_repository.dart';
import 'partner_session.dart';
import 'product_form_screen.dart';

/// Point d'entrée de l'espace partenaire : connexion, puis gestion des produits.
class PartnerScreen extends StatefulWidget {
  const PartnerScreen({super.key});

  @override
  State<PartnerScreen> createState() => _PartnerScreenState();
}

class _PartnerScreenState extends State<PartnerScreen> {
  final _session = PartnerSession.instance;
  late final Future<void> _restoring = _session.restore();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _restoring,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        return ListenableBuilder(
          listenable: _session,
          builder: (context, _) => _session.isSignedIn
              ? _ProductsHome(
                  // Nouvelle instance à chaque compte : rien ne reste du précédent
                  key: ValueKey(_session.user?.id),
                  session: _session,
                )
              : PartnerLoginScreen(session: _session),
        );
      },
    );
  }
}

enum _Visibility { online, hidden }

class _ProductsHome extends StatefulWidget {
  const _ProductsHome({super.key, required this.session});

  final PartnerSession session;

  @override
  State<_ProductsHome> createState() => _ProductsHomeState();
}

class _ProductsHomeState extends State<_ProductsHome> {
  static const _lastBusinessKey = 'partner_business_id';

  late final _repository = PartnerRepository(widget.session.client);

  List<PartnerBusiness> _businesses = [];
  PartnerBusiness? _business;
  List<PartnerProduct> _products = [];
  List<PartnerCategory> _categories = [];
  bool _loading = true;
  String? _error;
  String _search = '';
  _Visibility _visibility = _Visibility.online;

  @override
  void initState() {
    super.initState();
    _loadBusinesses();
  }

  Future<void> _loadBusinesses() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final all = await _repository.myBusinesses();
      final manageable = all.where((b) => b.canManageProducts).toList();
      if (!mounted) return;
      setState(() => _businesses = manageable);
      if (manageable.isEmpty) {
        setState(() => _loading = false);
        return;
      }
      final prefs = await SharedPreferences.getInstance();
      final lastId = prefs.getString(_lastBusinessKey);
      final initial = manageable.firstWhere((b) => b.id == lastId, orElse: () => manageable.first);
      await _selectBusiness(initial);
    } on AuthException {
      await widget.session.signOut();
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Impossible de charger vos boutiques. Vérifiez votre connexion.';
        });
      }
    }
  }

  Future<void> _selectBusiness(PartnerBusiness business) async {
    setState(() {
      _business = business;
      _loading = true;
      _error = null;
    });
    try {
      await _repository.activate(business.id);
      final results = await Future.wait([
        _repository.products(business.id),
        _repository.categories(business.id),
      ]);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_lastBusinessKey, business.id);
      if (!mounted) return;
      setState(() {
        _products = results[0] as List<PartnerProduct>;
        _categories = results[1] as List<PartnerCategory>;
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Impossible de charger les produits. Vérifiez votre connexion.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() async {
    final business = _business;
    if (business == null) return;
    try {
      final products = await _repository.products(business.id);
      if (mounted) setState(() => _products = products);
    } catch (_) {
      _toast('Actualisation impossible. Vérifiez votre connexion.');
    }
  }

  Future<void> _chooseBusiness() async {
    final picked = await showModalBottomSheet<PartnerBusiness>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const ListTile(title: Text('Choisir une boutique')),
            for (final b in _businesses)
              ListTile(
                leading: BoutiqueLogo(url: b.logoUrl, size: 40),
                title: Text(b.name),
                trailing: b.id == _business?.id ? const Icon(Icons.check_rounded) : null,
                onTap: () => Navigator.of(context).pop(b),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked != null && picked.id != _business?.id) await _selectBusiness(picked);
  }

  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Se déconnecter ?'),
        content: const Text('Vous resterez connecté sur le site et la caisse ELM.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Annuler')),
          TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Se déconnecter')),
        ],
      ),
    );
    if (confirmed == true) await widget.session.signOut();
  }

  Future<void> _openForm([PartnerProduct? product]) async {
    final business = _business;
    if (business == null) return;
    final saved = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => ProductFormScreen(
          repository: _repository,
          business: business,
          categories: _categories,
          product: product,
        ),
      ),
    );
    if (saved == null || !mounted) return;
    _toast(saved);
    await _refresh();
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  List<PartnerProduct> get _visible {
    final query = _search.trim().toLowerCase();
    return _products.where((p) {
      if (p.isActive != (_visibility == _Visibility.online)) return false;
      return query.isEmpty || p.name.toLowerCase().contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final business = _business;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: _businesses.length > 1 ? 4 : null,
        title: _businesses.length > 1
            ? TextButton.icon(
                onPressed: _chooseBusiness,
                iconAlignment: IconAlignment.end,
                icon: const Icon(Icons.expand_more_rounded),
                label: Text(business?.name ?? 'Ma boutique', overflow: TextOverflow.ellipsis),
                style: TextButton.styleFrom(
                  foregroundColor: Theme.of(context).colorScheme.onSurface,
                  textStyle: Theme.of(context).textTheme.titleLarge,
                ),
              )
            : Text(business?.name ?? 'Espace partenaire'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) => value == 'logout' ? _signOut() : _chooseBusiness(),
            itemBuilder: (_) => [
              if (_businesses.length > 1) const PopupMenuItem(value: 'switch', child: Text('Changer de boutique')),
              const PopupMenuItem(value: 'logout', child: Text('Se déconnecter')),
            ],
          ),
        ],
      ),
      floatingActionButton: business == null || _loading || _error != null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openForm(),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Ajouter un produit'),
            ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return ErrorView(
        message: _error!,
        onRetry: _business == null ? _loadBusinesses : () => _selectBusiness(_business!),
      );
    }
    if (_businesses.isEmpty) {
      return _NoAccess(email: widget.session.user?.email, onSignOut: widget.session.signOut);
    }

    final theme = Theme.of(context);
    final products = _visible;
    final onlineCount = _products.where((p) => p.isActive).length;
    final hiddenCount = _products.length - onlineCount;
    return RefreshIndicator(
      onRefresh: _refresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: TextField(
                onChanged: (v) => setState(() => _search = v),
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Rechercher un produit',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: SegmentedButton<_Visibility>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: _Visibility.online, label: Text('En ligne ($onlineCount)')),
                  ButtonSegment(value: _Visibility.hidden, label: Text('Masqués ($hiddenCount)')),
                ],
                selected: {_visibility},
                onSelectionChanged: (s) => setState(() => _visibility = s.first),
              ),
            ),
          ),
          if (products.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(32, 24, 32, 96),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.inventory_2_outlined, size: 40, color: theme.colorScheme.outline),
                    const SizedBox(height: 12),
                    Text(
                      _emptyMessage(),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleMedium,
                    ),
                  ],
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.only(bottom: 96),
              sliver: SliverList.separated(
                itemCount: products.length,
                separatorBuilder: (_, __) => const Divider(indent: 88),
                itemBuilder: (context, index) => _ProductRow(
                  product: products[index],
                  currency: _business!.currency,
                  onTap: () => _openForm(products[index]),
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _emptyMessage() {
    if (_search.trim().isNotEmpty) return 'Aucun produit ne correspond à « ${_search.trim()} ».';
    if (_visibility == _Visibility.hidden) return 'Aucun produit masqué. Tous vos produits sont visibles en boutique.';
    return 'Aucun produit en ligne.\nAjoutez votre premier produit pour qu’il apparaisse dans la boutique.';
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow({required this.product, required this.currency, required this.onTap});

  final PartnerProduct product;
  final String currency;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final String stockLabel;
    final Color stockColor;
    if (!product.trackStock) {
      stockLabel = 'Stock non suivi';
      stockColor = scheme.onSurfaceVariant;
    } else if (product.outOfStock) {
      stockLabel = 'Épuisé';
      stockColor = scheme.error;
    } else {
      stockLabel = '${product.stock} en stock';
      stockColor = scheme.onSurfaceVariant;
    }
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox.square(dimension: 58, child: ProductImage(url: product.imageUrl)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleMedium),
                  const SizedBox(height: 2),
                  Text(
                    formatCurrency(product.price, currency),
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(stockLabel, style: theme.textTheme.bodySmall?.copyWith(color: stockColor)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: scheme.outline),
          ],
        ),
      ),
    );
  }
}

/// Compte connecté sans rôle propriétaire / admin / manager sur aucune boutique.
class _NoAccess extends StatelessWidget {
  const _NoAccess({required this.email, required this.onSignOut});

  final String? email;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline_rounded, size: 40, color: theme.colorScheme.outline),
            const SizedBox(height: 12),
            Text(
              'Ce compte ne peut pas gérer de produits',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(
              '${email ?? 'Ce compte'} n’est propriétaire, administrateur ou manager d’aucune boutique. '
              'Demandez au propriétaire de vous donner le rôle manager dans ELM.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 20),
            OutlinedButton(onPressed: onSignOut, child: const Text('Se connecter avec un autre compte')),
          ],
        ),
      ),
    );
  }
}
