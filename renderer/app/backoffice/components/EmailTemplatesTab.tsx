'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, Pencil, Mail, Eye, Code2 } from 'lucide-react';
import type { Database } from '@services/supabase/database.types';
import { toUserError } from '@/lib/user-error';
import { supabase } from '@services/supabase/client';

type EmailTemplate = Database['public']['Tables']['email_templates']['Row'];

async function adminFetch(path: string, options?: RequestInit) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}

export function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState<EmailTemplate | null>(null);
  const [saving, setSaving]       = useState(false);
  const [preview, setPreview]     = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/email-templates');
      if (!res.ok) throw new Error((await res.json()).error);
      setTemplates(await res.json());
    } catch (e) {
      alert(toUserError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/email-templates', {
        method: 'PATCH',
        body: JSON.stringify({
          id:          editing.id,
          name:        editing.name,
          description: editing.description,
          html_body:   editing.html_body,
          is_active:   editing.is_active,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditing(null);
      await load();
    } catch (e) {
      alert(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  const variables = Array.isArray(editing?.variables) ? (editing.variables as string[]) : [];

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-content-brand" />
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-content-secondary">
        Modifiez le corps HTML de chaque template. Utilisez les placeholders{' '}
        <code className="bg-surface-input px-1 py-0.5 rounded text-content-brand text-xs">{'{{variable}}'}</code>{' '}
        listés sur chaque carte.
      </p>

      <div className="space-y-2">
        {templates.map((tpl) => (
          <div key={tpl.id} className="card p-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Mail className="w-4 h-4 text-content-brand shrink-0" />
                <p className="font-medium text-content-primary">{tpl.name}</p>
                {tpl.is_active
                  ? <span className="text-xs px-2 py-0.5 rounded-full border border-status-success text-status-success bg-badge-success">Actif</span>
                  : <span className="text-xs px-2 py-0.5 rounded-full border border-surface-border text-content-muted">Inactif</span>}
              </div>
              <p className="text-xs text-content-muted mt-0.5 font-mono">{tpl.key}</p>
              {tpl.description && <p className="text-xs text-content-secondary mt-1">{tpl.description}</p>}
              {Array.isArray(tpl.variables) && (tpl.variables as string[]).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(tpl.variables as string[]).map((v) => (
                    <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 bg-surface-input rounded border border-surface-border text-content-brand">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => { setEditing({ ...tpl }); setPreview(false); }}
              className="btn-secondary p-2 shrink-0"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-3xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
              <div>
                <h2 className="font-semibold text-content-primary">{editing.name}</h2>
                <p className="text-xs text-content-muted font-mono mt-0.5">{editing.key}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPreview(!preview)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border
                    ${preview
                      ? 'bg-brand-600 border-brand-500 text-content-primary'
                      : 'border-surface-border text-content-secondary hover:text-content-primary'}`}
                >
                  {preview ? <Code2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {preview ? 'HTML' : 'Aperçu'}
                </button>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.is_active}
                    onChange={(e) => setEditing((t) => t && { ...t, is_active: e.target.checked })}
                    className="w-4 h-4 accent-brand-500"
                  />
                  <span className="text-sm text-content-primary">Actif</span>
                </label>
              </div>
            </div>

            {/* Variables */}
            {variables.length > 0 && (
              <div className="px-5 pt-4 flex flex-wrap gap-1.5 shrink-0">
                <span className="text-xs text-content-muted self-center mr-1">Variables :</span>
                {variables.map((v) => (
                  <span key={v} className="text-xs font-mono px-2 py-0.5 bg-surface-input rounded border border-surface-border text-content-brand">
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            )}

            {/* Corps */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="label">Nom</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing((t) => t && { ...t, name: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Description (admin)</label>
                <input
                  type="text"
                  value={editing.description ?? ''}
                  onChange={(e) => setEditing((t) => t && { ...t, description: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Corps HTML</label>
                {preview ? (
                  <div
                    className="bg-white rounded-xl p-6 min-h-[260px] overflow-auto text-sm"
                    dangerouslySetInnerHTML={{ __html: editing.html_body }}
                  />
                ) : (
                  <textarea
                    value={editing.html_body}
                    onChange={(e) => setEditing((t) => t && { ...t, html_body: e.target.value })}
                    className="input font-mono text-xs leading-relaxed resize-y min-h-[260px]"
                    spellCheck={false}
                  />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-surface-border shrink-0">
              <button onClick={() => setEditing(null)} className="btn-secondary px-5">Annuler</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary px-5 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <Save className="w-4 h-4" />
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
