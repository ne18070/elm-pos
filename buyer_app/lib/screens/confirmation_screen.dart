import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/boutique_repository.dart';
import '../models/boutique.dart';
import '../utils/format.dart';
import '../widgets/common.dart';

const _statusLabels = {
  'pending': 'En attente',
  'confirmed': 'Confirmée',
  'paid': 'Payée',
  'completed': 'Terminée',
  'cancelled': 'Annulée',
  'refunded': 'Remboursée',
};

/// Confirmation après commande — lue via la RPC get_boutique_order(token).
class ConfirmationScreen extends StatefulWidget {
  const ConfirmationScreen({
    super.key,
    required this.token,
    required this.info,
    required this.paymentMethod,
    required this.repository,
  });

  final String token;
  final BoutiqueInfo info;
  final PaymentMethod paymentMethod;
  final BoutiqueRepository repository;

  @override
  State<ConfirmationScreen> createState() => _ConfirmationScreenState();
}

class _ConfirmationScreenState extends State<ConfirmationScreen> {
  BoutiqueOrderDetail? _order;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final order = await widget.repository.order(widget.token);
      if (!mounted) return;
      setState(() {
        _order = order;
        if (order == null) _error = 'Commande introuvable.';
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Votre commande est bien envoyée, mais le détail n’a pas pu être chargé.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _paymentHint(bool isDelivery) {
    switch (widget.paymentMethod) {
      case PaymentMethod.paymentLink:
        return 'Vous recevrez un lien de paiement sur votre WhatsApp très prochainement.';
      case PaymentMethod.mobileMoney:
        return isDelivery
            ? 'Préparez votre Mobile Money (Wave, Orange Money…) pour régler à la livraison.'
            : 'Préparez votre Mobile Money (Wave, Orange Money…) pour régler en boutique.';
      case PaymentMethod.cash:
        return isDelivery
            ? 'Préparez le montant exact en espèces pour régler à la remise de votre commande.'
            : 'Rendez-vous en boutique et réglez en espèces lors du retrait.';
    }
  }

  Future<void> _contactOnWhatsApp() async {
    final digits = digitsOnly(widget.info.phone ?? '');
    final opened = await launchUrl(
      Uri.parse('https://wa.me/$digits'),
      mode: LaunchMode.externalApplication,
    );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d’ouvrir WhatsApp sur cet appareil.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Commande envoyée')),
      body: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final order = _order;
    if (order == null) {
      return ErrorView(
        message: _error ?? 'Commande introuvable.',
        onRetry: _load,
        secondary: TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Retour à la boutique'),
        ),
      );
    }

    final theme = Theme.of(context);
    final currency = widget.info.currency;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 8),
          Icon(Icons.check_circle, size: 64, color: theme.colorScheme.primary),
          const SizedBox(height: 12),
          Text(
            (order.customerName ?? '').isEmpty ? 'Merci !' : 'Merci ${order.customerName} !',
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 4),
          Text(
            '${widget.info.name} a bien reçu votre commande n° ${shortOrderId(order.id)}.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 24),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _InfoRow(label: 'Statut', value: _statusLabels[order.status] ?? order.status),
                  _InfoRow(
                    label: 'Réception',
                    value: order.isDelivery ? 'Livraison' : 'En boutique',
                  ),
                  if (order.isDelivery && (order.deliveryAddress ?? '').isNotEmpty)
                    _InfoRow(label: 'Adresse', value: order.deliveryAddress!),
                  if ((order.customerPhone ?? '').isNotEmpty)
                    _InfoRow(label: 'Téléphone', value: order.customerPhone!),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  for (final item in order.items)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(child: Text('${item.name} × ${item.quantity}')),
                          Text(formatCurrency(item.total, currency)),
                        ],
                      ),
                    ),
                  const Divider(height: 24),
                  Row(
                    children: [
                      Text('Total', style: theme.textTheme.titleMedium),
                      const Spacer(),
                      Text(
                        formatCurrency(order.total, currency),
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            margin: EdgeInsets.zero,
            color: theme.colorScheme.secondaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_paymentHint(order.isDelivery)),
            ),
          ),
          const SizedBox(height: 24),
          if ((widget.info.phone ?? '').isNotEmpty) ...[
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: _contactOnWhatsApp,
              icon: const Icon(Icons.chat_outlined),
              label: Text('Contacter ${widget.info.name} sur WhatsApp'),
            ),
            const SizedBox(height: 8),
          ],
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Retour à la boutique'),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
