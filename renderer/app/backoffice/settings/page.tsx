'use client';

import { useState, useEffect } from 'react';
import { 
  Loader2, Save, Upload, Smartphone, 
  Mail, Grid3X3, CreditCard, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import { 
  getPaymentSettings, upsertPaymentSettings, uploadQrCode,
  type PaymentSettings 
} from '@services/supabase/subscriptions';
import { ModulesTab } from '../components/ModulesTab';
import { EmailTemplatesTab } from '../components/EmailTemplatesTab';

type SettingsTab = 'paiement' | 'modules' | 'emails';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('paiement');
  
  // Payment State
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ wave_qr_url: '', om_qr_url: '', whatsapp_number: '' });
  const [uploading, setUploading] = useState<'wave' | 'om' | null>(null);

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
  }, [activeTab]);

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
    { id: 'modules', label: 'Modules & Types', icon: Grid3X3 },
    { id: 'emails', label: 'Templates Email', icon: Mail },
  ];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight uppercase">Paramètres Système</h1>
        <p className="text-slate-500 text-sm mt-1">Configurez les aspects techniques et transactionnels de la plateforme.</p>
      </div>

      <div className="flex gap-1 bg-surface-card border border-surface-border p-1 rounded-2xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              activeTab === tab.id 
                ? "bg-brand-600 text-white shadow-lg" 
                : "text-slate-500 hover:text-slate-300 hover:bg-surface-input"
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
                  <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                     <Smartphone size={16} className="text-content-brand" /> Support Client
                  </h3>
                  <div>
                    <label className="label text-[10px] font-black uppercase tracking-widest text-slate-500">Numéro WhatsApp Business</label>
                    <input 
                      type="text" 
                      value={paymentForm.whatsapp_number} 
                      onChange={(e) => setPaymentForm({ ...paymentForm, whatsapp_number: e.target.value })} 
                      className="input h-12" 
                      placeholder="+221770000000" 
                    />
                    <p className="text-[10px] text-slate-500 mt-2 italic">Ce numéro sera utilisé pour les notifications de paiement et le support.</p>
                  </div>
               </div>

               {[{ type: 'wave' as const, label: 'Passerelle Wave', field: 'wave_qr_url', color: 'bg-cyan-500' }, 
                 { type: 'om' as const, label: 'Passerelle Orange Money', field: 'om_qr_url', color: 'bg-orange-500' }].map(({ type, label, field, color }) => (
                <div key={type} className="card p-6 space-y-4 flex flex-col">
                  <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                     <div className={cn("w-2 h-2 rounded-full", color)} /> {label}
                  </h3>
                  <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-surface-border rounded-2xl p-4 min-h-[200px] bg-surface-input/30">
                    {(paymentForm as any)[field] ? (
                      <div className="relative group">
                        <img src={(paymentForm as any)[field]} alt={label} className="w-32 h-32 object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                           <label className="cursor-pointer p-2 bg-brand-600 rounded-full text-white shadow-xl">
                              <Upload size={16} />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(type, e.target.files[0])} />
                           </label>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-2 text-slate-500 hover:text-content-brand transition-colors">
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

        {activeTab === 'modules' && <ModulesTab />}
        {activeTab === 'emails' && <EmailTemplatesTab />}
      </div>
    </div>
  );
}
