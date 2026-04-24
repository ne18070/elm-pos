'use client';

import { useEffect, useState } from 'react';
import { 
  Loader2, Plus, Pencil, Save, BarChart2, Check, X,
  Clock, CreditCard, Sparkles
} from 'lucide-react';
import { toUserError } from '@/lib/user-error';
import { displayCurrency, cn } from '@/lib/utils';
import { getPlans, upsertPlan, type Plan } from '@services/supabase/subscriptions';

export default function PlansPage() {
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);
  const [saving, setSaving]   = useState(false);

  async function load() {
    setLoading(true);
    try { setPlans(await getPlans()); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try { 
      await upsertPlan(editing); 
      setEditing(null); 
      await load(); 
    } catch (e) { alert(toUserError(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase">Plans & Tarification</h1>
          <p className="text-slate-500 text-sm mt-1">Gérez les offres commerciales et les fonctionnalités incluses.</p>
        </div>
        <button 
          onClick={() => setEditing({ name: '', label: '', price: 0, currency: 'XOF', duration_days: 30, features: [], is_active: true, sort_order: 0 })} 
          className="btn-primary h-11 px-6 flex items-center gap-2 shadow-lg shadow-brand-500/20"
        >
          <Plus className="w-5 h-5" />
          <span>Créer un Plan</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-brand-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.sort((a,b) => a.sort_order - b.sort_order).map((plan) => (
            <div key={plan.id} className={cn(
              "card p-0 flex flex-col transition-all group relative overflow-hidden",
              !plan.is_active && "opacity-60"
            )}>
              {/* Premium-like header for active plans */}
              <div className={cn("h-2 w-full", plan.is_active ? "bg-brand-600" : "bg-slate-700")} />
              
              <div className="p-6 flex-1 space-y-6 flex flex-col">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-white tracking-tight">{plan.label}</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{plan.name}</p>
                  </div>
                  <button 
                    onClick={() => setEditing({ ...plan })} 
                    className="p-2 rounded-xl bg-surface-input text-content-secondary hover:text-white transition-all border border-surface-border shadow-sm"
                  >
                    <Pencil size={16} />
                  </button>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">{plan.price.toLocaleString()}</span>
                  <span className="text-sm font-bold text-slate-500 uppercase">{displayCurrency(plan.currency)}</span>
                  <span className="text-xs text-slate-500 ml-1">/ {plan.duration_days}j</span>
                </div>

                <div className="space-y-2 flex-1">
                  <p className="text-[9px] font-black text-content-brand uppercase tracking-widest">Inclus dans le plan</p>
                  <ul className="space-y-2">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-xs text-slate-300 font-medium">
                        <Check className="w-3.5 h-3.5 text-brand-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 border-t border-surface-border flex items-center justify-between">
                   <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      <Clock size={12} /> {plan.duration_days} Jours
                   </div>
                   {!plan.is_active && (
                     <span className="text-[10px] font-black uppercase bg-badge-error text-status-error px-2 py-0.5 rounded border border-red-900/50">Désactivé</span>
                   )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal/Drawer */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="card w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] scale-in-center">
            <div className="p-6 border-b border-surface-border flex items-center justify-between bg-surface-hover shrink-0">
               <div>
                  <h3 className="text-xl font-black text-white tracking-tight uppercase">{editing.id ? 'Modifier Plan' : 'Nouveau Plan'}</h3>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Configuration de l'offre</p>
               </div>
               <button onClick={() => setEditing(null)} className="p-2 hover:bg-surface-input rounded-xl text-slate-500 transition-colors"><X size={24} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                 <div className="col-span-2 md:col-span-1">
                    <label className="label text-[10px] uppercase font-black tracking-widest">Libellé (Affiché)</label>
                    <input className="input h-12" value={editing.label ?? ''} onChange={e => setEditing({...editing, label: e.target.value})} placeholder="Ex: Plan Business" />
                 </div>
                 <div className="col-span-2 md:col-span-1">
                    <label className="label text-[10px] uppercase font-black tracking-widest">Slug (ID unique)</label>
                    <input className="input h-12" value={editing.name ?? ''} onChange={e => setEditing({...editing, name: e.target.value})} placeholder="Ex: business" />
                 </div>
                 <div className="col-span-2 md:col-span-1">
                    <label className="label text-[10px] uppercase font-black tracking-widest">Prix</label>
                    <input type="number" className="input h-12" value={editing.price ?? 0} onChange={e => setEditing({...editing, price: parseFloat(e.target.value) || 0})} />
                 </div>
                 <div className="col-span-2 md:col-span-1">
                    <label className="label text-[10px] uppercase font-black tracking-widest">Devise</label>
                    <input className="input h-12 uppercase" value={editing.currency ?? 'XOF'} onChange={e => setEditing({...editing, currency: e.target.value.toUpperCase()})} />
                 </div>
                 <div className="col-span-2">
                    <label className="label text-[10px] uppercase font-black tracking-widest">Durée (Jours)</label>
                    <div className="flex gap-2 p-1 bg-surface-input rounded-xl border border-surface-border h-14 items-center px-4">
                       <input type="number" className="bg-transparent border-none focus:ring-0 text-white font-black text-xl w-24" value={editing.duration_days ?? 30} onChange={e => setEditing({...editing, duration_days: parseInt(e.target.value) || 30})} />
                       <div className="h-6 w-px bg-slate-700 mx-2" />
                       <button onClick={() => setEditing({...editing, duration_days: 30})} className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all", editing.duration_days === 30 ? "bg-brand-600 text-white" : "text-slate-500")}>Mensuel</button>
                       <button onClick={() => setEditing({...editing, duration_days: 365})} className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all", editing.duration_days === 365 ? "bg-brand-600 text-white" : "text-slate-500")}>Annuel</button>
                    </div>
                 </div>
                 <div className="col-span-2">
                    <label className="label text-[10px] uppercase font-black tracking-widest">Fonctionnalités (une par ligne)</label>
                    <textarea 
                      className="input min-h-[120px] py-4 text-xs font-medium leading-relaxed" 
                      value={(editing.features ?? []).join('\n')} 
                      onChange={e => setEditing({...editing, features: e.target.value.split('\n').filter(Boolean)})} 
                      placeholder="pos&#10;stock&#10;hotel"
                    />
                 </div>
              </div>
              
              <label className="flex items-center gap-3 p-4 rounded-2xl bg-surface-input border border-surface-border cursor-pointer group">
                 <input type="checkbox" checked={editing.is_active ?? true} onChange={e => setEditing({...editing, is_active: e.target.checked})} className="w-5 h-5 accent-brand-500" />
                 <div>
                    <p className="text-xs font-black text-white uppercase tracking-widest">Plan Actif</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Si décoché, le plan ne sera plus proposé aux nouveaux clients.</p>
                 </div>
              </label>
            </div>

            <div className="p-6 bg-surface-hover border-t border-surface-border flex gap-4 shrink-0">
               <button onClick={() => setEditing(null)} className="btn-secondary flex-1 h-12 text-[10px] font-black uppercase tracking-widest">Annuler</button>
               <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 h-12 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-brand-500/20">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
