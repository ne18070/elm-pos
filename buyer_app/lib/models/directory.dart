/// Fiche ouverte : vitrine produits (/boutique) ou catalogue de prestations (/services).
enum VisitKind { boutique, service }

/// Ligne de l'annuaire — RPC list_directory_businesses (migration 156).
class DirectoryEntry {
  const DirectoryEntry({
    required this.id,
    required this.name,
    required this.hasProducts,
    required this.hasServices,
    this.logoUrl,
    this.address,
  });

  factory DirectoryEntry.fromJson(Map<String, dynamic> json) => DirectoryEntry(
        id: json['id'] as String,
        name: json['name'] as String,
        logoUrl: json['logo_url'] as String?,
        address: json['address'] as String?,
        hasProducts: json['has_products'] == true,
        hasServices: json['has_services'] == true,
      );

  final String id;
  final String name;
  final String? logoUrl;
  final String? address;
  final bool hasProducts;
  final bool hasServices;
}

/// Filtre de l'annuaire (valeur envoyée en p_kind).
enum DirectoryKind {
  all(null, 'Tout'),
  boutique('boutique', 'Boutiques'),
  service('service', 'Services');

  const DirectoryKind(this.apiValue, this.label);
  final String? apiValue;
  final String label;
}
