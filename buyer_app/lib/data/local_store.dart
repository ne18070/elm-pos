import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/boutique.dart';
import '../models/directory.dart';

class RecentBoutique {
  const RecentBoutique({
    required this.id,
    required this.name,
    required this.visitedAt,
    this.logoUrl,
    this.kind = VisitKind.boutique,
  });

  factory RecentBoutique.fromJson(Map<String, dynamic> json) => RecentBoutique(
        id: json['id'] as String,
        name: json['name'] as String,
        logoUrl: json['logo_url'] as String?,
        visitedAt: DateTime.tryParse('${json['visited_at']}') ?? DateTime.now(),
        // Entrées enregistrées avant la 1.1.0 : toujours des boutiques
        kind: json['kind'] == 'service' ? VisitKind.service : VisitKind.boutique,
      );

  final String id;
  final String name;
  final String? logoUrl;
  final DateTime visitedAt;
  final VisitKind kind;

  Map<String, Object?> toJson() => {
        'kind': kind.name,
        'id': id,
        'name': name,
        'logo_url': logoUrl,
        'visited_at': visitedAt.toIso8601String(),
      };
}

/// Coordonnées saisies à la dernière commande, pour pré-remplir la suivante.
class CustomerDetails {
  const CustomerDetails({required this.name, required this.phone, this.address});

  factory CustomerDetails.fromJson(Map<String, dynamic> json) => CustomerDetails(
        name: '${json['name'] ?? ''}',
        phone: '${json['phone'] ?? ''}',
        address: json['address'] as String?,
      );

  final String name;
  final String phone;
  final String? address;

  Map<String, Object?> toJson() => {'name': name, 'phone': phone, 'address': address};
}

/// Demande suivie depuis l'app (jeton de `/track/<jeton>`), affichée dans « Mes suivis ».
class TrackedRequest {
  const TrackedRequest({
    required this.token,
    required this.businessName,
    required this.label,
    required this.createdAt,
  });

  factory TrackedRequest.fromJson(Map<String, dynamic> json) => TrackedRequest(
        token: json['token'] as String,
        businessName: '${json['business_name'] ?? ''}',
        label: '${json['label'] ?? ''}',
        createdAt: DateTime.tryParse('${json['created_at']}') ?? DateTime.now(),
      );

  final String token;
  final String businessName;
  final String label;
  final DateTime createdAt;

  Map<String, Object?> toJson() => {
        'token': token,
        'business_name': businessName,
        'label': label,
        'created_at': createdAt.toIso8601String(),
      };
}

/// Boutique bloquée par l'acheteur : masquée de l'annuaire et des visites récentes.
class BlockedBusiness {
  const BlockedBusiness({
    required this.id,
    required this.name,
    required this.blockedAt,
    this.logoUrl,
    this.reported = false,
  });

  factory BlockedBusiness.fromJson(Map<String, dynamic> json) => BlockedBusiness(
        id: json['id'] as String,
        name: '${json['name'] ?? ''}',
        logoUrl: json['logo_url'] as String?,
        blockedAt: DateTime.tryParse('${json['blocked_at']}') ?? DateTime.now(),
        reported: json['reported'] == true,
      );

  final String id;
  final String name;
  final String? logoUrl;
  final DateTime blockedAt;

  /// Blocage transmis à l'équipe ELM (report_content) ; renvoyé au prochain lancement sinon.
  final bool reported;

  BlockedBusiness copyWith({bool? reported}) => BlockedBusiness(
        id: id,
        name: name,
        logoUrl: logoUrl,
        blockedAt: blockedAt,
        reported: reported ?? this.reported,
      );

  Map<String, Object?> toJson() => {
        'id': id,
        'name': name,
        'logo_url': logoUrl,
        'blocked_at': blockedAt.toIso8601String(),
        'reported': reported,
      };
}

/// Données gardées uniquement sur le téléphone (aucun compte acheteur en v1).
class LocalStore {
  static const _recentKey = 'recent_boutiques';
  static const _customerKey = 'customer_details';
  static const _recentMax = 20;
  static const _trackedKey = 'tracked_requests';
  static const _trackedMax = 50;
  static const _blockedKey = 'blocked_businesses';
  static const _termsKey = 'terms_accepted_version';
  static const _deviceIdKey = 'device_id';

