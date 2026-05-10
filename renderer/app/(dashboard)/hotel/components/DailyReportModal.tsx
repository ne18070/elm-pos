'use client';

import { X, Printer, TrendingUp, BedDouble, LogIn, LogOut, AlertCircle } from 'lucide-react';
import type { HotelRoom, HotelReservation } from '@services/supabase/hotel';
import { fmtMoney, fmt } from './hotel-helpers';

interface Props {
  rooms:        HotelRoom[];
  reservations: HotelReservation[];
  currency:     string;
  revenueToday: number;
  onClose:      () => void;
}

export function DailyReportModal({ rooms, reservations, currency, revenueToday, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const arrivalsExpected = reservations.filter(r => r.check_in === today && r.status === 'confirmed');
  const arrivalsCheckedIn = reservations.filter(r => r.check_in === today && r.status === 'checked_in');
  const departuresExpected = reservations.filter(r => r.check_out === today && r.status === 'checked_in');
  const departuresCheckedOut = reservations.filter(r => r.check_out === today && r.status === 'checked_out');

  const occupied = rooms.filter(r => r.status === 'occupied').length;
  const available = rooms.filter(r => r.status === 'available').length;
  const cleaning = rooms.filter(r => r.status === 'cleaning').length;
  const maintenance = rooms.filter(r => r.status === 'maintenance').length;
  const totalRooms = rooms.length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

  // Solde impayé sur réservations actives
  const unpaidBalance = reservations
    .filter(r => (r.status === 'confirmed' || r.status === 'checked_in') && r.total > r.paid_amount)
    .reduce((s, r) => s + (r.total - r.paid_amount), 0);

  function printReport() {
    const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const html = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><title>Rapport du ${dateLabel}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .sub { color: #666; font-size: 11px; margin-bottom: 20px; }
  .section { margin-bottom: 18px; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; font-weight: 600; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  .kpi-row { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
  .kpi { background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 14px; min-width: 120px; }
  .kpi-label { font-size: 10px; color: #888; text-transform: uppercase; }
  .kpi-value { font-size: 20px; font-weight: 700; color: #1a1a1a; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #1a1a1a; color: #fff; padding: 5px 8px; font-size: 10px; text-align: left; }
  td { padding: 5px 8px; font-size: 11px; border-bottom: 1px solid #eee; }
  .empty { color: #999; font-style: italic; font-size: 11px; padding: 6px 0; }
</style>
</head><body>
<h1>Rapport journalier</h1>
<p class="sub">${dateLabel}</p>

<div class="section">
  <div class="section-title">Occupation</div>
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-label">Taux d'occupation</div><div class="kpi-value">${occupancyRate}%</div></div>
    <div class="kpi"><div class="kpi-label">Chambres occupées</div><div class="kpi-value">${occupied} / ${totalRooms}</div></div>
    <div class="kpi"><div class="kpi-label">Disponibles</div><div class="kpi-value">${available}</div></div>
    <div class="kpi"><div class="kpi-label">Nettoyage</div><div class="kpi-value">${cleaning}</div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Finances du jour</div>
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-label">Encaissé aujourd'hui</div><div class="kpi-value">${new Intl.NumberFormat('fr-FR').format(revenueToday)} ${currency}</div></div>
    <div class="kpi"><div class="kpi-label">Soldes impayés</div><div class="kpi-value">${new Intl.NumberFormat('fr-FR').format(unpaidBalance)} ${currency}</div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Arrivées du jour (${arrivalsExpected.length + arrivalsCheckedIn.length})</div>
  ${arrivalsExpected.length + arrivalsCheckedIn.length === 0 ? '<p class="empty">Aucune arrivée</p>' : `
  <table>
    <thead><tr><th>Client</th><th>Chambre</th><th>Statut</th></tr></thead>
    <tbody>
      ${[...arrivalsCheckedIn, ...arrivalsExpected].map(r => `
        <tr>
          <td>${r.guest?.full_name ?? '—'}</td>
          <td>${r.room?.number ?? '—'}</td>
          <td>${r.status === 'checked_in' ? 'Arrivé' : 'Attendu'}</td>
        </tr>`).join('')}
    </tbody>
  </table>`}
</div>

<div class="section">
  <div class="section-title">Départs du jour (${departuresExpected.length + departuresCheckedOut.length})</div>
  ${departuresExpected.length + departuresCheckedOut.length === 0 ? '<p class="empty">Aucun départ</p>' : `
  <table>
    <thead><tr><th>Client</th><th>Chambre</th><th>Total</th><th>Statut</th></tr></thead>
    <tbody>
      ${[...departuresCheckedOut, ...departuresExpected].map(r => `
        <tr>
          <td>${r.guest?.full_name ?? '—'}</td>
          <td>${r.room?.number ?? '—'}</td>
          <td>${new Intl.NumberFormat('fr-FR').format(r.total)} ${currency}</td>
          <td>${r.status === 'checked_out' ? 'Parti' : 'Encore présent'}</td>
        </tr>`).join('')}
    </tbody>
  </table>`}
</div>

</body></html>`;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div>
            <h3 className="font-semibold text-content-primary">Rapport du jour</h3>
            <p className="text-xs text-content-secondary">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={printReport} className="btn-secondary h-9 px-3 text-sm flex items-center gap-1.5">
              <Printer className="w-4 h-4" /> Imprimer
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* KPIs occupation */}
          <div>
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <BedDouble className="w-3.5 h-3.5" /> Occupation
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Taux', value: `${occupancyRate}%`, color: occupancyRate >= 70 ? 'text-status-success' : 'text-content-primary' },
                { label: 'Occupées', value: `${occupied}/${totalRooms}`, color: 'text-content-brand' },
                { label: 'Disponibles', value: String(available), color: 'text-status-success' },
                { label: 'Nettoyage', value: String(cleaning), color: 'text-status-warning' },
              ].map(({ label, value, color }) => (
                <div key={label} className="card p-3 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-content-secondary mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* KPIs finances */}
          <div>
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Finances du jour
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-3">
                <p className="text-lg font-bold text-status-success">{fmtMoney(revenueToday, currency)}</p>
                <p className="text-xs text-content-secondary mt-0.5">Encaissé aujourd&apos;hui</p>
              </div>
              {unpaidBalance > 0 && (
                <div className="card p-3">
                  <p className="text-lg font-bold text-status-warning">{fmtMoney(unpaidBalance, currency)}</p>
                  <p className="text-xs text-content-secondary mt-0.5">Soldes impayés</p>
                </div>
              )}
            </div>
          </div>

          {/* Arrivées */}
          <div>
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <LogIn className="w-3.5 h-3.5 text-status-success" />
              Arrivées — {arrivalsExpected.length + arrivalsCheckedIn.length}
            </p>
            {arrivalsExpected.length + arrivalsCheckedIn.length === 0
              ? <p className="text-xs text-content-muted py-1">Aucune arrivée aujourd&apos;hui</p>
              : (
                <div className="space-y-1.5">
                  {[...arrivalsCheckedIn, ...arrivalsExpected].map(r => (
                    <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-surface-border last:border-0">
                      <div>
                        <p className="font-medium text-content-primary">{r.guest?.full_name}</p>
                        <p className="text-xs text-content-secondary">Chambre {r.room?.number}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'checked_in' ? 'bg-badge-success text-status-success' : 'bg-badge-warning text-status-warning'}`}>
                        {r.status === 'checked_in' ? 'Arrivé' : 'Attendu'}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Départs */}
          <div>
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <LogOut className="w-3.5 h-3.5 text-status-warning" />
              Départs — {departuresExpected.length + departuresCheckedOut.length}
            </p>
            {departuresExpected.length + departuresCheckedOut.length === 0
              ? <p className="text-xs text-content-muted py-1">Aucun départ aujourd&apos;hui</p>
              : (
                <div className="space-y-1.5">
                  {[...departuresCheckedOut, ...departuresExpected].map(r => (
                    <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-surface-border last:border-0">
                      <div>
                        <p className="font-medium text-content-primary">{r.guest?.full_name}</p>
                        <p className="text-xs text-content-secondary">Chambre {r.room?.number} · {fmtMoney(r.total, currency)}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'checked_out' ? 'bg-badge-success text-status-success' : 'bg-badge-warning text-status-warning'}`}>
                        {r.status === 'checked_out' ? 'Parti' : 'En attente'}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {maintenance > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-badge-warning border border-status-warning/30 text-sm text-status-warning">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{maintenance} chambre{maintenance > 1 ? 's' : ''} en maintenance</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
