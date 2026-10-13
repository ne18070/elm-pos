import 'package:flutter/material.dart';

/// Logo d'une boutique avec repli sur une icône si absent ou introuvable.
class BoutiqueLogo extends StatelessWidget {
  const BoutiqueLogo({super.key, required this.url, this.size = 44});

  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fallback = Container(
      color: scheme.primary,
      alignment: Alignment.center,
      child: Icon(Icons.storefront, color: scheme.onPrimary, size: size * 0.5),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.25),
      child: Container(
        width: size,
        height: size,
        color: Colors.white,
        child: url == null || url!.isEmpty
            ? fallback
            : Image.network(
                url!,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => fallback,
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
      color: scheme.surfaceContainerHighest,
      alignment: Alignment.center,
      child: Icon(Icons.inventory_2_outlined, color: scheme.onSurfaceVariant, size: 36),
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

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: theme.textTheme.labelMedium?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}
