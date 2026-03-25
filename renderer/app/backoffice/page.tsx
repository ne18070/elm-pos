'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, CheckCircle, Clock, XCircle, RefreshCw,
  Upload, Save, Plus, Pencil,
} from 'lucide-react';
import {
  getAllSubscriptions, activateSubscription,
  getPlans, getPaymentSettings, upsertPaymentSettings, upsertPlan,
  uploadQrCode,
  type SubscriptionRow, type Plan, type PaymentSettings,
} from '@services/supabase/subscriptions';

type Tab = 'abonnements' | 'plans' | 'paiement';

const STATUS_LABEL: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  active:  { label: 'Actif',   color: 'text-green-400 bg-green-900/20 border-green-800',  icon: CheckCircle },
  trial:   { label: 'Essai',   color: 'text-amber-400 bg-amber-900/20 border-amber-800',  icon: Clock       },
  expired: { label: 'Expiré',  color: 'text-red-400 bg-red-900/20 border-red-800',        icon: XCircle     },
};

function getRowStatus(row: SubscriptionRow): string {
  if (row.status === 'active' && row.expires_at && new Date(row.expires_at) < new Date()) return 'expired';
  if (row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at) < new Date()) return 'expired';
  return row.status;
}

// ── Onglet Abonnements ────────────────────────────────────────────────────────

