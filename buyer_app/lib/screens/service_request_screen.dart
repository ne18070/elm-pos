import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/boutique_repository.dart';
import '../data/local_store.dart';
import '../models/boutique.dart';
import '../models/service.dart';
import '../services/push_service.dart';
import '../state/service_cart.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import 'tracking_screen.dart';

/// Coordonnées + objet du service → create_public_service_order, puis confirmation.
class ServiceRequestScreen extends StatefulWidget {
  const ServiceRequestScreen({
    super.key,
    required this.info,
    required this.cart,
    required this.repository,
    required this.store,
  });

  final BoutiqueInfo info;
  final ServiceCart cart;
  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  State<ServiceRequestScreen> createState() => _ServiceRequestScreenState();
}

class _ServiceRequestScreenState extends State<ServiceRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _subjectRef = TextEditingController();
  final _subjectInfo = TextEditingController();
  final _notes = TextEditingController();

  bool _submitting = false;
  String? _submitError;

  /// Demande envoyée : récapitulatif figé (le panier est vidé).
  ServiceRequestResult? _result;
  List<ServiceCartLine> _sentLines = [];
  double _sentTotal = 0;

  @override
  void initState() {
    super.initState();
    _prefill();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _subjectRef.dispose();
    _subjectInfo.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _prefill() async {
    final saved = await widget.store.customerDetails();
    if (saved == null || !mounted) return;
    if (_name.text.isEmpty) _name.text = saved.name;
    if (_phone.text.isEmpty) _phone.text = saved.phone;
  }

  String? _optional(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      final result = await widget.repository.createServiceRequest(
        businessId: widget.info.id,
        clientName: _name.text.trim(),
        clientPhone: _phone.text.trim(),
        subjectRef: _optional(_subjectRef),
        subjectInfo: _optional(_subjectInfo),
        notes: _optional(_notes),
        items: widget.cart.toRequestItems(),
      );
      final saved = await widget.store.customerDetails();
      await widget.store.saveCustomerDetails(
        CustomerDetails(name: _name.text.trim(), phone: _phone.text.trim(), address: saved?.address),
      );
      final trackingToken = result.trackingToken;
      if (trackingToken != null) {
        // « Mes suivis » + notifications à chaque étape (permission demandée maintenant)
        await widget.store.rememberTracking(
          TrackedRequest(
            token: trackingToken,
            businessName: widget.info.name,
            label: 'Demande n° ${result.orderNumber ?? shortOrderId(result.id)}',
            createdAt: DateTime.now(),
          ),
        );
        await PushService.instance.subscribe(trackingToken);
      }
      if (!mounted) return;
      setState(() {
        _result = result;
        _sentLines = widget.cart.lines;
        _sentTotal = widget.cart.total;
      });
      widget.cart.clear();
    } on PostgrestException catch (e) {
      if (mounted) setState(() => _submitError = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _submitError = 'La demande n’a pas pu être envoyée. Vérifiez votre connexion et réessayez.');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return Scaffold(
      appBar: AppBar(title: Text(result == null ? 'Votre demande' : 'Demande envoyée')),
      body: result == null ? _buildForm(context) : _buildSuccess(context, result),
      bottomNavigationBar: result != null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: FilledButton(
                  onPressed: _submitting || widget.cart.isEmpty ? null : _submit,
                  child: _submitting
                      ? const SizedBox.square(
                          dimension: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5),
                        )
                      : const Text('Envoyer la demande'),
                ),
              ),
            ),
    );
  }

  Widget _buildForm(BuildContext context) {
    final currency = widget.info.currency;
    final theme = Theme.of(context);
    return Form(
      key: _formKey,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SectionTitle('Prestations'),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: ListenableBuilder(
                listenable: widget.cart,
                builder: (context, _) => Column(
                  children: [
                    for (final line in widget.cart.lines)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                line.quantity > 1 ? '${line.item.name} × ${line.quantity}' : line.item.name,
                              ),
                            ),
                            Text(formatCurrency(line.total, currency)),
                          ],
                        ),
                      ),
                    const Divider(height: 24),
                    Row(
                      children: [
                        Text('Total estimé', style: theme.textTheme.titleMedium),
                        const Spacer(),
                        Text(
                          formatCurrency(widget.cart.total, currency),
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
          const SectionTitle('Vos coordonnées'),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.name],
            decoration: const InputDecoration(labelText: 'Nom complet', hintText: 'Votre prénom et nom'),
            validator: (v) => (v ?? '').trim().isEmpty ? 'Indiquez votre nom.' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: const InputDecoration(labelText: 'Téléphone (WhatsApp)', hintText: 'Ex : 77 123 45 67'),
            validator: (v) => digitsOnly(v ?? '').length < 9
                ? 'Numéro incomplet : 9 chiffres minimum, ex. 77 123 45 67.'
                : null,
          ),
          const SizedBox(height: 24),
          const SectionTitle('Objet du service (optionnel)'),
          TextFormField(
            controller: _subjectRef,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Référence',
              hintText: 'Ex : AK-247-DK (immatriculation…)',
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _subjectInfo,
            textCapitalization: TextCapitalization.sentences,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Description',
              hintText: 'Ex : Toyota Corolla blanche 2018',
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _notes,
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Instructions',
              hintText: 'Précisez votre demande, le problème constaté, une préférence d’horaire…',
            ),
          ),
          if (_submitError != null) ...[
            const SizedBox(height: 16),
            Text(_submitError!, style: TextStyle(color: theme.colorScheme.error)),
          ],
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildSuccess(BuildContext context, ServiceRequestResult result) {
    final theme = Theme.of(context);
    final currency = widget.info.currency;
    final phone = digitsOnly(widget.info.phone ?? '');
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 8),
          Icon(Icons.check_circle, size: 64, color: theme.colorScheme.primary),
          const SizedBox(height: 12),
          Text('Demande envoyée !', textAlign: TextAlign.center, style: theme.textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(
            '${widget.info.name} vous contactera très prochainement.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text('Votre référence', style: theme.textTheme.labelMedium),
                  const SizedBox(height: 4),
                  SelectableText(
                    shortOrderId(result.id),
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 2,
                    ),
                  ),
                  Text('Conservez ce code pour le suivi', style: theme.textTheme.bodySmall),
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
                  for (final line in _sentLines)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              line.quantity > 1 ? '${line.item.name} × ${line.quantity}' : line.item.name,
                            ),
                          ),
                          Text(formatCurrency(line.total, currency)),
                        ],
                      ),
                    ),
                  const Divider(height: 24),
                  Row(
                    children: [
                      Text('Total estimé', style: theme.textTheme.titleMedium),
                      const Spacer(),
                      Text(
                        formatCurrency(_sentTotal, currency),
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          if (phone.isNotEmpty) ...[
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: () => launchUrl(
                Uri.parse('https://wa.me/$phone'),
                mode: LaunchMode.externalApplication,
              ),
              icon: const Icon(Icons.chat_outlined),
              label: Text('Contacter ${widget.info.name} sur WhatsApp'),
            ),
            const SizedBox(height: 8),
          ],
          if (result.trackingToken != null) ...[
            FilledButton.icon(
              onPressed: () => Navigator.of(context).pushReplacement(
                MaterialPageRoute<void>(
                  builder: (_) => TrackingScreen(
                    token: result.trackingToken!,
                    repository: widget.repository,
                    store: widget.store,
                  ),
                ),
              ),
              icon: const Icon(Icons.assignment_outlined),
              label: const Text('Suivre ma demande'),
            ),
            const SizedBox(height: 8),
          ],
          TextButton(
            style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Retour aux services'),
          ),
        ],
      ),
    );
  }
}
