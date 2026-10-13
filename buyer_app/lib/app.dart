import 'package:flutter/material.dart';

import 'data/boutique_repository.dart';
import 'data/local_store.dart';
import 'screens/home_screen.dart';

/// Couleur de marque ELM (brand-600 du renderer : rgb(2, 132, 199)).
const brandColor = Color(0xFF0284C7);

class ElmBoutiqueApp extends StatelessWidget {
  const ElmBoutiqueApp({super.key, required this.repository, required this.store});

  final BoutiqueRepository repository;
  final LocalStore store;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ELM Boutique',
      debugShowCheckedModeBanner: false,
      theme: _buildTheme(Brightness.light),
      darkTheme: _buildTheme(Brightness.dark),
      home: HomeScreen(repository: repository, store: store),
    );
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
