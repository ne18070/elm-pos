import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Palette ELM, tirée du logo : bleu « soleil » pour les actions,
/// marine du monogramme pour l'encre et les surfaces de marque.
abstract final class ElmColors {
  /// Bleu du logo (brand-600 du renderer) — boutons, liens, sélection
  static const blue = Color(0xFF0284C7);
  static const blueDeep = Color(0xFF0369A1);
  static const blueSoft = Color(0xFFE0F0FA);

  /// Marine du monogramme — bandeau d'accueil, barre panier
  static const navy = Color(0xFF23396B);
  static const navyDeep = Color(0xFF162648);

  /// Encre du texte : marine très sombre plutôt qu'un gris neutre
  static const ink = Color(0xFF14213D);
  static const inkMuted = Color(0xFF5B6478);

  static const paper = Color(0xFFFFFFFF);
  static const mist = Color(0xFFF1F3F7);
  static const line = Color(0xFFE2E6EC);

  /// Seul accent chaud : pastille du nombre d'articles au panier
  static const sun = Color(0xFFF2B705);

  static const danger = Color(0xFFC62828);
}

ThemeData buildElmTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;

  final scheme = dark
      ? const ColorScheme(
          brightness: Brightness.dark,
          primary: Color(0xFF4CB4EC),
          onPrimary: Color(0xFF04263B),
          primaryContainer: Color(0xFF123A57),
          onPrimaryContainer: Color(0xFFD3ECFA),
          secondary: Color(0xFF9DB2E0),
          onSecondary: ElmColors.navyDeep,
          secondaryContainer: ElmColors.navy,
          onSecondaryContainer: Color(0xFFE6ECF8),
          tertiary: ElmColors.sun,
          onTertiary: ElmColors.ink,
          error: Color(0xFFFF8A80),
          onError: Color(0xFF3B0A0A),
          surface: Color(0xFF0E182B),
          onSurface: Color(0xFFE8ECF3),
          onSurfaceVariant: Color(0xFF9AA5BA),
          surfaceContainerLowest: Color(0xFF0A1222),
          surfaceContainerLow: Color(0xFF131E33),
          surfaceContainer: Color(0xFF16233A),
          surfaceContainerHigh: Color(0xFF1B2942),
          surfaceContainerHighest: Color(0xFF213049),
          outline: Color(0xFF5A6884),
          outlineVariant: Color(0xFF243350),
          inverseSurface: Color(0xFFE8ECF3),
          onInverseSurface: ElmColors.ink,
          shadow: Colors.black,
          scrim: Colors.black,
          surfaceTint: Colors.transparent,
        )
      : const ColorScheme(
          brightness: Brightness.light,
          primary: ElmColors.blue,
          onPrimary: Colors.white,
          primaryContainer: ElmColors.blueSoft,
          onPrimaryContainer: ElmColors.blueDeep,
          secondary: ElmColors.navy,
          onSecondary: Colors.white,
          secondaryContainer: ElmColors.navy,
          onSecondaryContainer: Colors.white,
          tertiary: ElmColors.sun,
          onTertiary: ElmColors.ink,
          error: ElmColors.danger,
          onError: Colors.white,
          surface: ElmColors.paper,
          onSurface: ElmColors.ink,
          onSurfaceVariant: ElmColors.inkMuted,
          surfaceContainerLowest: Colors.white,
          surfaceContainerLow: Color(0xFFF7F8FA),
          surfaceContainer: ElmColors.mist,
          surfaceContainerHigh: ElmColors.mist,
          surfaceContainerHighest: Color(0xFFEAEDF2),
          outline: Color(0xFFB4BCC9),
          outlineVariant: ElmColors.line,
          inverseSurface: ElmColors.ink,
          onInverseSurface: Colors.white,
          shadow: Colors.black,
          scrim: Colors.black,
          surfaceTint: Colors.transparent,
        );

  // Archivo : grotesque un peu « enseigne », chiffres nets pour les prix
  final base = GoogleFonts.archivoTextTheme(
    ThemeData(brightness: brightness).textTheme,
  ).apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface);

  final text = base.copyWith(
    headlineMedium: base.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.8, height: 1.1),
    headlineSmall: base.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5, height: 1.15),
    titleLarge: base.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3),
    titleMedium: base.titleMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.1),
    titleSmall: base.titleSmall?.copyWith(fontWeight: FontWeight.w700),
    bodyLarge: base.bodyLarge?.copyWith(height: 1.45),
    bodyMedium: base.bodyMedium?.copyWith(height: 1.4),
    bodySmall: base.bodySmall?.copyWith(color: scheme.onSurfaceVariant, height: 1.35),
    labelLarge: base.labelLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 0),
  );

  const controlRadius = BorderRadius.all(Radius.circular(10));

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surface,
    textTheme: text,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleLarge,
      shape: Border(bottom: BorderSide(color: scheme.outlineVariant)),
    ),
    dividerTheme: DividerThemeData(color: scheme.outlineVariant, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? scheme.surfaceContainerHigh : ElmColors.mist,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: const OutlineInputBorder(borderRadius: controlRadius, borderSide: BorderSide.none),
      enabledBorder: const OutlineInputBorder(borderRadius: controlRadius, borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(
        borderRadius: controlRadius,
        borderSide: BorderSide(color: scheme.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: controlRadius,
        borderSide: BorderSide(color: scheme.error, width: 1.5),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: controlRadius,
        borderSide: BorderSide(color: scheme.error, width: 2),
      ),
      hintStyle: TextStyle(color: scheme.onSurfaceVariant),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: const RoundedRectangleBorder(borderRadius: controlRadius),
        textStyle: text.labelLarge?.copyWith(fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 44),
        foregroundColor: scheme.onSurface,
        side: BorderSide(color: scheme.outline),
        shape: const RoundedRectangleBorder(borderRadius: controlRadius),
        textStyle: text.labelLarge,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(textStyle: text.labelLarge, minimumSize: const Size(0, 44)),
    ),
    // Les cartes restent des blocs plats délimités par un filet, sans ombre
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: scheme.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(12)),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    chipTheme: ChipThemeData(
      showCheckmark: false,
      side: BorderSide(color: scheme.outlineVariant),
      shape: const StadiumBorder(),
      // Puce sélectionnée pleine (encre) : le libellé passe en couleur de fond
      labelStyle: text.labelLarge?.copyWith(
        fontWeight: FontWeight.w600,
        color: WidgetStateColor.resolveWith(
          (states) => states.contains(WidgetState.selected) ? scheme.surface : scheme.onSurface,
        ),
      ),
      selectedColor: scheme.onSurface,
      secondarySelectedColor: scheme.onSurface,
      checkmarkColor: scheme.surface,
      backgroundColor: scheme.surface,
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        minimumSize: const Size(0, 48),
        selectedBackgroundColor: scheme.primaryContainer,
        selectedForegroundColor: scheme.onPrimaryContainer,
        side: BorderSide(color: scheme.outlineVariant),
        shape: const RoundedRectangleBorder(borderRadius: controlRadius),
        textStyle: text.labelLarge,
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: scheme.outline,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: scheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 3,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(10)),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: dark ? scheme.surfaceContainerHighest : ElmColors.ink,
      contentTextStyle: text.bodyMedium?.copyWith(color: Colors.white),
      shape: const RoundedRectangleBorder(borderRadius: controlRadius),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: scheme.onSurfaceVariant,
      titleTextStyle: text.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
      subtitleTextStyle: text.bodySmall,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
  );
}
