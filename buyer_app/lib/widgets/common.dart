import 'package:flutter/material.dart';

/// Logo d'une boutique avec repli sur une icône si absent ou introuvable.
class BoutiqueLogo extends StatelessWidget {
  const BoutiqueLogo({super.key, required this.url, this.size = 44});

  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final radius = BorderRadius.circular(size * 0.22);
    // Repli : monogramme marine, comme une enseigne sans logo
    final fallback = Container(
      color: scheme.secondaryContainer,
      alignment: Alignment.center,
      child: Icon(Icons.storefront_rounded, color: scheme.onSecondaryContainer, size: size * 0.48),
    );
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: radius,
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: url == null || url!.isEmpty
            ? fallback
            : Padding(
                padding: EdgeInsets.all(size * 0.06),
                child: Image.network(
                  url!,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => fallback,
                ),
              ),
      ),
    );
  }
}

/// Image produit avec placeholder pendant le chargement et en cas d'erreur.
class ProductImage extends StatelessWidget {
  const ProductImage({super.key, required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final placeholder = Container(
      color: scheme.surfaceContainer,
      alignment: Alignment.center,
      child: Icon(Icons.image_outlined, color: scheme.outline, size: 32),
    );
    if (url == null || url!.isEmpty) return placeholder;
    return Image.network(
      url!,
      fit: BoxFit.cover,
      loadingBuilder: (context, child, progress) => progress == null ? child : placeholder,
      errorBuilder: (_, __, ___) => placeholder,
    );
  }
}

/// État d'erreur plein écran : dit ce qui s'est passé et propose une action.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry, this.secondary});

  final String message;
  final VoidCallback? onRetry;
  final Widget? secondary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center, style: theme.textTheme.titleMedium),
            const SizedBox(height: 24),
            if (onRetry != null)
              FilledButton(onPressed: onRetry, child: const Text('Réessayer')),
            if (secondary != null) ...[const SizedBox(height: 8), secondary!],
          ],
        ),
      ),
    );
  }
}

/// Titre de section en casse normale : il nomme le bloc, sans le décorer.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(child: Text(text, style: theme.textTheme.titleMedium)),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
