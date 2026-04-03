'use client';

import { useState, useRef } from 'react';
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, FileSpreadsheet, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { createProduct, getCategories } from '@services/supabase/products';
import { useNotificationStore } from '@/store/notifications';
import type { Category } from '@pos-types';

interface ImportProductsModalProps {
  businessId: string;
  onClose: () => void;
  onImported: () => void;
}

interface ParsedRow {
  line: number;
  nom: string;
  description: string;
  prix: string;
  categorie: string;
  code_barres: string;
  sku: string;
  stock: string;
  suivre_stock: string;
  actif: string;
  errors: string[];
}

const TEMPLATE_HEADERS = ['nom', 'description', 'prix', 'categorie', 'code_barres', 'sku', 'stock', 'suivre_stock', 'actif'];

const TEMPLATE_EXAMPLE = [
  ['Coca Cola 50cl', 'Bouteille 50cl', '500', 'Boissons', '', '', '100', 'oui', 'oui'],
  ['Eau Minérale', '', '200', 'Boissons', '0123456789', 'EAU-50', '200', 'oui', 'oui'],
  ['Pain de mie', 'Sachet 500g', '350', 'Alimentation', '', '', '', 'non', 'oui'],
];

function downloadTemplate() {
  const rows = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE];
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'modele_produits.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Aliases acceptés pour chaque champ ──────────────────────────────────────

const FIELD_ALIASES: Record<keyof Omit<ParsedRow, 'line' | 'errors'>, string[]> = {
  nom:          ['nom', 'name', 'produit', 'product', 'libelle', 'libellé', 'designation', 'désignation', 'article'],
  description:  ['description', 'desc', 'details', 'détails'],
  prix:         ['prix', 'price', 'prix_unitaire', 'unit_price', 'tarif', 'montant'],
  categorie:    ['categorie', 'catégorie', 'category', 'famille', 'rayon', 'type'],
  code_barres:  ['code_barres', 'code-barres', 'barcode', 'ean', 'upc', 'gtin', 'code'],
  sku:          ['sku', 'reference', 'réf', 'ref', 'reference_interne', 'code_article', 'code article'],
  stock:        ['stock', 'quantite', 'quantité', 'quantity', 'qty', 'qte', 'qté', 'inventaire'],
  suivre_stock: ['suivre_stock', 'suivi_stock', 'track_stock', 'gestion_stock'],
  actif:        ['actif', 'active', 'statut', 'status', 'enabled', 'disponible'],
};

const KNOWN_HEADER_WORDS = new Set(
  Object.values(FIELD_ALIASES).flat()
);

function normalizeKey(k: string): string {
  return k.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[\s\-_]+/g, '_');
}

function detectSeparator(firstLine: string): string {
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const ch of firstLine) {
    if (ch in counts) counts[ch as keyof typeof counts]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseLine(line: string, sep: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      cols.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function isHeaderRow(cols: string[]): boolean {
  // A row is a header if ≥ 2 cells match known field aliases
  const matches = cols.filter((c) => KNOWN_HEADER_WORDS.has(normalizeKey(c)));
  return matches.length >= 2;
}

function buildColumnMap(headerCols: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerCols.forEach((h, i) => {
    const norm = normalizeKey(h);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((a) => normalizeKey(a) === norm)) {
        map[field] = i;
        break;
      }
    }
  });
  return map;
}

function mapRowToFields(
  cols: string[],
  colMap: Record<string, number> | null,
): Omit<ParsedRow, 'line' | 'errors'> {
  function get(field: keyof typeof FIELD_ALIASES, fallbackIdx: number): string {
    const idx = colMap ? (colMap[field] ?? -1) : fallbackIdx;
    return idx >= 0 ? (cols[idx] ?? '').trim() : '';
  }
  return {
    nom:          get('nom',          0),
    description:  get('description',  1),
    prix:         get('prix',         2),
    categorie:    get('categorie',    3),
    code_barres:  get('code_barres',  4),
    sku:          get('sku',          5),
    stock:        get('stock',        6),
    suivre_stock: get('suivre_stock', 7),
    actif:        get('actif',        8),
  };
}

