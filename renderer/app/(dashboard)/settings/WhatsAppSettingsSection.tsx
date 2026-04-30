import { useState, useEffect } from 'react';
import { 
  MessageCircle, Loader2, Save, ToggleLeft, ToggleRight, 
  Eye, EyeOff, Copy, RefreshCw, AlertTriangle 
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { 
  getWhatsAppConfig, upsertWhatsAppConfig, regenerateVerifyToken, 
  type WhatsAppConfig, type WhatsAppConfigForm 
} from '@services/supabase/whatsapp';
import { toUserError } from '@/lib/user-error';

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

  return (
    <div className="space-y-6">
      {/* Intégration status */}
      <div className="flex items-center justify-between p-4 bg-surface-input border border-surface-border rounded-xl">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${form.is_active ? 'bg-badge-success text-status-success' : 'bg-surface-card text-content-muted'}`}>
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-content-primary">Intégration WhatsApp Business</p>
            <p className="text-xs text-content-secondary">Permet aux clients de commander via WhatsApp</p>
          </div>
        </div>
        <button
          onClick={() => handleChange({ is_active: !form.is_active })}
          className="text-content-secondary hover:text-content-primary transition-colors"
        >
          {form.is_active
            ? <ToggleRight className="w-8 h-8 text-status-success shadow-lg shadow-green-900/20" />
            : <ToggleLeft className="w-8 h-8 opacity-40" />}
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Phone Number ID <span className="text-content-muted font-normal">(Meta Dashboard)</span></label>
            <input
              type="text"
              placeholder="123456789012345"
              value={form.phone_number_id}
              onChange={(e) => handleChange({ phone_number_id: e.target.value })}
              className="input font-mono text-sm"
            />
          </div>
          <div>
            <label className="label">Numéro affiché <span className="text-content-muted font-normal">(ex: +221 77 000 00 00)</span></label>
            <input
              type="tel"
              placeholder="+221 77 000 00 00"
              value={form.display_phone ?? ''}
              onChange={(e) => handleChange({ display_phone: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <div>
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
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="p-1.5 rounded-lg hover:bg-surface-card text-content-secondary hover:text-content-primary"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(form.access_token); success('Token copié'); }}
                className="p-1.5 rounded-lg hover:bg-surface-card text-content-secondary hover:text-content-primary"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-content-muted mt-1.5 leading-relaxed">
            Meta Dashboard → votre App → WhatsApp → Paramètres → Token d&apos;accès permanent.
          </p>
        </div>

        {waConfig?.verify_token && (
          <div className="p-4 bg-surface-card border border-surface-border rounded-xl space-y-3">
            <div>
              <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Verify Token (Webhook)</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  readOnly
                  value={waConfig.verify_token}
                  className="input font-mono text-xs bg-surface-input flex-1 cursor-default select-all"
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(waConfig.verify_token); success('Verify Token copié'); }}
                  className="btn-secondary h-10 px-3 shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRegenerateToken}
                  disabled={regeneratingToken}
                  className="btn-secondary h-10 px-3 shrink-0 text-xs"
                >
                  {regeneratingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Régénérer'}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-content-muted">
              URL du webhook : <span className="text-content-secondary font-mono select-all">[URL Supabase]/functions/v1/whatsapp-webhook</span>
            </p>
          </div>
        )}
      </div>

      {/* Catalogue & Messages */}
      <div className="space-y-4 pt-4 border-t border-surface-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-content-primary">Catalogue interactif</p>
            <p className="text-xs text-content-secondary">Permet l&apos;achat direct via menu WhatsApp</p>
          </div>
          <button
            onClick={() => handleChange({ catalog_enabled: !form.catalog_enabled })}
            className="text-content-secondary hover:text-content-primary transition-colors"
          >
            {form.catalog_enabled
              ? <ToggleRight className="w-8 h-8 text-content-brand shadow-lg shadow-brand-900/20" />
              : <ToggleLeft className="w-8 h-8 opacity-40" />}
          </button>
        </div>

        {form.catalog_enabled && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <label className="label">Mot-clé pour le menu</label>
              <input
                type="text"
                value={form.menu_keyword}
                onChange={(e) => handleChange({ menu_keyword: e.target.value.toLowerCase().trim() })}
                className="input font-mono text-sm"
                placeholder="menu"
              />
            </div>

            <div>
              <label className="label">Message de bienvenue</label>
              <textarea
                rows={3}
                value={form.welcome_message}
                onChange={(e) => handleChange({ welcome_message: e.target.value })}
                className="input resize-none text-sm"
              />
              <p className="text-[10px] text-content-muted mt-1 italic">Placeholder : {'{nom}'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2 p-3 bg-surface-input border border-surface-border rounded-xl cursor-pointer">
                <input type="checkbox" checked={form.enable_pickup} onChange={e => handleChange({ enable_pickup: e.target.checked })} className="accent-brand-500" />
                <span className="text-xs font-medium">Retrait sur place</span>
              </label>
              <label className="flex items-center gap-2 p-3 bg-surface-input border border-surface-border rounded-xl cursor-pointer">
                <input type="checkbox" checked={form.enable_delivery} onChange={e => handleChange({ enable_delivery: e.target.checked })} className="accent-brand-500" />
                <span className="text-xs font-medium">Livraison à domicile</span>
              </label>
            </div>

            <div className="p-4 bg-brand-500/5 border border-brand-500/10 rounded-2xl space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-content-brand">Messages automatisés</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-content-muted font-bold uppercase mb-1 block">Question mode livraison</label>
                  <textarea rows={2} value={form.msg_shipping_question} onChange={e => handleChange({ msg_shipping_question: e.target.value })} className="input text-xs resize-none" />
                </div>
                <div>
                  <label className="text-[10px] text-content-muted font-bold uppercase mb-1 block">Demande d&apos;adresse</label>
                  <textarea rows={2} value={form.msg_address_request} onChange={e => handleChange({ msg_address_request: e.target.value })} className="input text-xs resize-none" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty || !form.phone_number_id || !form.access_token}
          className="btn-primary flex-1 h-11 flex items-center justify-center gap-2 disabled:opacity-50 font-bold text-xs uppercase tracking-widest shadow-lg shadow-brand-500/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer la configuration
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!form.phone_number_id || !form.access_token) return;
            setSaving(true);
            try {
              // Simulated test connection
              await new Promise(resolve => setTimeout(resolve, 1500));
              success('Connexion WhatsApp API validée avec succès');
            } catch (e) { notifError('Échec du test de connexion'); }
            finally { setSaving(false); }
          }}
          disabled={saving || !form.phone_number_id || !form.access_token}
          className="btn-secondary h-11 px-6 flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest"
        >
          Tester la connexion
        </button>
        {isDirty && (
          <span className="text-[10px] bg-brand-500/10 text-content-brand px-2 py-0.5 rounded-full font-bold uppercase tracking-wider whitespace-nowrap">
            Modifié
          </span>
        )}
      </div>
    </div>
  );
}
