import '../models/directory.dart';

// Formatage et parsing — alignés sur renderer/lib/utils.ts et renderer/lib/boutique-routes.ts.

const _currencyLabels = {'XOF': 'FCFA', 'XAF': 'FCFA'};
const _currencyDecimals = {'XOF': 0, 'XAF': 0, 'JPY': 0, 'MRU': 0};

/// « 12 500 FCFA » — même rendu que formatCurrency (Intl fr-FR) côté web.
String formatCurrency(num amount, [String currency = 'XOF']) {
  final decimals = _currencyDecimals[currency] ?? 2;
  final label = _currencyLabels[currency] ?? currency;
  final fixed = amount.abs().toStringAsFixed(decimals);
  final parts = fixed.split('.');
  final digits = parts[0];
  final grouped = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) grouped.write('\u202F');
    grouped.write(digits[i]);
  }
  final sign = amount < 0 ? '-' : '';
  final decimalPart = parts.length > 1 ? ',${parts[1]}' : '';
  return '$sign$grouped$decimalPart\u00A0$label';
}

class LinkTarget {
  const LinkTarget(this.ref, this.kind);

  final String ref;
  final VisitKind kind;
}

/// Lien partagé (…/boutique/<ref> ou …/services/<ref>) ou code saisi (→ boutique).
LinkTarget? parseBusinessLink(String input) {
  final trimmed = input.trim();
  if (trimmed.isEmpty) return null;
  final fromLink = RegExp(r'/(boutique|services)/([^/?#\s]+)').firstMatch(trimmed);
  if (fromLink != null) {
    final kind = fromLink.group(1) == 'services' ? VisitKind.service : VisitKind.boutique;
    try {
      return LinkTarget(Uri.decodeComponent(fromLink.group(2)!), kind);
    } on ArgumentError {
      return LinkTarget(fromLink.group(2)!, kind);
    }
  }
  return RegExp(r'^[\w-]+$').hasMatch(trimmed) ? LinkTarget(trimmed, VisitKind.boutique) : null;
}

/// Référence seule (rétro-compatibilité).
String? parseBoutiqueRef(String input) => parseBusinessLink(input)?.ref;

final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  caseSensitive: false,
);

bool isUuid(String value) => _uuid.hasMatch(value);

const _diacritics = {
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
  'ç': 'c',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
  'ñ': 'n',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
  'ý': 'y', 'ÿ': 'y',
  'œ': 'oe', 'æ': 'ae',
};

/// Même règle que slugifyBusinessName (services/supabase/public-business-ref.ts).
String slugify(String name) {
  final lower = name.toLowerCase();
  final ascii = StringBuffer();
  for (final char in lower.split('')) {
    ascii.write(_diacritics[char] ?? char);
  }
  return ascii
      .toString()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
}

String digitsOnly(String value) => value.replaceAll(RegExp(r'[^0-9]'), '');

String shortOrderId(String id) => (id.length >= 8 ? id.substring(0, 8) : id).toUpperCase();
