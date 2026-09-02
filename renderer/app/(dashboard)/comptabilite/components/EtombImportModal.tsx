'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Upload, X, Check, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { importEtombMovements, type EtombRow, type EtombImportResult } from '@services/supabase/accounting';
import { useNotificationStore } from '@/store/notifications';
import { displayCurrency } from '@/lib/utils';

interface Props {
  businessId: string;
  currency?: string;
  onClose: () => void;
  onDone: () => void;
}

interface ParsedFile {
  name: string;
  direction: 'entree' | 'sortie';
  rows: EtombRow[];
  invalid: number;
  minDate: string;
  maxDate: string;
  totalTTC: number;
}

const DIR_LABEL: Record<'entree' | 'sortie', string> = { entree: 'Entrées (achats)', sortie: 'Sorties (ventes)' };

function parseFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      delimiter: ';',
      skipEmptyLines: true,
      complete: (r) => {
        const data = r.data as string[][];
        if (data.length < 2) return reject(new Error(`${file.name} : fichier vide`));

        const header = data[0].map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
        const hasClient = header.includes('client');
        const direction: 'entree' | 'sortie' =
          /sorties?/i.test(file.name) ? 'sortie'
          : /entrees?|entr[ée]es?/i.test(file.name) ? 'entree'
          : hasClient ? 'sortie' : 'entree';

        const findCol = (...needles: string[]) => header.findIndex((h) => needles.some((n) => h.includes(n)));
        const iId      = findCol('id article', 'id_article', 'article');
        const iDesig   = findCol('signation', 'libell', 'produit');
        const iRef     = findCol('férence', 'ference', 'reference');
        const iDate    = header.findIndex((h) => h.startsWith('date'));
        const iMontant = findCol('montant', 'ttc', 'prix');
        const iType    = header.findIndex((h) => h === 'type');
        if (iDate < 0 || iMontant < 0) return reject(new Error(`${file.name} : colonnes Date / Montant introuvables`));

        const at = (c: string[], i: number) => (i >= 0 ? (c[i] ?? '') : '').trim();
        const rows: EtombRow[] = [];
        let invalid = 0;
        for (let i = 1; i < data.length; i++) {
          const c = data[i];
          const date = at(c, iDate).slice(0, 10);
          const amt  = parseFloat(at(c, iMontant).replace(/\s/g, '').replace(',', '.'));
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amt)) { invalid++; continue; }
          rows.push({
            direction,
            idArticle:   at(c, iId >= 0 ? iId : 0),
            designation: at(c, iDesig >= 0 ? iDesig : 1),
            refName:     at(c, iRef >= 0 ? iRef : 2),
            date,
            amountTTC: amt,
            type: at(c, iType),
          });
        }

        const dts = rows.map((x) => x.date).sort();
        resolve({
          name: file.name,
          direction,
          rows,
          invalid,
          minDate: dts[0] ?? '',
          maxDate: dts[dts.length - 1] ?? '',
          totalTTC: rows.reduce((s, x) => s + x.amountTTC, 0),
        });
      },
      error: (err) => reject(err),
    });
  });
}

