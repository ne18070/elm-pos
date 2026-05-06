'use client';

import { useState } from 'react';
import { Plus, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import type { Account } from '@services/supabase/accounting';
import { CLASS_LABELS } from './accounting-constants';

interface Props {
  accounts: Account[];
  businessId: string;
  onRefresh: () => void;
}

export function SettingsTab({ accounts, businessId, onRefresh }: Props) {
  const { success, error } = useNotificationStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newAcc, setNewAcc] = useState({ code: '', name: '', nature: 'charge' as any, balance_type: 'debit' as any });

  // On trie les comptes par code
  const sortedAccounts = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

  async function handleAdd() {
    if (!newAcc.code || !newAcc.name) return;
    try {
      // Simulation ou appel réel si la fonction existait
      // Pour l'instant, on prépare l'UI, on supposera qu'on peut insérer via Supabase directement
      success('Compte ajouté avec succès (simulation)');
      setShowAdd(false);
      onRefresh();
    } catch (err) {
      error(String(err));
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-content-primary">Plan Comptable Personnalisé</h2>
          <p className="text-sm text-content-secondary">Adaptez la comptabilité à la nature de votre business.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-brand flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nouveau compte
        </button>
      </div>

      <div className="grid gap-4">
        {Object.keys(CLASS_LABELS).map((clsNum) => {
          const clsAccounts = sortedAccounts.filter(a => a.code.startsWith(clsNum));
          if (clsAccounts.length === 0) return null;

          return (
            <div key={clsNum} className="card overflow-hidden">
              <div className="px-4 py-2 bg-surface-hover border-b border-surface-border">
                <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  {CLASS_LABELS[parseInt(clsNum)]}
                </span>
              </div>
              <div className="divide-y divide-surface-border">
                {clsAccounts.map((acc) => (
                  <div key={acc.code} className="px-4 py-3 flex items-center justify-between hover:bg-surface-hover/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-bold text-brand-500 w-16">{acc.code}</span>
                      <div>
                        <p className="text-sm font-medium text-content-primary">{acc.name}</p>
                        <p className="text-[10px] text-content-secondary uppercase">
                          {acc.nature} · Solde {acc.balance_type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {acc.is_default ? (
                        <span className="flex items-center gap-1 text-[10px] bg-badge-info text-blue-400 px-2 py-0.5 rounded-full border border-blue-800">
                          <ShieldCheck className="w-3 h-3" /> Standard
                        </span>
                      ) : (
                        <button className="p-1.5 text-content-secondary hover:text-status-error transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-surface-border">
              <h3 className="text-lg font-bold text-content-primary">Ajouter un compte</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Numéro de compte (ex: 6131)</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="6xxx"
                  value={newAcc.code}
                  onChange={e => setNewAcc({ ...newAcc, code: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Intitulé du compte</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Loyer boutique..."
                  value={newAcc.name}
                  onChange={e => setNewAcc({ ...newAcc, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Nature</label>
                  <select
                    className="input w-full"
                    value={newAcc.nature}
                    onChange={e => setNewAcc({ ...newAcc, nature: e.target.value as any })}
                  >
                    <option value="actif">Actif</option>
                    <option value="passif">Passif</option>
                    <option value="charge">Charge</option>
                    <option value="produit">Produit</option>
                  </select>
                </div>
                <div>
                  <label className="label">Solde Normal</label>
                  <select
                    className="input w-full"
                    value={newAcc.balance_type}
                    onChange={e => setNewAcc({ ...newAcc, balance_type: e.target.value as any })}
                  >
                    <option value="debit">Débiteur</option>
                    <option value="credit">Créditeur</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-surface-border flex justify-end gap-3">
              <button onClick={() => setShowAdd(false)} className="btn-secondary">Annuler</button>
              <button onClick={handleAdd} className="btn-brand">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
