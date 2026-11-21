import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../config.dart';
import 'partner_models.dart';
import 'partner_repository.dart';
import 'partner_widgets.dart';

/// « Ma boutique en ligne » : lien et QR à partager, présence dans l'annuaire de l'app.
class ShopSettingsScreen extends StatefulWidget {
  const ShopSettingsScreen({super.key, required this.repository, required this.business});

  final PartnerRepository repository;
  final PartnerBusiness business;

  @override
  State<ShopSettingsScreen> createState() => _ShopSettingsScreenState();
}

class _ShopSettingsScreenState extends State<ShopSettingsScreen> {
  bool? _listed;
  bool _saving = false;

  String get _url => '${AppConfig.siteUrl}/boutique/${widget.business.publicRef}';

  @override
  void initState() {
    super.initState();
    _loadListed();
  }

  Future<void> _loadListed() async {
    try {
      final listed = await widget.repository.directoryListed(widget.business.id);
      if (mounted) setState(() => _listed = listed);
    } catch (_) {
      // Réglage non affiché plutôt qu'un état faux
    }
  }

  Future<void> _setListed(bool value) async {
    setState(() {
      _saving = true;
      _listed = value;
    });
    try {
      await widget.repository.setDirectoryListed(widget.business.id, value);
      if (!mounted) return;
      showPartnerToast(
        context,
        value ? 'Votre boutique apparaît dans l’annuaire de l’app' : 'Votre boutique est retirée de l’annuaire',
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _listed = !value);
      showPartnerToast(context, partnerErrorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: _url));
    if (mounted) showPartnerToast(context, 'Lien copié');
  }

  void _shareWhatsApp() {
    final text = 'Découvrez ${widget.business.name} et commandez en ligne : $_url';
    openExternal(context, Uri.parse('https://wa.me/?text=${Uri.encodeComponent(text)}'));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Ma boutique en ligne')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Text(
            'Partagez ce lien ou faites scanner le QR code : vos clients voient vos produits '
            'et commandent directement.',
            style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 20),
          Center(
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                // QR toujours noir sur blanc : lisible par tous les lecteurs, même en thème sombre
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: scheme.outlineVariant),
              ),
              child: QrImageView(data: _url, size: 200, backgroundColor: Colors.white),
            ),
          ),
          const SizedBox(height: 14),
          SelectableText(_url, textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _shareWhatsApp,
            icon: const Icon(Icons.chat_outlined),
            label: const Text('Partager sur WhatsApp'),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _copy,
                  icon: const Icon(Icons.copy_rounded),
                  label: const Text('Copier le lien'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => openExternal(context, Uri.parse(_url)),
                  icon: const Icon(Icons.open_in_new_rounded),
                  label: const Text('Voir la boutique'),
                ),
              ),
            ],
          ),
          if (_listed != null) ...[
            const SizedBox(height: 28),
            const Divider(),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _listed!,
              onChanged: _saving ? null : _setListed,
              title: const Text('Visible dans l’annuaire ELM Boutique'),
              subtitle: const Text(
                'Les utilisateurs de l’app trouvent votre boutique en la cherchant. '
                'Désactivé, elle reste accessible par son lien.',
              ),
            ),
          ],
        ],
      ),
    );
  }
}
