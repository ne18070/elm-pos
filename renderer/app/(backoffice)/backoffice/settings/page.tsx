'use client';

import { useState, useEffect } from 'react';
import {
  Loader2, Save, Upload, Smartphone,
  Mail, Grid3X3, CreditCard, ShieldCheck, KeyRound, Copy, Check, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import {
  getPaymentSettings, upsertPaymentSettings, uploadQrCode,
  type PaymentSettings
} from '@services/supabase/subscriptions';
import {
  getPaydunyaSettingsAdmin, upsertPaydunyaSettingsAdmin, generateProxyApiKey,
  type PaydunyaSettingsAdmin,
} from '@services/supabase/paydunya-admin';
import { ModulesTab } from '../components/ModulesTab';
import { EmailTemplatesTab } from '../components/EmailTemplatesTab';

type SettingsTab = 'paiement' | 'paydunya' | 'modules' | 'emails';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('paiement');
  
  // Payment State
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ wave_qr_url: '', om_qr_url: '', whatsapp_number: '' });
  const [uploading, setUploading] = useState<'wave' | 'om' | null>(null);

  // PayDunya State
  const [pdLoading, setPdLoading] = useState(true);
  const [pdSaving, setPdSaving]   = useState(false);
  const [pdCopied, setPdCopied]   = useState(false);
  const [pdForm, setPdForm] = useState<PaydunyaSettingsAdmin>({
    mode: 'test',
    master_key: '',
    test_private_key: '', test_public_key: '', test_token: '',
    live_private_key: '', live_public_key: '', live_token: '',
    store_name: 'ELM', store_logo_url: '', store_website_url: '', proxy_api_key: '',
  });

  useEffect(() => {
    if (activeTab === 'paiement') {
      getPaymentSettings().then((s) => {
        setPaymentForm({
          wave_qr_url: s?.wave_qr_url ?? '',
          om_qr_url: s?.om_qr_url ?? '',
          whatsapp_number: s?.whatsapp_number ?? ''
        });
      }).finally(() => setPaymentLoading(false));
    }
    if (activeTab === 'paydunya') {
      getPaydunyaSettingsAdmin()
        .then((s) => setPdForm({
          ...s,
          master_key: s.master_key ?? '',
          test_private_key: s.test_private_key ?? '', test_public_key: s.test_public_key ?? '', test_token: s.test_token ?? '',
          live_private_key: s.live_private_key ?? '', live_public_key: s.live_public_key ?? '', live_token: s.live_token ?? '',
          store_logo_url: s.store_logo_url ?? '', store_website_url: s.store_website_url ?? '', proxy_api_key: s.proxy_api_key ?? '',
        }))
        .catch((e) => alert(toUserError(e)))
        .finally(() => setPdLoading(false));
    }
  }, [activeTab]);

  async function handleSavePaydunya() {
    setPdSaving(true);
    try {
      await upsertPaydunyaSettingsAdmin(pdForm);
      alert('Paramètres PayDunya enregistrés');
    } catch (e) { alert(toUserError(e)); }
    finally { setPdSaving(false); }
  }

  function handleGenerateProxyKey() {
    if (pdForm.proxy_api_key && !confirm('Générer une nouvelle clé invalidera l\'ancienne pour toutes vos applications externes. Continuer ?')) return;
    setPdForm((f) => ({ ...f, proxy_api_key: generateProxyApiKey() }));
  }

  function handleCopyProxyKey() {
    if (!pdForm.proxy_api_key) return;
    navigator.clipboard.writeText(pdForm.proxy_api_key);
    setPdCopied(true);
    setTimeout(() => setPdCopied(false), 1500);
  }

  async function handleUpload(type: 'wave' | 'om', file: File) {
    setUploading(type);
    try { 
      const url = await uploadQrCode(type, file); 
      setPaymentForm((f) => ({ ...f, [`${type}_qr_url`]: url })); 
    } catch (e) { alert(toUserError(e)); }
    finally { setUploading(null); }
  }

  async function handleSavePayment() {
    setPaymentSaving(true);
    try { 
      await upsertPaymentSettings(paymentForm); 
      alert('Paramètres enregistrés');
    } catch (e) { alert(toUserError(e)); }
    finally { setPaymentSaving(false); }
  }

  const TABS = [
    { id: 'paiement', label: 'Paiement Global', icon: CreditCard },
    { id: 'paydunya', label: 'PayDunya', icon: KeyRound },
    { id: 'modules', label: 'Modules & Types', icon: Grid3X3 },
    { id: 'emails', label: 'Templates Email', icon: Mail },
  ];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase">Paramètres Système</h1>
        <p className="text-content-muted text-sm mt-1">Configurez les aspects techniques et transactionnels de la plateforme.</p>
      </div>

      <div className="flex gap-1 bg-surface-card border border-surface-border p-1 rounded-2xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              activeTab === tab.id 
                ? "bg-brand-600 text-content-primary shadow-lg" 
                : "text-content-muted hover:text-content-primary hover:bg-surface-input"
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="animate-in fade-in duration-500">
        {activeTab === 'paiement' && (
          <div className="max-w-2xl space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="card p-6 space-y-4 col-span-2">
                  <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
                     <Smartphone size={16} className="text-content-brand" /> Support Client
                  </h3>
                  <div>
                    <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Numéro WhatsApp Business</label>
                    <input 
                      type="text" 
                      value={paymentForm.whatsapp_number} 
                      onChange={(e) => setPaymentForm({ ...paymentForm, whatsapp_number: e.target.value })} 
                      className="input h-12" 
                      placeholder="+221770000000" 
                    />
                    <p className="text-[10px] text-content-muted mt-2 italic">Ce numéro sera utilisé pour les notifications de paiement et le support.</p>
                  </div>
               </div>

               {[{ type: 'wave' as const, label: 'Passerelle Wave', field: 'wave_qr_url', color: 'bg-cyan-500' }, 
                 { type: 'om' as const, label: 'Passerelle Orange Money', field: 'om_qr_url', color: 'bg-orange-500' }].map(({ type, label, field, color }) => (
                <div key={type} className="card p-6 space-y-4 flex flex-col">
                  <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
                     <div className={cn("w-2 h-2 rounded-full", color)} /> {label}
                  </h3>
                  <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-surface-border rounded-2xl p-4 min-h-[200px] bg-surface-input/30">
                    {(paymentForm as any)[field] ? (
                      <div className="relative group">
                        <img src={(paymentForm as any)[field]} alt={label} className="w-32 h-32 object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                           <label className="cursor-pointer p-2 bg-brand-600 rounded-full text-content-primary shadow-xl">
                              <Upload size={16} />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(type, e.target.files[0])} />
                           </label>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-2 text-content-muted hover:text-content-brand transition-colors">
                        {uploading === type ? <Loader2 size={32} className="animate-spin" /> : <Upload size={32} />}
                        <span className="text-[10px] font-black uppercase tracking-widest">Uploader le QR Code</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(type, e.target.files[0])} />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button 
              onClick={handleSavePayment} 
              disabled={paymentSaving} 
              className="btn-primary w-full h-14 text-sm font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-brand-500/20"
            >
              {paymentSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              Sauvegarder les configurations
            </button>
          </div>
        )}

        {activeTab === 'paydunya' && (
          pdLoading ? (
            <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-content-muted" /></div>
          ) : (
          <div className="max-w-2xl space-y-6">

            {/* Mode actif */}
            <div className="card p-6 space-y-3">
              <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={16} className="text-content-brand" /> Mode actif
              </h3>
              <p className="text-xs text-content-muted">
                Détermine quel jeu de clés (Test ou Production) est utilisé par les paiements réels — les deux jeux restent enregistrés en permanence.
              </p>
              <div className="flex gap-2">
                {(['test', 'live'] as const).map((m) => (
                  <button key={m} onClick={() => setPdForm((f) => ({ ...f, mode: m }))}
                    className={cn(
                      'flex-1 h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all border',
                      pdForm.mode === m
                        ? m === 'live' ? 'bg-red-600 border-red-600 text-white' : 'bg-brand-600 border-brand-600 text-content-primary'
                        : 'border-surface-border text-content-muted hover:text-content-primary'
                    )}>
                    {m === 'test' ? 'Test (sandbox)' : 'Production (argent réel)'}
                  </button>
                ))}
              </div>
              {pdForm.mode === 'live' && (
                <p className="text-[10px] text-status-error font-semibold uppercase tracking-wide">
                  ⚠ Mode production actif — les paiements initiés déplaceront de l'argent réel.
                </p>
              )}
            </div>

            {/* Clé Master (unique, partagée Test + Production) */}
            <div className="card p-6 space-y-3">
              <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
                <KeyRound size={16} className="text-content-brand" /> Clé Principale (Master Key)
              </h3>
              <p className="text-xs text-content-muted">
                PayDunya n'attribue qu'une seule clé principale par application — partagée entre Test et Production.
              </p>
              <input
                type="text"
                value={pdForm.master_key ?? ''}
                onChange={(e) => setPdForm((f) => ({ ...f, master_key: e.target.value }))}
                className="input h-10 text-xs font-mono"
                placeholder="..."
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {/* Clés Test / Production */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {([
                { prefix: 'test' as const, label: 'Clés API de Test', color: 'bg-status-info' },
                { prefix: 'live' as const, label: 'Clés API de Production', color: 'bg-status-error' },
              ]).map(({ prefix, label, color }) => (
                <div key={prefix} className="card p-6 space-y-3">
                  <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full', color)} /> {label}
                  </h3>
                  {([
                    ['private_key', 'Clé Privée'],
                    ['public_key', 'Clé Publique'],
                    ['token', 'Token'],
                  ] as const).map(([field, fLabel]) => {
                    const key = `${prefix}_${field}` as keyof PaydunyaSettingsAdmin;
                    return (
                      <div key={field}>
                        <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">{fLabel}</label>
                        <input
                          type="text"
                          value={(pdForm[key] as string) ?? ''}
                          onChange={(e) => setPdForm((f) => ({ ...f, [key]: e.target.value }))}
                          className="input h-10 text-xs font-mono"
                          placeholder={`${prefix}_...`}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Boutique */}
            <div className="card p-6 space-y-4">
              <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
                <CreditCard size={16} className="text-content-brand" /> Fiche boutique (affichée sur la page de paiement PayDunya)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Nom</label>
                  <input type="text" value={pdForm.store_name} onChange={(e) => setPdForm((f) => ({ ...f, store_name: e.target.value }))} className="input h-10" />
                </div>
                <div>
                  <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Site web</label>
                  <input type="text" value={pdForm.store_website_url ?? ''} onChange={(e) => setPdForm((f) => ({ ...f, store_website_url: e.target.value }))} className="input h-10" placeholder="https://elm-app.click" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Logo (URL)</label>
                  <input type="text" value={pdForm.store_logo_url ?? ''} onChange={(e) => setPdForm((f) => ({ ...f, store_logo_url: e.target.value }))} className="input h-10" placeholder="https://.../logo.png" />
                </div>
              </div>
            </div>

            {/* Clé proxy pour applications externes */}
            <div className="card p-6 space-y-3">
              <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
                <KeyRound size={16} className="text-content-brand" /> Clé API du proxy (applications externes)
              </h3>
              <p className="text-xs text-content-muted">
                À fournir à tes autres applications pour qu'elles appellent <span className="font-mono text-content-secondary">/api/payments/paydunya/*</span> (header <span className="font-mono text-content-secondary">X-API-Key</span>). Ne jamais partager les clés PayDunya elles-mêmes.
              </p>
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={pdForm.proxy_api_key ?? ''} placeholder="Aucune clé générée"
                  className="input h-10 text-xs font-mono flex-1" />
                <button onClick={handleCopyProxyKey} disabled={!pdForm.proxy_api_key}
                  className="btn-secondary h-10 w-10 flex items-center justify-center shrink-0 disabled:opacity-30">
                  {pdCopied ? <Check size={16} className="text-status-success" /> : <Copy size={16} />}
                </button>
                <button onClick={handleGenerateProxyKey}
                  className="btn-secondary h-10 px-4 flex items-center gap-2 text-xs font-semibold shrink-0">
                  <RefreshCw size={14} /> {pdForm.proxy_api_key ? 'Régénérer' : 'Générer'}
                </button>
              </div>
              <a href="/backoffice/paydunya-docs" className="text-xs text-content-brand hover:underline inline-block">
                Voir la documentation d'intégration →
              </a>
            </div>

            <button
              onClick={handleSavePaydunya}
              disabled={pdSaving}
              className="btn-primary w-full h-14 text-sm font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-brand-500/20"
            >
              {pdSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              Sauvegarder PayDunya
            </button>
          </div>
          )
        )}

        {activeTab === 'modules' && <ModulesTab />}
        {activeTab === 'emails' && <EmailTemplatesTab />}
      </div>
    </div>
  );
}
