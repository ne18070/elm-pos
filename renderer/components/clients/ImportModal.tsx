'use client';

import { useState, useRef } from 'react';
import { Upload, X, Check, AlertTriangle, Download, Loader2, FileText } from 'lucide-react';
import { createClient } from '@services/supabase/clients';

interface RowResult {
  index: number;
  data: string[];
  status: 'pending' | 'ok' | 'error';
  message?: string;
}

interface Props {
  businessId: string;
  onClose: () => void;
  onDone: () => void;
}

const TEMPLATE =
  'nom,telephone,email,adresse,notes\n' +
  'Fatou Diop,+221 77 000 00 00,fatou@email.com,Liberté 5,Cliente fidèle\n' +
  'Ibou Ndiaye,+221 78 111 11 11,,,\n';

function parseCSV(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')))
    .filter((row) => row.some((c) => c));
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'clients_template.csv';
  a.click();
}

export function ClientsImportModal({ businessId, onClose, onDone }: Props) {
  const [step, setStep]           = useState<'upload' | 'preview' | 'done'>('upload');
  const [headers, setHeaders]     = useState<string[]>([]);
  const [rows, setRows]           = useState<string[][]>([]);
  const [results, setResults]     = useState<RowResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const inputRef                  = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      alert('Veuillez choisir un fichier .csv');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target?.result as string);
      if (parsed.length < 2) { alert('Fichier vide ou invalide'); return; }
      setHeaders(parsed[0]);
      setRows(parsed.slice(1));
      setStep('preview');
    };
    reader.readAsText(file, 'utf-8');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function cell(row: string[], name: string): string {
    const i = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    return i >= 0 ? (row[i] ?? '').trim() : '';
  }

  function validateRows(): RowResult[] {
    return rows.map((row, i) => {
      const nom = cell(row, 'nom');
      if (!nom) return { index: i, data: row, status: 'error', message: 'Nom manquant' };
      return { index: i, data: row, status: 'pending' };
    });
  }

  async function runImport() {
    setImporting(true);
    const initial = validateRows();
    setResults(initial);
    const updated = [...initial];

    for (let i = 0; i < rows.length; i++) {
      if (updated[i].status === 'error') continue;
      try {
        await createClient(businessId, {
          name:    cell(rows[i], 'nom'),
          phone:   cell(rows[i], 'telephone') || null,
          email:   cell(rows[i], 'email') || null,
          address: cell(rows[i], 'adresse') || null,
          notes:   cell(rows[i], 'notes') || null,
        });
        updated[i] = { ...updated[i], status: 'ok' };
      } catch (e) {
        updated[i] = { ...updated[i], status: 'error', message: String(e) };
      }
      setResults([...updated]);
    }

    setImporting(false);
    setStep('done');
  }

  const validated = step === 'preview' ? validateRows() : results;
  const errCount  = validated.filter((r) => r.status === 'error').length;
  const okCount   = results.filter((r) => r.status === 'ok').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-2xl bg-surface-card border border-surface-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-content-primary">Importer des clients</h2>
            <p className="text-xs text-content-primary">
              {step === 'upload'  && 'Chargez un fichier CSV'}
              {step === 'preview' && `${rows.length} ligne${rows.length > 1 ? 's' : ''} détectée${rows.length > 1 ? 's' : ''} —${errCount} erreur${errCount !== 1 ? 's' : ''}`}
              {step === 'done'    && `${okCount} importé${okCount > 1 ? 's' : ''} · ${errCount} erreur${errCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* -- Étape 1 : Upload -- */}
          {step === 'upload' && (
            <div className="p-6 space-y-5">

              {/* Explication */}
              <div className="p-4 rounded-xl bg-surface-input border border-surface-border space-y-2 text-sm">
                <p className="font-medium text-content-primary">Comment ça fonctionne ?</p>
                <ol className="space-y-1 text-content-secondary text-xs">
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-brand-600 text-content-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    Téléchargez le modèle CSV ci-dessous
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-brand-600 text-content-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    Remplissez-le avec vos clients (Excel, Google Sheets…)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-brand-600 text-content-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    Enregistrez en <strong className="text-content-primary">.csv</strong> et déposez-le ici
                  </li>
                </ol>
                <p className="text-xs text-content-primary pt-1 border-t border-surface-border">
                  Colonnes : <span className="text-content-primary">nom</span> (obligatoire), telephone, email, adresse, notes
                </p>
              </div>

              {/* Template */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-input border border-surface-border">
                <div>
                  <p className="text-sm text-content-primary font-medium">Modèle CSV Clients</p>
                  <p className="text-xs text-content-primary">Fichier Excel/Google Sheets compatible</p>
                </div>
                <button onClick={downloadTemplate} className="btn-secondary h-8 text-xs px-3 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Télécharger
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-12 cursor-pointer transition-colors
                  ${dragOver ? 'border-brand-400 bg-badge-brand' : 'border-slate-700 hover:border-slate-500'}`}
              >
                <Upload className="w-10 h-10 text-content-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium text-content-primary">Glissez votre fichier CSV ici</p>
                  <p className="text-xs text-content-primary mt-1">ou cliquez pour parcourir</p>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                />
              </div>
            </div>
          )}

          {/* -- Étape 2 : Prévisualisation + résultats -- */}
          {(step === 'preview' || step === 'done') && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-input">
                    <th className="px-4 py-2.5 text-left text-xs text-content-secondary font-medium w-10">#</th>
                    {headers.map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs text-content-secondary font-medium">{h}</th>
                    ))}
                    <th className="px-4 py-2.5 text-left text-xs text-content-secondary font-medium w-40">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const result = validated[i];
                    const status = result?.status ?? 'pending';
                    return (
                      <tr key={i} className={`border-b border-surface-border transition-colors
                        ${status === 'ok'    ? 'bg-badge-success' :
                          status === 'error' ? 'bg-badge-error'   : 'hover:bg-surface-hover'}`}>
                        <td className="px-4 py-2 text-content-primary text-xs">{i + 1}</td>
                        {headers.map((_, ci) => (
                          <td key={ci} className="px-4 py-2 text-content-primary text-xs truncate max-w-[140px]">
                            {row[ci] ?? ''}
                          </td>
                        ))}
                        <td className="px-4 py-2">
                          {status === 'pending' && !importing && <span className="text-xs text-content-primary">—</span>}
                          {status === 'pending' &&  importing && <Loader2 className="w-3 h-3 text-content-secondary animate-spin" />}
                          {status === 'ok'      && <span className="flex items-center gap-1 text-xs text-status-success"><Check className="w-3 h-3" /> Importé</span>}
                          {status === 'error'   && (
                            <span className="flex items-center gap-1 text-xs text-status-error">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span className="truncate">{result.message ?? 'Erreur'}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-border shrink-0 flex items-center gap-3">
          {step === 'upload' && (
            <button onClick={onClose} className="btn-secondary flex-1 h-10">Annuler</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('upload')} className="btn-secondary flex-1 h-10">
                <FileText className="w-4 h-4 mr-1.5 inline" /> Autre fichier
              </button>
              <button
                onClick={runImport}
                disabled={rows.length === 0 || importing || errCount === rows.length}
                className="btn-primary flex-1 h-10 flex items-center justify-center gap-2"
              >
                {importing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Import en cours…</>
                  : <><Upload className="w-4 h-4" /> Importer {rows.length - errCount} ligne{rows.length - errCount > 1 ? 's' : ''}</>}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={() => { onDone(); onClose(); }} className="btn-primary flex-1 h-10 flex items-center justify-center gap-2">
              <Check className="w-4 h-4" /> Terminé —{okCount} importé{okCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


