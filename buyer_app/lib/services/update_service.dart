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
  static const _dismissedKey = 'update_dismissed_version';

  static Future<void> checkForUpdate(BuildContext context) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      final bytes = await Supabase.instance.client.storage
          .from('app-releases')
          .download('android/latest.json');
      final latest = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
      final latestVersion = '${latest['version'] ?? ''}';
      // Version X.Y.Z et non numéro de build : les APK par architecture (--split-per-abi)
      // ont un versionCode préfixé (arm64 : 2000 + build), différent de latest.json.
      final currentVersion = (await PackageInfo.fromPlatform()).version;
      if (compareVersions(latestVersion, currentVersion) <= 0) return;

      final prefs = await SharedPreferences.getInstance();
      if (prefs.getString(_dismissedKey) == latestVersion) return;
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
        await prefs.setString(_dismissedKey, latestVersion);
      }
    } catch (error) {
      // Hors ligne ou aucune version publiée : on réessaiera au prochain lancement
      debugPrint('Vérification de mise à jour impossible : $error');
    }
  }
}

/// Compare deux versions « X.Y.Z » : négatif si a < b, 0 si égales, positif si a > b.
/// Un segment absent ou non numérique compte pour 0.
int compareVersions(String a, String b) {
  List<int> parts(String v) => v.split('.').map((p) => int.tryParse(p.trim()) ?? 0).toList();
  final pa = parts(a);
  final pb = parts(b);
  for (var i = 0; i < 3; i++) {
    final x = i < pa.length ? pa[i] : 0;
    final y = i < pb.length ? pb[i] : 0;
    if (x != y) return x.compareTo(y);
  }
  return 0;
}
