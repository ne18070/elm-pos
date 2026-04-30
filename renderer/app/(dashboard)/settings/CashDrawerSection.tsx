import { useState } from 'react';
import { Archive, Loader2, Save, AlertCircle } from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { loadCashDrawerConfig, saveCashDrawerConfig, openCashDrawer, isElectron, type CashDrawerConfig } from '@/lib/ipc';

export function CashDrawerSection() {
  const { success, error: notifError } = useNotificationStore();
  const [config, setConfig] = useState<CashDrawerConfig>(() => loadCashDrawerConfig());
  const [testing, setTesting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  function handleToggle() {
    const next = { ...config, enabled: !config.enabled };
    setConfig(next);
    saveCashDrawerConfig(next);
    success(next.enabled ? 'Tiroir-caisse activé' : 'Tiroir-caisse désactivé');
  }

  async function handleTest() {
    if (!isElectron) return;
    setTesting(true);
    try {
      const result = await openCashDrawer();
      if (result.success) success('Tiroir ouvert avec succès');
      else notifError(result.error ?? 'Tiroir non répondu - vérifiez la connexion');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-content-secondary leading-relaxed">
        Le tiroir-caisse s&apos;ouvre automatiquement via l&apos;imprimante thermique après chaque paiement en espèces.
      </p>

      {/* Toggle activé/désactivé */}
      <label className="flex items-center justify-between p-4 bg-surface-input border border-surface-border rounded-xl cursor-pointer select-none group transition-all hover:bg-surface-hover">
        <div className="flex items-center gap-3">
          <Archive className={`w-5 h-5 ${config.enabled ? 'text-brand-500' : 'text-content-muted'}`} />
          <span className="text-sm font-bold text-content-primary">Activer le tiroir-caisse</span>
        </div>
        <button
          role="switch"
          aria-checked={config.enabled}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.enabled ? 'bg-brand-600 shadow-lg shadow-brand-900/20' : 'bg-slate-700'
          }`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            config.enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </label>

      {config.enabled && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3 bg-brand-500/5 border border-brand-500/10 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-content-brand shrink-0 mt-0.5" />
            <p className="text-xs text-content-secondary leading-relaxed font-medium">
              La connexion utilise la même configuration que l&apos;imprimante thermique. Assurez-vous que le câble RJ11 du tiroir est branché sur l&apos;imprimante.
            </p>
          </div>
          
          {isElectron ? (
            <button
              onClick={handleTest}
              disabled={testing}
              className="w-full btn-secondary h-11 flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
              {testing ? 'Ouverture…' : 'Tester l\'ouverture'}
            </button>
          ) : (
            <div className="p-3 bg-amber-500/10 border border-status-warning/20 rounded-xl text-center">
              <p className="text-[10px] text-status-warning font-black uppercase tracking-widest">
                Test disponible uniquement sur desktop
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
