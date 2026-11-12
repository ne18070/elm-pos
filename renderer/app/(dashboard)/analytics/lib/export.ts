import type { AnalyticsSummary } from '@pos-types';
import type {
  CouponStat, HotelAnalyticsSummary, JuridiqueAnalyticsSummary, VoituresAnalyticsSummary,
  RevendeursAnalyticsSummary, ApprovAnalyticsSummary, ServicesAnalyticsSummary,
  VendeursAnalyticsSummary, WholesaleOrderItem, PaymentMethodStat,
} from '@services/supabase/analytics';
import { periodDates, type ResolvedPeriod } from './period';

type Cell = string | number | null | undefined;

export interface CsvSection {
  title?: string;
  header: string[];
  rows: Cell[][];
}

export interface ExportSources {
  data: AnalyticsSummary | null;
  payments: PaymentMethodStat[];
  coupons: CouponStat[];
  hotelData: HotelAnalyticsSummary | null;
  juridiqueData: JuridiqueAnalyticsSummary | null;
  voituresData: VoituresAnalyticsSummary | null;
  revendeursData: RevendeursAnalyticsSummary | null;
  approvData: ApprovAnalyticsSummary | null;
  servicesData: ServicesAnalyticsSummary | null;
  vendeursData: VendeursAnalyticsSummary | null;
  wholesaleItems: WholesaleOrderItem[] | null;
  /** Permission view_financials : ajoute prix d'achat et marge estimée. */
  showFinancials: boolean;
}

const n = (v: number | null | undefined) => Math.round(Number(v ?? 0));

/**
 * Sections CSV de l'onglet affiché — ce que l'on exporte est ce que l'on voit.
 * null = rien à exporter (données pas encore chargées).
 */
