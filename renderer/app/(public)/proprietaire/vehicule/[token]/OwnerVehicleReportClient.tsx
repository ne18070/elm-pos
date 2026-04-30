'use client';

import { useEffect, useState } from 'react';
import { Car, Download, Loader2, Phone, ReceiptText } from 'lucide-react';
import { getVehicleOwnerReport, type VehicleOwnerReport } from '@services/supabase/vehicle-owner-report';
import { displayCurrency } from '@/lib/utils';

function money(value: number | null | undefined, currency: string) {
  return `${new Intl.NumberFormat('fr-FR').format(Number(value ?? 0))} ${displayCurrency(currency)}`;
}

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('fr-FR') : '-';
}

export default function OwnerVehicleReportClient({ token }: { token: string }) {
  const [report, setReport] = useState<VehicleOwnerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVehicleOwnerReport(token)
      .then((data) => {
        setReport(data);
        setError(data ? null : 'Rapport introuvable.');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Rapport indisponible.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-content-muted" />
      </main>
    );
  }

  if (!report) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <Car className="w-12 h-12 mx-auto text-content-muted mb-3" />
          <h1 className="text-xl font-black text-content-primary">Rapport indisponible</h1>
          <p className="text-sm text-content-secondary mt-2">{error}</p>
        </div>
      </main>
    );
  }

  const activities = report.kind === 'rental' ? report.rentals : report.sales;

  return (
    <main className="min-h-screen bg-surface text-content-primary">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-surface-border pb-5">
          <div className="flex gap-4">
            {report.business_logo && (
              <img
                src={report.business_logo}
                alt={report.business_name}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl object-contain bg-surface-input border border-surface-border p-1 shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs text-content-muted uppercase tracking-widest font-bold">{report.business_name}</p>
              <h1 className="text-2xl sm:text-3xl font-black mt-1">{report.vehicle.name}</h1>
              <p className="text-sm text-content-secondary mt-1">
                {report.vehicle.year ? `${report.vehicle.year} · ` : ''}
                {report.vehicle.plate ?? (report.kind === 'rental' ? 'Plaque non renseignee' : 'Vehicule en vente')}
              </p>
              {report.business_phone && (
                <a href={`tel:${report.business_phone}`} className="inline-flex items-center gap-1.5 text-sm text-content-brand mt-2">
                  <Phone className="w-4 h-4" /> {report.business_phone}
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <div className="w-14 h-10 rounded-lg bg-white border border-surface-border flex items-center justify-center p-1 shrink-0">
              <img src="/logo.png" alt="ELM APP" className="w-full h-full object-contain" />
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <Metric label="Encaissements" value={money(report.totals.gross, report.currency)} />
          <Metric label="Commission agence" value={money(report.totals.commission, report.currency)} />
          <Metric label="Part proprietaire" value={money(report.totals.owner_share, report.currency)} />
        </section>

        <section className="mt-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
            {report.vehicle.image ? (
              <img src={report.vehicle.image} alt="" className="w-full h-48 object-cover" />
            ) : (
              <div className="h-48 bg-surface-input flex items-center justify-center">
                <Car className="w-12 h-12 text-content-muted" />
              </div>
            )}
            <div className="p-4 text-sm space-y-2">
              <p><span className="text-content-muted">Proprietaire:</span> {report.vehicle.owner_name ?? '-'}</p>
              <p><span className="text-content-muted">Telephone:</span> {report.vehicle.owner_phone ?? '-'}</p>
              <p>
                <span className="text-content-muted">Commission:</span>{' '}
                {report.vehicle.commission_type === 'percent'
                  ? `${report.vehicle.commission_value}%`
                  : money(report.vehicle.commission_value, report.currency)}
              </p>
            </div>
          </div>

          <div className="bg-surface-card border border-surface-border rounded-lg">
            <div className="p-4 border-b border-surface-border flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-content-muted" />
              <h2 className="font-black text-sm uppercase tracking-wide">
                {report.kind === 'rental' ? 'Locations' : 'Vente'}
              </h2>
            </div>
            <div className="divide-y divide-surface-border">
              {activities.length === 0 ? (
                <p className="p-4 text-sm text-content-muted">Aucune operation pour le moment.</p>
              ) : activities.map((item, index) => (
                <div key={index} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm">{item.client_name ?? item.status ?? 'Operation'}</p>
                    <p className="text-xs text-content-muted">
                      {report.kind === 'rental'
                        ? `${date(item.start_date)} ${item.start_time ?? ''} - ${date(item.end_date)} ${item.end_time ?? ''}`
                        : date(item.updated_at)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-black text-sm">{money(item.total_amount ?? item.price, report.currency)}</p>
                    {item.amount_paid != null && (
                      <p className="text-xs text-content-muted">Paye: {money(item.amount_paid, report.currency)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 bg-surface-card border border-surface-border rounded-lg p-4">
          <h2 className="font-black text-sm uppercase tracking-wide">Depenses</h2>
          {report.expenses.length === 0 ? (
            <p className="text-sm text-content-muted mt-2">Aucune depense rattachee au vehicule.</p>
          ) : (
            <div className="mt-3 divide-y divide-surface-border">
              {report.expenses.map((expense, index) => (
                <div key={index} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{expense.label ?? 'Depense'}</p>
                    <p className="text-xs text-content-muted">{date(expense.date)}</p>
                  </div>
                  <p className="text-sm font-black">{money(expense.amount, report.currency)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4">
      <p className="text-xs text-content-muted uppercase tracking-wide font-bold">{label}</p>
      <p className="text-xl font-black mt-1">{value}</p>
    </div>
  );
}