  Future<int> acceptedTermsVersion() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(_termsKey) ?? 0;
  }

  Future<void> acceptTerms(int version) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_termsKey, version);
  }

  /// Identifiant anonyme de l'installation, joint aux signalements
  /// (regroupe les signalements d'un même téléphone, sans compte).
  Future<String> deviceId() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_deviceIdKey);
    if (existing != null) return existing;
    final random = Random.secure();
    final id = List.generate(16, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
    await prefs.setString(_deviceIdKey, id);
    return id;
  }

  Future<List<BlockedBusiness>> blockedBusinesses() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_blockedKey);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((e) => BlockedBusiness.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } on FormatException {
      return [];
    }
  }

  Future<bool> isBlocked(String businessId) async =>
      (await blockedBusinesses()).any((b) => b.id == businessId);

  /// Bloque la boutique et la retire des visites récentes (boutique et services).
  Future<void> blockBusiness(BlockedBusiness business) async {
    final blocked = await blockedBusinesses();
    await _saveBlocked([business, ...blocked.where((b) => b.id != business.id)]);
    await _saveRecents((await recentBoutiques()).where((r) => r.id != business.id).toList());
  }

  Future<List<BlockedBusiness>> unblockBusiness(String businessId) async {
    final next = (await blockedBusinesses()).where((b) => b.id != businessId).toList();
    await _saveBlocked(next);
    return next;
  }

  Future<void> markBlockReported(String businessId) async {
    final blocked = await blockedBusinesses();
    await _saveBlocked([
      for (final b in blocked) b.id == businessId ? b.copyWith(reported: true) : b,
    ]);
  }

  Future<void> _saveBlocked(List<BlockedBusiness> blocked) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_blockedKey, jsonEncode(blocked.map((b) => b.toJson()).toList()));
  }

  Future<List<RecentBoutique>> recentBoutiques() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_recentKey);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((e) => RecentBoutique.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } on FormatException {
      return [];
    }
  }

  Future<void> rememberBoutique(BoutiqueInfo info, {VisitKind kind = VisitKind.boutique}) async {
    final current = await recentBoutiques();
    final next = [
      RecentBoutique(
        id: info.id,
        name: info.name,
        logoUrl: info.logoUrl,
        visitedAt: DateTime.now(),
        kind: kind,
      ),
      ...current.where((b) => !(b.id == info.id && b.kind == kind)),
    ].take(_recentMax).toList();
    await _saveRecents(next);
  }

  Future<List<RecentBoutique>> forgetBoutique(RecentBoutique visit) async {
    final next = (await recentBoutiques())
        .where((b) => !(b.id == visit.id && b.kind == visit.kind))
        .toList();
    await _saveRecents(next);
    return next;
  }

  Future<void> _saveRecents(List<RecentBoutique> recents) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_recentKey, jsonEncode(recents.map((b) => b.toJson()).toList()));
  }

  Future<CustomerDetails?> customerDetails() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_customerKey);
    if (raw == null) return null;
    try {
      return CustomerDetails.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } on FormatException {
      return null;
    }
  }

  Future<void> saveCustomerDetails(CustomerDetails details) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_customerKey, jsonEncode(details.toJson()));
  }

  Future<List<TrackedRequest>> trackedRequests() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_trackedKey);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((e) => TrackedRequest.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } on FormatException {
      return [];
    }
  }

  /// Ajoute (ou remonte en tête) une demande suivie ; garde les infos déjà connues.
  Future<void> rememberTracking(TrackedRequest request) async {
    final current = await trackedRequests();
    final next = [request, ...current.where((r) => r.token != request.token)].take(_trackedMax).toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_trackedKey, jsonEncode(next.map((r) => r.toJson()).toList()));
  }

  Future<List<TrackedRequest>> forgetTracking(String token) async {
    final next = (await trackedRequests()).where((r) => r.token != token).toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_trackedKey, jsonEncode(next.map((r) => r.toJson()).toList()));
    return next;
  }
}
