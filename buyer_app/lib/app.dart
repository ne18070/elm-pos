import 'package:flutter/material.dart';

import 'config.dart';
import 'data/boutique_repository.dart';
import 'data/local_store.dart';
import 'screens/home_screen.dart';
import 'screens/terms_screen.dart';
import 'theme.dart';

/// Affiche les notifications reçues quand l'app est ouverte (PushService)
final scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

class ElmBoutiqueApp extends StatelessWidget {
  const ElmBoutiqueApp({super.key, required this.repository, required this.store});

  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ELM Boutique',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: scaffoldMessengerKey,
      theme: buildElmTheme(Brightness.light),
      darkTheme: buildElmTheme(Brightness.dark),
      home: _TermsGate(repository: repository, store: store),
    );
  }
}

/// Conditions d'utilisation à accepter avant d'accéder à l'app (App Store, règle 1.2).
class _TermsGate extends StatefulWidget {
  const _TermsGate({required this.repository, required this.store});

  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  State<_TermsGate> createState() => _TermsGateState();
}

class _TermsGateState extends State<_TermsGate> {
  bool? _accepted;

  @override
  void initState() {
    super.initState();
    widget.store.acceptedTermsVersion().then((version) {
      if (mounted) setState(() => _accepted = version >= AppConfig.termsVersion);
    });
  }

  Future<void> _accept() async {
    await widget.store.acceptTerms(AppConfig.termsVersion);
    if (mounted) setState(() => _accepted = true);
  }

  @override
  Widget build(BuildContext context) {
    return switch (_accepted) {
      null => const Scaffold(),
      false => TermsScreen(onAccept: _accept),
      true => HomeScreen(repository: widget.repository, store: widget.store),
    };
  }
}
