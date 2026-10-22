import 'dart:convert';

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

/// Données gardées uniquement sur le téléphone (aucun compte acheteur en v1).
class LocalStore {
  static const _recentKey = 'recent_boutiques';
  static const _customerKey = 'customer_details';
  static const _recentMax = 20;
  static const _trackedKey = 'tracked_requests';
  static const _trackedMax = 50;

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
