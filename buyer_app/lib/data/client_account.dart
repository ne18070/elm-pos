import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'local_store.dart';

/// Compte client de cette installation (migration 178), sans mot de passe ni OTP.
///
/// L'app génère un secret aléatoire gardé sur le téléphone ; le serveur n'en stocke
/// que le hachage. Le nom et le numéro saisis sont une DÉCLARATION : la vérification
/// se fait au comptoir, quand la boutique scanne le « code client » (QR temporaire)
/// depuis son espace partenaire. Chaque boutique vérifie elle-même son client.
///
/// Tout passe par des RPC `client_app_*` appelées avec la clé anon : la vitrine
/// reste anonyme (les lectures publiques sont réservées au rôle `anon`).
class ClientAccount extends ChangeNotifier {
  ClientAccount(this._db, this._store);

  /// Instance de l'app (créée dans main.dart)
  static late ClientAccount instance;

  final SupabaseClient _db;
  final LocalStore _store;

  static const _secretKey = 'client_app_secret';
  static const _profileKey = 'client_app_profile';
  static const _sentTokenKey = 'client_app_fcm_sent';

  ClientProfile? _profile;
  bool _loaded = false;

  // Dernier jeton FCM connu (transmis par PushService au lancement et à chaque
  // rotation) : réutilisé si le compte doit être recréé côté serveur.
  String? _fcmToken;
  String? _platform;

