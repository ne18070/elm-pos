import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'partner_models.dart';
import 'partner_repository.dart';

/// « Scanner un client » : le client montre son code (app ELM Boutique → Mon code
/// client), on le scanne au comptoir et on lie son app à la boutique. Ses ordres de
/// travail lui parviennent ensuite par notification au lieu d'un lien.
///
/// Le numéro déclaré dans l'app n'est pas vérifié : c'est ici qu'on le rapproche
/// de celui de l'ordre de travail, avec le client devant soi.
class ScanClientScreen extends StatefulWidget {
  const ScanClientScreen({super.key, required this.repository, required this.business});

  final PartnerRepository repository;
  final PartnerBusiness business;

  @override
  State<ScanClientScreen> createState() => _ScanClientScreenState();
}

enum _Step { scanning, resolving, resolved, linking, done }

class _ScanClientScreenState extends State<ScanClientScreen> {
  _Step _step = _Step.scanning;
  ScannedClient? _client;
  ClientLinkResult? _result;

  // Aucun ordre avec le numéro déclaré : recherche manuelle de l'ordre
  final _search = TextEditingController();
  Timer? _debounce;
  List<OpenServiceOrder>? _searchResults;
  bool _searching = false;
  OpenServiceOrder? _picked;

  /// true : corriger l'ordre choisi avec le numéro déclaré ; false (défaut) : lier
  /// l'app au numéro de l'ordre, qui fait foi — le numéro déclaré n'est pas vérifié
  bool _useDeclaredPhone = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  String _errorMessage(Object error) {
    if (error is PartnerActionError) return error.message;
    if (error is PostgrestException) {
      return error.message.replaceFirst(RegExp(r'^ACCES_REFUSE:\s*'), '');
    }
    return 'Connexion impossible. Vérifiez le réseau et réessayez.';
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // Dernier QR refusé (pas un code ELM, ou code inconnu/expiré) : la caméra le
  // détecte à chaque image, on ne le retraite pas tant qu'il reste dans le cadre.
  String? _rejected;
  DateTime _rejectedAt = DateTime.fromMillisecondsSinceEpoch(0);

  void _reject(String raw) {
    _rejected = raw;
    _rejectedAt = DateTime.now();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_step != _Step.scanning) return;
    final raw = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
    if (raw == null) return;
    if (raw == _rejected && DateTime.now().difference(_rejectedAt) < const Duration(seconds: 4)) {
      _rejectedAt = DateTime.now();
      return;
    }
    if (!raw.toLowerCase().startsWith('elm-client:')) {
      _reject(raw);
      _toast('Ce QR n’est pas un code client ELM. Demandez au client d’ouvrir « Mon code client ».');
      return;
    }
    _resolve(raw);
  }

