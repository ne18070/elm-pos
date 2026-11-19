import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/client_account.dart';
import '../data/local_store.dart';
import '../services/push_service.dart';
import '../widgets/common.dart';

/// « Mon code client » : le client crée son compte (nom + numéro, sans OTP) puis
/// montre ce QR au comptoir. La boutique le scanne depuis son espace partenaire et
/// lie l'app : ses ordres de travail arrivent alors par notification, sans lien.
class ClientAccountScreen extends StatefulWidget {
  const ClientAccountScreen({super.key, required this.store});

  final LocalStore store;

  @override
  State<ClientAccountScreen> createState() => _ClientAccountScreenState();
}

class _ClientAccountScreenState extends State<ClientAccountScreen> with WidgetsBindingObserver {
  final _account = ClientAccount.instance;

  PairingCode? _code;
  String? _codeError;
  List<ClientLink>? _links;
  bool _editing = false;
  bool _saving = false;
  String? _saveError;

  Timer? _tick;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (_account.hasAccount) _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_account.hasAccount || _editing) return;
    if (state == AppLifecycleState.resumed) {
      _start();
    } else if (state == AppLifecycleState.paused) {
      _stop();
    }
  }

  void _start() {
    _stop();
    _refreshCode();
    _refreshLinks();
    // Compte à rebours du code ; nouveau code dès qu'il expire
    // Sans code (échec réseau), nouvel essai toutes les 5 s
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      final code = _code;
      final now = DateTime.now();
      if (code == null ? now.isAfter(_codeRetryAt) : code.expiresAt.isBefore(now)) _refreshCode();
      if (mounted) setState(() {});
    });
    // Le scan au comptoir crée la liaison côté serveur : on la voit arriver ici
    _poll = Timer.periodic(const Duration(seconds: 5), (_) => _checkNewLink());
  }

  void _stop() {
    _tick?.cancel();
    _poll?.cancel();
    _tick = null;
    _poll = null;
  }

  bool _fetchingCode = false;

  /// Fin du dernier renouvellement du code : un sondage parti avant ne doit pas
  /// déclarer « consommé » le code qui vient d'être émis
  DateTime _codeIssuedAt = DateTime.fromMillisecondsSinceEpoch(0);

  /// Prochain essai après un échec de récupération du code
  DateTime _codeRetryAt = DateTime.fromMillisecondsSinceEpoch(0);

  Future<void> _refreshCode() async {
    if (_fetchingCode) return;
    _fetchingCode = true;
    try {
      final code = await _account.pairingCode();
      _codeIssuedAt = DateTime.now();
      if (mounted) {
        setState(() {
          _code = code;
          _codeError = null;
        });
      }
    } catch (_) {
      _codeRetryAt = DateTime.now().add(const Duration(seconds: 5));
      if (mounted) {
        setState(() {
          _code = null;
          _codeError = 'Code indisponible. Vérifiez votre connexion.';
        });
      }
    } finally {
      _fetchingCode = false;
    }
  }

  bool _checkingLink = false;

  /// Sondage léger (identifiants seulement) ; l'aperçu complet n'est rechargé
  /// que lorsqu'une liaison apparaît ou disparaît.
  /// Un seul appel à la fois : sur un réseau lent, l'aperçu complet peut durer
  /// plus que l'intervalle de sondage.
  Future<void> _checkNewLink() async {
    if (_checkingLink) return;
    _checkingLink = true;
    final known = _links;
    final pollStart = DateTime.now();
    try {
      if (known == null) {
        await _refreshLinks();
        return;
      }
      final (:ids, :codeUsed) = await _account.linkIds();
      final current = known.map((l) => l.id).toSet();
      if (ids.length != current.length || !ids.every(current.contains)) {
        await _refreshLinks(announce: true);
      } else if (codeUsed && _code != null && !_fetchingCode && _codeIssuedAt.isBefore(pollStart)) {
        // Re-liaison d'une boutique déjà liée : même liaison, mais le code a servi
        _refreshCode();
        _toast('Liaison confirmée par la boutique.');
      }
    } catch (_) {
      // Réseau : on réessaie au prochain passage
    } finally {
      _checkingLink = false;
    }
  }

  Future<void> _refreshLinks({bool announce = false}) async {
    try {
      final overview = await _account.overview();
      if (!mounted) return;
      final before = _links?.map((l) => l.id).toSet();
      final added = before == null ? <ClientLink>[] : overview.links.where((l) => !before.contains(l.id)).toList();
      setState(() => _links = overview.links);
      if (announce && added.isNotEmpty) {
        // Code à usage unique : il a servi, on en prépare un autre
        _refreshCode();
        _toast('App liée à ${added.first.businessName}. Vos ordres de travail arrivent dans « Mes suivis ».');
      }
    } catch (_) {
      // Réseau : on réessaie au prochain passage
    }
  }

  Future<void> _save(String name, String phone) async {
    setState(() {
      _saving = true;
      _saveError = null;
    });
    try {
      // Permission de notification demandée ici : c'est tout l'intérêt du compte
      final push = PushService.instance;
      final token = await push.deviceToken();
      final unlinked = await _account.register(name, phone, fcmToken: token, platform: token == null ? null : push.platform);
      if (!mounted) return;
      setState(() {
        _saving = false;
        _editing = false;
        if (unlinked > 0) _links = null;
      });
      if (unlinked > 0) {
        _toast('Numéro modifié : vos boutiques ont été déliées. Montrez votre nouveau code au comptoir.');
      } else if (token == null) {
        _toast('Notifications désactivées : activez-les dans les réglages du téléphone pour être prévenu.');
      }
      _start();
    } on PostgrestException catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _saveError = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _saveError = 'Enregistrement impossible. Vérifiez votre connexion et réessayez.';
        });
      }
    }
  }

  Future<void> _unlink(ClientLink link) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Délier ${link.businessName} ?'),
        content: const Text(
          'Vous ne recevrez plus ses ordres de travail dans l’app. '
          'La boutique pourra vous lier à nouveau en scannant votre code.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Annuler')),
          TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Délier')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _account.unlink(link.id);
      if (mounted) setState(() => _links = _links?.where((l) => l.id != link.id).toList());
    } catch (_) {
      _toast('Impossible de délier la boutique. Vérifiez votre connexion.');
    }
  }

  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer mon compte client ?'),
        content: const Text(
          'Votre nom, votre numéro et vos boutiques liées sont effacés. Vous ne recevrez plus '
          'vos ordres de travail dans l’app. Les suivis ouverts par lien restent dans « Mes suivis ».',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Annuler')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    _stop();
    try {
      await _account.deleteAccount();
      if (!mounted) return;
      _toast('Compte client supprimé.');
      Navigator.of(context).pop();
    } catch (_) {
      _toast('Suppression impossible. Vérifiez votre connexion et réessayez.');
      if (mounted && _account.hasAccount) _start();
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 5)));
  }

  Future<void> _startEditing() async {
    _stop();
    setState(() {
      _editing = true;
      _saveError = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final profile = _account.profile;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mon code client'),
        leading: _editing && profile != null
            ? IconButton(
                tooltip: 'Annuler',
                icon: const Icon(Icons.close_rounded),
                onPressed: () {
                  setState(() => _editing = false);
                  _start();
                },
              )
            : null,
      ),
      body: profile == null || _editing
          ? FutureBuilder<CustomerDetails?>(
              future: widget.store.customerDetails(),
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                return _ProfileForm(
                  isNew: profile == null,
                  initialName: profile?.name ?? snapshot.data?.name ?? '',
                  initialPhone: profile?.phone ?? snapshot.data?.phone ?? '',
                  busy: _saving,
                  error: _saveError,
                  onSubmit: _save,
                );
              },
            )
          : _buildCode(profile),
    );
  }

  Widget _buildCode(ClientProfile profile) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final code = _code;
    final remaining = code?.expiresAt.difference(DateTime.now());
    final links = _links;

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_refreshCode(), _refreshLinks()]);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          Text(
            'Montrez ce code au comptoir',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge,
          ),
          const SizedBox(height: 6),
          Text(
            'La boutique le scanne une fois : vous recevez ensuite l’avancement de vos ordres de travail '
            'ici, par notification.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 20),
          Center(
            child: Container(
              width: 260,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                // Toujours blanc : un QR se lit mal sur fond sombre
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: scheme.outlineVariant),
              ),
              child: Column(
                children: [
                  SizedBox.square(
                    dimension: 220,
                    child: code != null
                        ? QrImageView(data: code.qrData, padding: EdgeInsets.zero, backgroundColor: Colors.white)
                        : Center(
                            child: _codeError == null
                                ? const CircularProgressIndicator()
                                : Text(
                                    _codeError!,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(color: Colors.black87),
                                  ),
                          ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    code?.display ?? '····-····',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      color: Colors.black,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 3,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          if (remaining != null && !remaining.isNegative)
            Text(
              'Nouveau code dans ${remaining.inMinutes}:${(remaining.inSeconds % 60).toString().padLeft(2, '0')}',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
          if (_codeError != null)
            Center(
              child: TextButton.icon(
                onPressed: _refreshCode,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Réessayer'),
              ),
            ),
          const SizedBox(height: 20),
          Card(
            child: ListTile(
              leading: const Icon(Icons.person_outline_rounded),
              title: Text(profile.name),
              subtitle: Text(profile.phone),
              trailing: TextButton(onPressed: _startEditing, child: const Text('Modifier')),
            ),
          ),
          const SizedBox(height: 8),
          Card(
            color: scheme.secondaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.shield_outlined, color: scheme.onSecondaryContainer),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'ELM ne vous enverra jamais de lien pour payer ou vous connecter. '
                      'Vos ordres de travail arrivent uniquement dans cette app.',
                      style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSecondaryContainer),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          const SectionTitle('Boutiques liées'),
          if (links == null)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (links.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Aucune boutique pour l’instant. Chaque boutique scanne votre code une fois, '
                'lors de votre prochain passage.',
                style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
              ),
            )
          else
            for (final link in links)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  contentPadding: const EdgeInsets.only(left: 12, right: 4),
                  leading: BoutiqueLogo(url: link.logoUrl, size: 40),
                  title: Text(link.businessName),
                  subtitle: const Text('Ordres de travail reçus par notification'),
                  trailing: IconButton(
                    tooltip: 'Délier',
                    icon: const Icon(Icons.link_off_rounded),
                    onPressed: () => _unlink(link),
                  ),
                ),
              ),
          const SizedBox(height: 24),
          Center(
            child: TextButton.icon(
              onPressed: _deleteAccount,
              style: TextButton.styleFrom(foregroundColor: scheme.error),
              icon: const Icon(Icons.delete_outline_rounded),
              label: const Text('Supprimer mon compte client'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileForm extends StatefulWidget {
  const _ProfileForm({
    required this.isNew,
    required this.initialName,
    required this.initialPhone,
    required this.busy,
    required this.error,
    required this.onSubmit,
  });

  final bool isNew;
  final String initialName;
  final String initialPhone;
  final bool busy;
  final String? error;
  final void Function(String name, String phone) onSubmit;

  @override
  State<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends State<_ProfileForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.initialName);
  late final _phone = TextEditingController(text: widget.initialPhone);

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState!.validate()) widget.onSubmit(_name.text.trim(), _phone.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
        children: [
          Text(
            widget.isNew ? 'Suivez vos ordres de travail sans lien' : 'Vos coordonnées',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            widget.isNew
                ? 'Indiquez le numéro que vous donnez à la boutique. Au comptoir, elle scanne votre code '
                    'et vérifie qu’il correspond à vos ordres : vous êtes ensuite prévenu ici à chaque étape.'
                : 'Le numéro doit être celui donné à la boutique pour vos ordres de travail.',
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 24),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.name],
            decoration: const InputDecoration(labelText: 'Nom complet', hintText: 'Ex : Awa Diop'),
            validator: (v) => (v ?? '').trim().length < 2 ? 'Indiquez votre nom (2 caractères minimum).' : null,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.telephoneNumber],
            onFieldSubmitted: (_) => _submit(),
            decoration: const InputDecoration(labelText: 'Téléphone', hintText: 'Ex : 77 123 45 67'),
            validator: (v) => (v ?? '').replaceAll(RegExp(r'\D'), '').length < 8
                ? 'Numéro incomplet : 9 chiffres au Sénégal (ex. 77 123 45 67).'
                : null,
          ),
          if (widget.error != null) ...[
            const SizedBox(height: 14),
            Text(widget.error!, style: TextStyle(color: theme.colorScheme.error)),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: widget.busy ? null : _submit,
            child: widget.busy
                ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                : Text(widget.isNew ? 'Créer mon code client' : 'Enregistrer'),
          ),
        ],
      ),
    );
  }
}
