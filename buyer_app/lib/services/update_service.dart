import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';

/// Android (APK hors Play Store) : aucune mise à jour automatique par un store.
/// Au démarrage, l'app lit android/latest.json (publié par la CI dans le bucket
/// app-releases) et propose la nouvelle version, une fois par version.
class UpdateService {
  static const _dismissedKey = 'update_dismissed_build';

  static Future<void> checkForUpdate(BuildContext context) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      final bytes = await Supabase.instance.client.storage
          .from('app-releases')
          .download('android/latest.json');
      final latest = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
      final latestBuild = (latest['build'] as num?)?.toInt() ?? 0;
      final current = int.tryParse((await PackageInfo.fromPlatform()).buildNumber) ?? 0;
      if (latestBuild <= current) return;

      final prefs = await SharedPreferences.getInstance();
      if (prefs.getInt(_dismissedKey) == latestBuild) return;
      if (!context.mounted) return;

      final update = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Nouvelle version disponible'),
          content: Text(
            'La version ${latest['version'] ?? ''} d’ELM Boutique est disponible. '
            'Téléchargez-la puis installez-la par-dessus l’app actuelle : vos boutiques et vos suivis sont conservés.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Plus tard')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Mettre à jour')),
          ],
        ),
      );
      if (update == true) {
        await launchUrl(Uri.parse(AppConfig.downloadPageUrl), mode: LaunchMode.externalApplication);
      } else {
        await prefs.setInt(_dismissedKey, latestBuild);
      }
    } catch (error) {
      // Hors ligne ou aucune version publiée : on réessaiera au prochain lancement
      debugPrint('Vérification de mise à jour impossible : $error');
    }
  }
}
