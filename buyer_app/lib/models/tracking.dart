// Suivi public d'une demande — RPC get_public_tracking (migration 050), page web /track/[token].

double _toDouble(Object? value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

/// Statuts d'un ordre de service (mêmes libellés que PublicTrackingView côté web).
enum ServiceStatus {
  attente('En attente'),
  enCours('En cours'),
  termine('Terminé'),
  paye('Payé'),
  annule('Annulé'),
  inconnu('—');

  const ServiceStatus(this.label);
  final String label;

  static ServiceStatus parse(String? value) => switch (value) {
        'attente' => attente,
        'en_cours' => enCours,
        'termine' => termine,
        'paye' => paye,
        'annule' => annule,
        _ => inconnu,
      };

  /// Étapes affichées dans la frise de progression
  static const steps = [attente, enCours, termine, paye];
}

class TrackingBusiness {
  const TrackingBusiness({required this.name, this.logoUrl, this.phone, this.address});

  factory TrackingBusiness.fromJson(Map<String, dynamic> json) => TrackingBusiness(
        name: '${json['name'] ?? ''}',
        logoUrl: json['logo_url'] as String?,
        phone: json['phone'] as String?,
        address: json['address'] as String?,
      );

  final String name;
  final String? logoUrl;
  final String? phone;
  final String? address;
}

class TrackingItem {
  const TrackingItem({required this.name, required this.quantity, required this.total});

  factory TrackingItem.fromJson(Map<String, dynamic> json) => TrackingItem(
        name: '${json['name'] ?? ''}',
        quantity: json['quantity'] is num ? (json['quantity'] as num).toInt() : 1,
        total: _toDouble(json['total']),
      );

  final String name;
  final int quantity;
  final double total;
}

class TrackingEvent {
  const TrackingEvent({required this.label, required this.createdAt, this.actorName});

  factory TrackingEvent.fromJson(Map<String, dynamic> json) => TrackingEvent(
        label: '${json['label'] ?? ''}',
        actorName: json['actor_name'] as String?,
        createdAt: DateTime.tryParse('${json['created_at']}')?.toLocal() ?? DateTime.now(),
      );

  final String label;
  final String? actorName;
  final DateTime createdAt;
}

/// Ordre de service suivi (type « service »). Les dossiers juridiques (type « dossier »)
/// sont affichés par leur seul statut.
class TrackingData {
  const TrackingData({
    required this.isService,
    required this.business,
    required this.reference,
    required this.statusLabel,
    this.status = ServiceStatus.inconnu,
    this.subject,
    this.items = const [],
    this.total = 0,
    this.paid = 0,
    this.events = const [],
    this.rating,
  });

  factory TrackingData.fromJson(Map<String, dynamic> json) {
    final business = json['business'] is Map
        ? TrackingBusiness.fromJson(Map<String, dynamic>.from(json['business'] as Map))
        : const TrackingBusiness(name: '');
    final events = (json['events'] is List ? json['events'] as List : const [])
        .whereType<Map>()
        .map((e) => TrackingEvent.fromJson(Map<String, dynamic>.from(e)))
        .toList();

    if (json['type'] == 'service' && json['service'] is Map) {
      final s = Map<String, dynamic>.from(json['service'] as Map);
      final status = ServiceStatus.parse(s['status'] as String?);
      final subject = [s['subject_ref'], s['subject_info']]
          .whereType<String>()
          .where((v) => v.trim().isNotEmpty)
          .join(' · ');
      return TrackingData(
        isService: true,
        business: business,
        reference: 'Demande n° ${s['order_number'] ?? '—'}',
        status: status,
        statusLabel: status.label,
        subject: subject.isEmpty ? null : subject,
        items: (s['items'] is List ? s['items'] as List : const [])
            .whereType<Map>()
            .map((i) => TrackingItem.fromJson(Map<String, dynamic>.from(i)))
            .toList(),
        total: _toDouble(s['total']),
        paid: _toDouble(s['paid_amount']),
        events: events,
        rating: s['client_rating'] is num ? (s['client_rating'] as num).toInt() : null,
      );
    }

    final d = json['dossier'] is Map ? Map<String, dynamic>.from(json['dossier'] as Map) : const {};
    return TrackingData(
      isService: false,
      business: business,
      reference: 'Dossier ${d['reference'] ?? ''}'.trim(),
      statusLabel: '${d['status'] ?? '—'}',
      subject: d['type_affaire'] as String?,
      events: events,
    );
  }

  final bool isService;
  final TrackingBusiness business;
  final String reference;
  final ServiceStatus status;
  final String statusLabel;
  final String? subject;
  final List<TrackingItem> items;
  final double total;
  final double paid;
  final List<TrackingEvent> events;
  final int? rating;

  bool get canRate =>
      isService && rating == null && (status == ServiceStatus.termine || status == ServiceStatus.paye);
}

/// Erreurs renvoyées par get_public_tracking ({ error: … }) en message lisible.
String trackingErrorMessage(String? code) => switch (code) {
      'expired_token' => 'Ce lien de suivi a expiré.',
      'no_data' => 'Aucune donnée associée à ce lien.',
      _ => 'Lien de suivi invalide ou expiré.',
    };
