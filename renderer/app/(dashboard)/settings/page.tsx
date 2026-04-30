'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Building2, Printer, Wifi, ChevronDown, MessageCircle, 
  UserCircle, ArrowRight, Package, Archive, ShieldCheck, 
  Briefcase, Globe, Settings2, Wrench
} from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { canManageSettings, hasRole } from '@/lib/permissions';
import { getBusinessTypes, type BusinessTypeRow } from '@services/supabase/business-config';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';

// Modular Sections
import { BusinessSettingsSection } from './BusinessSettingsSection';
import { OrganizationSection } from './OrganizationSection';
import { PublicLinksQrSection } from './PublicLinksQrSection';
import { StockUnitsSection } from './StockUnitsSection';
import { PrintTemplatesSection } from './PrintTemplatesSection';
import { OfflineSyncSection } from './OfflineSyncSection';
import { PrinterSection } from './PrinterSection';
import { CashDrawerSection } from './CashDrawerSection';
import { WhatsAppSettingsSection } from './WhatsAppSettingsSection';
import { AccountSection } from './AccountSection';

// --- Local Components --------------------------------------------------------

function SettingsSection({ 
  id, title, icon: Icon, isOpen, onToggle, children, badge 
}: { 
  id: string; title: string; icon: any; isOpen: boolean; onToggle: (id: string) => void; children: React.ReactNode; badge?: string;
}) {
  return (
    <div className="card overflow-hidden transition-all duration-300">
      <button 
        onClick={() => onToggle(id)} 
        className={cn(
          "w-full flex items-center justify-between p-5 transition-colors",
          isOpen ? "bg-surface-card/50 border-b border-surface-border" : "hover:bg-surface-hover/50"
        )}
      >
        <div className="flex items-center gap-4">
          <div className={cn(
            "p-2.5 rounded-xl transition-all duration-300",
            isOpen ? "bg-brand-500 text-content-primary shadow-lg shadow-brand-900/20" : "bg-surface-input text-content-secondary group-hover:text-content-primary"
          )}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h2 className="font-bold text-content-primary tracking-tight">{title}</h2>
            {badge && <span className="text-[9px] font-black uppercase tracking-widest text-brand-500 mt-0.5 block">{badge}</span>}
          </div>
        </div>
        <ChevronDown className={cn("w-5 h-5 text-content-muted transition-transform duration-300", isOpen ? "rotate-180" : "")} />
      </button>
      
      {isOpen && (
        <div className="px-5 py-6 bg-surface-card/20 animate-in slide-in-from-top-4 duration-300">
          {children}
        </div>
      )}
    </div>
  );
}

// --- Main Page ---------------------------------------------------------------

