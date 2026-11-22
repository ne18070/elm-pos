import 'package:flutter/material.dart';

import '../utils/format.dart';
import 'partner_models.dart';
import 'partner_repository.dart';
import 'partner_widgets.dart';

enum _OrderFilter { todo, all }

/// « Commandes » : commandes passées sur la boutique en ligne (site + app).
/// À traiter = encore à encaisser ou à remettre au client.
class PartnerOrdersTab extends StatefulWidget {
  const PartnerOrdersTab({
    super.key,
    required this.repository,
    required this.business,
    required this.onTodoCount,
  });

  final PartnerRepository repository;
  final PartnerBusiness business;

  /// Nombre de commandes à traiter, pour la pastille de la barre de navigation
  final ValueChanged<int> onTodoCount;

  @override
  State<PartnerOrdersTab> createState() => _PartnerOrdersTabState();
}

class _PartnerOrdersTabState extends State<PartnerOrdersTab> with AutomaticKeepAliveClientMixin {
  List<PartnerOrder> _orders = [];
  bool _loading = true;
  String? _error;
  _OrderFilter _filter = _OrderFilter.todo;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final orders = await widget.repository.boutiqueOrders(widget.business.id);
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _error = null;
      });
      widget.onTodoCount(orders.where((o) => o.needsAction).length);
    } catch (_) {
      if (!mounted) return;
      if (silent) {
        showPartnerToast(context, 'Actualisation impossible. Vérifiez votre connexion.');
      } else {
        setState(() => _error = 'Impossible de charger les commandes. Vérifiez votre connexion.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(PartnerOrder order) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => PartnerOrderScreen(repository: widget.repository, business: widget.business, order: order),
      ),
    );
    if (mounted) await _load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: const Text('Réessayer')),
            ],
          ),
        ),
      );
    }

    final todo = _orders.where((o) => o.needsAction).toList();
    final visible = _filter == _OrderFilter.todo ? todo : _orders;
    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: SegmentedButton<_OrderFilter>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: _OrderFilter.todo, label: Text('À traiter (${todo.length})')),
                  ButtonSegment(value: _OrderFilter.all, label: Text('Toutes (${_orders.length})')),
                ],
                selected: {_filter},
                onSelectionChanged: (s) => setState(() => _filter = s.first),
              ),
            ),
          ),
          if (visible.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: PartnerEmptyState(
                icon: Icons.receipt_long_outlined,
                message: _orders.isEmpty
                    ? 'Aucune commande en ligne pour l’instant.\n'
                        'Les commandes passées sur votre boutique (site et app ELM Boutique) arrivent ici.'
                    : 'Tout est traité : aucune commande à encaisser ou à remettre.',
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.only(bottom: 24),
              sliver: SliverList.separated(
                itemCount: visible.length,
                separatorBuilder: (_, __) => const Divider(height: 1, indent: 16),
                itemBuilder: (context, index) => _OrderRow(
                  order: visible[index],
                  currency: widget.business.currency,
                  onTap: () => _open(visible[index]),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Statut principal d'une commande, du plus urgent au plus calme.
(String, StatusTone) orderStatusOf(PartnerOrder order) {
  if (order.status == 'refunded') return ('Remboursée', StatusTone.neutral);
  if (order.isCancelled) return ('Annulée', StatusTone.neutral);
  if (order.isPaid && order.isHandedOver) return ('Terminée', StatusTone.success);
  if (order.isHandedOver) return ('À encaisser', StatusTone.warning);
  if (order.deliveryStatus == 'picking') return ('En préparation', StatusTone.info);
  return ('Nouvelle', StatusTone.info);
}

class _OrderRow extends StatelessWidget {
  const _OrderRow({required this.order, required this.currency, required this.onTap});

  final PartnerOrder order;
  final String currency;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (label, tone) = orderStatusOf(order);
    final name = (order.customerName ?? '').trim();
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          name.isEmpty ? 'Client sans nom' : name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium,
                        ),
                      ),
                      const SizedBox(width: 8),
                      StatusChip(label: label, tone: tone),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${order.reference} · ${order.articleCount} article${order.articleCount > 1 ? 's' : ''} · '
                    '${order.isDelivery ? 'Livraison' : 'Retrait'}',
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  Text(
                    formatDateTime(order.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatCurrency(order.total, currency),
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                if (!order.isCancelled)
                  Text(
                    order.isPaid ? 'Payée' : 'Non payée',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: order.isPaid ? theme.colorScheme.onSurfaceVariant : theme.colorScheme.error,
                    ),
                  ),
              ],
            ),
            Icon(Icons.chevron_right_rounded, color: theme.colorScheme.outline),
          ],
        ),
      ),
    );
  }
}

/// Détail d'une commande en ligne : encaisser, remettre au client, annuler.
class PartnerOrderScreen extends StatefulWidget {
  const PartnerOrderScreen({super.key, required this.repository, required this.business, required this.order});

  final PartnerRepository repository;
  final PartnerBusiness business;
  final PartnerOrder order;

  @override
  State<PartnerOrderScreen> createState() => _PartnerOrderScreenState();
}

class _PartnerOrderScreenState extends State<PartnerOrderScreen> {
  late PartnerOrder _order = widget.order;
  bool _busy = false;

  String get _currency => widget.business.currency;

