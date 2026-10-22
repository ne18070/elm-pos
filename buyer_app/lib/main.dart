import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config.dart';
import 'data/boutique_repository.dart';
import 'data/local_store.dart';
import 'services/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (!AppConfig.isConfigured) {
    runApp(const _MissingConfigApp());
    return;
  }

  await Supabase.initialize(url: AppConfig.supabaseUrl, anonKey: AppConfig.supabaseAnonKey);

  final repository = BoutiqueRepository(Supabase.instance.client);
  final store = LocalStore();
  // Sans configuration Firebase : no-op, l'app fonctionne sans notifications
  PushService.instance = PushService(repository, store, scaffoldMessengerKey);
  await PushService.instance.init();

  runApp(ElmBoutiqueApp(repository: repository, store: store));
}

/// Build lancé sans --dart-define : message explicite plutôt qu'un crash au démarrage.
class _MissingConfigApp extends StatelessWidget {
  const _MissingConfigApp();

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Configuration manquante : lancez avec\n'
              '--dart-define=SUPABASE_URL=… --dart-define=SUPABASE_ANON_KEY=…',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}
