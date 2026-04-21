'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Save, Printer, Wifi, WifiOff, Loader2, Plus, X, Package, Palette, CheckCircle2, XCircle, Network, Archive, ShoppingBag, Utensils, Briefcase, BedDouble, ArrowRight, Upload, ImageIcon, MessageCircle, Eye, EyeOff, Copy, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react';
import { TemplateManager } from '@/components/settings/TemplateManager';
import { loadPrinterConfig, savePrinterConfig, testPrinterConnection, type PrinterConfig, loadCashDrawerConfig, saveCashDrawerConfig, openCashDrawer, isElectron, type CashDrawerConfig } from '@/lib/ipc';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { flushSyncQueue } from '@/lib/ipc';
import { supabase } from '@/lib/supabase';
import { canManageSettings, hasRole } from '@/lib/permissions';
import { getWhatsAppConfig, upsertWhatsAppConfig, regenerateVerifyToken, type WhatsAppConfig, type WhatsAppConfigForm } from '@services/supabase/whatsapp';
import { getBusinessTypes, type BusinessTypeRow } from '@services/supabase/business-config';
import * as LucideIcons from 'lucide-react';

const DEFAULT_UNITS = ['pièce', 'kg', 'g', 'litre', 'cl', 'carton', 'sac', 'sachet', 'boîte', 'paquet', 'lot'];