  ClientProfile? get profile => _profile;
  bool get hasAccount => _profile != null;

  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_profileKey);
    if (raw == null || prefs.getString(_secretKey) == null) return;
    try {
      _profile = ClientProfile.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } on FormatException {
      _profile = null;
    }
    notifyListeners();
  }

  Future<String> _secret() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_secretKey);
    if (existing != null) return existing;
    final random = Random.secure();
    final secret = List.generate(32, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
    await prefs.setString(_secretKey, secret);
    return secret;
  }

  /// Crée le compte ou met à jour le profil. [fcmToken] null = jeton inchangé.
  /// Renvoie le nombre de boutiques déliées : changer de numéro supprime les
  /// liaisons (elles valaient pour l'ancien numéro).
  /// [fromUser] : saisie de l'utilisateur — pré-remplit aussi les formulaires de
  /// commande. Faux pour les mises à jour techniques (jeton, recréation), qui ne
  /// doivent pas écraser des coordonnées modifiées entre-temps dans ces formulaires.
  Future<int> register(
    String name,
    String phone, {
    String? fcmToken,
    String? platform,
    bool fromUser = true,
  }) async {
    if (fcmToken != null) {
      _fcmToken = fcmToken;
      _platform = platform ?? _platform;
    }
    final data = await _db.rpc('client_app_register', params: {
      'p_secret': await _secret(),
      'p_name': name.trim(),
      'p_phone': phone.trim(),
      'p_fcm_token': fcmToken,
      'p_platform': platform,
    });
    final profile = ClientProfile(name: name.trim(), phone: phone.trim());
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_profileKey, jsonEncode(profile.toJson()));
    if (fcmToken != null) await prefs.setString(_sentTokenKey, fcmToken);
    if (fromUser) {
      // Pré-remplit aussi les prochaines commandes et demandes de service
      final details = await _store.customerDetails();
      await _store.saveCustomerDetails(
        CustomerDetails(name: profile.name, phone: profile.phone, address: details?.address),
      );
    }
    _profile = profile;
    final removed = data is Map && data['links_removed'] is num ? (data['links_removed'] as num).toInt() : 0;
    if (removed > 0) await _store.removeAccountTrackings();
    notifyListeners();
    return removed;
  }

  /// Nouveau jeton FCM (réinstallation, rotation) : transmis au compte s'il existe.
  Future<void> updatePushToken(String fcmToken, String platform) async {
    _fcmToken = fcmToken;
    _platform = platform;
    await load();
    final profile = _profile;
    if (profile == null) return;
    // Appelé à chaque lancement : rien à envoyer si le serveur a déjà ce jeton
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_sentTokenKey) == fcmToken) return;
    try {
      await register(profile.name, profile.phone, fcmToken: fcmToken, platform: platform, fromUser: false);
    } catch (error) {
      debugPrint('Mise à jour du jeton de notification impossible : $error');
    }
  }

  /// Appel d'une RPC du compte ; si le serveur ne connaît plus cet appareil
  /// (no_data_found), le compte est recréé depuis le profil local puis l'appel rejoué.
  Future<dynamic> _call(String fn, [Map<String, dynamic> extra = const {}]) async {
    Future<dynamic> run() async => _db.rpc(fn, params: {'p_secret': await _secret(), ...extra});
    try {
      return await run();
    } on PostgrestException catch (e) {
      final profile = _profile;
      if (e.code != 'P0002' || profile == null || fn == 'client_app_unlink') rethrow;
      // Sans le jeton FCM, l'appareil recréé ne recevrait aucune notification
      await register(profile.name, profile.phone, fcmToken: _fcmToken, platform: _platform, fromUser: false);
      return run();
    }
  }

  /// Code client à montrer au comptoir (valable 10 minutes).
  Future<PairingCode> pairingCode() async {
    final data = await _call('client_app_pairing_code');
    return PairingCode.fromJson(Map<String, dynamic>.from(data as Map));
  }

  /// Boutiques liées et ordres de travail. Les ordres rejoignent « Mes suivis ».
  Future<ClientOverview> overview() async {
    final data = await _call('client_app_overview');
    final overview = ClientOverview.fromJson(Map<String, dynamic>.from(data as Map));
    await _store.addTrackings(
      [
        for (final order in overview.orders)
          TrackedRequest(
            token: order.trackingToken,
            businessName: order.businessName,
            label: order.label,
            createdAt: order.createdAt,
            fromAccount: true,
          ),
      ],
      aliases: {for (final order in overview.orders) order.trackingToken: order.knownTokens},
    );
    return overview;
  }

  /// Ordre retiré de « Mes suivis » : plus synchronisé ni notifié sur ce téléphone.
  /// Sans compte, rien à faire côté serveur.
  Future<void> forgetOrder(String trackingToken) async {
    await load();
    if (_profile == null) return;
    try {
      await _call('client_app_forget_order', {'p_tracking_token': trackingToken});
    } catch (error) {
      debugPrint('Retrait de l’ordre impossible : $error');
    }
  }

  /// Supprime le compte client : profil, numéro, jeton, liaisons (serveur) puis
  /// secret et suivis synchronisés (téléphone). Les suivis ouverts par lien restent.
  Future<void> deleteAccount() async {
    final prefs = await SharedPreferences.getInstance();
    final secret = prefs.getString(_secretKey);
    if (secret != null) {
      await _db.rpc('client_app_delete', params: {'p_secret': secret});
    }
    await prefs.remove(_secretKey);
    await prefs.remove(_profileKey);
    await prefs.remove(_sentTokenKey);
    await _store.removeAccountTrackings();
    _profile = null;
    notifyListeners();
  }

  /// Identifiants des boutiques liées et état du code (appel léger, pour voir
  /// arriver une liaison). [codeUsed] : le code a servi (liaison ou re-liaison
  /// d'une boutique déjà liée) et n'est plus valable.
  Future<({Set<String> ids, bool codeUsed})> linkIds() async {
    final data = await _call('client_app_link_ids');
    final map = data is Map ? data : const {};
    return (
      ids: {for (final id in (map['ids'] as List? ?? [])) '$id'},
      codeUsed: map['code_used'] == true,
    );
  }

  /// Délie une boutique : le serveur coupe les abonnements push de ce téléphone à
  /// ses ordres et renvoie leurs jetons de suivi, retirés ici de « Mes suivis »
  /// (sinon PushService les réabonnerait au prochain lancement).
  Future<void> unlink(String linkId) async {
    final data = await _call('client_app_unlink', {'p_link_id': linkId});
    final tokens = data is Map ? (data['tracking_tokens'] as List? ?? []) : const [];
    await _store.removeTrackings({for (final t in tokens) '$t'});
  }
}

