'use client';

import { useState, useRef, useMemo } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { importGuests, type GuestImportRow } from '@services/supabase/event-guests';

interface ImportGuestsModalProps {
  businessId: string;
  eventId:    string;
  onClose:    () => void;
  onDone:     (count: number) => void;
}

// --- Détection des colonnes -----------------------------------------------------
// Le fichier peut venir de n'importe qui (client, agence, organisateur d'événement),
// avec des en-têtes dans n'importe quelle langue/forme. On propose une association
// automatique par ressemblance, mais l'utilisateur peut tout réassigner à la main.

type MappableField = 'full_name' | 'first_name' | 'last_name' | 'company' | 'phone' | 'category' | 'pass_code';

const NONE = '__none__';

const FIELD_LABELS: Record<MappableField, string> = {
  full_name:  'Nom complet',
  first_name: 'Prénom',
  last_name:  'Nom de famille',
  company:    'Entreprise / Pays / Média',
  phone:      'Téléphone',
  category:   'Catégorie',
  pass_code:  'Code / Pass',
};

const FIELD_SYNONYMS: Record<MappableField, string[]> = {
  full_name:  ['nom', 'nom_complet', 'nom_et_prenom', 'nomprenom', 'full_name', 'fullname', 'name', 'invite', 'invitee', 'guest', 'guest_name', 'participant', 'attendee', 'visiteur', 'client'],
  first_name: ['prenom', 'first_name', 'firstname', 'given_name'],
  last_name:  ['nom_de_famille', 'last_name', 'lastname', 'surname', 'family_name'],
  company:    ['entreprise', 'societe', 'company', 'organisation', 'organization', 'pays', 'country', 'media', 'affiliation', 'structure', 'cabinet', 'employeur'],
  phone:      ['telephone', 'tel', 'phone', 'numero', 'num', 'contact', 'mobile', 'gsm', 'whatsapp'],
  category:   ['categorie', 'category', 'type', 'type_invite', 'statut', 'profil', 'segment', 'badge_type'],
  pass_code:  ['pass', 'pass_code', 'code', 'badge', 'code_badge', 'numero_badge', 'ticket', 'qr', 'id_invite'],
};

function normalizeKey(k: string): string {
  return k.trim().toLowerCase()
    .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[ùûü]/g, 'u').replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Devine la meilleure colonne source pour chaque champ cible, sans jamais réutiliser deux fois la même colonne. */
function guessMapping(headers: string[]): Record<MappableField, string> {
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeKey(h) }));
  const used = new Set<string>();
  const mapping = {} as Record<MappableField, string>;

  const hasFirstName = normalized.some((h) => FIELD_SYNONYMS.first_name.includes(h.norm));
  const hasLastName  = normalized.some((h) => FIELD_SYNONYMS.last_name.includes(h.norm));

  // Ordre : si Prénom + Nom séparés existent, on privilégie ce découpage plutôt
  // qu'un "nom complet" qui ne récupérerait que la moitié de l'information.
  const order: MappableField[] = hasFirstName && hasLastName
    ? ['first_name', 'last_name', 'company', 'phone', 'category', 'pass_code', 'full_name']
    : ['full_name', 'first_name', 'last_name', 'company', 'phone', 'category', 'pass_code'];

  for (const field of order) {
    const match = normalized.find((h) => !used.has(h.raw) && FIELD_SYNONYMS[field].includes(h.norm));
    if (match) { mapping[field] = match.raw; used.add(match.raw); }
    else mapping[field] = NONE;
  }
  return mapping;
}

function resolveName(row: Record<string, string>, mapping: Record<MappableField, string>): string {
  if (mapping.full_name !== NONE) return (row[mapping.full_name] ?? '').trim();
  const first = mapping.first_name !== NONE ? (row[mapping.first_name] ?? '').trim() : '';
  const last  = mapping.last_name  !== NONE ? (row[mapping.last_name]  ?? '').trim() : '';
  return [first, last].filter(Boolean).join(' ');
}

function rowsToGuests(raw: Record<string, string>[], mapping: Record<MappableField, string>): GuestImportRow[] {
  return raw
    .map((row) => ({
      full_name: resolveName(row, mapping),
      company:   mapping.company   !== NONE ? (row[mapping.company]   ?? '').trim() || null : null,
      phone:     mapping.phone     !== NONE ? (row[mapping.phone]     ?? '').trim() || null : null,
      category:  mapping.category  !== NONE ? (row[mapping.category]  ?? '').trim() || null : null,
      pass_code: mapping.pass_code !== NONE ? (row[mapping.pass_code] ?? '').trim() || null : null,
    }))
    .filter((g) => g.full_name.length > 0);
}

