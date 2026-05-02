'use client';

import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, MessageSquare, AlertCircle, CheckCircle2, 
  Clock, ExternalLink, ShieldAlert, Wifi, WifiOff,
  Search, Filter, Smartphone, Key
} from 'lucide-react';
import { getAllWhatsAppConfigsAdmin, runWhatsAppHealthCheck, type WhatsAppHealthRow } from '@services/supabase/whatsapp';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function WhatsAppCenter() {
  const [configs, setConfigs] = useState<WhatsAppHealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  async function loadData() {
    try {
      const data = await getAllWhatsAppConfigsAdmin();
      setConfigs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckHealth() {
    setChecking(true);
    try {
      await runWhatsAppHealthCheck();
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = configs.filter(c => 
    c.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.display_phone?.includes(searchTerm)
  );

  const stats = {
    total: configs.length,
    healthy: configs.filter(c => c.status_health === 'healthy').length,
    expired: configs.filter(c => c.status_health === 'token_expired').length,
    error: configs.filter(c => c.status_health === 'api_error').length,
  };

  if (loading) return (
    <div className="h-64 flex flex-col items-center justify-center gap-4">
      <RefreshCw className="w-8 h-8 animate-spin text-content-brand" />
      <p className="text-content-secondary text-sm font-medium">Chargement du parc WhatsApp...</p>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 border-surface-border">
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Total Connexions</p>
          <p className="text-2xl font-black text-content-primary mt-1">{stats.total}</p>
        </div>
        <div className="card p-4 border-surface-border">
          <p className="text-[10px] font-black text-status-success uppercase tracking-widest">Opérationnels</p>
          <p className="text-2xl font-black text-status-success mt-1">{stats.healthy}</p>
        </div>
        <div className="card p-4 border-surface-border">
          <p className="text-[10px] font-black text-status-error uppercase tracking-widest">Tokens Expirés</p>
          <p className="text-2xl font-black text-status-error mt-1">{stats.expired}</p>
        </div>
        <div className="card p-4 border-surface-border">
          <p className="text-[10px] font-black text-status-warning uppercase tracking-widest">Erreurs API</p>
          <p className="text-2xl font-black text-status-warning mt-1">{stats.error}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          <input 
            type="text" 
            placeholder="Rechercher un business ou un numéro..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        <button 
          onClick={handleCheckHealth}
          disabled={checking}
          className="btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          {checking ? <RefreshCw size={16} className="animate-spin" /> : <Wifi size={16} />}
          Lancer un diagnostic global
        </button>
      </div>

      {/* Config Table */}
      <div className="card border-surface-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-input border-b border-surface-border text-[10px] font-black text-content-muted uppercase tracking-widest">
                <th className="px-4 py-3 text-center w-12">État</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Numéro / ID</th>
                <th className="px-4 py-3">Dernier Check</th>
                <th className="px-4 py-3">Détails Erreur</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-surface-hover transition-colors group">
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center">
                      {c.status_health === 'healthy' ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-status-success shadow-[0_0_8px_rgba(34,197,94,0.5)]" title="Connecté" />
                      ) : c.status_health === 'token_expired' ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-status-error animate-pulse" title="Token Expiré" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-status-warning" title="Erreur" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold text-content-primary">{c.business_name || 'Inconnu'}</p>
                    <p className="text-[10px] text-content-muted truncate w-32">{c.business_id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-content-secondary">
                      <Smartphone size={12} className="text-content-muted" />
                      {c.display_phone || 'N/A'}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-content-muted mt-0.5">
                      <Key size={10} />
                      {c.phone_number_id}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[11px] text-content-primary">
                      {c.last_health_check_at ? format(new Date(c.last_health_check_at), 'HH:mm', { locale: fr }) : '-'}
                    </p>
                    <p className="text-[9px] text-content-muted">
                      {c.last_health_check_at ? format(new Date(c.last_health_check_at), 'dd MMM', { locale: fr }) : 'Jamais'}
                    </p>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {c.last_api_error_message ? (
                      <p className="text-[10px] text-status-error font-medium leading-tight">
                        {c.last_api_error_message}
                      </p>
                    ) : (
                      <p className="text-[10px] text-status-success font-medium italic">Aucun problème</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => {
                        const msg = `Bonjour, votre connexion WhatsApp sur ELM a besoin d'être renouvelée. Merci de vous rendre dans vos paramètres.`;
                        window.open(`https://wa.me/${c.display_phone?.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                      className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-content-brand hover:text-brand-600 transition-colors"
                    >
                      <MessageSquare size={12} /> Relancer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="card p-12 text-center border-dashed border-surface-border">
          <WifiOff className="w-12 h-12 text-content-muted mx-auto mb-4" />
          <p className="text-content-primary font-bold">Aucune configuration trouvée</p>
          <p className="text-content-secondary text-sm mt-1">Modifiez vos critères de recherche.</p>
        </div>
      )}
    </div>
  );
}