class ClientProfile {
  const ClientProfile({required this.name, required this.phone});

  factory ClientProfile.fromJson(Map<String, dynamic> json) =>
      ClientProfile(name: '${json['name'] ?? ''}', phone: '${json['phone'] ?? ''}');

  final String name;
  final String phone;

  Map<String, Object?> toJson() => {'name': name, 'phone': phone};
}

class PairingCode {
  const PairingCode({required this.code, required this.expiresAt});

  /// L'expiration est calculée depuis l'horloge locale et la durée renvoyée par le
  /// serveur : comparer `expires_at` à une horloge de téléphone décalée rendait le
  /// code faux (régénéré en boucle, ou affiché alors que déjà refusé).
  factory PairingCode.fromJson(Map<String, dynamic> json) {
    final ttl = json['ttl_seconds'] is num ? (json['ttl_seconds'] as num).toInt() : 600;
    // Marge pour la latence réseau : le code est renouvelé un peu avant le serveur
    return PairingCode(
      code: '${json['code']}',
      expiresAt: DateTime.now().add(Duration(seconds: ttl > 15 ? ttl - 10 : ttl)),
    );
  }

  final String code;
  final DateTime expiresAt;

  /// Contenu du QR, reconnu par le scanner de l'espace partenaire
  String get qrData => 'elm-client:$code';

  /// « ABCD-EFGH » : plus facile à dicter si le scan échoue
  String get display => code.length == 8 ? '${code.substring(0, 4)}-${code.substring(4)}' : code;
}

class ClientLink {
  const ClientLink({
    required this.id,
    required this.businessName,
    required this.createdAt,
    this.logoUrl,
  });

  factory ClientLink.fromJson(Map<String, dynamic> json) => ClientLink(
        id: '${json['id']}',
        businessName: '${json['business_name'] ?? ''}',
        logoUrl: json['logo_url'] as String?,
        createdAt: DateTime.tryParse('${json['created_at']}')?.toLocal() ?? DateTime.now(),
      );

  final String id;
  final String businessName;
  final String? logoUrl;
  final DateTime createdAt;
}

class ClientOrder {
  const ClientOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.businessName,
    required this.trackingToken,
    required this.createdAt,
    this.subject,
    this.knownTokens = const {},
  });

  factory ClientOrder.fromJson(Map<String, dynamic> json) => ClientOrder(
        id: '${json['id']}',
        orderNumber: json['order_number'] is num ? (json['order_number'] as num).toInt() : 0,
        status: '${json['status'] ?? ''}',
        subject: json['subject'] as String?,
        businessName: '${json['business_name'] ?? ''}',
        trackingToken: '${json['tracking_token']}',
        createdAt: DateTime.tryParse('${json['created_at']}')?.toLocal() ?? DateTime.now(),
        knownTokens: {for (final t in (json['known_tokens'] as List? ?? [])) '$t'},
      );

  final String id;
  final int orderNumber;
  final String status;
  final String? subject;
  final String businessName;
  final String trackingToken;
  final DateTime createdAt;

  /// Tous les jetons de suivi de l'ordre (dont expirés) : reconnaît un ordre déjà
  /// suivi sous un autre jeton
  final Set<String> knownTokens;

  String get reference => 'OT-${orderNumber.toString().padLeft(4, '0')}';

  String get label {
    final s = subject?.trim() ?? '';
    return s.isEmpty ? reference : '$reference · $s';
  }
}

class ClientOverview {
  const ClientOverview({required this.links, required this.orders});

  factory ClientOverview.fromJson(Map<String, dynamic> json) => ClientOverview(
        links: ((json['links'] as List?) ?? [])
            .whereType<Map>()
            .map((e) => ClientLink.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        orders: ((json['orders'] as List?) ?? [])
            .whereType<Map>()
            .map((e) => ClientOrder.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );

  final List<ClientLink> links;
  final List<ClientOrder> orders;
}
