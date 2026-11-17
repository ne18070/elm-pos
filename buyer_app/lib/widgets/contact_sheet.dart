import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../data/boutique_repository.dart';

/// « Nous contacter » : joindre l'équipe ELM (pas une boutique) par WhatsApp ou email.
/// Accessible depuis l'accueil et l'espace partenaire (App Store, règle 1.2).
Future<void> showContactSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (_) => const _ContactSheet(),
  );
}

class _ContactSheet extends StatefulWidget {
  const _ContactSheet();

  @override
  State<_ContactSheet> createState() => _ContactSheetState();
}

class _ContactSheetState extends State<_ContactSheet> {
  // Client anonyme de la vitrine : le numéro est lisible sans connexion
  late final Future<String?> _whatsApp =
      BoutiqueRepository(Supabase.instance.client).supportWhatsApp().catchError((_) => null);

  Future<void> _open(Uri uri) async {
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).pop();
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Aucune application disponible pour ouvrir ce lien.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Text('Nous contacter', style: theme.textTheme.titleLarge),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                'Une question sur l’app, votre compte ou votre boutique ELM ? '
                'Pour une commande, contactez directement la boutique.',
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
            FutureBuilder<String?>(
              future: _whatsApp,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const ListTile(
                    leading: SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2.5)),
                    title: Text('WhatsApp'),
                  );
                }
                final number = snapshot.data;
                if (number == null) return const SizedBox.shrink();
                return ListTile(
                  leading: const Icon(Icons.chat_outlined),
                  title: const Text('WhatsApp'),
                  subtitle: Text('+$number'),
                  onTap: () => _open(Uri.parse('https://wa.me/$number')),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.mail_outline),
              title: const Text('Email'),
              subtitle: const Text(AppConfig.contactEmail),
              onTap: () => _open(Uri(
                scheme: 'mailto',
                path: AppConfig.contactEmail,
                query: 'subject=${Uri.encodeComponent('ELM Boutique')}',
              )),
            ),
          ],
        ),
      ),
    );
  }
}
