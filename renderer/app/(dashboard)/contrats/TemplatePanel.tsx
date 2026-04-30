import { useState, useRef, useEffect } from 'react';
import { Loader2, Eye, Bold, Italic, List, Heading2, Minus, Type, PenLine } from 'lucide-react';
import { SlidePanel, Field } from './SharedComponents';
import { toUserError } from '@/lib/user-error';
import { DEFAULT_TEMPLATE } from './contract-utils';
import {
  updateTemplate, createTemplate,
  type ContractTemplate
} from '@services/supabase/contracts';
import DOMPurify from 'dompurify';

const VARIABLES = [
  { key: 'client_name',      label: 'Nom client' },
  { key: 'client_phone',     label: 'Tél client' },
  { key: 'client_id_number', label: 'Pièce identité' },
  { key: 'client_address',   label: 'Adresse client' },
  { key: 'vehicle_name',     label: 'Véhicule' },
  { key: 'license_plate',    label: 'Immatriculation' },
  { key: 'start_date',       label: 'Date départ' },
  { key: 'start_time',       label: 'Heure départ' },
  { key: 'end_date',         label: 'Date retour' },
  { key: 'end_time',         label: 'Heure retour' },
  { key: 'duration_days',    label: 'Durée (jours)' },
  { key: 'pickup_location',  label: 'Lieu prise' },
  { key: 'return_location',  label: 'Lieu retour' },
  { key: 'price_per_day',    label: 'Prix/jour' },
  { key: 'total_amount',     label: 'Total' },
  { key: 'deposit_amount',   label: 'Caution' },
  { key: 'currency',         label: 'Devise' },
  { key: 'business_name',    label: 'Établissement' },
];

