'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Loader2, Search, Filter, MessageSquare, 
  Bug, Lightbulb, HelpCircle, CheckCircle2,
  Clock, XCircle, ChevronRight, User, 
  Building2, Calendar, Paperclip, ExternalLink,
  RefreshCw, MoreVertical, ShieldAlert, Activity as ActivityIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  getAllTicketsAdmin, updateTicketAdmin, 
  type SupportTicket, type TicketStatus, type TicketPriority 
} from '@services/supabase/support';
import { useNotificationStore } from '@/store/notifications';
import { SideDrawer } from '@/components/ui/SideDrawer';

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: any }> = {
  open:        { label: 'Ouvert',      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: Clock },
  in_progress: { label: 'En cours',   color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: ActivityIcon },
  resolved:    { label: 'Résolu',      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  closed:      { label: 'Fermé',      color: 'text-slate-500 bg-slate-500/10 border-slate-500/20', icon: XCircle },
};

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  bug:        { label: 'Bug',        icon: Bug,           color: 'text-red-400' },
  suggestion: { label: 'Suggestion', icon: Lightbulb,     color: 'text-amber-400' },
  question:   { label: 'Question',   icon: HelpCircle,    color: 'text-blue-400' },
  feedback:   { label: 'Feedback',   icon: MessageSquare, color: 'text-emerald-400' },
};