export function ImportGuestsModal({ businessId, eventId, onClose, onDone }: ImportGuestsModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawRows, setRawRows]     = useState<Record<string, string>[] | null>(null);
  const [headers, setHeaders]     = useState<string[]>([]);
  const [mapping, setMapping]     = useState<Record<MappableField, string> | null>(null);
  const [fileName, setFileName]   = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  function onParsed(rows: Record<string, string>[]) {
    const hdrs = rows.length > 0 ? Object.keys(rows[0]) : [];
    setRawRows(rows);
    setHeaders(hdrs);
    setMapping(guessMapping(hdrs));
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setRawRows(null);
    setMapping(null);
    setError(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        onParsed(rows);
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse<Record<string, string>>(file, {
        header:         true,
        skipEmptyLines: true,
        complete: (res) => onParsed(res.data),
      });
    }
  }

  const guests = useMemo(
    () => (rawRows && mapping ? rowsToGuests(rawRows, mapping) : null),
    [rawRows, mapping]
  );

  const nameResolved = mapping
    ? mapping.full_name !== NONE || mapping.first_name !== NONE || mapping.last_name !== NONE
    : false;

  function setField(field: MappableField, value: string) {
    setMapping((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  async function handleImport() {
    if (!guests || guests.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const count = await importGuests(businessId, eventId, guests);
      onDone(count);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur pendant l\'import');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
          <h2 className="font-semibold text-content-primary flex items-center gap-2">
            <Upload className="w-4 h-4 text-content-brand" />
            Importer la liste des invités
          </h2>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-brand-600 rounded-xl p-8
                       flex flex-col items-center gap-3 cursor-pointer transition-colors text-center"
          >
            <FileText className="w-8 h-8 text-content-primary" />
            <div>
              <p className="text-content-primary font-medium">
                {fileName || 'Cliquez pour sélectionner un fichier'}
              </p>
              <p className="text-xs text-content-primary mt-1">Excel ou CSV — n&apos;importe quel intitulé de colonnes, on les associe ensuite</p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />

          {error && (
            <div className="p-3 rounded-xl bg-badge-error border border-status-error text-sm text-status-error">
              {error}
            </div>
          )}

          {mapping && headers.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-content-primary">
                Associez vos colonnes ({headers.length} détectée{headers.length > 1 ? 's' : ''})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(FIELD_LABELS) as MappableField[]).map((field) => (
                  <div key={field} className="flex items-center gap-2">
                    <label className="text-xs text-content-secondary w-32 shrink-0">
                      {FIELD_LABELS[field]}
                      {(field === 'full_name') && <span className="text-status-error"> *</span>}
                    </label>
                    <ArrowRight className="w-3.5 h-3.5 text-content-muted shrink-0" />
                    <select
                      className="input h-9 text-sm flex-1"
                      value={mapping[field]}
                      onChange={(e) => setField(field, e.target.value)}
                    >
                      <option value={NONE}>— Aucune —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!nameResolved && (
                <p className="text-xs text-status-warning">
                  Associez au moins « Nom complet » ou « Prénom »/« Nom de famille » pour identifier vos invités.
                </p>
              )}
            </div>
          )}

          {guests && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-content-primary">
                <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />
                {guests.length} invité{guests.length > 1 ? 's' : ''} reconnu{guests.length > 1 ? 's' : ''}
                {rawRows && guests.length < rawRows.length && (
                  <span className="text-content-muted">
                    ({rawRows.length - guests.length} ligne{rawRows.length - guests.length > 1 ? 's' : ''} sans nom ignorée{rawRows.length - guests.length > 1 ? 's' : ''})
                  </span>
                )}
              </div>
              <div className="border border-surface-border rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface-input text-content-secondary sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Nom</th>
                      <th className="text-left px-3 py-2">Entreprise</th>
                      <th className="text-left px-3 py-2">Téléphone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guests.slice(0, 50).map((g, i) => (
                      <tr key={i} className="border-t border-surface-border">
                        <td className="px-3 py-2 text-content-primary">{g.full_name}</td>
                        <td className="px-3 py-2 text-content-primary">{g.company ?? '—'}</td>
                        <td className="px-3 py-2 text-content-primary">{g.phone ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {guests.length > 50 && (
                  <p className="text-center text-content-muted text-xs py-2 bg-surface-input">
                    + {guests.length - 50} autre{guests.length - 50 > 1 ? 's' : ''}…
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-surface-border flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button
            onClick={handleImport}
            disabled={!guests || guests.length === 0 || importing || !nameResolved}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? 'Import en cours…' : `Importer ${guests ? guests.length : 0} invité(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