  Future<void> _run(Future<void> Function() action, String success) async {
    setState(() => _busy = true);
    try {
      await action();
      final fresh = await widget.repository.boutiqueOrder(_order.id);
      if (!mounted) return;
      setState(() {
        if (fresh != null) _order = fresh;
      });
      showPartnerToast(context, success);
    } catch (e) {
      if (mounted) showPartnerToast(context, partnerErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _collect() async {
    final method = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
              child: Text(
                'Encaisser ${formatCurrency(_order.balanceDue, _currency)}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: const Text('Espèces'),
              onTap: () => Navigator.of(context).pop('cash'),
            ),
            ListTile(
              leading: const Icon(Icons.phone_android_outlined),
              title: const Text('Mobile money (Wave, Orange Money…)'),
              onTap: () => Navigator.of(context).pop('mobile_money'),
            ),
            ListTile(
              leading: const Icon(Icons.credit_card_outlined),
              title: const Text('Carte bancaire'),
              onTap: () => Navigator.of(context).pop('card'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (method == null || !mounted) return;
    await _run(
      () => widget.repository.collectOrderPayment(_order, method),
      'Paiement de ${formatCurrency(_order.balanceDue, _currency)} enregistré',
    );
  }

  Future<void> _handOver() => _run(
        () => widget.repository.confirmHandOver(_order.id),
        _order.isDelivery ? 'Commande marquée livrée' : 'Commande marquée retirée',
      );

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Annuler cette commande ?'),
        content: Text(
          _order.isPaid
              ? 'Elle est déjà payée : pensez à rembourser le client. Les articles retournent en stock.'
              : 'Les articles retournent en stock. Prévenez le client que sa commande est annulée.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Garder')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
            child: const Text('Annuler la commande'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run(() => widget.repository.cancelOrder(_order.id), 'Commande annulée');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final order = _order;
    final (label, tone) = orderStatusOf(order);

    final Widget? primary = order.canCollect
        ? FilledButton.icon(
            onPressed: _busy ? null : _collect,
            icon: const Icon(Icons.payments_outlined),
            label: Text('Encaisser ${formatCurrency(order.balanceDue, _currency)}'),
          )
        : order.canHandOver
            ? FilledButton.icon(
                onPressed: _busy ? null : _handOver,
                icon: Icon(order.isDelivery ? Icons.local_shipping_outlined : Icons.storefront_outlined),
                label: Text(order.isDelivery ? 'Marquer livrée' : 'Marquer retirée par le client'),
              )
            : null;
    // Encaissée sur place puis remise : les deux actions restent accessibles, une seule en avant
    final Widget? secondary = order.canCollect && order.canHandOver
        ? OutlinedButton(
            onPressed: _busy ? null : _handOver,
            child: Text(order.isDelivery ? 'Marquer livrée' : 'Marquer retirée'),
          )
        : null;

    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Commande ${order.reference}'),
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Row(
              children: [
                StatusChip(label: label, tone: tone),
                const SizedBox(width: 8),
                StatusChip(label: order.isDelivery ? 'Livraison' : 'Retrait en boutique'),
                const Spacer(),
                Text(
                  formatDateTime(order.createdAt),
                  style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
            const SizedBox(height: 14),
            CustomerContactCard(
              name: order.customerName,
              phone: order.customerPhone,
              extra: order.isDelivery && (order.deliveryAddress ?? '').trim().isNotEmpty
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.place_outlined, size: 18, color: scheme.onSurfaceVariant),
                        const SizedBox(width: 6),
                        Expanded(child: Text(order.deliveryAddress!.trim())),
                      ],
                    )
                  : null,
            ),
            const SizedBox(height: 14),
            Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Articles', style: theme.textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant)),
                    const SizedBox(height: 6),
                    for (final item in order.items)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 34,
                              child: Text('${item.quantity}×', style: theme.textTheme.bodyMedium),
                            ),
                            Expanded(child: Text(item.name, style: theme.textTheme.bodyMedium)),
                            const SizedBox(width: 8),
                            Text(formatCurrency(item.total, _currency), style: theme.textTheme.bodyMedium),
                          ],
                        ),
                      ),
                    const Divider(height: 20),
                    _TotalLine(label: 'Total', value: formatCurrency(order.total, _currency), bold: true),
                    if (!order.isCancelled) ...[
                      _TotalLine(label: 'Déjà payé', value: formatCurrency(order.amountPaid, _currency)),
                      if (order.balanceDue > 0.005)
                        _TotalLine(
                          label: 'Reste à encaisser',
                          value: formatCurrency(order.balanceDue, _currency),
                          color: scheme.error,
                        ),
                    ],
                  ],
                ),
              ),
            ),
            if ((order.notes ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 14),
              Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Note du client',
                          style: theme.textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant)),
                      const SizedBox(height: 4),
                      Text(order.notes!.trim()),
                    ],
                  ),
                ),
              ),
            ],
            if (order.canCancel) ...[
              const SizedBox(height: 24),
              Center(
                child: TextButton.icon(
                  onPressed: _busy ? null : _cancel,
                  style: TextButton.styleFrom(foregroundColor: scheme.error),
                  icon: const Icon(Icons.cancel_outlined),
                  label: const Text('Annuler la commande'),
                ),
              ),
            ],
          ],
        ),
        bottomNavigationBar: primary == null
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_busy)
                        const Padding(padding: EdgeInsets.only(bottom: 8), child: LinearProgressIndicator()),
                      primary,
                      if (secondary != null) ...[const SizedBox(height: 8), secondary],
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

class _TotalLine extends StatelessWidget {
  const _TotalLine({required this.label, required this.value, this.bold = false, this.color});

  final String label;
  final String value;
  final bool bold;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
          fontWeight: bold ? FontWeight.w700 : null,
          color: color,
        );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(value, style: style),
        ],
      ),
    );
  }
}
