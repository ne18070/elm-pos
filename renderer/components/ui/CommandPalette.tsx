'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, Command, X, Layers, Users, 
  CreditCard, Briefcase, FileText, Loader2,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAllOrganizationsAdmin } from '@services/supabase/business';
import { getSubscriptionRequests, getPublicSubscriptionRequests, getAllSubscriptions } from '@services/supabase/subscriptions';

export function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    orgs: any[];
    demandes: any[];
    subs: any[];
  }>({ orgs: [], demandes: [], subs: [] });

  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults({ orgs: [], demandes: [], subs: [] });
      return;
    }
    setLoading(true);
    try {
      const [orgs, reqs, pub, subs] = await Promise.all([
        getAllOrganizationsAdmin(),
        getSubscriptionRequests(),
        getPublicSubscriptionRequests(),
        getAllSubscriptions()
      ]);

      const term = q.toLowerCase();
      
      setResults({
        orgs: orgs.filter(o => o.legal_name.toLowerCase().includes(term) || o.denomination?.toLowerCase().includes(term)).slice(0, 5),
        demandes: [...reqs, ...pub].filter(r => r.business_name.toLowerCase().includes(term) || (r as any).email?.toLowerCase().includes(term)).slice(0, 5),
        subs: subs.filter(s => s.owner_name?.toLowerCase().includes(term) || s.owner_email?.toLowerCase().includes(term) || s.business_name?.toLowerCase().includes(term)).slice(0, 5)
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => performSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Toggle handled by parent but we handle it here for safety
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-24 sm:pt-40 p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-surface-card border border-surface-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Search Input */}
        <div className="flex items-center px-6 h-16 border-b border-surface-border gap-4">
          <Search className="text-content-primary" size={20} />
          <input
            autoFocus
            className="flex-1 bg-transparent border-none focus:ring-0 text-content-primary placeholder-slate-500 font-bold"
            placeholder="Rechercher une organisation, un client, une demande..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading ? (
            <Loader2 className="animate-spin text-brand-500" size={18} />
          ) : (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-surface-border bg-surface text-[10px] font-black text-content-primary uppercase">
              Esc
            </div>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-4 no-scrollbar">
          {query.length < 2 ? (
            <div className="py-12 text-center space-y-3">
              <Command className="mx-auto text-slate-700" size={40} />
              <p className="text-content-primary text-sm font-medium">Saisissez au moins 2 caractﾃｨres pour rechercher.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                 {['Nestlﾃｩ', 'Dakar', 'Standard', 'Pro'].map(t => (
                   <button key={t} onClick={() => setQuery(t)} className="px-3 py-1.5 rounded-full bg-surface-input border border-surface-border text-[10px] font-black text-content-secondary hover:text-content-primary transition-all">"{t}"</button>
                 ))}
              </div>
            </div>
          ) : (results.orgs.length === 0 && results.demandes.length === 0 && results.subs.length === 0) ? (
            <div className="py-12 text-center">
              <p className="text-content-primary text-sm italic">Aucun rﾃｩsultat pour "{query}"</p>
            </div>
          ) : (
            <div className="space-y-6">
              {results.orgs.length > 0 && (
                <Section title="Organisations" icon={Layers} items={results.orgs} 
                  renderItem={(item: any) => (
                    <Item 
                      key={item.id}
                      title={item.legal_name}
                      subtitle={item.denomination || 'Entitﾃｩ lﾃｩgale'}
                      onClick={() => { router.push('/backoffice/structures'); onClose(); }}
                    />
                  )} 
                />
              )}
              {results.subs.length > 0 && (
                <Section title="Abonnements Clients" icon={CreditCard} items={results.subs} 
                  renderItem={(item: any) => (
                    <Item 
                      key={item.id || item.business_id}
                      title={item.owner_name || item.business_name}
                      subtitle={item.owner_email}
                      badge={item.plan_label}
                      onClick={() => { router.push('/backoffice/abonnements'); onClose(); }}
                    />
                  )} 
                />
              )}
              {results.demandes.length > 0 && (
                <Section title="Demandes & Prospects" icon={Users} items={results.demandes} 
                  renderItem={(item: any) => (
                    <Item 
                      key={item.id}
                      title={item.business_name}
                      subtitle={item.email || 'Demande entrante'}
                      onClick={() => { router.push('/backoffice/demandes'); onClose(); }}
                    />
                  )} 
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-hover border-t border-surface-border flex items-center justify-between">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-1.5">
                 <kbd className="px-1.5 py-0.5 rounded border border-surface-border bg-surface text-[10px] font-black text-content-secondary">↑↓</kbd>
                 <span className="text-[10px] font-bold text-content-primary uppercase tracking-widest">Naviguer</span>
              </div>
              <div className="flex items-center gap-1.5">
                 <kbd className="px-1.5 py-0.5 rounded border border-surface-border bg-surface text-[10px] font-black text-content-secondary">Enter</kbd>
                 <span className="text-[10px] font-bold text-content-primary uppercase tracking-widest">Sélectionner</span>
              </div>
           </div>
           <p className="text-[10px] font-black text-content-brand uppercase tracking-widest">Command Center</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, items, renderItem }: any) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Icon size={14} className="text-content-primary" />
        <h4 className="text-[10px] font-black text-content-primary uppercase tracking-[0.2em]">{title}</h4>
      </div>
      <div className="space-y-1">
        {items.map(renderItem)}
      </div>
    </div>
  );
}

function Item({ title, subtitle, badge, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-brand-600/10 hover:ring-1 hover:ring-brand-500/30 transition-all group text-left"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-input border border-surface-border flex items-center justify-center group-hover:bg-brand-500/20 group-hover:border-brand-500/30 transition-all">
          <ArrowRight size={16} className="text-content-primary group-hover:text-content-brand" />
        </div>
        <div>
          <p className="text-sm font-bold text-content-primary group-hover:text-content-brand transition-colors">{title}</p>
          <p className="text-[10px] text-content-primary font-medium">{subtitle}</p>
        </div>
      </div>
      {badge && (
        <span className="px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-[9px] font-black text-content-brand uppercase">{badge}</span>
      )}
    </button>
  );
}