export function TemplatePanel({
  template, businessId, onClose, onSaved, notifError, notifSuccess,
}: {
  template: ContractTemplate | null;
  businessId: string;
  onClose: () => void;
  onSaved: () => void;
  notifError: (m: string) => void;
  notifSuccess: (m: string) => void;
}) {
  const [name, setName]     = useState(template?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Initialise le contenu de l'éditeur
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = template?.body ?? DEFAULT_TEMPLATE;
    }
  }, [template]);

  function getBody(): string {
    if (!editorRef.current) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = editorRef.current.innerHTML;
    // Remplacer les chips de variables par leur texte brut {{key}}
    tmp.querySelectorAll('.var-chip').forEach((el) => {
      el.replaceWith(el.textContent ?? '');
    });
    // Remplacer les blocs visuels de signature par leur placeholder brut {{type}}
    tmp.querySelectorAll('[data-sigblock]').forEach((el) => {
      const type = el.getAttribute('data-sigblock') ?? '';
      el.replaceWith(`{{${type}}}`);
    });
    return tmp.innerHTML;
  }

  // Commandes de mise en forme
  function fmt(cmd: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  function insertVariable(key: string) {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.className = 'var-chip';
    span.style.cssText = 'display:inline-block;background:#1e3a5f;color:#7dd3fc;border:1px solid #2563eb;border-radius:4px;padding:0 4px;font-size:12px;font-family:monospace;user-select:all;';
    span.contentEditable = 'false';
    span.textContent = `{{${key}}}`;
    range.deleteContents();
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertSeparator() {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, '<hr style="border:none;border-top:1px solid #ccc;margin:16px 0;">');
  }

  function insertSignatureBlock(type: 'signature_block' | 'lessor_signature_block') {
    editorRef.current?.focus();
    const isLessor = type === 'lessor_signature_block';
    const color  = isLessor ? '#92400e' : '#166534';
    const bg     = isLessor ? '#fffbeb' : '#f0fdf4';
    const border = isLessor ? '#d97706' : '#16a34a';
    const label  = isLessor ? 'Signature du Loueur' : 'Signature du Locataire';
    document.execCommand('insertHTML', false,
      `<div data-sigblock="${type}" contenteditable="false"
           style="display:block;border:2px dashed ${border};background:${bg};text-align:center;padding:14px 10px;margin:8px 0;border-radius:6px;">
         <span style="font-family:monospace;font-size:11px;color:${color};">{{${type}}}</span>
         <p style="margin:4px 0 0;font-size:11px;color:${color};">✍️ ${label}</p>       </div>`
    );
  }

  async function save() {
    const body = getBody();
    if (!name.trim()) { notifError('Nom du modèle requis'); return; }
    if (!body.trim()) { notifError('Contenu du modèle requis'); return; }
    setSaving(true);
    try {
      if (template) {
        await updateTemplate(template.id, name.trim(), body.trim());
        notifSuccess('Modèle mis à jour');
      } else {
        await createTemplate(businessId, name.trim(), body.trim());
        notifSuccess('Modèle créé');
      }
      onSaved();
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  const toolbarBtn = (title: string, onClick: () => void, children: React.ReactNode) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="p-1.5 rounded hover:bg-surface-hover text-content-secondary hover:text-content-primary transition-colors">
      {children}
    </button>
  );

  return (
    <SlidePanel title={template ? 'Modifier le modèle' : 'Nouveau modèle'} onClose={onClose} wide>
      <div className="space-y-4 flex-1">
        <Field label="Nom du modèle *" value={name} onChange={setName} placeholder="Contrat standard" />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-content-secondary font-medium">Contenu du contrat</label>
            <button type="button" onClick={() => setPreview(!preview)}
              className="flex items-center gap-1 text-xs text-content-brand hover:text-content-brand">
              <Eye className="w-3.5 h-3.5" /> {preview ? 'Éditer' : 'Aperçu'}
            </button>
          </div>

          {preview ? (
            <div className="bg-white rounded-xl p-5 text-sm text-gray-800 overflow-auto max-h-[50vh] border border-gray-200"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(getBody()) }} />
          ) : (
            <div className="border border-surface-border rounded-xl overflow-hidden">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-surface-card border-b border-surface-border">
                {toolbarBtn('Gras', () => fmt('bold'),           <Bold      className="w-3.5 h-3.5" />)}
                {toolbarBtn('Italique', () => fmt('italic'),     <Italic    className="w-3.5 h-3.5" />)}
                <div className="w-px h-4 bg-surface-border mx-1" />
                {toolbarBtn('Titre', () => fmt('formatBlock', 'h2'), <Heading2  className="w-3.5 h-3.5" />)}
                {toolbarBtn('Paragraphe', () => fmt('formatBlock', 'p'), <Type className="w-3.5 h-3.5" />)}
                {toolbarBtn('Liste', () => fmt('insertUnorderedList'), <List className="w-3.5 h-3.5" />)}
                {toolbarBtn('Séparateur', insertSeparator,      <Minus     className="w-3.5 h-3.5" />)}
              </div>

              {/* Variables */}
              <div className="flex flex-wrap gap-1 px-2 py-1.5 bg-surface border-b border-surface-border">
                <span className="text-[10px] text-content-muted self-center mr-1">Insérer :</span>
                {VARIABLES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertVariable(key); }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-badge-info text-blue-300 border border-blue-800 hover:bg-blue-800/50 transition-colors font-mono"
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Blocs de signature */}
              <div className="flex flex-wrap gap-2 px-2 py-1.5 bg-surface-overlay border-b border-surface-border">
                <span className="text-[10px] text-content-muted self-center mr-1">Signatures :</span>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertSignatureBlock('lessor_signature_block'); }}
                  className="text-[10px] px-2 py-1 rounded bg-badge-warning text-status-warning border border-status-warning hover:bg-amber-800/50 transition-colors font-medium flex items-center gap-1"
                >
                  <PenLine className="w-3 h-3" /> Zone signature Loueur
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertSignatureBlock('signature_block'); }}
                  className="text-[10px] px-2 py-1 rounded bg-badge-success text-status-success border border-status-success hover:bg-green-800/50 transition-colors font-medium flex items-center gap-1"
                >
                  <PenLine className="w-3 h-3" /> Zone signature Locataire
                </button>
                <span className="text-[10px] text-content-muted self-center">← cliquer positionne le curseur, puis cliquer le bouton</span>
              </div>

              {/* Editor area */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-[320px] max-h-[45vh] overflow-y-auto p-4 text-sm bg-white text-gray-900 focus:outline-none"
                style={{ lineHeight: '1.6' }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-surface-border mt-6">
        <button onClick={onClose} className="btn-secondary flex-1 h-10 text-sm">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1 h-10 text-sm flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {template ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>
    </SlidePanel>
  );
}
