import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../utils/format.dart';
import 'partner_repository.dart';

/// Message lisible pour une erreur d'action partenaire (RPC, RLS, réseau).
String partnerErrorMessage(Object error) {
  if (error is PartnerException) return error.message;
  if (error is PartnerActionError) return error.message;
  if (error is PostgrestException) {
    final message = error.message.replaceFirst(RegExp(r'^ACCES_REFUSE:\s*'), '');
    return message.isEmpty ? 'Action refusée.' : message;
  }
  return 'Connexion impossible. Vérifiez le réseau et réessayez.';
}

void showPartnerToast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

Future<void> openExternal(BuildContext context, Uri uri) async {
  final messenger = ScaffoldMessenger.of(context);
  final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened) {
    messenger.showSnackBar(const SnackBar(content: Text('Aucune application disponible pour ouvrir ce lien.')));
  }
}

/// Pastille de statut (couleurs du thème : lisible en clair comme en sombre).
enum StatusTone { neutral, info, warning, success, danger }

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, this.tone = StatusTone.neutral});

  final String label;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (Color bg, Color fg) = switch (tone) {
      StatusTone.neutral => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
      StatusTone.info => (scheme.primaryContainer, scheme.onPrimaryContainer),
      StatusTone.warning => (scheme.tertiaryContainer, scheme.onTertiaryContainer),
      StatusTone.success => (scheme.secondaryContainer, scheme.onSecondaryContainer),
      StatusTone.danger => (scheme.errorContainer, scheme.onErrorContainer),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: fg, fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// Client avec appel et WhatsApp à portée de pouce.
class CustomerContactCard extends StatelessWidget {
  const CustomerContactCard({super.key, required this.name, required this.phone, this.extra});

  final String? name;
  final String? phone;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final digits = digitsOnly(phone ?? '');
    final hasPhone = digits.length >= 7;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Client', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text(
              (name ?? '').trim().isEmpty ? 'Client sans nom' : name!.trim(),
              style: theme.textTheme.titleMedium,
            ),
            if (hasPhone) Text(phone!.trim(), style: theme.textTheme.bodyMedium),
            if (extra != null) ...[const SizedBox(height: 6), extra!],
            if (hasPhone) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => openExternal(context, Uri(scheme: 'tel', path: phone!.trim())),
                      icon: const Icon(Icons.call_outlined),
                      label: const Text('Appeler'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          openExternal(context, Uri.parse('https://wa.me/${whatsAppNumber(phone!)}')),
                      icon: const Icon(Icons.chat_outlined),
                      label: const Text('WhatsApp'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Liste vide ou filtrée sans résultat : dit pourquoi.
class PartnerEmptyState extends StatelessWidget {
  const PartnerEmptyState({super.key, required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 24, 32, 48),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 40, color: theme.colorScheme.outline),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center, style: theme.textTheme.titleMedium),
        ],
      ),
    );
  }
}
