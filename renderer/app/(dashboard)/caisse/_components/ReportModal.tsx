import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { X, FileText, Printer } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { type ReportData, printReport } from '../_lib/report-utils';
import { useEffect } from 'react';

function RRow({ label, value, bold = false, color }: {
  label: string; value: string; bold?: boolean; color?: string;
}) {
  return (
    <div className={`flex justify-between gap-2 text-[11px] ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <span className={color ?? 'text-gray-800'}>{value}</span>
    </div>
  );
}

export function ReportModal({ data, onClose }: { data: ReportData; onClose: () => void }) {
  const fmt  = (n: number) => formatCurrency(n, data.currency);
  const isZ  = data.type === 'Z';
  const diff = data.difference ?? 0;

  // Handle Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="card p-0 w-full max-w-sm overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-brand-600/20 rounded-lg">
              <FileText className="w-4 h-4 text-content-brand" />
            </div>
            <div>
              <h2 id="report-modal-title" className="font-semibold text-content-primary text-base leading-none">
                Rapport {data.type} — {isZ ? 'Clôture' : 'Lecture'}
              </h2>
              <p className="text-xs text-content-muted mt-0.5">
                {isZ ? 'Clôture définitive de session' : 'Lecture en cours de journée'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-content-secondary hover:text-content-primary"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white rounded-xl p-4 font-mono shadow-inner">
            <p className="text-center font-bold text-sm text-content-primary mb-0.5">{data.businessName}</p>
            <p className="text-center text-[10px] text-gray-500 border-b border-dashed border-gray-300 pb-1 mb-1">
              {isZ ? '— RAPPORT Z — CLÔTURE —' : '— RAPPORT X — LECTURE —'}
            </p>
            <p className="text-center text-[10px] text-gray-500 mb-1">
              {format(new Date(data.generatedAt), 'dd/MM/yyyy HH:mm', { locale: fr })}
            </p>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="Ouverture" value={format(new Date(data.openedAt), 'dd/MM HH:mm', { locale: fr })} />
              {isZ && data.closedAt && <RRow label="Clôture" value={format(new Date(data.closedAt), 'dd/MM HH:mm', { locale: fr })} />}
              <RRow label="Caissier" value={data.cashierName} />
            </div>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="Fond de caisse" value={fmt(data.openingAmount)} />
            </div>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="Espèces"      value={fmt(data.totalCash)} />
              <RRow label="Carte"        value={fmt(data.totalCard)} />
              <RRow label="Mobile Money" value={fmt(data.totalMobile)} />
              {data.totalRefunds > 0 && <RRow label="Remboursements" value={`-${fmt(data.totalRefunds)}`} />}
            </div>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="TOTAL VENTES" value={fmt(data.totalSales)}    bold />
              <RRow label="Transactions" value={String(data.totalOrders)} />
            </div>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="Fond initial"      value={fmt(data.openingAmount)} />
              <RRow label="+ Espèces reçues"  value={fmt(data.totalCash)} />
              {data.totalRefunds > 0 && <RRow label="- Remboursements" value={fmt(data.totalRefunds)} />}
              <RRow label="= ATTENDUES"       value={fmt(data.expectedCash)} bold />
            </div>

            {isZ && data.actualCash != null && (
              <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
                <RRow label="Espèces comptées" value={fmt(data.actualCash)} />
                <RRow
                  label="ÉCART"
                  value={`${diff >= 0 ? '+' : ''}${fmt(diff)}`}
                  bold
                  color={Math.abs(diff) < 1 ? 'text-green-700' : diff > 0 ? 'text-blue-700' : 'text-red-700'}
                />
                <p className={`text-center text-[11px] font-bold ${
                  Math.abs(diff) < 1 ? 'text-green-700' : diff > 0 ? 'text-blue-700' : 'text-red-700'
                }`}>
                  {Math.abs(diff) < 1 ? '✓ ÉQUILIBRÉE' : diff > 0 ? '▲ EXCÉDENT' : '▼ DÉFICIT'}
                </p>
              </div>
            )}

            {data.notes && (
              <div className="border-t border-dashed border-gray-200 pt-1">
                <p className="text-[10px] italic text-gray-500">Notes : {data.notes}</p>
              </div>
            )}

            <p className="text-center text-[10px] text-gray-400 border-t border-dashed border-gray-200 pt-1 mt-1">
              {isZ ? 'Document définitif' : 'Non définitif'} · elm-pos
            </p>
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary flex-1 h-11">Fermer</button>
          <button
            onClick={() => printReport(data)}
            className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}