export function EtombImportModal({ businessId, currency, onClose, onDone }: Props) {
  const { success, error: notifError } = useNotificationStore();
  const [step, setStep]         = useState<'upload' | 'done'>('upload');
  const [files, setFiles]       = useState<ParsedFile[]>([]);
  const [parsing, setParsing]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult]     = useState<EtombImportResult | null>(null);

  const cur = displayCurrency(currency ?? 'XOF');
  const nf  = new Intl.NumberFormat('fr-FR');

  async function onPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setParsing(true);
    try {
      const parsed = await Promise.all(Array.from(list).map(parseFile));
      // Dédoublonne par CONTENU (les exports téléchargés plusieurs fois —
      // « sorties (1).csv », « (2).csv »… — ont des noms différents mais le
      // même contenu ; les additionner fausserait tout).
      const sig = (f: ParsedFile) =>
        `${f.direction}|${f.rows.length}|${f.minDate}|${f.maxDate}|${Math.round(f.totalTTC)}`;
      const merged = [...files];
      for (const p of parsed) {
        if (merged.some((m) => sig(m) === sig(p))) continue;
        merged.push(p);
      }
      setFiles(merged);
    } catch (e) {
      notifError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }

  const allRows   = files.flatMap((f) => f.rows);
  const totalRows = allRows.length;
  const totalInvalid = files.reduce((s, f) => s + f.invalid, 0);
  const span = (() => {
    const d = allRows.map((r) => r.date).sort();
    return d.length ? `${d[0]} → ${d[d.length - 1]}` : '—';
  })();

  async function handleImport() {
    if (allRows.length === 0) return;
    setImporting(true);
    setProgress({ done: 0, total: allRows.length });
    try {
      const r = await importEtombMovements(businessId, allRows, (done, total) => setProgress({ done, total }));
      setResult(r);
      setStep('done');
      if (r.entriesCreated > 0) {
        success(`${r.entriesCreated} écriture${r.entriesCreated > 1 ? 's' : ''} importée${r.entriesCreated > 1 ? 's' : ''}`);
        onDone();
      }
    } catch (e) {
      notifError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
          <div>
            <h2 className="text-content-primary font-semibold">Importer l'historique</h2>
            <p className="text-xs text-content-secondary mt-0.5">Entrées / sorties → journal comptable</p>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {step === 'upload' && (
            <>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-surface-border rounded-xl py-8 cursor-pointer hover:border-brand-500 transition-colors">
                <Upload className="w-6 h-6 text-content-muted" />
                <span className="text-sm text-content-secondary">Choisir les fichiers CSV</span>
                <span className="text-xs text-content-muted">entrees_*.csv et sorties_*.csv · séparateur « ; »</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={(e) => onPick(e.target.files)}
                />
              </label>

              {parsing && (
                <p className="text-sm text-content-secondary flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Lecture des fichiers…
                </p>
              )}

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div key={f.name + i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-input border border-surface-border">
                      <FileText className="w-4 h-4 text-content-brand shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-content-primary truncate">{f.name}</p>
                        <p className="text-xs text-content-muted">
                          {DIR_LABEL[f.direction]} · {nf.format(f.rows.length)} lignes · {f.minDate} → {f.maxDate}
                          {f.invalid > 0 && <span className="text-status-warning"> · {f.invalid} ignorées</span>}
                        </p>
                        <p className="text-xs text-content-muted">Total TTC : {nf.format(Math.round(f.totalTTC))} {cur}</p>
                      </div>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="p-1 text-content-muted hover:text-status-error shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {files.length > 0 && (
                <div className="text-xs text-content-secondary bg-badge-info border border-blue-800 rounded-xl p-3 space-y-1">
                  <p><strong className="text-content-primary">{nf.format(totalRows)}</strong> lignes valides · période {span}{totalInvalid > 0 ? ` · ${totalInvalid} lignes illisibles ignorées` : ''}</p>
                  <p><strong className="text-content-primary">1 écriture par ligne</strong> · réf. = ID Article · libellé = Désignation — Référence (+ type).</p>
                  <p>Achat → 601 · Vente → 701 (TVA 18 % extraite) · <strong>promo → 6234</strong>, manuelle → 6584 (charges, sans TVA) · contrepartie <strong>Caisse (571)</strong>.</p>
                  <p className="text-status-warning">Aucun dédoublonnage : videz d'abord le journal si vous ré-importez.</p>
                </div>
              )}
            </>
          )}

          {step === 'done' && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-status-success">
                <Check className="w-5 h-5" />
                <p className="font-semibold">Import terminé</p>
              </div>
              <ul className="text-sm text-content-secondary space-y-1">
                <li><strong className="text-content-primary">{nf.format(result.entriesCreated)}</strong> écritures créées</li>
                <li>{nf.format(result.rowsSkippedZero)} lignes à 0 ignorées · {nf.format(result.rowsSkippedInvalid)} lignes illisibles</li>
              </ul>
              {result.entriesCreated === 0 && (
                <p className="text-xs text-content-muted flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-status-warning" />
                  Aucune écriture créée — vérifiez le contenu des fichiers.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-border shrink-0">
          {step === 'upload' ? (
            <>
              <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
              <button
                onClick={handleImport}
                disabled={totalRows === 0 || importing}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-xl transition-colors text-sm"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing
                  ? (progress ? `Import… ${nf.format(progress.done)} / ${nf.format(progress.total)}` : 'Import en cours…')
                  : 'Importer'}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="btn-primary flex-1">Fermer</button>
          )}
        </div>
      </div>
    </div>
  );
}
