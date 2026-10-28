import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';

/// Conditions d'utilisation (EULA) — résumé de renderer/app/(marketing)/conditions.
///
/// Avec [onAccept] : affiché au premier lancement (et après chaque nouvelle
/// AppConfig.termsVersion), l'app n'est accessible qu'après acceptation.
/// Sans : simple consultation depuis le menu de l'accueil.
class TermsScreen extends StatefulWidget {
  const TermsScreen({super.key, this.onAccept});

  final VoidCallback? onAccept;

  @override
  State<TermsScreen> createState() => _TermsScreenState();
}

class _TermsScreenState extends State<TermsScreen> {
  bool _agreed = false;

  void _open(String url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final gate = widget.onAccept != null;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: !gate,
        title: const Text('Conditions d’utilisation'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            if (gate) ...[
              Text('Bienvenue sur ELM Boutique', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text('Avant de commencer, lisez et acceptez nos conditions d’utilisation.'),
              const SizedBox(height: 16),
            ],
            const _Rule(
              icon: Icons.storefront_outlined,
              title: 'Contenus des commerçants',
              text: 'Les boutiques, produits, photos et prix sont publiés par les commerçants, '
                  'qui en sont responsables. La vente est conclue directement avec eux.',
            ),
            const _Rule(
              icon: Icons.gpp_bad_outlined,
              title: 'Tolérance zéro',
              text: 'Aucun contenu inacceptable (haineux, violent, pornographique, choquant, illégal, '
                  'arnaque, spam) et aucun utilisateur abusif ne sont tolérés. Le contenu est retiré '
                  'et son auteur exclu, sans préavis.',
            ),
            const _Rule(
              icon: Icons.flag_outlined,
              title: 'Signaler et bloquer',
              text: 'Le menu ⋮ de chaque boutique, et le lien « Signaler » de chaque produit, '
                  'permettent de signaler un contenu ou de bloquer une boutique : elle disparaît '
                  'aussitôt de votre app et l’équipe ELM est prévenue. Chaque signalement est '
                  'examiné sous 24 h.',
            ),
            const _Rule(
              icon: Icons.handshake_outlined,
              title: 'Votre engagement',
              text: 'Donner des coordonnées exactes, ne pas passer de commandes fictives et '
                  'respecter les commerçants. L’accès peut être limité en cas d’abus.',
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                TextButton.icon(
                  onPressed: () => _open(AppConfig.termsUrl),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: const Text('Conditions complètes'),
                ),
                TextButton.icon(
                  onPressed: () => _open(AppConfig.privacyUrl),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: const Text('Confidentialité'),
                ),
              ],
            ),
          ],
        ),
      ),
      bottomNavigationBar: !gate
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      value: _agreed,
                      onChanged: (value) => setState(() => _agreed = value ?? false),
                      title: const Text('J’ai lu et j’accepte les conditions d’utilisation'),
                    ),
                    FilledButton(
                      onPressed: _agreed ? widget.onAccept : null,
                      child: const Text('Accepter et continuer'),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule({required this.icon, required this.title, required this.text});

  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: theme.colorScheme.primary),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(text),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