  Future<void> _enterCode() async {
    final controller = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Saisir le code client'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(labelText: 'Code affiché sous le QR', hintText: 'ABCD-EFGH'),
          onSubmitted: (v) => Navigator.of(context).pop(v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.of(context).pop(controller.text), child: const Text('Valider')),
        ],
      ),
    );
    controller.dispose();
    if (code != null && code.trim().isNotEmpty) await _resolve(code);
  }

  Future<void> _resolve(String code) async {
    setState(() => _step = _Step.resolving);
    try {
      final client = await widget.repository.resolveClientCode(widget.business.id, code);
      if (!mounted) return;
      setState(() {
        _client = client;
        _step = _Step.resolved;
      });
    } catch (error) {
      if (!mounted) return;
      _reject(code);
      setState(() => _step = _Step.scanning);
      _toast(_errorMessage(error));
    }
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _runSearch(value.trim()));
  }

  Future<void> _runSearch(String query) async {
    if (query.length < 2) {
      setState(() => _searchResults = null);
      return;
    }
    setState(() => _searching = true);
    try {
      final results = await widget.repository.searchServiceOrders(widget.business.id, query);
      if (mounted) setState(() => _searchResults = results);
    } catch (error) {
      _toast(_errorMessage(error));
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  /// Le numéro déclaré dans l'app n'est pas vérifié : avant toute liaison, le
  /// technicien confirme l'identité du client (sinon quelqu'un pourrait déclarer
  /// le numéro d'un autre et recevoir ses ordres). Le nom de l'ordre est comparé
  /// au nom déclaré pour signaler un écart.
  Future<bool> _confirmIdentity(ScannedClient client, String phone, {OpenServiceOrder? fixing}) async {
    final orders = [if (fixing != null) fixing else ...client.orders];
    final orderNames = orders.map((o) => o.clientName?.trim() ?? '').where((n) => n.isNotEmpty).toSet();
    final nameMismatch = orderNames.isNotEmpty && !orderNames.any((n) => namesLookAlike(client.name, n));
    var checked = false;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          final scheme = Theme.of(context).colorScheme;
          return AlertDialog(
            title: const Text('Vérifier l’identité du client'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Tous les ordres actuels et futurs du $phone seront envoyés sur ce téléphone. '
                    'Le numéro saisi dans l’app n’est pas vérifié : appelez-le devant le client '
                    'ou comparez avec sa pièce d’identité.',
                  ),
                  if (fixing != null) ...[
                    const SizedBox(height: 8),
                    Text('Le numéro de ${fixing.reference} sera remplacé par le $phone.'),
                  ],
                  if (nameMismatch) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: scheme.errorContainer,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        'Attention : le nom déclaré (« ${client.name} ») ne correspond pas au nom '
                        'de l’ordre (« ${orderNames.join(' », « ')} »).',
                        style: TextStyle(color: scheme.onErrorContainer),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  CheckboxListTile(
                    value: checked,
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: const Text('J’ai vérifié que ce numéro est celui du client'),
                    onChanged: (v) => setDialogState(() => checked = v ?? false),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Annuler')),
              FilledButton(
                onPressed: checked ? () => Navigator.of(context).pop(true) : null,
                child: const Text('Lier'),
              ),
            ],
          );
        },
      ),
    );
    return confirmed == true;
  }

  Future<void> _link() async {
    final client = _client;
    if (client == null) return;
    final picked = _picked;
    var phone = client.phone;
    var fix = <String>[];
    OpenServiceOrder? fixing;
    if (picked != null && picked.phoneNormalized != client.phoneNormalized) {
      final orderPhone = picked.clientPhone?.trim() ?? '';
      if (_useDeclaredPhone || orderPhone.isEmpty) {
        fix = [picked.id];
        fixing = picked;
      } else {
        phone = orderPhone;
      }
    }
    if (!await _confirmIdentity(client, phone, fixing: fixing)) return;
    if (!mounted) return;
    setState(() => _step = _Step.linking);
    try {
      final result = await widget.repository.linkClientApp(
        widget.business.id,
        client.code,
        phone,
        fixOrderIds: fix,
        identityChecked: true,
      );
      if (!mounted) return;
      setState(() {
        _result = result;
        _step = _Step.done;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _step = _Step.resolved);
      _toast(_errorMessage(error));
    }
  }

  void _reset() {
    _debounce?.cancel();
    _search.clear();
    setState(() {
      _client = null;
      _result = null;
      _searchResults = null;
      _picked = null;
      _useDeclaredPhone = false;
      _step = _Step.scanning;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scanner un client'),
        leading: _step == _Step.resolved
            ? IconButton(tooltip: 'Scanner à nouveau', icon: const Icon(Icons.arrow_back_rounded), onPressed: _reset)
            : null,
      ),
      body: switch (_step) {
        _Step.scanning => _buildScanner(),
        _Step.resolving || _Step.linking => const Center(child: CircularProgressIndicator()),
        _Step.resolved => _buildResolved(_client!),
        _Step.done => _buildDone(_client!, _result!),
      },
    );
  }

  Widget _buildScanner() {
    final theme = Theme.of(context);
    return Column(
      children: [
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              MobileScanner(
                onDetect: _onDetect,
                errorBuilder: (context, error) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      error.errorCode == MobileScannerErrorCode.permissionDenied
                          ? 'Autorisez l’accès à la caméra dans les réglages du téléphone, '
                              'ou saisissez le code affiché sous le QR.'
                          : 'Caméra indisponible. Saisissez le code affiché sous le QR.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ),
              Center(
                child: Container(
                  width: 240,
                  height: 240,
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.white, width: 3),
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            child: Column(
              children: [
                Text(
                  'Le client ouvre l’app ELM Boutique → « Mon code client ».',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _enterCode,
                    icon: const Icon(Icons.keyboard_outlined),
                    label: const Text('Saisir le code à la main'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildResolved(ScannedClient client) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final picked = _picked;
    final pickedPhone = picked?.clientPhone?.trim() ?? '';
    final mismatch = picked != null && picked.phoneNormalized != client.phoneNormalized;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Card(
          child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person_rounded)),
            title: Text(client.name, style: theme.textTheme.titleMedium),
            subtitle: Text('Numéro déclaré dans l’app : ${client.phone}'),
          ),
        ),
        if (client.alreadyLinked)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Icon(Icons.check_circle_rounded, color: scheme.primary, size: 20),
                const SizedBox(width: 8),
                const Expanded(child: Text('Déjà lié à votre boutique pour ce numéro.')),
              ],
            ),
          ),
        if (!client.hasPush)
          _Notice(
            icon: Icons.notifications_off_outlined,
            text: 'Notifications désactivées sur son téléphone : il verra ses ordres dans l’app '
                'mais ne sera pas alerté. Proposez-lui de les activer.',
          ),
        const SizedBox(height: 12),
        if (client.orders.isNotEmpty) ...[
          Text('Ordres ouverts avec ce numéro (${client.orders.length})', style: theme.textTheme.titleSmall),
          const SizedBox(height: 6),
          for (final order in client.orders) _OrderTile(order: order),
          const SizedBox(height: 8),
          Text(
            'Vérifiez avec le client que ce sont bien ses ordres. Les prochains ordres créés '
            'pour ce numéro lui seront aussi notifiés.',
            style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _link,
            icon: const Icon(Icons.link_rounded),
            label: const Text('Lier l’app du client'),
          ),
        ] else ...[
          Text('Aucun ordre ouvert avec ce numéro', style: theme.textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(
            'Numéro mal saisi au dépôt, ou client avec deux numéros ? Retrouvez son ordre :',
            style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _search,
            onChanged: _onSearchChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              labelText: 'N° d’ordre, nom ou téléphone',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(14),
                      child: SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 8),
          if (_searchResults != null && _searchResults!.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('Aucun ordre ouvert ne correspond.', style: theme.textTheme.bodyMedium),
            ),
          for (final order in _searchResults ?? const <OpenServiceOrder>[])
            _OrderTile(
              order: order,
              selected: order.id == picked?.id,
              onTap: () => setState(() {
                _picked = order.id == picked?.id ? null : order;
                _useDeclaredPhone = false;
              }),
            ),
          if (mismatch) ...[
            const SizedBox(height: 12),
            Text('Quel numéro garder ?', style: theme.textTheme.titleSmall),
            RadioGroup<bool>(
              groupValue: pickedPhone.isEmpty ? true : _useDeclaredPhone,
              onChanged: (v) => setState(() => _useDeclaredPhone = v ?? false),
              child: Column(
                children: [
                  if (pickedPhone.isNotEmpty)
                    RadioListTile<bool>(
                      value: false,
                      contentPadding: EdgeInsets.zero,
                      title: Text('$pickedPhone (numéro de l’ordre)'),
                      subtitle: const Text('L’app est liée à ce numéro, l’ordre ne change pas'),
                    ),
                  RadioListTile<bool>(
                    value: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('${client.phone} (déclaré dans l’app, non vérifié)'),
                    subtitle: Text('Le numéro de ${picked.reference} est remplacé'),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          if (picked != null)
            FilledButton.icon(
              onPressed: _link,
              icon: const Icon(Icons.link_rounded),
              label: const Text('Lier l’app du client'),
            )
          else
            OutlinedButton(
              onPressed: _link,
              child: const Text('Lier pour ses prochains ordres'),
            ),
        ],
      ],
    );
  }

  Widget _buildDone(ScannedClient client, ClientLinkResult result) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final orders = result.openOrders;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_rounded, size: 64, color: scheme.primary),
            const SizedBox(height: 16),
            Text('App de ${client.name} liée', textAlign: TextAlign.center, style: theme.textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              orders == 0
                  ? 'Ses prochains ordres de travail lui seront notifiés dans l’app.'
                  : '$orders ordre${orders > 1 ? 's' : ''} ouvert${orders > 1 ? 's' : ''} '
                      'et les suivants lui seront notifiés dans l’app.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
            if (result.hasPush) ...[
              const SizedBox(height: 8),
              Text(
                'Il vient de recevoir la notification « App liée ».',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ] else ...[
              const SizedBox(height: 16),
              const _Notice(
                icon: Icons.notifications_off_outlined,
                text: 'Ses notifications sont désactivées : invitez-le à les activer pour être prévenu.',
              ),
            ],
            const SizedBox(height: 28),
            FilledButton.icon(
              onPressed: _reset,
              icon: const Icon(Icons.qr_code_scanner_rounded),
              label: const Text('Scanner un autre client'),
            ),
            const SizedBox(height: 8),
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Terminer')),
          ],
        ),
      ),
    );
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order, this.selected = false, this.onTap});

  final OpenServiceOrder order;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final details = [
      if ((order.subject ?? '').isNotEmpty) order.subject!,
      if ((order.clientName ?? '').isNotEmpty) order.clientName!,
      if ((order.clientPhone ?? '').isNotEmpty) order.clientPhone!,
    ].join(' · ');
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      color: selected ? Theme.of(context).colorScheme.primaryContainer : null,
      child: ListTile(
        onTap: onTap,
        leading: Icon(selected ? Icons.check_circle_rounded : Icons.build_circle_outlined),
        title: Text('${order.reference} · ${order.statusLabel}', style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: details.isEmpty ? null : Text(details),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.tertiaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: scheme.onTertiaryContainer),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: scheme.onTertiaryContainer))),
        ],
      ),
    );
  }
}
