import 'package:flutter/material.dart';

import 'config.dart';
import 'data/boutique_repository.dart';
import 'data/local_store.dart';
import 'screens/home_screen.dart';
import 'screens/terms_screen.dart';

/// Couleur de marque ELM (brand-600 du renderer : rgb(2, 132, 199)).
const brandColor = Color(0xFF0284C7);

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
      theme: _buildTheme(Brightness.light),
      darkTheme: _buildTheme(Brightness.dark),
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

ThemeData _buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(seedColor: brandColor, brightness: brightness);
  final radius = BorderRadius.circular(12);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      border: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide.none),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
  );
}
