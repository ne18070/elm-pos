import 'package:flutter/material.dart';

import '../utils/format.dart';
import 'partner_models.dart';
import 'partner_repository.dart';
import 'partner_widgets.dart';

/// Colonnes du tableau Prestations du web, dans l'ordre du flux.
const _columns = ['attente', 'en_cours', 'pause', 'termine'];

StatusTone serviceStatusTone(String status) => switch (status) {
      'attente' => StatusTone.warning,
      'en_cours' => StatusTone.info,
      'pause' => StatusTone.neutral,
      'termine' => StatusTone.success,
      'annule' => StatusTone.danger,
      _ => StatusTone.neutral,
    };

/// « Atelier » : ordres de travail en cours, par statut. Chaque changement de
/// statut prévient le client (lien de suivi ou app liée par « Scanner un client »).
class PartnerServiceOrdersTab extends StatefulWidget {
  const PartnerServiceOrdersTab({super.key, required this.repository, required this.business});

  final PartnerRepository repository;
  final PartnerBusiness business;

  @override
  State<PartnerServiceOrdersTab> createState() => _PartnerServiceOrdersTabState();
}

class _PartnerServiceOrdersTabState extends State<PartnerServiceOrdersTab> with AutomaticKeepAliveClientMixin {
  List<PartnerServiceOrder> _orders = [];
  bool _loading = true;
  String? _error;
  String _status = 'attente';
  String _search = '';

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
      final orders = await widget.repository.openServiceOrders(widget.business.id);
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      if (silent) {
        showPartnerToast(context, 'Actualisation impossible. Vérifiez votre connexion.');
      } else {
        setState(() => _error = 'Impossible de charger les ordres de travail. Vérifiez votre connexion.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(PartnerServiceOrder order) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => PartnerServiceOrderScreen(
          repository: widget.repository,
          business: widget.business,
          order: order,
        ),
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

    final query = _search.trim().toLowerCase();
    final searching = query.isNotEmpty;
    bool matches(PartnerServiceOrder o) => [
          o.reference,
          o.clientName,
          o.clientPhone,
          o.subjectRef,
          o.subjectInfo,
        ].whereType<String>().any((v) => v.toLowerCase().contains(query));
    // Une recherche porte sur tous les statuts : on cherche un client, pas une colonne
    final visible = searching ? _orders.where(matches).toList() : _orders.where((o) => o.status == _status).toList();

    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: TextField(
                onChanged: (v) => setState(() => _search = v),
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Client, téléphone, OT, plaque…',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
            ),
          ),
          if (!searching)
            SliverToBoxAdapter(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Row(
                  children: [
                    for (final status in _columns)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(
                            '${serviceStatusLabel(status)} (${_orders.where((o) => o.status == status).length})',
                          ),
                          selected: _status == status,
                          onSelected: (_) => setState(() => _status = status),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          if (visible.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: PartnerEmptyState(
                icon: Icons.handyman_outlined,
                message: searching
                    ? 'Aucun ordre en cours ne correspond à « ${_search.trim()} ».'
                    : _emptyMessage(),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.only(bottom: 24),
              sliver: SliverList.separated(
                itemCount: visible.length,
                separatorBuilder: (_, __) => const Divider(height: 1, indent: 16),
                itemBuilder: (context, index) => _ServiceOrderRow(
                  order: visible[index],
                  currency: widget.business.currency,
                  showStatus: searching,
                  onTap: () => _open(visible[index]),
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _emptyMessage() => switch (_status) {
        'attente' => _orders.isEmpty
            ? 'Aucun ordre de travail en cours.\nLes ordres créés à la caisse ou demandés depuis l’app arrivent ici.'
            : 'Aucun ordre en attente : tout est pris en charge.',
        'en_cours' => 'Aucun ordre en cours de réalisation.',
        'pause' => 'Aucun ordre en pause.',
        _ => 'Aucun ordre terminé à encaisser.',
      };
}

class _ServiceOrderRow extends StatelessWidget {
  const _ServiceOrderRow({
    required this.order,
    required this.currency,
    required this.showStatus,
    required this.onTap,
  });

  final PartnerServiceOrder order;
  final String currency;
  final bool showStatus;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final name = (order.clientName ?? '').trim();
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
                      Text(order.reference, style: theme.textTheme.labelLarge),
                      if (showStatus) ...[
                        const SizedBox(width: 8),
                        StatusChip(label: order.statusLabel, tone: serviceStatusTone(order.status)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    name.isEmpty ? 'Client sans nom' : name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium,
                  ),
                  if (order.subject.isNotEmpty)
                    Text(order.subject, maxLines: 1, overflow: TextOverflow.ellipsis, style: muted),
                  if (order.itemNames.isNotEmpty)
                    Text(order.itemNames.join(', '), maxLines: 1, overflow: TextOverflow.ellipsis, style: muted),
                  if ((order.assignedName ?? '').trim().isNotEmpty)
                    Text('Technicien : ${order.assignedName!.trim()}', style: muted),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(formatCurrency(order.total, currency), style: theme.textTheme.titleSmall),
            Icon(Icons.chevron_right_rounded, color: theme.colorScheme.outline),
          ],
        ),
      ),
    );
  }
}

/// Détail d'un ordre de travail : contact client et passage à l'étape suivante.
/// L'encaissement et la modification des prestations restent sur la caisse / le web.
class PartnerServiceOrderScreen extends StatefulWidget {
  const PartnerServiceOrderScreen({
    super.key,
    required this.repository,
    required this.business,
    required this.order,
  });

  final PartnerRepository repository;
  final PartnerBusiness business;
  final PartnerServiceOrder order;

  @override
  State<PartnerServiceOrderScreen> createState() => _PartnerServiceOrderScreenState();
}

class _PartnerServiceOrderScreenState extends State<PartnerServiceOrderScreen> {
  PartnerServiceOrder get _order => widget.order;

  /// Statut en cours d'enregistrement (null : rien en cours)
  String? _saving;

  Future<void> _setStatus(String status) async {
    if (status == 'annule') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Annuler ${_order.reference} ?'),
          content: const Text('Le client est prévenu que son ordre de travail est annulé.'),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Garder')),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
              child: const Text('Annuler l’ordre'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    if (!mounted) return;
    setState(() => _saving = status);
    try {
      await widget.repository.setServiceOrderStatus(widget.business.id, _order, status);
      if (!mounted) return;
      showPartnerToast(context, '${_order.reference} : ${serviceStatusLabel(status).toLowerCase()}. Client prévenu.');
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      showPartnerToast(context, partnerErrorMessage(e));
      setState(() => _saving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final order = _order;
    final currency = widget.business.currency;
    final next = order.nextStatuses;
    final busy = _saving != null;

    return PopScope(
      canPop: !busy,
      child: Scaffold(
        appBar: AppBar(title: Text(order.reference)),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Row(
              children: [
                StatusChip(label: order.statusLabel, tone: serviceStatusTone(order.status)),
                const Spacer(),
                Text(formatDateTime(order.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
              ],
            ),
            const SizedBox(height: 14),
            CustomerContactCard(name: order.clientName, phone: order.clientPhone),
            const SizedBox(height: 14),
            Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (order.subject.isNotEmpty) ...[
                      Text('Objet', style: theme.textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant)),
                      const SizedBox(height: 2),
                      Text(order.subject, style: theme.textTheme.titleSmall),
                      const SizedBox(height: 12),
                    ],
                    Text('Prestations', style: theme.textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant)),
                    const SizedBox(height: 4),
                    if (order.itemNames.isEmpty)
                      Text('Aucune prestation saisie', style: theme.textTheme.bodyMedium)
                    else
                      for (final name in order.itemNames)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Text('• $name', style: theme.textTheme.bodyMedium),
                        ),
                    const Divider(height: 20),
                    Row(
                      children: [
                        Expanded(child: Text('Total', style: theme.textTheme.titleSmall)),
                        Text(formatCurrency(order.total, currency), style: theme.textTheme.titleSmall),
                      ],
                    ),
                    if (order.paidAmount > 0)
                      Row(
                        children: [
                          const Expanded(child: Text('Déjà payé')),
                          Text(formatCurrency(order.paidAmount, currency)),
                        ],
                      ),
                    if ((order.assignedName ?? '').trim().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text('Technicien : ${order.assignedName!.trim()}', style: theme.textTheme.bodyMedium),
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
                      Text('Notes', style: theme.textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant)),
                      const SizedBox(height: 4),
                      Text(order.notes!.trim()),
                    ],
                  ),
                ),
              ),
            ],
            if (order.status == 'termine') ...[
              const SizedBox(height: 14),
              Text(
                'Travail terminé : l’encaissement se fait à la caisse ou sur elm-app.click.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
            if (!order.isClosed && order.paidAmount <= 0) ...[
              const SizedBox(height: 24),
              Center(
                child: TextButton.icon(
                  onPressed: busy ? null : () => _setStatus('annule'),
                  style: TextButton.styleFrom(foregroundColor: scheme.error),
                  icon: const Icon(Icons.cancel_outlined),
                  label: const Text('Annuler l’ordre de travail'),
                ),
              ),
            ],
          ],
        ),
        bottomNavigationBar: next.isEmpty
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final (index, status) in next.indexed) ...[
                        if (index > 0) const SizedBox(height: 8),
                        if (index == 0)
                          FilledButton(
                            onPressed: busy ? null : () => _setStatus(status),
                            child: _saving == status
                                ? const SizedBox.square(
                                    dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                                : Text(serviceActionLabel(status)),
                          )
                        else
                          OutlinedButton(
                            onPressed: busy ? null : () => _setStatus(status),
                            child: _saving == status
                                ? const SizedBox.square(
                                    dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                                : Text(serviceActionLabel(status)),
                          ),
                      ],
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}
