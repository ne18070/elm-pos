import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../models/boutique.dart';
import '../models/directory.dart';
import '../models/service.dart';
import '../state/service_cart.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/moderation.dart';
import 'service_request_screen.dart';

/// Catalogue de prestations d'une entreprise — équivalent de /services/[businessId] sur le web.
class ServiceScreen extends StatefulWidget {
  const ServiceScreen({
    super.key,
    required this.businessId,
    required this.repository,
    required this.store,
  });

  final String businessId;
  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  State<ServiceScreen> createState() => _ServiceScreenState();
}

class _ServiceScreenState extends State<ServiceScreen> {
  final _cart = ServiceCart();
  BoutiqueInfo? _info;
  List<ServiceItem> _catalog = [];
  bool _loading = true;
  String? _error;
  String? _categoryId;

  /// Établissement bloqué par l'acheteur, ouvert par un lien : rien n'est chargé
  BoutiqueInfo? _blocked;

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

  Future<void> _load({bool showSpinner = true}) async {
    setState(() {
      _loading = showSpinner;
      _error = null;
    });
    try {
      final info = await widget.repository.findBoutique(widget.businessId);
      if (info == null) {
        if (mounted) setState(() => _error = 'Cet établissement n’existe plus ou son lien a changé.');
        return;
      }
      if (await widget.store.isBlocked(info.id)) {
        if (mounted) setState(() => _blocked = info);
        return;
      }
      final catalog = await widget.repository.serviceCatalog(info.id);
      await widget.store.rememberBoutique(info, kind: VisitKind.service);
      if (!mounted) return;
      setState(() {
        _info = info;
        _catalog = catalog;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Impossible de charger les services. Vérifiez votre connexion.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<ServiceCategory> get _categories {
    final seen = <String, ServiceCategory>{};
    for (final item in _catalog) {
      if (item.category != null) seen[item.category!.id] = item.category!;
    }
    return seen.values.toList();
  }

  List<ServiceItem> get _filtered =>
      _categoryId == null ? _catalog : _catalog.where((i) => i.categoryId == _categoryId).toList();

  ModerationSubject get _subject =>
      ModerationSubject(businessId: _info!.id, businessName: _info!.name, logoUrl: _info!.logoUrl);

  Future<void> _unblock() async {
    await widget.store.unblockBusiness(_blocked!.id);
    if (!mounted) return;
    setState(() => _blocked = null);
    await _load();
  }

  Future<void> _openRequest() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ServiceRequestScreen(
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
                        Text('Services', style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
        actions: [
          if ((info?.phone ?? '').isNotEmpty)
            IconButton(
              tooltip: 'Appeler',
              icon: const Icon(Icons.call_outlined),
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: info!.phone)),
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
              child: FilledButton(
                onPressed: _openRequest,
                child: Row(
                  children: [
                    const Icon(Icons.assignment_outlined),
                    const SizedBox(width: 8),
                    Text('Demander (${_cart.count})'),
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
    if (_blocked != null) return BlockedBusinessView(name: _blocked!.name, onUnblock: _unblock);
    if (_error != null || _info == null) {
      return ErrorView(
        message: _error ?? 'Établissement introuvable.',
        onRetry: _load,
        secondary: TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Retour'),
        ),
      );
    }
    if (_catalog.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'Cet établissement ne propose pas encore de services en ligne.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final categories = _categories;
    final items = _filtered;
    return RefreshIndicator(
      onRefresh: () => _load(showSpinner: false),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          if (categories.isNotEmpty)
            SizedBox(
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
                ],
              ),
            ),
          for (final item in items)
            _ServiceTile(item: item, currency: _info!.currency, cart: _cart),
        ],
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({required this.item, required this.currency, required this.cart});

  final ServiceItem item;
  final String currency;
  final ServiceCart cart;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final duration = item.durationLabel;
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.name, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                  if ((item.description ?? '').isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      item.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Text(
                        formatCurrency(item.price, currency),
                        style: theme.textTheme.titleSmall?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (duration != null) ...[
                        const SizedBox(width: 12),
                        Icon(Icons.schedule, size: 14, color: theme.colorScheme.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Text(duration, style: theme.textTheme.bodySmall),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            ListenableBuilder(
              listenable: cart,
              builder: (context, _) {
                final qty = cart.quantityOf(item);
                if (qty == 0) {
                  return IconButton.filledTonal(
                    tooltip: 'Ajouter',
                    onPressed: () => cart.add(item),
                    icon: const Icon(Icons.add),
                  );
                }
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Retirer un',
                      onPressed: () => cart.decrement(item),
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                    Text('$qty', style: theme.textTheme.titleMedium),
                    IconButton(
                      tooltip: 'Ajouter un',
                      onPressed: () => cart.add(item),
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