export function buildTabExport(tab: string, src: ExportSources, period: ResolvedPeriod): CsvSection[] | null {
  switch (tab) {
    case 'general': {
      if (!src.data) return null;
      const byDay = new Map(src.data.daily_stats.map((d) => [d.date, d]));
      const dates = periodDates(period);
      return [
        {
          title: 'Ventes par jour',
          header: ['Date', 'CA facturé', 'Encaissé', 'Ventes', 'dont prestations (CA)', 'Ventes finalisées (CA)'],
          rows: dates.map((d) => {
            const s = byDay.get(d);
            return [d, n(s?.billed_sales), n(s?.collected_sales), s?.billed_count ?? 0, n(s?.billed_services), n(s?.total_sales)];
          }),
        },
        {
          title: 'Encaissements par moyen de paiement',
          header: ['Moyen', 'Montant', 'Paiements'],
          rows: src.payments.map((p) => [p.method, n(p.amount), p.count]),
        },
        {
          title: 'Meilleures ventes',
          header: ['Produit', 'Quantité', 'CA'],
          rows: src.data.top_products.map((p) => [p.name, p.quantity_sold, n(p.revenue)]),
        },
      ];
    }
    case 'produits':
      return src.data ? [{
        header: ['Produit', 'Quantité vendue', 'CA', ...(src.showFinancials ? ["Prix d'achat actuel", 'Marge estimée'] : [])],
        rows: src.data.top_products.map((p) => [
          p.name, p.quantity_sold, n(p.revenue),
          ...(src.showFinancials
            ? [p.unit_cost == null ? '' : n(p.unit_cost), p.unit_cost == null ? '' : n(p.revenue - p.quantity_sold * p.unit_cost)]
            : []),
        ]),
      }] : null;
    case 'vendeurs':
      return src.vendeursData ? [{
        header: ['Vendeur', 'CA', 'Commandes', 'Articles', 'Panier moyen'],
        rows: [
          ...src.vendeursData.sellers.map((s) => [s.name, n(s.revenue), s.order_count, s.item_count, n(s.avg_order)]),
          ...(src.vendeursData.unassigned_orders > 0
            ? [['Sans vendeur', n(src.vendeursData.unassigned_ca), src.vendeursData.unassigned_orders, '', '']]
            : []),
        ],
      }] : null;
    case 'grossiste':
      return src.wholesaleItems ? [{
        header: ['Revendeur', 'Client', 'Produit', 'Quantité', 'CA'],
        rows: src.wholesaleItems.map((i) => [i.reseller_name, i.client_name ?? '', i.product_name, i.quantity, n(i.revenue)]),
      }] : null;
    case 'revendeurs':
      return src.revendeursData ? [
        {
          title: 'Revendeurs',
          header: ['Revendeur', 'Type', 'Zone', 'CA', 'Commandes'],
          rows: src.revendeursData.top_resellers.map((r) => [r.name, r.type, r.zone ?? '', n(r.revenue), r.order_count]),
        },
        {
          title: 'Par zone',
          header: ['Zone', 'CA', 'Commandes'],
          rows: src.revendeursData.by_zone.map((z) => [z.zone, n(z.revenue), z.count]),
        },
      ] : null;
    case 'promos':
      return [{
        header: ['Code', 'Utilisations', 'Remise accordée', 'CA associé', 'Mesure du CA'],
        rows: src.coupons.map((c) => [c.coupon_code, c.usage_count, n(c.total_discount), n(c.revenue), c.revenue_label]),
      }];
    case 'appro':
      return src.approvData ? [
        {
          title: 'Fournisseurs',
          header: ['Fournisseur', 'Dépense', 'Entrées'],
          rows: src.approvData.top_suppliers.map((s) => [s.name, n(s.total), s.entries]),
        },
        {
          title: 'Produits achetés',
          header: ['Produit', 'Quantité', 'Coût'],
          rows: src.approvData.top_products.map((p) => [p.name, p.quantity, n(p.cost)]),
        },
      ] : null;
    case 'services':
      return src.servicesData ? [
        {
          title: 'Prestations',
          header: ['Prestation', 'Nombre', 'CA'],
          rows: src.servicesData.top_services.map((s) => [s.name, s.count, n(s.revenue)]),
        },
        {
          title: 'Encaissements par jour',
          header: ['Date', 'Montant', 'Prestations'],
          rows: src.servicesData.daily_revenue.map((d) => [d.date, n(d.total), d.count]),
        },
      ] : null;
    case 'juridique':
      return src.juridiqueData ? [
        {
          title: 'Honoraires par type',
          header: ['Type', 'Montant', 'Factures'],
          rows: src.juridiqueData.fees_by_type.map((f) => [f.type, n(f.amount), f.count]),
        },
        {
          title: 'Dossiers par statut',
          header: ['Statut', 'Dossiers'],
          rows: src.juridiqueData.dossiers_by_status.map((d) => [d.status, d.count]),
        },
      ] : null;
    case 'hotel':
      return src.hotelData ? [{
        header: ['Chambre', 'Type', 'Départs', 'Nuits', 'CA'],
        rows: src.hotelData.room_stats.map((r) => [r.room_number, r.room_type, r.checkouts, r.nights, n(r.revenue)]),
      }] : null;
    case 'voitures':
      return src.voituresData ? [{
        header: ['Marque', 'Modèle', 'Année', 'Prix', 'Date'],
        rows: src.voituresData.recent_ventes.map((v) => [v.marque, v.modele, v.annee ?? '', n(v.prix), v.updated_at.slice(0, 10)]),
      }] : null;
    default:
      return null;
  }
}

const escapeCell = (c: Cell) => {
  const s = c == null ? '' : String(c);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV « à la française » (séparateur ;, BOM UTF-8) — s'ouvre directement dans Excel. */
export function toCsv(sections: CsvSection[]): string {
  return sections
    .map((sec) => [
      ...(sec.title && sections.length > 1 ? [[sec.title]] : []),
      sec.header,
      ...sec.rows,
    ].map((r) => r.map(escapeCell).join(';')).join('\n'))
    .join('\n\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
