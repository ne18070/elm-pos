'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Save, Printer, Wifi, WifiOff, Loader2, Plus, X, Package, Palette, CheckCircle2, XCircle, Network, Archive, ShoppingBag, Utensils, Briefcase, BedDouble, ArrowRight } from 'lucide-react';
import { TemplateManager } from '@/components/settings/TemplateManager';
import { loadPrinterConfig, savePrinterConfig, testPrinterConnection, type PrinterConfig, loadCashDrawerConfig, saveCashDrawerConfig, openCashDrawer, isElectron, type CashDrawerConfig } from '@/lib/ipc';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { flushSyncQueue } from '@/lib/ipc';
import { supabase } from '@/lib/supabase';

const DEFAULT_UNITS = ['pièce', 'kg', 'g', 'litre', 'cl', 'carton', 'sac', 'sachet', 'boîte', 'paquet', 'lot'];

export default function SettingsPage() {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const { isOnline, pending: pendingCount, syncing } = useOfflineSync();
  const [saving, setSaving] = useState(false);
  const [syncing2, setSyncing2] = useState(false);

  const [bizForm, setBizForm] = useState({
    name:           business?.name ?? '',
    address:        business?.address ?? '',
    phone:          business?.phone ?? '',
    tax_rate:       String(business?.tax_rate ?? '0'),
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

  async function handleSaveBusiness() {
    if (!business) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('businesses')
        .update({
          name:           bizForm.name,
          address:        bizForm.address,
          phone:          bizForm.phone,
          tax_rate:       parseFloat(bizForm.tax_rate) || 0,
          currency:       bizForm.currency,
          receipt_footer: bizForm.receipt_footer,
        })
        .eq('id', business.id);

      if (error) throw new Error(error.message);
      success('Paramètres enregistrés');
    } catch (err) {
      notifError(String(err));
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
      notifError(String(err));
    } finally {
      setSavingUnits(false);
    }
  }

  async function handleForceSync() {
    setSyncing2(true);
    try {
      await flushSyncQueue();
      success('Synchronisation effectuée');
    } catch (err) {
      notifError(String(err));
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

        {/* Type d'activité */}
        {(() => {
          const TYPE_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
            retail:     { label: 'Commerce / Boutique',    icon: ShoppingBag },
            restaurant: { label: 'Restaurant / Café',      icon: Utensils    },
            service:    { label: 'Prestation de service',  icon: Briefcase   },
            hotel:      { label: 'Hôtel / Hébergement',    icon: BedDouble   },
          };
          const t = business?.type ? TYPE_LABELS[business.type] : null;
          const Icon = t?.icon;
          return (
            <div className="card p-5 flex items-center gap-4">
              {Icon && (
                <div className="w-10 h-10 rounded-xl bg-brand-900/40 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-brand-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Type d&apos;établissement</p>
                <p className="font-semibold text-white">{t?.label ?? '—'}</p>
                <p className="text-xs text-slate-400 mt-0.5">Détermine les fonctionnalités affichées dans le menu</p>
              </div>
              <Link
                href="/configure"
                className="btn-secondary h-9 px-4 text-sm flex items-center gap-1.5 shrink-0"
              >
                Modifier <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          );
        })()}

        {/* Informations établissement */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            Informations de l&apos;établissement
          </h2>

          <div>
            <label className="label">Nom</label>
            <input
              type="text"
              value={bizForm.name}
              onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })}
              className="input"
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

          <button
            onClick={handleSaveBusiness}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>

        {/* Unités de stock */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" />
            Unités de stock
          </h2>
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
        </div>

        {/* Modèles de facture */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Printer className="w-4 h-4 text-slate-400" />
            Modèles de facture
          </h2>
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
        </div>

        {/* Synchronisation */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-white">Synchronisation & Mode hors ligne</h2>

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
        </div>

        {/* Config imprimante */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Printer className="w-4 h-4 text-slate-400" />
            Imprimante thermique
          </h2>

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
              L&apos;imprimante est détectée automatiquement via USB.
              Assurez-vous que les pilotes ESC/POS sont installés.
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
                <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm ${
                  printerTestResult.connected
                    ? 'bg-green-900/20 border-green-800 text-green-400'
                    : 'bg-red-900/20 border-red-800 text-red-400'
                }`}>
                  {printerTestResult.connected
                    ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                    : <XCircle className="w-4 h-4 shrink-0" />}
                  <span>
                    {printerTestResult.connected
                      ? `Imprimante accessible — latence ${printerTestResult.latency}ms`
                      : `Connexion impossible : ${printerTestResult.error}`}
                  </span>
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
        </div>

        {/* Tiroir-caisse */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Archive className="w-4 h-4 text-slate-400" />
            Tiroir-caisse
          </h2>

          <p className="text-sm text-slate-400">
            Le tiroir-caisse s&apos;ouvre automatiquement via l&apos;imprimante thermique
            (commande ESC/POS) après chaque paiement en espèces.
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
        </div>

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