export default function SettingsPage() {
  const { business, user, setBusiness } = useAuthStore();
  const isManagerOrAbove = canManageSettings(user?.role);
  const { success, error: notifError } = useNotificationStore();
  const { isOnline, pending: pendingCount, syncing } = useOfflineSync();
  const [saving, setSaving] = useState(false);
  const [syncing2, setSyncing2] = useState(false);
  const [logoUrl, setLogoUrl] = useState(business?.logo_url ?? '');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [bizForm, setBizForm] = useState({
    name:           business?.name ?? '',
    denomination:   business?.denomination ?? '',
    rib:            business?.rib ?? '',
    address:        business?.address ?? '',
    phone:          business?.phone ?? '',
    tax_rate:       String(business?.tax_rate ?? '0'),
    tax_inclusive:  business?.tax_inclusive ?? false,
    currency:       business?.currency ?? 'XOF',
    receipt_footer: business?.receipt_footer ?? '',
  });

  // Unités de stock
  const [stockUnits, setStockUnits] = useState<string[]>(
    business?.stock_units ?? DEFAULT_UNITS
  );
  const [newUnit, setNewUnit]       = useState('');
  const [savingUnits, setSavingUnits] = useState(false);

  const [showTemplateManager, setShowTemplateManager] = useState(false);

  // Types d'établissement dynamiques
  const [allTypes, setAllTypes] = useState<BusinessTypeRow[]>([]);
  useEffect(() => {
    getBusinessTypes().then(setAllTypes).catch(() => {});
  }, []);

  function getIcon(name: string): React.ComponentType<{ className?: string }> {
    return (LucideIcons as Record<string, unknown>)[name] as React.ComponentType<{ className?: string }>
      ?? LucideIcons.Package;
  }

  // WhatsApp Business
  const isAdmin = hasRole(user?.role, 'admin');
  const [waConfig, setWaConfig]       = useState<WhatsAppConfig | null>(null);
  const [waLoaded, setWaLoaded]       = useState(false);
  const [waForm, setWaForm]           = useState<WhatsAppConfigForm>({
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
  const [showToken, setShowToken]       = useState(false);
  const [savingWa, setSavingWa]         = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState(false);

  // Sections repliables
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    etablissement: true,
    stock:         false,
    facture:       false,
    sync:          false,
    printer:       false,
    drawer:        false,
    whatsapp:      false,
  });
  function toggleSection(key: string) {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  }

  // Config tiroir-caisse
  const [drawerConfig, setDrawerConfig] = useState<CashDrawerConfig>(() => loadCashDrawerConfig());
  const [testingDrawer, setTestingDrawer] = useState(false);

  function handleSaveDrawerConfig(cfg: CashDrawerConfig) {
    saveCashDrawerConfig(cfg);
    setDrawerConfig(cfg);
    success('Configuration tiroir enregistrée');
  }

  async function handleTestDrawer() {
    setTestingDrawer(true);
    try {
      const result = await openCashDrawer();
      if (result.success) success('Tiroir ouvert avec succès');
      else notifError(result.error ?? 'Tiroir non répondu — vérifiez la connexion');
    } finally {
      setTestingDrawer(false);
    }
  }

  // Config imprimante réseau
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() => loadPrinterConfig());
  const [testingPrinter, setTestingPrinter]   = useState(false);
  const [printerTestResult, setPrinterTestResult] = useState<{ connected: boolean; latency?: number; error?: string } | null>(null);

  function handleSavePrinterConfig() {
    savePrinterConfig(printerConfig);
    success('Configuration imprimante enregistrée');
  }

  async function handleTestPrinter() {
    if (!printerConfig.ip) { notifError('Entrez une adresse IP'); return; }
    setTestingPrinter(true);
    setPrinterTestResult(null);
    try {
      const result = await testPrinterConnection(printerConfig.ip, printerConfig.port);
      setPrinterTestResult(result);
    } finally {
      setTestingPrinter(false);
    }
  }

  async function handleUploadLogo(file: File) {
    if (!business) return;
    setUploadingLogo(true);
    try {
      const ext  = file.name.split('.').pop() ?? 'png';
      const path = `${business.id}/logo.${ext}`;
      const { error: upErr } = await (supabase as any).storage
        .from('business-logos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = (supabase as any).storage.from('business-logos').getPublicUrl(path);
      const url = urlData.publicUrl as string;
      const { error: dbErr } = await (supabase as any)
        .from('businesses').update({ logo_url: url }).eq('id', business.id);
      if (dbErr) throw new Error(dbErr.message);
      setLogoUrl(url);
      if (business) setBusiness({ ...business, logo_url: url });
      success('Logo enregistré');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSaveBusiness() {
    if (!business) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('businesses')
        .update({
          name:           bizForm.name,
          denomination:   bizForm.denomination,
          rib:            bizForm.rib,
          address:        bizForm.address,
          phone:          bizForm.phone,
          tax_rate:       parseFloat(bizForm.tax_rate) || 0,
          tax_inclusive:  bizForm.tax_inclusive,
          currency:       bizForm.currency,
          receipt_footer: bizForm.receipt_footer,
        })
        .eq('id', business.id);

      if (error) throw new Error(error.message);
      setBusiness({
        ...business,
        name:           bizForm.name,
        denomination:   bizForm.denomination,
        rib:            bizForm.rib,
        address:        bizForm.address,
        phone:          bizForm.phone,
        tax_rate:       parseFloat(bizForm.tax_rate) || 0,
        tax_inclusive:  bizForm.tax_inclusive,
        currency:       bizForm.currency,
        receipt_footer: bizForm.receipt_footer,
      });
      success('Paramètres enregistrés');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  function addUnit() {
    const u = newUnit.trim().toLowerCase();
    if (!u || stockUnits.includes(u)) { setNewUnit(''); return; }
    setStockUnits((prev) => [...prev, u]);
    setNewUnit('');
  }

  function removeUnit(unit: string) {
    setStockUnits((prev) => prev.filter((u) => u !== unit));
  }

  async function handleSaveUnits() {
    if (!business) return;
    setSavingUnits(true);
    try {
      const { error } = await supabase
        .from('businesses')
        .update({ stock_units: stockUnits })
        .eq('id', business.id);
      if (error) throw new Error(error.message);
      success('Unités enregistrées');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSavingUnits(false);
    }
  }

  useEffect(() => {
    if (!business?.id || !isAdmin || waLoaded) return;
    getWhatsAppConfig(business.id).then((cfg) => {
      if (cfg) {
        setWaConfig(cfg);
        setWaForm({
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
      setWaLoaded(true);
    }).catch(() => setWaLoaded(true));
  }, [business?.id, isAdmin, waLoaded]);

  async function handleRegenerateVerifyToken() {
    if (!waConfig?.id) return;
    setRegeneratingToken(true);
    try {
      const newToken = await regenerateVerifyToken(waConfig.id);
      setWaConfig((prev) => prev ? { ...prev, verify_token: newToken } : prev);
      success('Nouveau token généré — reconfigurez le webhook dans Meta Dashboard');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setRegeneratingToken(false);
    }
  }

  async function handleSaveWaConfig() {
    if (!business?.id) return;
    setSavingWa(true);
    try {
      const saved = await upsertWhatsAppConfig(business.id, waForm);
      setWaConfig(saved);
      success('Configuration WhatsApp enregistrée');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSavingWa(false);
    }
  }

  async function handleForceSync() {
    setSyncing2(true);
    try {
      await flushSyncQueue();
      success('Synchronisation effectuée');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSyncing2(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-surface-border">
        <h1 className="text-xl font-bold text-white">Paramètres</h1>
      </div>

      <div className="p-6 space-y-6 max-w-2xl">

        {/* Type d'activité — manager+ seulement */}
        {isManagerOrAbove && (() => {
          const businessTypes: string[] = business?.types?.length
            ? business.types
            : business?.type ? [business.type as string] : [];
          
          const selectedTypes = allTypes.filter((t) => businessTypes.includes(t.id));

          return (
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Type d&apos;établissement</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedTypes.length > 0 ? selectedTypes.map(t => {
                      const Icon = getIcon(t.icon);
                      return (
                        <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-900/30 border border-brand-800/50">
                          <Icon className="w-3.5 h-3.5 text-brand-400" />
                          <span className="text-sm font-semibold text-white">{t.label}</span>
                        </div>
                      );
                    }) : <p className="text-sm text-slate-400 font-medium italic">Aucun type défini</p>}
                  </div>
                  <p className="text-xs text-slate-500 mt-3">Détermine les fonctionnalités disponibles dans votre espace de travail.</p>
                </div>
                <Link
                  href="/configure"
                  className="btn-secondary h-9 px-4 text-sm flex items-center gap-1.5 shrink-0"
                >
                  Configurer <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })()}

        {/* Informations établissement — manager+ seulement */}
        {isManagerOrAbove && (
        <div className="card overflow-hidden">
          <button onClick={() => toggleSection('etablissement')} className="w-full flex items-center justify-between p-5">
            <h2 className="font-semibold text-white flex items-center gap-2">
              Informations de l&apos;établissement
            </h2>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openSections.etablissement ? 'rotate-180' : ''}`} />
          </button>
          {openSections.etablissement && <div className="px-5 pb-5 space-y-4 border-t border-surface-border pt-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nom commercial</label>
              <input
                type="text"
                value={bizForm.name}
                onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Dénomination sociale</label>
              <input
                type="text"
                value={bizForm.denomination}
                onChange={(e) => setBizForm({ ...bizForm, denomination: e.target.value })}
                className="input"
                placeholder="Ex: SARL Le Gourmet"
              />
            </div>
          </div>

          <div>
            <label className="label">RIB / Coordonnées bancaires</label>
            <textarea
              value={bizForm.rib}
              onChange={(e) => setBizForm({ ...bizForm, rib: e.target.value })}
              className="input min-h-[80px] py-3"
              placeholder="Saisir votre RIB..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Téléphone</label>
              <input
                type="tel"
                value={bizForm.phone}
                onChange={(e) => setBizForm({ ...bizForm, phone: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Devise</label>
              <select
                value={bizForm.currency}
                onChange={(e) => setBizForm({ ...bizForm, currency: e.target.value })}
                className="input"
              >
                <option value="XOF">XOF — Franc CFA</option>
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — Dollar</option>
                <option value="GBP">GBP — Livre sterling</option>
                <option value="MAD">MAD — Dirham marocain</option>
                <option value="DZD">DZD — Dinar algérien</option>
                <option value="TND">TND — Dinar tunisien</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Adresse</label>
            <input
              type="text"
              value={bizForm.address}
              onChange={(e) => setBizForm({ ...bizForm, address: e.target.value })}
              className="input"
            />
          </div>

          <div>
            <label className="label">TVA (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={bizForm.tax_rate}
              onChange={(e) => setBizForm({ ...bizForm, tax_rate: e.target.value })}
              className="input"
            />
            {parseFloat(bizForm.tax_rate) > 0 && (
              <button
                type="button"
                onClick={() => setBizForm({ ...bizForm, tax_inclusive: !bizForm.tax_inclusive })}
                className="mt-2 flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                {bizForm.tax_inclusive
                  ? <ToggleRight className="w-5 h-5 text-brand-400" />
                  : <ToggleLeft  className="w-5 h-5 text-slate-500" />}
                <span>
                  TVA incluse dans les prix
                  <span className="ml-1 text-xs text-slate-500">
                    ({bizForm.tax_inclusive ? 'prix TTC saisis — TVA déduite' : 'prix HT saisis — TVA ajoutée'})
                  </span>
                </span>
              </button>
            )}
          </div>

          <div>
            <label className="label">Message pied de reçu</label>
            <textarea
              value={bizForm.receipt_footer}
              onChange={(e) => setBizForm({ ...bizForm, receipt_footer: e.target.value })}
              className="input resize-none"
              rows={2}
              placeholder="Merci de votre visite !"
            />
          </div>

          {/* Logo établissement */}
          <div>
            <label className="label flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" />Logo de l&apos;établissement</label>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="w-16 h-16 rounded-xl object-cover border border-surface-border" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-surface-input border border-surface-border flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-slate-500" />
                </div>
              )}
              <label className="btn-secondary h-9 px-4 text-sm flex items-center gap-2 cursor-pointer">
                {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadingLogo ? 'Chargement…' : 'Choisir un fichier'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploadingLogo}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadLogo(f); }}
                />
              </label>
              {logoUrl && (
                <button
                  onClick={async () => {
                    if (!business) return;
                    await (supabase as any).from('businesses').update({ logo_url: null }).eq('id', business.id);
                    setLogoUrl('');
                    success('Logo supprimé');
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleSaveBusiness}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          </div>}
        </div>
        )}

        {/* Unités de stock — manager+ seulement */}
        {isManagerOrAbove && (
        <div className="card overflow-hidden">
          <button onClick={() => toggleSection('stock')} className="w-full flex items-center justify-between p-5">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-slate-400" />
              Unités de stock
            </h2>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openSections.stock ? 'rotate-180' : ''}`} />
          </button>
          {openSections.stock && <div className="px-5 pb-5 space-y-4 border-t border-surface-border pt-4">
          <p className="text-xs text-slate-500">
            Ces unités seront disponibles en liste déroulante lors de la création de produits.
          </p>

          {/* Liste des unités existantes */}
          <div className="flex flex-wrap gap-2">
            {stockUnits.map((unit) => (
              <span
                key={unit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-input
                           border border-surface-border rounded-lg text-sm text-slate-300"
              >
                {unit}
                <button
                  onClick={() => removeUnit(unit)}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          {/* Ajouter une nouvelle unité */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addUnit()}
              placeholder="Nouvelle unité (ex: bouteille)"
              className="input flex-1"
            />
            <button onClick={addUnit} className="btn-secondary px-3">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleSaveUnits}
            disabled={savingUnits}
            className="btn-primary flex items-center gap-2"
          >
            {savingUnits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingUnits ? 'Enregistrement...' : 'Enregistrer les unités'}
          </button>
          </div>}
        </div>
        )}

        {/* Modèles de facture — manager+ seulement */}
        {isManagerOrAbove && (
        <div className="card overflow-hidden">
          <button onClick={() => toggleSection('facture')} className="w-full flex items-center justify-between p-5">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-slate-400" />
              Modèles de facture
            </h2>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openSections.facture ? 'rotate-180' : ''}`} />
          </button>
          {openSections.facture && <div className="px-5 pb-5 space-y-4 border-t border-surface-border pt-4">
          <p className="text-xs text-slate-500">
            Créez et personnalisez vos modèles d&apos;impression : format, couleurs, champs affichés, duplicata…
          </p>
          <button onClick={() => setShowTemplateManager(true)} className="btn-secondary flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Gérer les modèles
          </button>
          {showTemplateManager && (
            <TemplateManager businessId={business?.id ?? ''} onClose={() => setShowTemplateManager(false)} />
          )}
          </div>}
        </div>
        )}

        {/* Synchronisation */}
        <div className="card overflow-hidden">
          <button onClick={() => toggleSection('sync')} className="w-full flex items-center justify-between p-5">
            <h2 className="font-semibold text-white">Synchronisation & Mode hors ligne</h2>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openSections.sync ? 'rotate-180' : ''}`} />
          </button>
          {openSections.sync && <div className="px-5 pb-5 space-y-4 border-t border-surface-border pt-4">
          <div className={`flex items-center gap-3 p-3 rounded-xl ${
            isOnline ? 'bg-green-900/20 border border-green-800' : 'bg-yellow-900/20 border border-yellow-800'
          }`}>
            {isOnline
              ? <Wifi className="w-5 h-5 text-green-400" />
              : <WifiOff className="w-5 h-5 text-yellow-400" />}
            <div>
              <p className={`text-sm font-medium ${isOnline ? 'text-green-400' : 'text-yellow-400'}`}>
                {isOnline ? 'Connecté à Internet' : 'Mode hors ligne'}
              </p>
              {pendingCount > 0 && (
                <p className="text-xs text-slate-400">
                  {pendingCount} opération(s) en attente de synchronisation
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleForceSync}
            disabled={syncing2 || syncing || !isOnline}
            className="btn-secondary flex items-center gap-2"
          >
            {syncing2 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {syncing2 ? 'Synchronisation...' : 'Synchroniser maintenant'}
          </button>
          </div>}
        </div>

        {/* Config imprimante */}
        <div className="card overflow-hidden">
          <button onClick={() => toggleSection('printer')} className="w-full flex items-center justify-between p-5">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-slate-400" />
              Imprimante thermique
            </h2>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openSections.printer ? 'rotate-180' : ''}`} />
          </button>
          {openSections.printer && <div className="px-5 pb-5 space-y-4 border-t border-surface-border pt-4">
          {/* Mode de connexion */}
          <div>
            <label className="label">Mode de connexion</label>
            <div className="flex gap-2 mt-1">
              {(['usb', 'network'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => { setPrinterConfig({ ...printerConfig, type }); setPrinterTestResult(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    printerConfig.type === type
                      ? 'border-brand-600 bg-brand-600/10 text-white'
                      : 'border-surface-border text-slate-400 hover:border-slate-600 hover:bg-surface-hover'
                  }`}
                >
                  {type === 'usb'
                    ? <><Printer className="w-4 h-4" /> USB</>
                    : <><Network className="w-4 h-4" /> Réseau TCP/IP</>}
                </button>
              ))}
            </div>
          </div>

          {/* USB */}
          {printerConfig.type === 'usb' && (
            <p className="text-sm text-slate-400">
              L&apos;imprimante est détectée automatiquement.
              Vérifiez qu&apos;elle est bien branchée et allumée.
            </p>
          )}

          {/* Réseau */}
          {printerConfig.type === 'network' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="label">Adresse IP</label>
                  <input
                    type="text"
                    placeholder="192.168.1.100"
                    value={printerConfig.ip}
                    onChange={(e) => { setPrinterConfig({ ...printerConfig, ip: e.target.value }); setPrinterTestResult(null); }}
                    className="input font-mono"
                  />
                </div>
                <div>
                  <label className="label">Port</label>
                  <input
                    type="number"
                    value={printerConfig.port}
                    onChange={(e) => setPrinterConfig({ ...printerConfig, port: parseInt(e.target.value) || 9100 })}
                    className="input font-mono"
                    min={1}
                    max={65535}
                  />
                </div>
              </div>

              <button
                onClick={handleTestPrinter}
                disabled={testingPrinter || !printerConfig.ip}
                className="btn-secondary flex items-center gap-2"
              >
                {testingPrinter
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Wifi className="w-4 h-4" />}
                {testingPrinter ? 'Test en cours…' : 'Tester la connexion'}
              </button>

              {printerTestResult && (
                <div className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${
                  printerTestResult.connected
                    ? 'bg-green-900/20 border-green-800 text-green-400'
                    : 'bg-red-900/20 border-red-800 text-red-400'
                }`}>
                  {printerTestResult.connected
                    ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <div>
                    <p>
                      {printerTestResult.connected
                        ? `Imprimante joignable — latence ${printerTestResult.latency} ms`
                        : `Impossible de joindre l'imprimante${printerTestResult.error ? ` (${printerTestResult.error})` : ''}`}
                    </p>
                    {!isElectron && (
                      <p className="text-xs opacity-70 mt-0.5">
                        L&apos;impression directe est disponible uniquement dans l&apos;application de bureau.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSavePrinterConfig}
            className="btn-primary flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Enregistrer
          </button>
          </div>}
        </div>

        {/* Tiroir-caisse */}
        <div className="card overflow-hidden">
          <button onClick={() => toggleSection('drawer')} className="w-full flex items-center justify-between p-5">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Archive className="w-4 h-4 text-slate-400" />
              Tiroir-caisse
            </h2>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openSections.drawer ? 'rotate-180' : ''}`} />
          </button>
          {openSections.drawer && <div className="px-5 pb-5 space-y-4 border-t border-surface-border pt-4">
          <p className="text-sm text-slate-400">
            Le tiroir-caisse s&apos;ouvre automatiquement via l&apos;imprimante thermique
            après chaque paiement en espèces.
          </p>

          {/* Toggle activé/désactivé */}
          <label className="flex items-center justify-between cursor-pointer select-none">
            <span className="text-sm text-slate-300">Activer le tiroir-caisse</span>
            <button
              role="switch"
              aria-checked={drawerConfig.enabled}
              onClick={() => handleSaveDrawerConfig({ ...drawerConfig, enabled: !drawerConfig.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                drawerConfig.enabled ? 'bg-brand-600' : 'bg-slate-700'
              }`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                drawerConfig.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </label>

          {drawerConfig.enabled && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                La connexion utilise la même configuration que l&apos;imprimante thermique ci-dessus.
                Assurez-vous que le câble RJ11 du tiroir est branché sur l&apos;imprimante.
              </p>
              {isElectron ? (
                <button
                  onClick={handleTestDrawer}
                  disabled={testingDrawer}
                  className="btn-secondary flex items-center gap-2"
                >
                  {testingDrawer
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Archive className="w-4 h-4" />}
                  {testingDrawer ? 'Ouverture…' : 'Tester le tiroir'}
                </button>
              ) : (
                <p className="text-xs text-amber-400">
                  Test disponible uniquement dans l&apos;application Electron.
                </p>
              )}
            </div>
          )}
          </div>}
        </div>

        {/* WhatsApp Business — admin/owner uniquement */}
        {isAdmin && (
          <div className="card overflow-hidden">
            <button onClick={() => toggleSection('whatsapp')} className="w-full flex items-center justify-between p-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-green-900/40 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-green-400" />
                </div>
                <h2 className="font-semibold text-white">WhatsApp Business</h2>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openSections.whatsapp ? 'rotate-180' : ''}`} />
            </button>
            {openSections.whatsapp && <div className="px-5 pb-5 space-y-4 border-t border-surface-border pt-4">
            {!waLoaded ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />Chargement…
              </div>
            ) : (
              <div className="space-y-4">
                {/* Statut */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-input border border-surface-border">
                  <div>
                    <p className="text-sm font-medium text-white">Intégration active</p>
                    <p className="text-xs text-slate-400">Activez pour recevoir et répondre aux messages</p>
                  </div>
                  <button
                    onClick={() => setWaForm((f) => ({ ...f, is_active: !f.is_active }))}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    {waForm.is_active
                      ? <ToggleRight className="w-7 h-7 text-green-400" />
                      : <ToggleLeft className="w-7 h-7" />}
                  </button>
                </div>

                {/* Champs */}
                <div className="space-y-3">
                  <div>
                    <label className="label">Phone Number ID <span className="text-slate-500">(Meta Dashboard)</span></label>
                    <input
                      type="text"
                      placeholder="123456789012345"
                      value={waForm.phone_number_id}
                      onChange={(e) => setWaForm((f) => ({ ...f, phone_number_id: e.target.value }))}
                      className="input font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="label">
                      Access Token permanent
                      <span className="text-slate-500 font-normal"> — obtenu depuis Meta Developer Dashboard</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder="EAAxxxxxxxx…"
                        value={waForm.access_token}
                        onChange={(e) => setWaForm((f) => ({ ...f, access_token: e.target.value }))}
                        className="input font-mono text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((s) => !s)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Ce token vient de Meta : <span className="text-slate-400">developers.facebook.com → votre App → WhatsApp → Paramètres → Token d&apos;accès permanent</span>
                    </p>
                  </div>

                  <div>
                    <label className="label">Numéro affiché <span className="text-slate-500">(ex: +221 77 000 0000)</span></label>
                    <input
                      type="tel"
                      placeholder="+221 77 000 0000"
                      value={waForm.display_phone ?? ''}
                      onChange={(e) => setWaForm((f) => ({ ...f, display_phone: e.target.value }))}
                      className="input"
                    />
                  </div>
                </div>

                {/* Verify token — généré par l'app, à coller dans Meta */}
                {waConfig?.verify_token && (
                  <div>
                    <label className="label">
                      Verify Token
                      <span className="text-slate-500 font-normal"> — généré par ELM APP, à coller dans Meta</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={waConfig.verify_token}
                        className="input font-mono text-sm bg-surface-input flex-1 cursor-default select-all"
                      />
                      <button
                        onClick={() => { navigator.clipboard.writeText(waConfig.verify_token); success('Token copié !'); }}
                        className="btn-secondary h-10 px-3 shrink-0"
                        title="Copier"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleRegenerateVerifyToken}
                        disabled={regeneratingToken}
                        className="btn-secondary h-10 px-3 shrink-0 text-xs whitespace-nowrap"
                        title="Régénérer un nouveau token"
                      >
                        {regeneratingToken
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : 'Régénérer'}
                      </button>
                    </div>
                    <p className="text-xs text-amber-500/80 mt-1">
                      ⚠ Régénérer invalide l&apos;ancien token — vous devrez reconfigurer le webhook dans Meta.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      URL du webhook :{' '}
                      <span className="font-mono text-slate-400 select-all">
                        [URL Supabase]/functions/v1/whatsapp-webhook
                      </span>
                    </p>
                  </div>
                )}

                {/* Catalogue interactif */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-input border border-surface-border">
                  <div>
                    <p className="text-sm font-medium text-white">Catalogue interactif</p>
                    <p className="text-xs text-slate-400">Les clients peuvent commander via un menu WhatsApp cliquable</p>
                  </div>
                  <button
                    onClick={() => setWaForm((f) => ({ ...f, catalog_enabled: !f.catalog_enabled }))}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    {waForm.catalog_enabled
                      ? <ToggleRight className="w-7 h-7 text-brand-400" />
                      : <ToggleLeft className="w-7 h-7" />}
                  </button>
                </div>

                {/* Message de bienvenue */}
                {waForm.catalog_enabled && (
                  <div className="space-y-3">
                  <div>
                    <label className="label">Mot-clé pour afficher le menu</label>
                    <input
                      type="text"
                      placeholder="menu"
                      value={waForm.menu_keyword}
                      onChange={(e) => {
                        const newKeyword = e.target.value.toLowerCase().trim() || 'menu';
                        setWaForm((f) => ({
                          ...f,
                          menu_keyword:    newKeyword,
                          welcome_message: f.welcome_message.replace(
                            /\*[^*]+\*/g,
                            (match) => match.toLowerCase().includes(f.menu_keyword.toLowerCase())
                              ? `*${newKeyword}*`
                              : match,
                          ),
                        }));
                      }}
                      className="input font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Le client envoie ce mot pour voir le catalogue. Par défaut : <span className="font-mono text-slate-400">menu</span>
                    </p>
                  </div>
                  <div>
                    <label className="label">Message de bienvenue</label>
                    <textarea
                      rows={3}
                      value={waForm.welcome_message}
                      onChange={(e) => setWaForm((f) => ({ ...f, welcome_message: e.target.value }))}
                      className="input resize-none text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Utilisez <span className="font-mono text-slate-400">{'{nom}'}</span> pour le nom de l&apos;établissement.
                    </p>
                  </div>
                  <div>
                    <label className="label">Message de confirmation de commande</label>
                    <textarea
                      rows={5}
                      value={waForm.confirm_message}
                      onChange={(e) => setWaForm((f) => ({ ...f, confirm_message: e.target.value }))}
                      className="input resize-none text-sm font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Envoyé automatiquement quand le client tape <span className="font-mono text-slate-400">confirmer</span>.
                      Placeholders : <span className="font-mono text-slate-400">{'{nom}'}</span> → nom de l&apos;établissement,{' '}
                      <span className="font-mono text-slate-400">{'{mot_cle}'}</span> → mot-clé du menu.
                    </p>
                  </div>
                  <div>
                    <label className="label">Lien de paiement Wave <span className="text-slate-500 font-normal">(optionnel)</span></label>
                    <input
                      type="url"
                      value={waForm.wave_payment_url ?? ''}
                      onChange={(e) => setWaForm((f) => ({ ...f, wave_payment_url: e.target.value || null }))}
                      placeholder="https://pay.wave.com/m/M_xxx/c/sn/?"
                      className="input text-sm font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      URL de base Wave du marchand (se termine par <span className="font-mono text-slate-400">?</span>).
                      Le montant sera ajouté automatiquement à la validation de chaque commande.
                    </p>
                  </div>

                  {/* Options de livraison */}
                  <div className="border border-slate-700 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-300">Options de commande</h4>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-300">Retrait sur place</p>
                        <p className="text-xs text-slate-500">Le client peut venir chercher sa commande</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWaForm((f) => ({ ...f, enable_pickup: !f.enable_pickup }))}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        {waForm.enable_pickup
                          ? <ToggleRight className="w-7 h-7 text-green-400" />
                          : <ToggleLeft className="w-7 h-7" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-300">Livraison à domicile</p>
                        <p className="text-xs text-slate-500">Le client partage son adresse ou sa localisation</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWaForm((f) => ({ ...f, enable_delivery: !f.enable_delivery }))}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        {waForm.enable_delivery
                          ? <ToggleRight className="w-7 h-7 text-green-400" />
                          : <ToggleLeft className="w-7 h-7" />}
                      </button>
                    </div>

                  </div>

                  {/* Messages B2C personnalisables */}
                  <div className="border border-slate-700 rounded-lg p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-slate-300">Messages automatiques</h4>
                    <p className="text-xs text-slate-500">
                      Placeholders : <span className="font-mono text-slate-400">{'{nom}'}</span> → établissement,{' '}
                      <span className="font-mono text-slate-400">{'{mot_cle}'}</span> → mot-clé menu,{' '}
                      <span className="font-mono text-slate-400">{'{commande}'}</span> → n° commande,{' '}
                      <span className="font-mono text-slate-400">{'{total}'}</span> → montant.
                    </p>

                    <div>
                      <label className="label">Pied de panier</label>
                      <textarea
                        rows={2}
                        value={waForm.msg_cart_footer}
                        onChange={(e) => setWaForm((f) => ({ ...f, msg_cart_footer: e.target.value }))}
                        className="input resize-none text-sm font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-1">Affiché sous le récapitulatif du panier.</p>
                    </div>

                    <div>
                      <label className="label">Question mode de livraison</label>
                      <textarea
                        rows={2}
                        value={waForm.msg_shipping_question}
                        onChange={(e) => setWaForm((f) => ({ ...f, msg_shipping_question: e.target.value }))}
                        className="input resize-none text-sm font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-1">Demande au client de choisir retrait ou livraison.</p>
                    </div>

                    <div>
                      <label className="label">Demande d&apos;adresse</label>
                      <textarea
                        rows={3}
                        value={waForm.msg_address_request}
                        onChange={(e) => setWaForm((f) => ({ ...f, msg_address_request: e.target.value }))}
                        className="input resize-none text-sm font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-1">Envoyé quand le client choisit la livraison à domicile.</p>
                    </div>

                    <div>
                      <label className="label">Confirmation de livraison au client</label>
                      <textarea
                        rows={4}
                        value={waForm.msg_delivery_confirmation}
                        onChange={(e) => setWaForm((f) => ({ ...f, msg_delivery_confirmation: e.target.value }))}
                        className="input resize-none text-sm font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Envoyé au client quand la commande est marquée livrée.
                        Utilisez <span className="font-mono text-slate-400">{'{commande}'}</span> et <span className="font-mono text-slate-400">{'{total}'}</span>.
                      </p>
                    </div>
                  </div>
                  </div>
                )}

                <button
                  onClick={handleSaveWaConfig}
                  disabled={savingWa || !waForm.phone_number_id || !waForm.access_token}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {savingWa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingWa ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            )}
            </div>}
          </div>
        )}

        {/* Compte utilisateur */}
        <div className="card p-5 space-y-2">
          <h2 className="font-semibold text-white">Compte</h2>
          <p className="text-sm text-slate-400">{user?.full_name}</p>
          <p className="text-xs text-slate-500">{user?.email}</p>
          <p className="text-xs text-slate-500 capitalize">Rôle : {user?.role}</p>
        </div>
      </div>
    </div>
  );
}