function SubscriptionsTab({ plans }: { plans: Plan[] }) {
  const [rows, setRows]             = useState<SubscriptionRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [activating, setActivating] = useState<string | null>(null);
  const [form, setForm]             = useState<{
    businessId: string; planId: string; days: string; mode: 'jours' | 'mois'; note: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await getAllSubscriptions()); } catch { /* pas superadmin */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) =>
    !search ||
    r.business_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.owner_email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleActivate() {
    if (!form) return;
    setActivating(form.businessId);
    const totalDays = form.mode === 'mois'
      ? (parseInt(form.days) || 1) * 30
      : parseInt(form.days) || 30;
    try {
      await activateSubscription(form.businessId, form.planId, totalDays, form.note || undefined);
      setForm(null);
      await load();
    } catch (e) { alert(String(e)); }
    finally { setActivating(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par établissement ou email…"
          className="input flex-1 max-w-sm"
        />
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const st    = getRowStatus(row);
            const badge = STATUS_LABEL[st] ?? STATUS_LABEL.expired;
            const Icon  = badge.icon;
            return (
              <div key={row.business_id} className="card p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-surface-input border border-surface-border
                                flex items-center justify-center text-brand-400 font-bold shrink-0">
                  {row.business_name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm truncate">{row.business_name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {row.owner_name ?? '—'} · {row.owner_email ?? '—'}
                  </p>
                  {row.payment_note && (
                    <p className="text-xs text-slate-400 mt-0.5 italic">"{row.payment_note}"</p>
                  )}
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${badge.color}`}>
                    <Icon className="w-3 h-3" /> {badge.label}
                  </span>
                  {row.expires_at && (
                    <p className="text-xs text-slate-500">
                      Exp. {new Date(row.expires_at).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                  {st === 'trial' && row.trial_ends_at && (
                    <p className="text-xs text-slate-500">
                      Essai → {new Date(row.trial_ends_at).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setForm({
                    businessId: row.business_id,
                    planId: plans[0]?.id ?? '',
                    days: '1',
                    mode: 'mois',
                    note: '',
                  })}
                  className="btn-primary text-sm px-4 shrink-0"
                >
                  Activer
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-slate-500 py-12">Aucun abonnement trouvé</p>
          )}
        </div>
      )}

      {/* Modal activation */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="font-semibold text-white">Activer l'abonnement</h2>

            <div>
              <label className="label">Plan</label>
              <select
                value={form.planId}
                onChange={(e) => setForm((f) => f && { ...f, planId: e.target.value })}
                className="input"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} — {p.price.toLocaleString('fr-FR')} {p.currency}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Durée</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={form.days}
                  onChange={(e) => setForm((f) => f && { ...f, days: e.target.value })}
                  className="input flex-1"
                  min={1}
                />
                <div className="flex rounded-xl border border-surface-border overflow-hidden shrink-0">
                  {(['jours', 'mois'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm((f) => f && { ...f, mode: m })}
                      className={`px-3 py-2 text-sm font-medium transition-colors
                        ${form.mode === m
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-400 hover:text-white'}`}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                = {form.mode === 'mois'
                  ? `${(parseInt(form.days) || 1) * 30} jours`
                  : `${parseInt(form.days) || 0} jour${parseInt(form.days) > 1 ? 's' : ''}`}
              </p>
            </div>

            <div>
              <label className="label">Note (optionnel)</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => f && { ...f, note: e.target.value })}
                className="input"
                placeholder="Ex : Wave #REF123"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setForm(null)} className="btn-secondary px-5">Annuler</button>
              <button
                onClick={handleActivate}
                disabled={!!activating || !form.planId}
                className="btn-primary px-5 flex items-center gap-2"
              >
                {activating && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Plans ──────────────────────────────────────────────────────────────

function PlansTab() {
  const [plans, setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);
  const [saving, setSaving]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await import('@services/supabase/subscriptions').then(
        (m) => m.getPlans().then((data) => ({ data }))
      );
      setPlans(data);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      await upsertPlan(editing);
      setEditing(null);
      await load();
    } catch (e) { alert(String(e)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ name: '', label: '', price: 0, currency: 'XOF', duration_days: 30, features: [], is_active: true, sort_order: 0 })}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> Nouveau plan
        </button>
      </div>

      <div className="space-y-2">
        {plans.map((plan) => (
          <div key={plan.id} className="card p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-white">{plan.label}</p>
                {!plan.is_active && <span className="text-xs text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">Inactif</span>}
              </div>
              <p className="text-sm text-brand-400">{plan.price.toLocaleString('fr-FR')} {plan.currency} / {plan.duration_days}j</p>
              <p className="text-xs text-slate-500 mt-0.5">{plan.features.join(' · ')}</p>
            </div>
            <button
              onClick={() => setEditing({ ...plan })}
              className="btn-secondary p-2"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold text-white">{editing.id ? 'Modifier le plan' : 'Nouveau plan'}</h2>

            {[
              { field: 'label',         label: 'Nom affiché',       type: 'text'   },
              { field: 'name',          label: 'Identifiant',       type: 'text'   },
              { field: 'price',         label: 'Prix',              type: 'number' },
              { field: 'currency',      label: 'Devise',            type: 'text'   },
              { field: 'duration_days', label: 'Durée (jours)',     type: 'number' },
              { field: 'sort_order',    label: 'Ordre d\'affichage',type: 'number' },
            ].map(({ field, label, type }) => (
              <div key={field}>
                <label className="label">{label}</label>
                <input
                  type={type}
                  value={(editing as Record<string, unknown>)[field] as string ?? ''}
                  onChange={(e) => setEditing((p) => p && ({
                    ...p,
                    [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value,
                  }))}
                  className="input"
                />
              </div>
            ))}

            <div>
              <label className="label">Fonctionnalités (une par ligne)</label>
              <textarea
                value={(editing.features ?? []).join('\n')}
                onChange={(e) => setEditing((p) => p && ({ ...p, features: e.target.value.split('\n').filter(Boolean) }))}
                className="input min-h-[80px] resize-y"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.is_active ?? true}
                onChange={(e) => setEditing((p) => p && ({ ...p, is_active: e.target.checked }))}
                className="w-4 h-4 accent-brand-500"
              />
              <span className="text-sm text-white">Plan actif</span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditing(null)} className="btn-secondary px-5">Annuler</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary px-5 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Paramètres paiement ────────────────────────────────────────────────

function PaymentTab() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({ wave_qr_url: '', om_qr_url: '', whatsapp_number: '' });
  const [uploading, setUploading] = useState<'wave' | 'om' | null>(null);

  useEffect(() => {
    getPaymentSettings()
      .then((s) => {
        setSettings(s);
        setForm({
          wave_qr_url:    s?.wave_qr_url    ?? '',
          om_qr_url:      s?.om_qr_url      ?? '',
          whatsapp_number: s?.whatsapp_number ?? '+33746436801',
        });
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleUpload(type: 'wave' | 'om', file: File) {
    setUploading(type);
    try {
      const url = await uploadQrCode(type, file);
      setForm((f) => ({ ...f, [`${type}_qr_url`]: url }));
    } catch (e) { alert(String(e)); }
    finally { setUploading(null); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await upsertPaymentSettings(form);
      setSettings({ ...form });
    } catch (e) { alert(String(e)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>;

  return (
    <div className="max-w-lg space-y-6">
      {/* Numéro WhatsApp */}
      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-white">Numéro WhatsApp</h3>
        <div>
          <label className="label">Numéro (format international)</label>
          <input
            type="text"
            value={form.whatsapp_number}
            onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))}
            className="input"
            placeholder="+33746436801"
          />
        </div>
      </div>

      {/* QR Codes */}
      {[
        { type: 'wave' as const, label: 'QR Code Wave',         field: 'wave_qr_url' },
        { type: 'om'   as const, label: 'QR Code Orange Money', field: 'om_qr_url'   },
      ].map(({ type, label, field }) => (
        <div key={type} className="card p-5 space-y-4">
          <h3 className="font-semibold text-white">{label}</h3>

          {(form as Record<string, string>)[field] && (
            <img
              src={(form as Record<string, string>)[field]}
              alt={label}
              className="w-40 h-40 object-contain rounded-xl border border-surface-border"
            />
          )}

          <label className="btn-secondary cursor-pointer flex items-center gap-2 w-fit text-sm">
            {uploading === type
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Upload className="w-4 h-4" />}
            {(form as Record<string, string>)[field] ? 'Remplacer l\'image' : 'Uploader l\'image'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(type, e.target.files[0])}
            />
          </label>
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary flex items-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        <Save className="w-4 h-4" /> Enregistrer les paramètres
      </button>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function BackofficePage() {
  const [tab, setTab]   = useState<Tab>('abonnements');
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    getPlans().then(setPlans).catch(() => {});
  }, []);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'abonnements', label: 'Abonnements' },
    { id: 'plans',       label: 'Plans & tarifs' },
    { id: 'paiement',    label: 'Paramètres paiement' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto" style={{ height: 'calc(100vh - 57px)' }}>
      {/* Tabs */}
      <div className="flex gap-1 bg-surface-input rounded-xl p-1 w-fit mb-6">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'abonnements' && <SubscriptionsTab plans={plans} />}
      {tab === 'plans'       && <PlansTab />}
      {tab === 'paiement'    && <PaymentTab />}
    </div>
  );
}