export default function SupportAdminPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [updating, setUpdating] = useState(false);
  
  const { success, error: notifError } = useNotificationStore();

  async function load() {
    setLoading(true);
    try {
      const data = await getAllTicketsAdmin();
      setTickets(data);
    } catch (err) {
      notifError("Échec du chargement des tickets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return tickets.filter(t => {
      const matchesSearch = !search || 
        t.subject.toLowerCase().includes(search.toLowerCase()) ||
        t.user?.full_name.toLowerCase().includes(search.toLowerCase()) ||
        t.business?.name.toLowerCase().includes(search.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [tickets, search, statusFilter]);

  async function handleUpdateStatus(ticketId: string, status: TicketStatus) {
    setUpdating(true);
    try {
      await updateTicketAdmin(ticketId, { status });
      success(`Statut mis à jour : ${STATUS_CONFIG[status].label}`);
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(prev => prev ? { ...prev, status } : null);
      }
    } catch (err) {
      notifError("Échec de la mise à jour");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="p-8 space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase">Support Client</h1>
          <p className="text-slate-500 text-sm mt-1">Gérez les retours, bugs et suggestions des utilisateurs.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Rechercher un ticket..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-surface-card border border-surface-border rounded-xl pl-10 pr-4 h-11 text-sm focus:ring-1 focus:ring-brand-500 w-64 transition-all"
            />
          </div>
          <button onClick={load} className="btn-secondary h-11 px-4 flex items-center gap-2">
            <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        <button 
          onClick={() => setStatusFilter('all')}
          className={cn(
            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all",
            statusFilter === 'all' ? "bg-white text-black border-white shadow-lg" : "bg-surface-card border border-surface-border text-slate-500 hover:text-white"
          )}
        >
          Tous ({tickets.length})
        </button>
        {(Object.entries(STATUS_CONFIG) as [TicketStatus, any][]).map(([key, cfg]) => (
          <button 
            key={key}
            onClick={() => setStatusFilter(key)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all flex items-center gap-2",
              statusFilter === key ? cfg.color + " border-current shadow-lg ring-1 ring-current" : "bg-surface-card border border-surface-border text-slate-500 hover:text-white"
            )}
          >
            <cfg.icon size={14} />
            {cfg.label} ({tickets.filter(t => t.status === key).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-brand-500" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.length === 0 ? (
            <div className="card p-20 text-center space-y-4 border-dashed">
               <MessageSquare className="mx-auto text-slate-800" size={48} />
               <p className="text-slate-500 font-medium italic">Aucun ticket de support trouvé.</p>
            </div>
          ) : (
            filtered.map((ticket) => {
              const typeCfg = TYPE_CONFIG[ticket.type];
              const statusCfg = STATUS_CONFIG[ticket.status];
              return (
                <div 
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className="card p-6 border-surface-border hover:border-brand-500/50 transition-all group cursor-pointer relative overflow-hidden flex flex-col md:flex-row md:items-center gap-6"
                >
                  <div className={cn("w-1.5 h-12 rounded-full absolute left-0 top-1/2 -translate-y-1/2", ticket.priority === 'urgent' ? 'bg-red-500' : ticket.priority === 'high' ? 'bg-orange-500' : 'bg-blue-500')} />
                  
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className={cn("text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5", typeCfg.color)}>
                        <typeCfg.icon size={12} />
                        {typeCfg.label}
                      </span>
                      <span className="text-slate-700">•</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase">{new Date(ticket.created_at).toLocaleString('fr-FR')}</span>
                    </div>
                    <h3 className="text-lg font-black text-white tracking-tight truncate">{ticket.subject}</h3>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <User size={14} className="text-slate-600" />
                        <span className="font-bold">{ticket.user?.full_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Building2 size={14} className="text-slate-600" />
                        <span className="font-bold">{ticket.business?.name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0">
                    <div className="flex flex-col items-end gap-1.5">
                       <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border", statusCfg.color)}>
                          {statusCfg.label}
                       </span>
                       {ticket.attachments.length > 0 && (
                         <div className="flex items-center gap-1 text-slate-500 text-[10px] font-bold uppercase">
                            <Paperclip size={12} /> {ticket.attachments.length} fichiers
                         </div>
                       )}
                    </div>
                    <ChevronRight className="text-slate-700 group-hover:text-brand-400 transition-colors" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Ticket Detail Drawer */}
      <SideDrawer
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        title="Détails du Ticket"
        subtitle={`ID: ${selectedTicket?.id.slice(0, 8)}`}
        maxWidth="max-w-2xl"
        footer={
          <div className="flex gap-3">
            {selectedTicket?.status !== 'resolved' && selectedTicket?.status !== 'closed' && (
              <button 
                onClick={() => handleUpdateStatus(selectedTicket!.id, 'resolved')}
                disabled={updating}
                className="btn-primary flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"
              >
                {updating ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                Marquer comme résolu
              </button>
            )}
            {selectedTicket?.status !== 'closed' && (
               <button 
                onClick={() => handleUpdateStatus(selectedTicket!.id, 'closed')}
                disabled={updating}
                className="bg-slate-800 hover:bg-slate-700 text-white flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 rounded-2xl transition-all border border-slate-700"
              >
                {updating ? <Loader2 className="animate-spin" size={16} /> : <XCircle size={16} />}
                Fermer le ticket
              </button>
            )}
          </div>
        }
      >
        {selectedTicket && (
          <div className="space-y-8">
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                  <div className={cn("px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", STATUS_CONFIG[selectedTicket.status].color)}>
                     {STATUS_CONFIG[selectedTicket.status].label}
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                     <Calendar size={14} /> {new Date(selectedTicket.created_at).toLocaleString()}
                  </div>
               </div>
               <h2 className="text-2xl font-black text-white tracking-tight leading-tight">{selectedTicket.subject}</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="p-4 rounded-2xl bg-surface-input/50 border border-surface-border space-y-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Utilisateur</p>
                  <p className="text-sm font-bold text-white">{selectedTicket.user?.full_name}</p>
                  <p className="text-xs text-slate-500">{selectedTicket.user?.email}</p>
               </div>
               <div className="p-4 rounded-2xl bg-surface-input/50 border border-surface-border space-y-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Établissement</p>
                  <p className="text-sm font-bold text-white">{selectedTicket.business?.name}</p>
                  <p className="text-xs text-slate-500">{selectedTicket.business_id.slice(0, 8)}</p>
               </div>
            </div>

            <div className="space-y-3">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Message</p>
               <div className="p-6 rounded-3xl bg-surface-input border border-surface-border text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedTicket.message}
               </div>
            </div>

            {selectedTicket.attachments.length > 0 && (
              <div className="space-y-3">
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pièces jointes ({selectedTicket.attachments.length})</p>
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selectedTicket.attachments.map((url, i) => (
                      <a 
                        key={i} 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="aspect-video rounded-2xl overflow-hidden border border-surface-border bg-black group relative"
                      >
                         <img src={url} alt="attachment" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                         <div className="absolute inset-0 bg-brand-600/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <ExternalLink size={20} />
                         </div>
                      </a>
                    ))}
                 </div>
              </div>
            )}

            <div className="space-y-3">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Données Système (Metadata)</p>
               <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 font-mono text-[10px] text-slate-400 overflow-x-auto">
                  <pre>{JSON.stringify(selectedTicket.metadata, null, 2)}</pre>
               </div>
            </div>

            {selectedTicket.status === 'open' && (
              <div className="p-5 rounded-3xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-4">
                 <ShieldAlert className="text-blue-400 shrink-0" size={20} />
                 <div className="space-y-1">
                    <p className="text-xs font-bold text-white">Prise en charge nécessaire</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed">Pensez à contacter le client par email ou WhatsApp avant de clôturer ce ticket pour lui confirmer la résolution.</p>
                 </div>
              </div>
            )}
          </div>
        )}
      </SideDrawer>
    </div>
  );
}
