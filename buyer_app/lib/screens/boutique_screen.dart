import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../models/boutique.dart';
import '../state/cart.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/moderation.dart';
import 'checkout_screen.dart';

enum _SortKey {
  standard('Par défaut'),
  priceAsc('Prix croissant'),
  priceDesc('Prix décroissant'),
  name('A → Z');

  const _SortKey(this.label);
  final String label;
}

/// Catalogue d'une boutique — équivalent de /boutique/[businessId] sur le web.
class BoutiqueScreen extends StatefulWidget {
  const BoutiqueScreen({
    super.key,
    required this.boutiqueId,
    required this.repository,
    required this.store,
  });

  final String boutiqueId;
  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  State<BoutiqueScreen> createState() => _BoutiqueScreenState();
}

class _BoutiqueScreenState extends State<BoutiqueScreen> {
  final _cart = Cart();
  BoutiqueInfo? _info;
  List<BoutiqueProduct> _products = [];
  bool _loading = true;
  String? _error;

  /// Boutique bloquée par l'acheteur, ouverte par un lien : rien n'est chargé
  BoutiqueInfo? _blocked;

  String _search = '';
  String? _categoryId;
  _SortKey _sort = _SortKey.standard;
  bool _showOutOfStock = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _cart.dispose();
    super.dispose();
  }

  /// [showSpinner] à false pour le tirer-pour-rafraîchir : le catalogue reste affiché.
  Future<void> _load({bool showSpinner = true}) async {
    setState(() {
      _loading = showSpinner;
      _error = null;
    });
    try {
      final info = await widget.repository.findBoutique(widget.boutiqueId);
      if (info == null) {
        if (mounted) setState(() => _error = 'Cette boutique n’existe plus ou son lien a changé.');
        return;
      }
      if (await widget.store.isBlocked(info.id)) {
        if (mounted) setState(() => _blocked = info);
        return;
      }
      final products = await widget.repository.products(info.id);
      await widget.store.rememberBoutique(info);
      if (!mounted) return;
      setState(() {
        _info = info;
        _products = products;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Impossible de charger la boutique. Vérifiez votre connexion.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<BoutiqueCategory> get _categories {
    final seen = <String, BoutiqueCategory>{};
    for (final p in _products) {
      if (p.category != null) seen[p.category!.id] = p.category!;
    }
    return seen.values.toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  List<BoutiqueProduct> get _filtered {
    final query = _search.trim().toLowerCase();
    final result = _products.where((p) {
      if (!_showOutOfStock && p.outOfStock) return false;
      if (_categoryId != null && p.categoryId != _categoryId) return false;
      if (query.isEmpty) return true;
      return p.name.toLowerCase().contains(query) ||
          (p.description ?? '').toLowerCase().contains(query);
    }).toList();
    switch (_sort) {
      case _SortKey.priceAsc:
        result.sort((a, b) => a.price.compareTo(b.price));
      case _SortKey.priceDesc:
        result.sort((a, b) => b.price.compareTo(a.price));
      case _SortKey.name:
        result.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      case _SortKey.standard:
        break;
    }
    return result;
  }

  void _add(BoutiqueProduct product, [BoutiqueVariant? variant]) {
    if (!_cart.add(product, variant)) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Stock disponible atteint pour cet article.')));
    }
  }

  Future<void> _chooseVariant(BoutiqueProduct product) async {
    final currency = _info!.currency;
    final variant = await showModalBottomSheet<BoutiqueVariant>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(
              title: Text(product.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: const Text('Choisissez une option'),
            ),
            for (final v in product.variants)
              ListTile(
                enabled: !product.variantOutOfStock(v),
                title: Text(v.name),
                subtitle: product.variantOutOfStock(v) ? const Text('Épuisé') : null,
                trailing: Text(
                  formatCurrency(product.priceFor(v), currency),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                onTap: () => Navigator.of(context).pop(v),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (variant != null && mounted) _add(product, variant);
  }

  ModerationSubject get _subject =>
      ModerationSubject(businessId: _info!.id, businessName: _info!.name, logoUrl: _info!.logoUrl);

  Future<void> _reportProduct(BoutiqueProduct product) async {
    final outcome = await showReportSheet(
      context,
      repository: widget.repository,
      store: widget.store,
      subject: _subject,
      target: ReportTarget.product,
      targetId: product.id,
      targetName: product.name,
    );
    if (outcome == ReportOutcome.blocked && mounted) Navigator.of(context).pop();
  }

  Future<void> _unblock() async {
    await widget.store.unblockBusiness(_blocked!.id);
    if (!mounted) return;
    setState(() => _blocked = null);
    await _load();
  }

  Future<void> _showDetails(BoutiqueProduct product) async {
    final currency = _info!.currency;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        builder: (context, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: AspectRatio(aspectRatio: 1, child: ProductImage(url: product.imageUrl)),
            ),
            const SizedBox(height: 16),
            Text(product.name, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              formatCurrency(product.price, currency),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.w700,
                  ),
            ),
            if ((product.description ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(product.description!),
            ],
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: product.outOfStock
                  ? null
                  : () {
                      Navigator.of(context).pop();
                      product.hasVariants ? _chooseVariant(product) : _add(product);
                    },
              icon: const Icon(Icons.add_shopping_cart),
              label: Text(product.outOfStock ? 'Épuisé' : 'Ajouter au panier'),
            ),
            const SizedBox(height: 8),
            Center(
              child: TextButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  _reportProduct(product);
                },
                icon: const Icon(Icons.flag_outlined, size: 18),
                label: const Text('Signaler ce produit'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openCheckout() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CheckoutScreen(
          info: _info!,
          cart: _cart,
          repository: widget.repository,
          store: widget.store,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final info = _info;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: info == null ? null : Text(info.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (info != null)
            PopupMenuButton<_SortKey>(
              tooltip: 'Trier',
              icon: const Icon(Icons.swap_vert_rounded),
              initialValue: _sort,
              onSelected: (value) => setState(() => _sort = value),
              itemBuilder: (_) => [
                for (final key in _SortKey.values)
                  PopupMenuItem(value: key, child: Text(key.label)),
              ],
            ),
          if (info != null)
            ModerationMenuButton(
              repository: widget.repository,
              store: widget.store,
              subject: _subject,
              onBlocked: () => Navigator.of(context).pop(),
            ),
        ],
      ),
      body: _buildBody(),
      bottomNavigationBar: ListenableBuilder(
        listenable: _cart,
        builder: (context, _) {
          if (_cart.isEmpty || info == null) return const SizedBox.shrink();
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: _CartBar(
                count: _cart.count,
                total: formatCurrency(_cart.total, info.currency),
                onPressed: _openCheckout,
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const _CatalogSkeleton();
    if (_blocked != null) return BlockedBusinessView(name: _blocked!.name, onUnblock: _unblock);
    if (_error != null || _info == null) {
      return ErrorView(
        message: _error ?? 'Boutique introuvable.',
        onRetry: _load,
        secondary: TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Retour à mes boutiques'),
        ),
      );
    }

    final categories = _categories;
    final products = _filtered;
    return RefreshIndicator(
      onRefresh: () => _load(showSpinner: false),
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: _ShopHeader(
              info: _info!,
              productCount: _products.length,
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: TextField(
                onChanged: (value) => setState(() => _search = value),
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Rechercher dans la boutique',
                  prefixIcon: Icon(Icons.search_rounded),
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
                  ChoiceChip(
                    label: const Text('Tout'),
                    selected: _categoryId == null,
                    onSelected: (_) => setState(() => _categoryId = null),
                  ),
                  for (final c in categories) ...[
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: Text(c.name),
                      selected: _categoryId == c.id,
                      onSelected: (_) => setState(() => _categoryId = c.id),
                    ),
                  ],
                  const SizedBox(width: 8),
                  FilterChip(
                    label: const Text('Inclure les épuisés'),
                    selected: _showOutOfStock,
                    onSelected: (value) => setState(() => _showOutOfStock = value),
                  ),
                ],
              ),
            ),
          ),
          if (products.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(
                    _products.isEmpty
                        ? 'Cette boutique n’a pas encore de produits en ligne.'
                        : 'Aucun produit ne correspond à votre recherche.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 220,
                  mainAxisExtent: 268,
                  mainAxisSpacing: 20,
                  crossAxisSpacing: 14,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, index) => _ProductCard(
                    product: products[index],
                    currency: _info!.currency,
                    cart: _cart,
                    onTap: () => _showDetails(products[index]),
                    onAdd: () => products[index].hasVariants
                        ? _chooseVariant(products[index])
                        : _add(products[index]),
                  ),
                  childCount: products.length,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.currency,
    required this.cart,
    required this.onTap,
    required this.onAdd,
  });

  final BoutiqueProduct product;
  final String currency;
  final Cart cart;
  final VoidCallback onTap;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final radius = BorderRadius.circular(10);
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                DecoratedBox(
                  position: DecorationPosition.foreground,
                  decoration: BoxDecoration(
                    borderRadius: radius,
                    border: Border.all(color: scheme.outlineVariant),
                  ),
                  child: ClipRRect(
                    borderRadius: radius,
                    child: Opacity(
                      opacity: product.outOfStock ? 0.45 : 1,
                      child: ProductImage(url: product.imageUrl),
                    ),
                  ),
                ),
                if (product.outOfStock)
                  Positioned(
                    left: 8,
                    top: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: scheme.inverseSurface,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'Épuisé',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: scheme.onInverseSurface,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  )
                else
                  Positioned(
                    right: 6,
                    bottom: 6,
                    child: ListenableBuilder(
                      listenable: cart,
                      builder: (context, _) => _QuantityControl(product: product, cart: cart, onAdd: onAdd),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            product.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(height: 1.25),
          ),
          const SizedBox(height: 2),
          Text(
            formatCurrency(product.price, currency),
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: product.outOfStock ? scheme.onSurfaceVariant : scheme.onSurface,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

/// Bouton « + » posé sur la photo ; devient un sélecteur de quantité une fois au panier.
class _QuantityControl extends StatelessWidget {
  const _QuantityControl({required this.product, required this.cart, required this.onAdd});

  final BoutiqueProduct product;
  final Cart cart;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final qty = product.hasVariants ? cart.quantityOfProduct(product.id) : cart.quantityOf(product);
    final countStyle = theme.textTheme.titleSmall?.copyWith(
      color: scheme.surface,
      fontWeight: FontWeight.w800,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

    Widget round({required IconData icon, required String tooltip, required VoidCallback onPressed}) =>
        IconButton(
          tooltip: tooltip,
          onPressed: onPressed,
          iconSize: 20,
          color: scheme.surface,
          constraints: const BoxConstraints.tightFor(width: 44, height: 44),
          icon: Icon(icon),
        );

    final Widget content;
    if (qty == 0) {
      content = round(
        icon: Icons.add_rounded,
        tooltip: product.hasVariants ? 'Choisir une option' : 'Ajouter au panier',
        onPressed: onAdd,
      );
    } else if (product.hasVariants) {
      // Les options se choisissent dans la feuille dédiée : on affiche le total au panier
      content = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(padding: const EdgeInsets.only(left: 14), child: Text('$qty', style: countStyle)),
          round(icon: Icons.add_rounded, tooltip: 'Choisir une autre option', onPressed: onAdd),
        ],
      );
    } else {
      content = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          round(
            icon: Icons.remove_rounded,
            tooltip: 'Retirer un',
            onPressed: () => cart.decrement(cartKey(product.id)),
          ),
          Text('$qty', style: countStyle),
          round(icon: Icons.add_rounded, tooltip: 'Ajouter un', onPressed: onAdd),
        ],
      );
    }

    return AnimatedSize(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      alignment: Alignment.centerRight,
      child: Material(
        color: scheme.onSurface,
        shape: const StadiumBorder(),
        elevation: 2,
        shadowColor: Colors.black38,
        child: content,
      ),
    );
  }
}

/// Barre panier : nombre d'articles, accès au panier, total.
class _CartBar extends StatelessWidget {
  const _CartBar({required this.count, required this.total, required this.onPressed});

  final int count;
  final String total;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: ElmColors.navy,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onPressed,
        child: SizedBox(
          height: 58,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                Container(
                  constraints: const BoxConstraints(minWidth: 30),
                  height: 30,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: ElmColors.sun, borderRadius: BorderRadius.circular(15)),
                  child: Text(
                    '$count',
                    style: theme.textTheme.labelLarge?.copyWith(color: ElmColors.ink, fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  'Voir le panier',
                  style: theme.textTheme.titleMedium?.copyWith(color: Colors.white),
                ),
                const Spacer(),
                Text(
                  total,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// En-tête de la boutique, comme son enseigne : logo, nom, adresse, appel.
class _ShopHeader extends StatelessWidget {
  const _ShopHeader({required this.info, required this.productCount});

  final BoutiqueInfo info;
  final int productCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasPhone = (info.phone ?? '').isNotEmpty;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              BoutiqueLogo(url: info.logoUrl, size: 64),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(info.name, style: theme.textTheme.headlineSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if ((info.address ?? '').isNotEmpty) info.address!,
                        productCount == 1 ? '1 produit' : '$productCount produits',
                      ].join('\n'),
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (hasPhone) ...[
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: info.phone)),
              icon: const Icon(Icons.call_outlined, size: 18),
              label: const Text('Appeler la boutique'),
            ),
          ],
        ],
      ),
    );
  }
}

/// Squelette du catalogue pendant le chargement.
class _CatalogSkeleton extends StatelessWidget {
  const _CatalogSkeleton();

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.surfaceContainerHighest;
    Widget block(double? width, double height, [double radius = 4]) => Container(
          width: width,
          height: height,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(radius)),
        );
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            block(64, 64, 14),
            const SizedBox(width: 14),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [block(170, 20), const SizedBox(height: 8), block(110, 12)],
            ),
          ],
        ),
        const SizedBox(height: 20),
        block(null, 48, 10),
        const SizedBox(height: 20),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 20,
          crossAxisSpacing: 14,
          childAspectRatio: 0.72,
          children: [
            for (var i = 0; i < 4; i++)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: block(null, double.infinity, 10)),
                  const SizedBox(height: 8),
                  block(120, 12),
                  const SizedBox(height: 6),
                  block(70, 14),
                ],
              ),
          ],
        ),
      ],
    );
  }
}
