import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../models/boutique.dart';
import '../state/cart.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
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
        title: info == null
            ? null
            : Row(
                children: [
                  BoutiqueLogo(url: info.logoUrl, size: 36),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(info.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                        if ((info.address ?? '').isNotEmpty)
                          Text(
                            info.address!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                      ],
                    ),
                  ),
                ],
              ),
        actions: [
          if ((info?.phone ?? '').isNotEmpty)
            IconButton(
              tooltip: 'Appeler la boutique',
              icon: const Icon(Icons.call_outlined),
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: info!.phone)),
            ),
          if (info != null)
            PopupMenuButton<_SortKey>(
              tooltip: 'Trier',
              icon: const Icon(Icons.sort),
              initialValue: _sort,
              onSelected: (value) => setState(() => _sort = value),
              itemBuilder: (_) => [
                for (final key in _SortKey.values)
                  PopupMenuItem(value: key, child: Text(key.label)),
              ],
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
              child: FilledButton(
                onPressed: _openCheckout,
                child: Row(
                  children: [
                    const Icon(Icons.shopping_bag_outlined),
                    const SizedBox(width: 8),
                    Text('Panier (${_cart.count})'),
                    const Spacer(),
                    Text(formatCurrency(_cart.total, info.currency)),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
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
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: TextField(
                onChanged: (value) => setState(() => _search = value),
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Rechercher un produit…',
                  prefixIcon: Icon(Icons.search),
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
                    label: const Text('Afficher les épuisés'),
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
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 220,
                  mainAxisExtent: 300,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
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
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Opacity(
          opacity: product.outOfStock ? 0.55 : 1,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: ProductImage(url: product.imageUrl)),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      height: 40,
                      child: Text(
                        product.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formatCurrency(product.price, currency),
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 44,
                      child: product.outOfStock
                          ? Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                'Épuisé',
                                style: TextStyle(color: theme.colorScheme.error),
                              ),
                            )
                          : ListenableBuilder(
                              listenable: cart,
                              builder: (context, _) => _QuantityControl(
                                product: product,
                                cart: cart,
                                onAdd: onAdd,
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuantityControl extends StatelessWidget {
  const _QuantityControl({required this.product, required this.cart, required this.onAdd});

  final BoutiqueProduct product;
  final Cart cart;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    // Produit à variantes : le choix se fait dans la feuille dédiée
    if (product.hasVariants) {
      final qty = cart.quantityOfProduct(product.id);
      return FilledButton.tonal(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44)),
        onPressed: onAdd,
        child: Text(qty > 0 ? 'Options · $qty au panier' : 'Choisir', overflow: TextOverflow.ellipsis),
      );
    }

    final qty = cart.quantityOf(product);
    if (qty == 0) {
      return FilledButton.tonalIcon(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44)),
        onPressed: onAdd,
        icon: const Icon(Icons.add, size: 20),
        label: const Text('Ajouter'),
      );
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        IconButton.outlined(
          tooltip: 'Retirer un',
          onPressed: () => cart.decrement(cartKey(product.id)),
          icon: const Icon(Icons.remove, size: 20),
        ),
        Text('$qty', style: Theme.of(context).textTheme.titleMedium),
        IconButton.filled(
          tooltip: 'Ajouter un',
          onPressed: onAdd,
          icon: const Icon(Icons.add, size: 20),
        ),
      ],
    );
  }
}
