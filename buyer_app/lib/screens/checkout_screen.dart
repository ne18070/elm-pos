import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../models/boutique.dart';
import '../state/cart.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import 'confirmation_screen.dart';

/// Panier + coordonnées + réception + paiement → create_boutique_order.
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({
    super.key,
    required this.info,
    required this.cart,
    required this.repository,
    required this.store,
  });

  final BoutiqueInfo info;
  final Cart cart;
  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _notes = TextEditingController();

  DeliveryType _delivery = DeliveryType.pickup;
  PaymentMethod _payment = PaymentMethod.cash;
  bool _submitting = false;
  // Commande envoyée : le panier est vidé pendant la transition, sans afficher « panier vide »
  bool _ordered = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _prefill();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _address.dispose();
    _notes.dispose();
    super.dispose();
  }

  /// Coordonnées de la dernière commande : l'acheteur n'a pas à les retaper.
  Future<void> _prefill() async {
    final saved = await widget.store.customerDetails();
    if (saved == null || !mounted) return;
    if (_name.text.isEmpty) _name.text = saved.name;
    if (_phone.text.isEmpty) _phone.text = saved.phone;
    if (_address.text.isEmpty) _address.text = saved.address ?? '';
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    final isDelivery = _delivery == DeliveryType.delivery;
    try {
      final token = await widget.repository.createOrder(
        businessId: widget.info.id,
        customerName: _name.text.trim(),
        customerPhone: _phone.text.trim(),
        deliveryType: _delivery,
        paymentMethod: _payment,
        deliveryAddress: isDelivery ? _address.text.trim() : null,
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        items: widget.cart.toOrderItems(),
      );
      await widget.store.saveCustomerDetails(
        CustomerDetails(
          name: _name.text.trim(),
          phone: _phone.text.trim(),
          address: _address.text.trim().isEmpty ? null : _address.text.trim(),
        ),
      );
      if (!mounted) return;
      setState(() => _ordered = true);
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => ConfirmationScreen(
            token: token,
            info: widget.info,
            paymentMethod: _payment,
            repository: widget.repository,
          ),
        ),
      );
      widget.cart.clear();
    } on PostgrestException catch (e) {
      if (mounted) setState(() => _submitError = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _submitError = 'La commande n’a pas pu être envoyée. Vérifiez votre connexion et réessayez.');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currency = widget.info.currency;
    return Scaffold(
      appBar: AppBar(title: const Text('Votre commande')),
      body: ListenableBuilder(
        listenable: widget.cart,
        builder: (context, _) {
          if (widget.cart.isEmpty && !_ordered) {
            return ErrorView(
              message: 'Votre panier est vide.',
              secondary: FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Continuer mes achats'),
              ),
            );
          }
          return Form(
            key: _formKey,
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const SectionTitle('Panier'),
                _CartSummary(cart: widget.cart, currency: currency),
                const SizedBox(height: 24),
                const SectionTitle('Vos coordonnées'),
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.name],
                  decoration: const InputDecoration(labelText: 'Nom complet', hintText: 'Ex : Amadou Diallo'),
                  validator: (v) => (v ?? '').trim().isEmpty ? 'Indiquez votre nom pour la commande.' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  decoration: const InputDecoration(
                    labelText: 'Téléphone (WhatsApp)',
                    hintText: 'Ex : 77 000 00 00',
                  ),
                  validator: (v) => digitsOnly(v ?? '').length < 9
                      ? 'Numéro incomplet : 9 chiffres minimum, ex. 77 000 00 00.'
                      : null,
                ),
                const SizedBox(height: 24),
                const SectionTitle('Réception'),
                SegmentedButton<DeliveryType>(
                  segments: const [
                    ButtonSegment(
                      value: DeliveryType.pickup,
                      icon: Icon(Icons.storefront_outlined),
                      label: Text('En boutique'),
                    ),
                    ButtonSegment(
                      value: DeliveryType.delivery,
                      icon: Icon(Icons.local_shipping_outlined),
                      label: Text('Livraison'),
                    ),
                  ],
                  selected: {_delivery},
                  onSelectionChanged: (s) => setState(() => _delivery = s.first),
                ),
                if (_delivery == DeliveryType.delivery) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _address,
                    textCapitalization: TextCapitalization.sentences,
                    autofillHints: const [AutofillHints.fullStreetAddress],
                    decoration: const InputDecoration(
                      labelText: 'Adresse de livraison',
                      hintText: 'Ex : Rue 10, Dakar',
                    ),
                    validator: (v) => (v ?? '').trim().isEmpty
                        ? 'Indiquez l’adresse où livrer la commande.'
                        : null,
                  ),
                ],
                const SizedBox(height: 24),
                const SectionTitle('Paiement'),
                for (final option in _paymentOptions(_delivery))
                  _ChoiceTile(
                    selected: _payment == option.method,
                    icon: option.icon,
                    title: option.title,
                    subtitle: option.subtitle,
                    onTap: () => setState(() => _payment = option.method),
                  ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _notes,
                  maxLines: 2,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Notes (optionnel)',
                    hintText: 'Instructions spéciales, horaires…',
                  ),
                ),
                if (_submitError != null) ...[
                  const SizedBox(height: 16),
                  Text(_submitError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 16),
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: ListenableBuilder(
        listenable: widget.cart,
        builder: (context, _) {
          if (widget.cart.isEmpty && !_ordered) return const SizedBox.shrink();
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: FilledButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox.square(
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5),
                      )
                    : Text('Commander · ${formatCurrency(widget.cart.total, currency)}'),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PaymentOption {
  const _PaymentOption(this.method, this.icon, this.title, this.subtitle);

  final PaymentMethod method;
  final IconData icon;
  final String title;
  final String subtitle;
}

/// Mêmes libellés que la vitrine web (BoutiqueClient.tsx).
List<_PaymentOption> _paymentOptions(DeliveryType delivery) {
  final isDelivery = delivery == DeliveryType.delivery;
  return [
    _PaymentOption(
      PaymentMethod.cash,
      Icons.payments_outlined,
      isDelivery ? 'À la livraison' : 'Sur place',
      isDelivery ? 'Payez en espèces à la réception' : 'Payez en espèces en boutique',
    ),
    const _PaymentOption(
      PaymentMethod.mobileMoney,
      Icons.phone_android,
      'Mobile Money',
      'Wave, Orange Money…',
    ),
    const _PaymentOption(
      PaymentMethod.paymentLink,
      Icons.chat_outlined,
      'Lien de paiement sécurisé',
      'Lien envoyé sur WhatsApp',
    ),
  ];
}

class _ChoiceTile extends StatelessWidget {
  const _ChoiceTile({
    required this.selected,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected ? scheme.primaryContainer : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(icon, color: selected ? scheme.primary : scheme.onSurfaceVariant),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                Icon(
                  selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                  color: selected ? scheme.primary : scheme.outline,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CartSummary extends StatelessWidget {
  const _CartSummary({required this.cart, required this.currency});

  final Cart cart;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          children: [
            for (final line in cart.lines)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(line.name, maxLines: 2, overflow: TextOverflow.ellipsis),
                          Text(
                            formatCurrency(line.unitPrice, currency),
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Retirer un',
                      onPressed: () => cart.decrement(line.key),
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                    Text('${line.quantity}', style: theme.textTheme.titleMedium),
                    IconButton(
                      tooltip: 'Ajouter un',
                      onPressed: line.atMax ? null : () => cart.increment(line.key),
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
              ),
            const Divider(),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Text('Total', style: theme.textTheme.titleMedium),
                  const Spacer(),
                  Text(
                    formatCurrency(cart.total, currency),
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