export default function SettingsPage() {
  const { business, user } = useAuthStore();
  const isManager = canManageSettings(user?.role);
  const isAdmin   = hasRole(user?.role, 'admin');
  const isOwner   = hasRole(user?.role, 'owner');

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    biz: true,
  });

  const toggle = (id: string) => setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));

  // Dynamic types for icon helper
  const [allTypes, setAllTypes] = useState<BusinessTypeRow[]>([]);
  useEffect(() => {
    getBusinessTypes().then(setAllTypes).catch(() => {});
  }, []);

  function getIcon(name: string): React.ComponentType<{ className?: string }> {
    return (LucideIcons as any)[name] ?? LucideIcons.Package;
  }

  if (!business) return null;

  const businessTypes: string[] = business.types?.length ? business.types : (business.type ? [business.type] : []);
  const selectedTypes = allTypes.filter((t) => businessTypes.includes(t.id));

  return (
    <div className="h-full flex flex-col bg-surface overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-6 border-b border-surface-border bg-surface-card shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-content-brand shadow-glow">
            <Settings2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase italic">Paramètres</h1>
            <p className="text-xs text-content-secondary font-medium mt-0.5">Configuration de l&apos;établissement, du matériel et des intégrations</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 py-8 space-y-10 pb-24">
        
        {/* TOP SUMMARY - Types activity */}
        {isManager && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5 flex items-center justify-between group bg-brand-500/5 border-brand-500/10">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-content-brand mb-2">Activités actives</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTypes.map(t => {
                    const Icon = getIcon(t.icon);
                    return (
                      <div key={t.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-card border border-surface-border shadow-sm">
                        <Icon className="w-3.5 h-3.5 text-content-brand" />
                        <span className="text-xs font-bold text-content-primary">{t.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <Link href="/configure" className="p-2 rounded-xl bg-surface-card hover:bg-brand-500 hover:text-content-primary text-content-secondary transition-all shadow-sm">
                <Wrench className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="card p-5 bg-surface-card border-surface-border flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface-input flex items-center justify-center text-content-brand">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-content-muted">Niveau d&apos;accès</p>
                <p className="text-sm font-bold text-content-primary capitalize">{user?.role}</p>
                <p className="text-[10px] text-content-secondary italic">Permissions limitées selon le rôle</p>
              </div>
            </div>
          </div>
        )}

        {/* --- Category: Établissement --- */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1 mb-2">
            <Building2 className="w-4 h-4 text-content-muted" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-content-muted">Établissement & Organisation</h3>
          </div>

          <SettingsSection id="biz" title="Informations de l'établissement" icon={Briefcase} isOpen={openSections.biz} onToggle={toggle} badge={isManager ? "Manager+" : "Lecture seule"}>
            <BusinessSettingsSection />
          </SettingsSection>

          {isOwner && (
            <SettingsSection id="org" title="Organisation (Entité légale)" icon={Building2} isOpen={openSections.org} onToggle={toggle} badge="Propriétaire">
              <OrganizationSection />
            </SettingsSection>
          )}

          <SettingsSection id="public" title="Liens publics & QR Codes" icon={Globe} isOpen={openSections.public} onToggle={toggle}>
            <PublicLinksQrSection />
          </SettingsSection>
          
          {isManager && (
            <SettingsSection id="stock" title="Unités de stock" icon={Package} isOpen={openSections.stock} onToggle={toggle} badge="Manager+">
              <StockUnitsSection />
            </SettingsSection>
          )}
        </div>

        {/* --- Category: Hardware --- */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-3 px-1 mb-2">
            <Printer className="w-4 h-4 text-content-muted" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-content-muted">Matériel & Impression</h3>
          </div>

          {isManager && (
            <SettingsSection id="print-temp" title="Modèles de facture & reçus" icon={LucideIcons.Palette} isOpen={openSections['print-temp']} onToggle={toggle} badge="Manager+">
              <PrintTemplatesSection />
            </SettingsSection>
          )}

          <SettingsSection id="printer" title="Imprimante thermique" icon={Printer} isOpen={openSections.printer} onToggle={toggle}>
            <PrinterSection />
          </SettingsSection>

          <SettingsSection id="drawer" title="Tiroir-caisse" icon={Archive} isOpen={openSections.drawer} onToggle={toggle}>
            <CashDrawerSection />
          </SettingsSection>
        </div>

        {/* --- Category: Système --- */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-3 px-1 mb-2">
            <Settings2 className="w-4 h-4 text-content-muted" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-content-muted">Système & Intégrations</h3>
          </div>

          <SettingsSection id="sync" title="Synchronisation & Hors ligne" icon={Wifi} isOpen={openSections.sync} onToggle={toggle}>
            <OfflineSyncSection />
          </SettingsSection>

          {isAdmin && (
            <SettingsSection id="wa" title="WhatsApp Business API" icon={MessageCircle} isOpen={openSections.wa} onToggle={toggle} badge="Administrateur">
              <WhatsAppSettingsSection />
            </SettingsSection>
          )}
        </div>

        {/* --- Category: Compte --- */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-3 px-1 mb-2">
            <UserCircle className="w-4 h-4 text-content-muted" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-content-muted">Compte Utilisateur</h3>
          </div>

          <div className="card p-6 bg-surface-card border-surface-border">
            <AccountSection />
          </div>
        </div>

      </div>
    </div>
  );
}
