import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../utils/format.dart';
import '../widgets/common.dart';
import 'partner_models.dart';
import 'partner_repository.dart';

/// Ajout / modification d'un produit. Renvoie (pop) le message à afficher une fois enregistré.
class ProductFormScreen extends StatefulWidget {
  const ProductFormScreen({
    super.key,
    required this.repository,
    required this.business,
    required this.categories,
    this.product,
  });

  final PartnerRepository repository;
  final PartnerBusiness business;
  final List<PartnerCategory> categories;

  /// null : nouveau produit
  final PartnerProduct? product;

  @override
  State<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends State<ProductFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.product?.name);
  late final _price = TextEditingController(
    text: widget.product == null ? '' : _formatPrice(widget.product!.price),
  );
  late final _description = TextEditingController(text: widget.product?.description);
  late final _stock = TextEditingController(text: '${widget.product?.stock ?? 0}');
  late String? _categoryId = widget.categories.any((c) => c.id == widget.product?.categoryId)
      ? widget.product?.categoryId
      : null;
  late bool _trackStock = widget.product?.trackStock ?? false;

  /// URL actuelle (null si retirée) et nouvelle photo choisie, envoyée à l'enregistrement
  late String? _imageUrl = widget.product?.imageUrl;
  Uint8List? _newImage;
  String _newImageExt = 'jpg';

  bool _saving = false;
  String? _error;

  bool get _isNew => widget.product == null;

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _description.dispose();
    _stock.dispose();
    super.dispose();
  }

  static String _formatPrice(double value) =>
      value == value.roundToDouble() ? value.toInt().toString() : value.toString();

  static double? _parsePrice(String raw) {
    final cleaned = raw.replaceAll(RegExp(r'[\s  ]'), '').replaceAll(',', '.');
    return double.tryParse(cleaned);
  }

  Future<void> _pickImage() async {
    final source = await showModalBottomSheet<Object>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Prendre une photo'),
              onTap: () => Navigator.of(context).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choisir dans la galerie'),
              onTap: () => Navigator.of(context).pop(ImageSource.gallery),
            ),
            if (_imageUrl != null || _newImage != null)
              ListTile(
                leading: Icon(Icons.delete_outline, color: Theme.of(context).colorScheme.error),
                title: Text('Retirer la photo', style: TextStyle(color: Theme.of(context).colorScheme.error)),
                onTap: () => Navigator.of(context).pop('remove'),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;
    if (source == 'remove') {
      setState(() {
        _imageUrl = null;
        _newImage = null;
      });
      return;
    }
    try {
      // Redimensionnée : une photo de téléphone brute pèse plusieurs Mo
      final file = await ImagePicker().pickImage(
        source: source as ImageSource,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 82,
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final name = file.name.toLowerCase();
      if (!mounted) return;
      setState(() {
        _newImage = bytes;
        _newImageExt = name.endsWith('.png') ? 'png' : 'jpg';
      });
    } on PlatformException {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Accès refusé. Autorisez l’appareil photo ou les photos dans les réglages du téléphone.'),
        ),
      );
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      var imageUrl = _imageUrl;
      if (_newImage != null) {
        imageUrl = await widget.repository.uploadImage(widget.business.id, _newImage!, _newImageExt);
      }
      final draft = ProductDraft(
        name: _name.text.trim(),
        price: _parsePrice(_price.text)!,
        description: _description.text,
        imageUrl: imageUrl,
        categoryId: _categoryId,
        trackStock: _trackStock,
        stock: _trackStock ? int.parse(_stock.text.trim()) : widget.product?.stock,
      );
      if (_isNew) {
        await widget.repository.create(widget.business.id, draft);
      } else {
        await widget.repository.update(widget.business.id, widget.product!, draft);
      }
      if (!mounted) return;
      Navigator.of(context).pop(_isNew ? '${draft.name} ajouté à la boutique' : 'Modifications enregistrées');
    } on PartnerException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Enregistrement impossible. Vérifiez votre connexion et réessayez.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleVisible() async {
    final product = widget.product!;
    final hide = product.isActive;
    if (hide) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Masquer ce produit ?'),
          content: const Text(
            'Il n’apparaîtra plus dans la boutique ni à la caisse. Vous pourrez le remettre en ligne à tout moment.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Annuler')),
            TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Masquer')),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.repository.setVisible(widget.business.id, product, !hide);
      if (!mounted) return;
      Navigator.of(context).pop(hide ? '${product.name} masqué de la boutique' : '${product.name} remis en ligne');
    } on PartnerException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Modification impossible. Vérifiez votre connexion et réessayez.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _stepStock(int delta) {
    final current = int.tryParse(_stock.text.trim()) ?? 0;
    final next = (current + delta).clamp(0, 999999);
    _stock.text = '$next';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final product = widget.product;
    final currencyLabel = formatCurrency(0, widget.business.currency).replaceAll(RegExp(r'^[\d,.\s  -]+'), '');

    return Scaffold(
      appBar: AppBar(title: Text(_isNew ? 'Nouveau produit' : 'Modifier le produit')),
      body: Form(
        key: _formKey,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            _PhotoField(
              imageUrl: _imageUrl,
              newImage: _newImage,
              onTap: _saving ? null : _pickImage,
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Nom du produit', hintText: 'Ex : Thiouraye 250 g'),
              validator: (v) => (v ?? '').trim().isEmpty ? 'Donnez un nom au produit.' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _price,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(labelText: 'Prix', suffixText: currencyLabel, hintText: 'Ex : 2500'),
              validator: (v) {
                final price = _parsePrice(v ?? '');
                if (price == null) return 'Saisissez un prix en chiffres, ex. 2500.';
                if (price < 0) return 'Le prix ne peut pas être négatif.';
                return null;
              },
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String?>(
              initialValue: _categoryId,
              decoration: const InputDecoration(labelText: 'Catégorie'),
              items: [
                const DropdownMenuItem(value: null, child: Text('Sans catégorie')),
                for (final c in widget.categories) DropdownMenuItem(value: c.id, child: Text(c.name)),
              ],
              onChanged: (v) => setState(() => _categoryId = v),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _description,
              minLines: 2,
              maxLines: 5,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Description (optionnel)',
                hintText: 'Taille, matière, conseils d’utilisation…',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 20),
            Text('Stock', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _trackStock,
              onChanged: _saving ? null : (v) => setState(() => _trackStock = v),
              title: const Text('Suivre la quantité en stock'),
              subtitle: const Text('Le produit passe « Épuisé » dans la boutique quand il n’en reste plus.'),
            ),
            if (_trackStock) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  IconButton.outlined(
                    tooltip: 'Retirer un',
                    onPressed: () => _stepStock(-1),
                    icon: const Icon(Icons.remove_rounded),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextFormField(
                      controller: _stock,
                      textAlign: TextAlign.center,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(labelText: 'Quantité en stock'),
                      validator: (v) => int.tryParse((v ?? '').trim()) == null ? 'Saisissez une quantité, ex. 12.' : null,
                    ),
                  ),
                  const SizedBox(width: 10),
                  IconButton.outlined(
                    tooltip: 'Ajouter un',
                    onPressed: () => _stepStock(1),
                    icon: const Icon(Icons.add_rounded),
                  ),
                ],
              ),
            ],
            if ((product?.variantCount ?? 0) > 0) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline_rounded, size: 20, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Ce produit a ${product!.variantCount} option(s) (taille, couleur…). '
                        'Elles se modifient sur elm-app.click et restent inchangées ici.',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: scheme.error)),
            ],
            if (product != null) ...[
              const SizedBox(height: 24),
              Center(
                child: TextButton.icon(
                  onPressed: _saving ? null : _toggleVisible,
                  style: TextButton.styleFrom(foregroundColor: product.isActive ? scheme.error : scheme.primary),
                  icon: Icon(product.isActive ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                  label: Text(product.isActive ? 'Masquer de la boutique' : 'Remettre en ligne'),
                ),
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                : Text(_isNew ? 'Ajouter le produit' : 'Enregistrer'),
          ),
        ),
      ),
    );
  }
}

class _PhotoField extends StatelessWidget {
  const _PhotoField({required this.imageUrl, required this.newImage, required this.onTap});

  final String? imageUrl;
  final Uint8List? newImage;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final hasImage = newImage != null || (imageUrl ?? '').isNotEmpty;
    return Center(
      child: SizedBox(
        width: 180,
        height: 180,
        child: Material(
          color: scheme.surfaceContainer,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: scheme.outlineVariant),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (newImage != null)
                  Image.memory(newImage!, fit: BoxFit.cover)
                else if (hasImage)
                  ProductImage(url: imageUrl)
                else
                  Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_a_photo_outlined, size: 32, color: scheme.primary),
                      const SizedBox(height: 8),
                      Text('Ajouter une photo', style: theme.textTheme.labelLarge?.copyWith(color: scheme.primary)),
                    ],
                  ),
                if (hasImage)
                  Positioned(
                    right: 8,
                    bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: scheme.inverseSurface,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Changer',
                        style: theme.textTheme.labelMedium?.copyWith(color: scheme.onInverseSurface),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