function parseCSVText(text: string): { rows: string[][]; sep: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], sep: ',' };
  const sep  = detectSeparator(lines[0]);
  const rows = lines.map((l) => parseLine(l, sep));
  return { rows, sep };
}

function validateRow(cols: string[], colMap: Record<string, number> | null, lineNum: number): ParsedRow {
  const fields = mapRowToFields(cols, colMap);
  const errors: string[] = [];
  if (!fields.nom) errors.push('Nom requis');
  const prixNum = parseFloat(fields.prix.replace(',', '.'));
  if (!fields.prix || isNaN(prixNum) || prixNum < 0) errors.push('Prix invalide');
  if (fields.stock && isNaN(parseFloat(fields.stock.replace(',', '.')))) errors.push('Stock invalide');
  return { line: lineNum, ...fields, errors };
}

export function ImportProductsModal({ businessId, onClose, onImported }: ImportProductsModalProps) {
  const { success, error: notifError } = useNotificationStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows]       = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported]   = useState(0);

  const validRows   = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    function process(text: string) {
      const { rows: all } = parseCSVText(text);
      if (!all.length) { setRows([]); return; }

      // Détecter si la 1ère ligne est un en-tête
      let colMap: Record<string, number> | null = null;
      let dataRows = all;
      if (isHeaderRow(all[0])) {
        colMap    = buildColumnMap(all[0]);
        dataRows  = all.slice(1);
      }

      const parsed = dataRows
        .filter((r) => r.some((c) => c))
        .map((r, i) => validateRow(r, colMap, i + (colMap ? 2 : 1)));
      setRows(parsed);
      setImported(0);
    }

    // Essayer UTF-8 d'abord, puis latin1 si caractères illisibles
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text.includes('\uFFFD')) {
        // Caractères mal décodés → relire en latin1
        const reader2 = new FileReader();
        reader2.onload = (ev2) => process(ev2.target?.result as string);
        reader2.readAsText(file, 'windows-1252');
      } else {
        process(text);
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    let done = 0;

    // Charger les catégories pour faire la correspondance par nom
    let categories: Category[] = [];
    try { categories = await getCategories(businessId); } catch { /* */ }

    for (const row of validRows) {
      try {
        const cat = categories.find((c) => c.name.toLowerCase() === row.categorie.toLowerCase());
        const trackStock = row.suivre_stock.toLowerCase() === 'oui' || row.suivre_stock === '1' || row.suivre_stock.toLowerCase() === 'true';
        const isActive   = !row.actif || row.actif.toLowerCase() === 'oui' || row.actif === '1' || row.actif.toLowerCase() === 'true';

        await createProduct({
          business_id:  businessId,
          name:         row.nom.trim(),
          description:  row.description.trim() || null,
          price:        parseFloat(row.prix.replace(',', '.')),
          category_id:  cat?.id ?? null,
          barcode:      row.code_barres.trim() || null,
          sku:          row.sku.trim() || null,
          stock:        trackStock && row.stock ? parseFloat(row.stock.replace(',', '.')) : null,
          track_stock:  trackStock,
          is_active:    isActive,
          image_url:    null,
          variants:     [],
        } as never);

        done++;
        setImported(done);
      } catch { /* ignorer les erreurs individuelles */ }
    }

    success(`${done} produit${done !== 1 ? 's' : ''} importé${done !== 1 ? 's' : ''}`);
    setImporting(false);
    onImported();
  }

  return (
    <Modal
      title="Importer des produits"
      onClose={onClose}
      size="lg"
      footer={() => (
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Fermer</button>
          {validRows.length > 0 && !importing && (
            <button onClick={handleImport} className="btn-primary flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Importer {validRows.length} produit{validRows.length !== 1 ? 's' : ''}
            </button>
          )}
          {importing && (
            <button disabled className="btn-primary flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {imported} / {validRows.length}…
            </button>
          )}
        </div>
      )}
    >
      <div className="space-y-5">

        {/* ── Instructions ── */}
        <div className="bg-brand-900/20 border border-brand-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-brand-400 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Comment importer vos produits ?
          </h3>
          <ol className="space-y-2 text-sm text-slate-300">
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-brand-700 text-white text-xs flex items-center justify-center shrink-0 font-bold">1</span>
              <span>Téléchargez le modèle CSV ci-dessous et ouvrez-le dans Excel ou Google Sheets.</span>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-brand-700 text-white text-xs flex items-center justify-center shrink-0 font-bold">2</span>
              <span>Remplissez les lignes en respectant le format : <code className="text-brand-300 bg-brand-900/50 px-1 rounded">nom</code> et <code className="text-brand-300 bg-brand-900/50 px-1 rounded">prix</code> sont obligatoires.</span>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-brand-700 text-white text-xs flex items-center justify-center shrink-0 font-bold">3</span>
              <span>Enregistrez en <strong>CSV (séparé par des virgules)</strong> puis chargez le fichier ici.</span>
            </li>
          </ol>

          <div className="grid grid-cols-3 gap-2 text-xs mt-2 border-t border-brand-800 pt-3">
            {[
              { col: 'nom', desc: 'Nom du produit (requis)' },
              { col: 'prix', desc: 'Prix en chiffres — ex: 1500' },
              { col: 'categorie', desc: 'Nom exact de la catégorie' },
              { col: 'code_barres', desc: 'Code-barres EAN/UPC' },
              { col: 'sku', desc: 'Référence interne' },
              { col: 'stock', desc: 'Quantité initiale en stock' },
              { col: 'suivre_stock', desc: 'oui / non' },
              { col: 'description', desc: 'Description courte' },
              { col: 'actif', desc: 'oui (défaut) / non' },
            ].map(({ col, desc }) => (
              <div key={col} className="flex flex-col gap-0.5">
                <code className="text-brand-300 bg-brand-900/50 px-1.5 py-0.5 rounded text-xs font-mono">{col}</code>
                <span className="text-slate-400">{desc}</span>
              </div>
            ))}
          </div>

          <button
            onClick={downloadTemplate}
            className="btn-secondary flex items-center gap-2 text-sm mt-1"
          >
            <Download className="w-4 h-4" />
            Télécharger le modèle CSV
          </button>
        </div>

        {/* ── Upload ── */}
        <div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-surface-border hover:border-brand-600
                       rounded-xl p-6 flex flex-col items-center gap-2 text-slate-400
                       hover:text-white transition-colors group"
          >
            <Upload className="w-8 h-8 group-hover:text-brand-400 transition-colors" />
            <span className="text-sm font-medium">Cliquez pour choisir un fichier CSV</span>
            <span className="text-xs">ou glissez-déposez ici</span>
          </button>
        </div>

        {/* ── Résultat parsing ── */}
        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                {validRows.length} valide{validRows.length !== 1 ? 's' : ''}
              </span>
              {invalidRows.length > 0 && (
                <span className="flex items-center gap-1.5 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  {invalidRows.length} erreur{invalidRows.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="rounded-xl border border-surface-border overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-card sticky top-0">
                  <tr className="text-left text-slate-400 uppercase tracking-wide">
                    <th className="px-3 py-2">Ligne</th>
                    <th className="px-3 py-2">Nom</th>
                    <th className="px-3 py-2">Prix</th>
                    <th className="px-3 py-2">Catégorie</th>
                    <th className="px-3 py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.line}
                      className={`border-t border-surface-border ${
                        row.errors.length > 0 ? 'bg-red-900/10' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-500">{row.line}</td>
                      <td className="px-3 py-2 text-white font-medium max-w-[150px] truncate">{row.nom || '—'}</td>
                      <td className="px-3 py-2 text-brand-400">{row.prix || '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{row.categorie || '—'}</td>
                      <td className="px-3 py-2">
                        {row.errors.length === 0 ? (
                          <span className="text-green-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> OK
                          </span>
                        ) : (
                          <span className="text-red-400 flex items-center gap-1" title={row.errors.join(', ')}>
                            <X className="w-3 h-3" /> {row.errors.join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
