import { useState, useEffect } from 'react';
import { 
  MessageCircle, Loader2, Save, ToggleLeft, ToggleRight, 
  Eye, EyeOff, Copy, RefreshCw, AlertTriangle,
  QrCode, Share2, Info, CheckCircle2, ShieldCheck,
  Zap, Smartphone, Settings
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { 
  getWhatsAppConfig, upsertWhatsAppConfig, regenerateVerifyToken, 
  type WhatsAppConfig, type WhatsAppConfigForm 
} from '@services/supabase/whatsapp';
import { toUserError } from '@/lib/user-error';
import { cn } from '@/lib/utils';

export function WhatsAppSettingsSection() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  
  const [waConfig, setWaConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [form, setForm] = useState<WhatsAppConfigForm>({
    phone_number_id: '',
    access_token:    '',
    display_phone:   '',
    is_active:       false,
    use_shared_number: true, // Par défaut sur le nouveau modèle
    catalog_enabled: false,
    welcome_message: 'Bienvenue chez {nom} ! Tapez *menu* pour voir notre catalogue 🛍️',
    menu_keyword:    'menu',
    confirm_message: '✅ *Commande confirmée !*\n\nVotre commande a bien été enregistrée. Notre équipe vous contactera pour la préparation ou la livraison.\n\nMerci de votre confiance ! 🙏\n\nPour une nouvelle commande, tapez *{mot_cle}*.',
    wave_payment_url: null,
    enable_pickup:    false,
    enable_delivery:  false,
    msg_cart_footer:          'Tapez *confirmer* pour valider ou *menu* pour modifier.',
    msg_shipping_question:    '🚚 *Comment souhaitez-vous recevoir votre commande ?*',
    msg_address_request:      '📍 *Adresse de livraison*\n\nPartagez votre localisation 📌 ou tapez votre adresse en texte.\n\n_Tapez *annuler* pour revenir au menu._',
    msg_delivery_confirmation: '✅ *Votre commande a été livrée !*\n\n📦 *Commande :* #{commande}\n💰 *Total :* {total} FCFA\n\nMerci pour votre confiance ! 🙏',
  });

  useEffect(() => {
    if (!business?.id) return;
    getWhatsAppConfig(business.id)
      .then((cfg) => {
        if (cfg) {
          setWaConfig(cfg);
          setForm({
            phone_number_id: cfg.phone_number_id,
            access_token:    cfg.access_token,
            display_phone:   cfg.display_phone ?? '',
            is_active:       cfg.is_active,
            use_shared_number: cfg.use_shared_number ?? false,
            catalog_enabled: cfg.catalog_enabled,
            welcome_message: cfg.welcome_message,
            menu_keyword:    cfg.menu_keyword ?? 'menu',
            confirm_message: cfg.confirm_message ?? '',
            wave_payment_url: cfg.wave_payment_url ?? null,
            enable_pickup:    cfg.enable_pickup   ?? false,
            enable_delivery:  cfg.enable_delivery ?? false,
            msg_cart_footer:          cfg.msg_cart_footer          ?? 'Tapez *confirmer* pour valider ou *menu* pour modifier.',
            msg_shipping_question:    cfg.msg_shipping_question    ?? '🚚 *Comment souhaitez-vous recevoir votre commande ?*',
            msg_address_request:      cfg.msg_address_request      ?? '📍 *Adresse de livraison*\n\nPartagez votre localisation 📌 ou tapez votre adresse en texte.\n\n_Tapez *annuler* pour revenir au menu._',
            msg_delivery_confirmation: cfg.msg_delivery_confirmation ?? '✅ *Votre commande a été livrée !*\n\n📦 *Commande :* #{commande}\n💰 *Total :* {total} FCFA\n\nMerci pour votre confiance ! 🙏',
          });
        }
      })
      .catch((err) => notifError(toUserError(err)))
      .finally(() => setLoading(false));
  }, [business?.id, notifError]);

  const handleChange = (patch: Partial<WhatsAppConfigForm>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  async function handleSave() {
    if (!business?.id) return;
    setSaving(true);
    try {
      const saved = await upsertWhatsAppConfig(business.id, form);
      setWaConfig(saved);
      setIsDirty(false);
      success('Configuration WhatsApp enregistrée');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateToken() {
    if (!waConfig?.id || !window.confirm('Voulez-vous vraiment régénérer le token de vérification ? Cela invalidera votre configuration actuelle sur Meta.')) return;
    setRegeneratingToken(true);
    try {
      const newToken = await regenerateVerifyToken(waConfig.id);
      setWaConfig((prev) => prev ? { ...prev, verify_token: newToken } : prev);
      success('Nouveau token généré - mettez à jour votre webhook Meta');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setRegeneratingToken(false);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-content-secondary"><Loader2 className="w-4 h-4 animate-spin" /> Chargement de l&apos;intégration…</div>;

  const routingCode = business?.whatsapp_routing_code || 'DEMO-123';
  const sharedNumber = '+221 33 867 00 00'; // À adapter selon votre numéro officiel ELM

  return (
    <div className="space-y-8 max-w-4xl">
      
      {/* 1. Mode Selection */}
      <div className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-content-primary">Méthode de connexion</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* ELM HUB (Shared) */}
          <button 
            onClick={() => handleChange({ use_shared_number: true })}
            className={cn(
              "flex flex-col gap-4 p-6 rounded-2xl border-2 transition-all text-left group relative overflow-hidden",
              form.use_shared_number 
                ? "border-brand-500 bg-brand-500/5 ring-4 ring-brand-500/10" 
                : "border-surface-border bg-white hover:border-brand-500/30"
            )}
          >
            <div className="flex items-center justify-between">
              <div className={cn("p-3 rounded-xl", form.use_shared_number ? "bg-brand-500 text-white" : "bg-surface-input text-content-muted group-hover:text-brand-500")}>
                <Zap size={24} />
              </div>
              {form.use_shared_number && <CheckCircle2 size={20} className="text-brand-500" />}
            </div>
            <div>
              <p className="font-black text-content-primary">Mode ELM Hub</p>
              <p className="text-xs text-content-secondary mt-1">Prêt en 2 secondes. Zéro configuration Meta requise. Idéal pour débuter.</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
               <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-badge-success text-status-success">Recommandé</span>
            </div>
          </button>

          {/* DEDICATED (Meta) */}
          <button 
            onClick={() => handleChange({ use_shared_number: false })}
            className={cn(
              "flex flex-col gap-4 p-6 rounded-2xl border-2 transition-all text-left group",
              !form.use_shared_number 
                ? "border-brand-500 bg-brand-500/5 ring-4 ring-brand-500/10" 
                : "border-surface-border bg-white hover:border-brand-500/30"
            )}
          >
            <div className="flex items-center justify-between">
              <div className={cn("p-3 rounded-xl", !form.use_shared_number ? "bg-brand-500 text-white" : "bg-surface-input text-content-muted group-hover:text-brand-500")}>
                <Settings size={24} />
              </div>
              {!form.use_shared_number && <CheckCircle2 size={20} className="text-brand-500" />}
            </div>
            <div>
              <p className="font-black text-content-primary">Mode Dédié (Expert)</p>
              <p className="text-xs text-content-secondary mt-1">Utilisez votre propre numéro et compte Meta Cloud API. Nécessite une config technique.</p>
            </div>
          </button>

        </div>
      </div>

      {/* 2. Mode Content */}
      <div className="card p-8 border-surface-border space-y-6">
        
        <div className="flex items-center justify-between pb-6 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", form.is_active ? "bg-badge-success text-status-success" : "bg-surface-card text-content-muted")}>
              <MessageCircle size={20} />
            </div>
            <div>
              <p className="font-bold text-content-primary">Statut de l'intégration</p>
              <p className="text-xs text-content-secondary">L'intégration est actuellement {form.is_active ? 'active' : 'en pause'}</p>
            </div>
          </div>
          <button
            onClick={() => handleChange({ is_active: !form.is_active })}
            className="text-content-secondary hover:text-content-primary transition-colors"
          >
            {form.is_active
              ? <ToggleRight className="w-10 h-10 text-status-success" />
              : <ToggleLeft className="w-10 h-10 opacity-40" />}
          </button>
        </div>

        {form.use_shared_number ? (
          /* ── ELM HUB UI ── */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center animate-in slide-in-from-left-4 duration-500">
            <div className="space-y-6">
              <div className="p-4 bg-badge-info/30 border border-status-info/20 rounded-2xl flex gap-3">
                <Info className="w-5 h-5 text-status-info shrink-0" />
                <div className="text-xs text-status-info leading-relaxed font-medium">
                  Vos clients écrivent au numéro officiel <strong>{sharedNumber}</strong>. 
                  En utilisant votre code unique, les messages arrivent directement ici.
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-content-muted">Votre code de routage</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-input border border-surface-border rounded-xl px-4 py-3 font-black text-2xl tracking-tighter text-content-brand flex items-center justify-between">
                    {routingCode}
                    <button 
                      onClick={() => { navigator.clipboard.writeText(routingCode); success('Code copié'); }}
                      className="text-content-muted hover:text-content-primary p-1"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => {
                  const url = `https://wa.me/${sharedNumber.replace(/\D/g, '')}?text=${encodeURIComponent(routingCode)}`;
                  window.open(url, '_blank');
                }}
                className="btn-secondary w-full flex items-center justify-center gap-2 h-12 font-bold"
              >
                <Smartphone size={18} /> Tester le numéro partagé
              </button>
            </div>

            <div className="flex flex-col items-center justify-center p-6 bg-surface-input border border-surface-border rounded-3xl text-center space-y-4">
              <div className="w-48 h-48 bg-white p-4 rounded-2xl shadow-xl border border-surface-border flex items-center justify-center relative group">
                <QrCode size={140} className="text-content-primary" />
                <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-content-primary">Imprimer pour ma vitrine</p>
                  <button className="btn-primary h-8 px-3 text-[10px] flex items-center gap-1">
                    <Share2 size={12} /> Télécharger
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-content-primary">QR Code de commande</p>
                <p className="text-[10px] text-content-muted mt-1 leading-relaxed">Scannez ce code pour ouvrir WhatsApp avec votre routing code pré-rempli.</p>
              </div>
            </div>
          </div>
        ) : (
          /* ── DEDICATED UI ── */
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Phone Number ID <span className="text-content-muted font-normal">(Meta)</span></label>
                <input
                  type="text"
                  placeholder="123456789012345"
                  value={form.phone_number_id}
                  onChange={(e) => handleChange({ phone_number_id: e.target.value })}
                  className="input font-mono text-sm"
                />
              </div>
              <div>
                <label className="label">Votre numéro <span className="text-content-muted font-normal">(ex: +221...)</span></label>
                <input
                  type="tel"
                  placeholder="+221 77 000 00 00"
                  value={form.display_phone ?? ''}
                  onChange={(e) => handleChange({ display_phone: e.target.value })}
                  className="input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="label">Access Token permanent</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder="EAAxxxxxxxx…"
                  value={form.access_token}
                  onChange={(e) => handleChange({ access_token: e.target.value })}
                  className="input font-mono text-sm pr-20"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button type="button" onClick={() => setShowToken((s) => !s)} className="p-1.5 rounded-lg hover:bg-surface-card text-content-secondary hover:text-content-primary">{showToken ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(form.access_token); success('Token copié'); }} className="p-1.5 rounded-lg hover:bg-surface-card text-content-secondary hover:text-content-primary"><Copy size={16} /></button>
                </div>
              </div>
              <p className="text-[10px] text-content-muted mt-1 leading-relaxed flex gap-1.5 items-start">
                <ShieldCheck size={12} className="shrink-0 mt-0.5" />
                Vos credentials sont chiffrés et stockés en toute sécurité sur les serveurs ELM.
              </p>
            </div>

            {waConfig?.verify_token && (
              <div className="p-4 bg-surface-card border border-surface-border rounded-xl space-y-3">
                <div>
                  <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Verify Token (Webhook)</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="text" readOnly value={waConfig.verify_token} className="input font-mono text-xs bg-surface-input flex-1 cursor-default select-all" />
                    <button onClick={() => { navigator.clipboard.writeText(waConfig.verify_token); success('Verify Token copié'); }} className="btn-secondary h-10 px-3 shrink-0"><Copy size={16} /></button>
                    <button onClick={handleRegenerateToken} disabled={regeneratingToken} className="btn-secondary h-10 px-3 shrink-0 text-xs">{regeneratingToken ? <Loader2 size={16} className="animate-spin" /> : 'Régénérer'}</button>
                  </div>
                </div>
                <p className="text-[10px] text-content-muted">URL Webhook : <span className="text-content-secondary font-mono select-all">https://elm-app.click/api/v1/whatsapp-webhook</span></p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Catalog & Settings (Common) */}
      <div className="card p-8 border-surface-border space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-content-primary">Paramètres du Catalogue</h3>
            <p className="text-xs text-content-secondary italic">Personnalisez l&apos;expérience d&apos;achat de vos clients</p>
          </div>
          <button
            onClick={() => handleChange({ catalog_enabled: !form.catalog_enabled })}
            className="text-content-secondary hover:text-content-primary transition-colors"
          >
            {form.catalog_enabled
              ? <ToggleRight className="w-10 h-10 text-brand-500" />
              : <ToggleLeft className="w-10 h-10 opacity-40" />}
          </button>
        </div>

        {form.catalog_enabled && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Mot-clé pour le menu</label>
                <input type="text" value={form.menu_keyword} onChange={(e) => handleChange({ menu_keyword: e.target.value.toLowerCase().trim() })} className="input font-mono text-sm" placeholder="menu" />
              </div>
              <div className="flex flex-col gap-3">
                 <label className="label">Options disponibles</label>
                 <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={form.enable_pickup} onChange={e => handleChange({ enable_pickup: e.target.checked })} className="w-4 h-4 accent-brand-500" />
                      <span className="text-xs font-semibold group-hover:text-brand-500 transition-colors">Retrait</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={form.enable_delivery} onChange={e => handleChange({ enable_delivery: e.target.checked })} className="w-4 h-4 accent-brand-500" />
                      <span className="text-xs font-semibold group-hover:text-brand-500 transition-colors">Livraison</span>
                    </label>
                 </div>
              </div>
            </div>

            <div>
              <label className="label">Message de bienvenue</label>
              <textarea rows={3} value={form.welcome_message} onChange={(e) => handleChange({ welcome_message: e.target.value })} className="input resize-none text-sm" />
              <p className="text-[10px] text-content-muted mt-1">Placeholder : {'{nom}'}</p>
            </div>
          </div>
        )}
      </div>

      {/* 4. Final Actions */}
      <div className="flex items-center gap-4 sticky bottom-8 bg-white/80 backdrop-blur-xl p-4 rounded-3xl border border-surface-border shadow-2xl animate-in fade-in zoom-in slide-in-from-bottom-8 duration-700">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty || (!form.use_shared_number && (!form.phone_number_id || !form.access_token))}
          className="btn-primary flex-1 h-14 flex items-center justify-center gap-3 font-black uppercase tracking-widest"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={20} />}
          Sauvegarder les changements
        </button>
        {isDirty && (
          <div className="px-4 py-2 bg-badge-warning text-status-warning rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse">
            Non enregistré
          </div>
        )}
      </div>
    </div>
  );
}
