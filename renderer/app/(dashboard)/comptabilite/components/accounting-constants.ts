import {
  TrendingDown, ArrowLeftRight, Users, Wrench, Banknote,
} from 'lucide-react';

export type Tab    = 'dashboard' | 'journal' | 'balance' | 'etats';
export type Period = 'month' | 'quarter' | 'year' | 'custom';
export type PaySide = 'caisse' | 'banque' | 'mobile';

export interface OpTemplate {
  id: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  category: string;
  defaultDesc: string;
  hasPay?: boolean;
  debit:  { code: string; name: string };
  credit: { code: string; name: string };
}

export function getPeriod(p: Period, customFrom?: string, customTo?: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === 'month') {
    return { from: new Date(y, m, 1).toISOString().slice(0, 10), to: new Date(y, m + 1, 0).toISOString().slice(0, 10) };
  }
  if (p === 'quarter') {
    const q = Math.floor(m / 3);
    return { from: new Date(y, q * 3, 1).toISOString().slice(0, 10), to: new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10) };
  }
  if (p === 'year') {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: customFrom ?? `${y}-01-01`, to: customTo ?? new Date().toISOString().slice(0, 10) };
}

export const PERIOD_LABELS: Record<Period, string> = {
  month:   'Ce mois',
  quarter: 'Ce trimestre',
  year:    'Cette année',
  custom:  'Personnalisé',
};

export const CLASS_LABELS: Record<number, string> = {
  1: 'Classe 1 – Ressources durables',
  2: 'Classe 2 – Actif immobilisé',
  3: 'Classe 3 – Stocks',
  4: 'Classe 4 – Tiers',
  5: 'Classe 5 – Trésorerie',
  6: 'Classe 6 – Charges',
  7: 'Classe 7 – Produits',
  8: 'Classe 8 – Autres charges et produits',
};

export const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  order:         { label: 'Vente',       color: 'text-status-success bg-badge-success border-status-success'   },
  stock:         { label: 'Achat',       color: 'text-blue-400 bg-badge-info border-blue-800'                  },
  refund:        { label: 'Remb.',       color: 'text-status-orange bg-badge-orange border-orange-800'         },
  manual:        { label: 'Manuel',      color: 'text-status-purple bg-badge-purple border-purple-800'         },
  hotel:         { label: 'Hôtel',       color: 'text-status-teal bg-badge-teal border-teal-700'               },
  adjustment:    { label: 'Ajustement',  color: 'text-content-secondary bg-surface-card border-slate-700'      },
  voiture:       { label: 'Véhicule',    color: 'text-yellow-400 bg-yellow-900/20 border-yellow-700'           },
  honoraires:    { label: 'Honoraires',  color: 'text-violet-400 bg-violet-900/20 border-violet-700'           },
  service_order: { label: 'Prestation',  color: 'text-cyan-400 bg-cyan-900/20 border-cyan-700'                 },
  rental:        { label: 'Location',    color: 'text-rose-400 bg-rose-900/20 border-rose-700'                 },
};

export const PAY_ACCOUNTS: Record<PaySide, { code: string; name: string }> = {
  caisse: { code: '571', name: 'Caisse' },
  banque: { code: '521', name: 'Banques – comptes courants' },
  mobile: { code: '576', name: 'Mobile Money' },
};

export const OP_CATEGORIES = [
  { id: 'charges',    label: 'Charges',          icon: TrendingDown,   color: 'text-status-error bg-badge-error border-status-error' },
  { id: 'tresorerie', label: 'Trésorerie',        icon: ArrowLeftRight, color: 'text-cyan-400 bg-cyan-900/20 border-cyan-800' },
  { id: 'tiers',      label: 'Clients / Fourn.',  icon: Users,          color: 'text-blue-400 bg-badge-info border-blue-800' },
  { id: 'invest',     label: 'Investissement',    icon: Wrench,         color: 'text-status-warning bg-badge-warning border-status-warning' },
  { id: 'capital',    label: 'Capital',           icon: Banknote,       color: 'text-status-success bg-badge-success border-status-success' },
] as const;

export const OP_TEMPLATES: OpTemplate[] = [
  // -- Charges --
  { id: 'loyer',        label: 'Loyer',                     desc: 'Paiement du loyer du local',           icon: TrendingDown, category: 'charges',    defaultDesc: 'Loyer',                        hasPay: true,  debit: { code: '613', name: 'Loyers et charges locatives' },          credit: { code: '571', name: 'Caisse' } },
  { id: 'salaire',      label: 'Salaires',                  desc: 'Paiement des salaires du personnel',   icon: Users,        category: 'charges',    defaultDesc: 'Salaires du personnel',         hasPay: true,  debit: { code: '641', name: 'Rémunérations du personnel' },           credit: { code: '571', name: 'Caisse' } },
  { id: 'cs',           label: 'Charges sociales',          desc: 'Cotisations CNSS / sécurité sociale',  icon: Users,        category: 'charges',    defaultDesc: 'Charges sociales',              hasPay: true,  debit: { code: '646', name: 'Charges sociales' },                     credit: { code: '571', name: 'Caisse' } },
  { id: 'transport',    label: 'Transport',                 desc: 'Frais de livraison ou déplacement',    icon: TrendingDown, category: 'charges',    defaultDesc: 'Frais de transport',            hasPay: true,  debit: { code: '611', name: 'Transports sur achats' },                credit: { code: '571', name: 'Caisse' } },
  { id: 'telephone',    label: 'Téléphone / Internet',      desc: 'Facture télécom ou internet',          icon: TrendingDown, category: 'charges',    defaultDesc: 'Frais de télécommunications',   hasPay: true,  debit: { code: '625', name: 'Frais de télécommunications' },          credit: { code: '571', name: 'Caisse' } },
  { id: 'publicite',    label: 'Publicité',                 desc: 'Dépenses marketing ou pub',            icon: TrendingDown, category: 'charges',    defaultDesc: 'Publicité',                     hasPay: true,  debit: { code: '621', name: 'Publicité, publications' },              credit: { code: '571', name: 'Caisse' } },
  { id: 'frais_banque', label: 'Frais bancaires',           desc: 'Commissions et agios bancaires',       icon: TrendingDown, category: 'charges',    defaultDesc: 'Frais bancaires',               hasPay: false, debit: { code: '631', name: 'Frais bancaires' },                      credit: { code: '521', name: 'Banques – comptes courants' } },
  { id: 'impots',       label: 'Impôts / Taxes',            desc: "Paiement d'impôts ou taxes",           icon: TrendingDown, category: 'charges',    defaultDesc: 'Impôts et taxes',               hasPay: true,  debit: { code: '444', name: 'État – impôts et taxes divers' },        credit: { code: '571', name: 'Caisse' } },
  { id: 'autre_charge', label: 'Autre dépense',             desc: 'Toute autre dépense courante',         icon: TrendingDown, category: 'charges',    defaultDesc: 'Autre dépense',                 hasPay: true,  debit: { code: '628', name: 'Divers services extérieurs' },           credit: { code: '571', name: 'Caisse' } },
  // -- Trésorerie --
  { id: 'depot_banque',   label: 'Dépôt en banque',        desc: 'Verser des espèces à la banque',        icon: ArrowLeftRight, category: 'tresorerie', defaultDesc: 'Dépôt espèces en banque',  hasPay: false, debit: { code: '521', name: 'Banques – comptes courants' }, credit: { code: '571', name: 'Caisse' } },
  { id: 'retrait_banque', label: 'Retrait bancaire',        desc: 'Retirer des espèces de la banque',      icon: ArrowLeftRight, category: 'tresorerie', defaultDesc: 'Retrait bancaire',          hasPay: false, debit: { code: '571', name: 'Caisse' },                     credit: { code: '521', name: 'Banques – comptes courants' } },
  { id: 'depot_mobile',   label: 'Dépôt Mobile Money',     desc: 'Verser des espèces en mobile money',    icon: ArrowLeftRight, category: 'tresorerie', defaultDesc: 'Dépôt Mobile Money',        hasPay: false, debit: { code: '576', name: 'Mobile Money' },                credit: { code: '571', name: 'Caisse' } },
  { id: 'retrait_mobile', label: 'Retrait Mobile Money',   desc: 'Recevoir des espèces du mobile money',  icon: ArrowLeftRight, category: 'tresorerie', defaultDesc: 'Retrait Mobile Money',      hasPay: false, debit: { code: '571', name: 'Caisse' },                     credit: { code: '576', name: 'Mobile Money' } },
  // -- Clients / Fournisseurs --
  { id: 'paiement_fourn',    label: 'Paiement fournisseur', desc: 'Régler une facture fournisseur',     icon: Users, category: 'tiers', defaultDesc: 'Paiement fournisseur',  hasPay: true,  debit: { code: '401', name: 'Fournisseurs' },                  credit: { code: '571', name: 'Caisse' } },
  { id: 'encaissement_cli',  label: 'Encaissement client',  desc: 'Recevoir un paiement client',        icon: Users, category: 'tiers', defaultDesc: 'Encaissement client',   hasPay: false, debit: { code: '571', name: 'Caisse' },                        credit: { code: '411', name: 'Clients' } },
  { id: 'avance_fourn',      label: 'Avance fournisseur',   desc: "Verser une avance à un fournisseur", icon: Users, category: 'tiers', defaultDesc: 'Avance fournisseur',    hasPay: true,  debit: { code: '481', name: 'Fournisseurs – avances versées' }, credit: { code: '571', name: 'Caisse' } },
  // -- Investissement --
  { id: 'achat_materiel',  label: 'Achat matériel',         desc: 'Machines, équipements…',          icon: Wrench, category: 'invest', defaultDesc: 'Achat de matériel',           hasPay: true,  debit: { code: '241', name: 'Matériel et outillage industriel' },   credit: { code: '571', name: 'Caisse' } },
  { id: 'achat_mobilier',  label: 'Mobilier / agencement',  desc: 'Tables, chaises, rayonnages…',    icon: Wrench, category: 'invest', defaultDesc: 'Achat mobilier',              hasPay: true,  debit: { code: '245', name: 'Mobilier et agencement' },             credit: { code: '571', name: 'Caisse' } },
  { id: 'achat_info',      label: 'Matériel informatique',  desc: 'Ordinateur, imprimante…',         icon: Wrench, category: 'invest', defaultDesc: 'Achat matériel informatique', hasPay: true,  debit: { code: '244', name: 'Matériel de bureau et informatique' },  credit: { code: '571', name: 'Caisse' } },
  { id: 'achat_vehicule',  label: 'Véhicule',               desc: 'Voiture, moto, camion…',          icon: Wrench, category: 'invest', defaultDesc: 'Achat véhicule',              hasPay: true,  debit: { code: '248', name: 'Matériel de transport' },              credit: { code: '571', name: 'Caisse' } },
  // -- Capital --
  { id: 'apport',   label: 'Apport en capital',     desc: 'Le propriétaire apporte des fonds', icon: Banknote, category: 'capital', defaultDesc: 'Apport en capital',     hasPay: false, debit: { code: '571', name: 'Caisse' },                      credit: { code: '101', name: 'Capital social' } },
  { id: 'emprunt',  label: "Réception d'emprunt",   desc: "Réception d'un prêt bancaire",      icon: Banknote, category: 'capital', defaultDesc: 'Emprunt bancaire',      hasPay: false, debit: { code: '521', name: 'Banques – comptes courants' },  credit: { code: '161', name: 'Emprunts' } },
  { id: 'rembours', label: 'Remboursement emprunt', desc: "Mensualité d'un emprunt",           icon: Banknote, category: 'capital', defaultDesc: 'Remboursement emprunt', hasPay: false, debit: { code: '161', name: 'Emprunts' },                    credit: { code: '521', name: 'Banques – comptes courants' } },
];
