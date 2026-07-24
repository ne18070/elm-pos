'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Upload, Download, Search, Ticket, CheckCircle2, XCircle, Building2, Phone, Undo2, Users, ChevronLeft, ChevronRight, Loader2, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { ImportGuestsModal } from '@/components/evenements/ImportGuestsModal';
import {
  listEvents, createEvent, deleteEvent, archiveEvent, unarchiveEvent, listArchivedEvents,
  listGuests, checkInGuest, undoCheckIn,
  type EventItem, type EventGuest,
} from '@services/supabase/event-guests';

const COMBINING_DIACRITIC_MIN = 0x0300;
const COMBINING_DIACRITIC_MAX = 0x036f;

function normalize(s: string): string {
  return Array.from(s.toLowerCase().normalize('NFD'))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < COMBINING_DIACRITIC_MIN || code > COMBINING_DIACRITIC_MAX;
    })
    .join('');
}

function exportGuestsCSV(guests: EventGuest[], eventName: string) {
  const header = 'nom,entreprise,telephone,categorie,statut,date_validation';
  const rows = guests.map((g) =>
    [
      g.full_name,
      g.company ?? '',
      g.phone ?? '',
      g.category ?? '',
      g.status === 'used' ? 'Validé' : 'En attente',
      g.checked_in_at ? new Date(g.checked_in_at).toLocaleString('fr-FR') : '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const safeName = normalize(eventName).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'evenement';
  a.download = `invites_${safeName}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function EvenementsPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const can = useCan();
  const { askConfirm, ConfirmDialog } = useConfirm();

  const [events, setEvents]     = useState<EventItem[]>([]);
  const [eventId, setEventId]   = useState<string | null>(null);
  const [guests, setGuests]     = useState<EventGuest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showArchived, setShowArchived]     = useState(false);
  const [archivedEvents, setArchivedEvents] = useState<EventItem[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  const [selected, setSelected] = useState<EventGuest | null>(null);
  const [checking, setChecking] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'used'>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [showImport, setShowImport]     = useState(false);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: '', event_date: '', location: '' });
  const [savingEvent, setSavingEvent]   = useState(false);

  useEffect(() => {
    if (!business) return;
    (async () => {
      setLoading(true);
      try {
        const rows = await listEvents(business.id);
        setEvents(rows);
        if (rows.length > 0) setEventId(rows[0].id);
      } catch (e) { notifError(toUserError(e)); }
      finally { setLoading(false); }
    })();
  }, [business]);

  useEffect(() => {
    if (!eventId) { setGuests([]); return; }
    loadGuests(eventId);
  }, [eventId]);

  async function loadGuests(id: string) {
    setLoading(true);
    try {
      setGuests(await listGuests(id));
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }

  async function handleCreateEvent() {
    if (!business || !newEvent.name.trim()) return;
    setSavingEvent(true);
    try {
      const created = await createEvent(business.id, {
        name: newEvent.name.trim(),
        event_date: newEvent.event_date || null,
        location: newEvent.location.trim() || null,
      });
      setEvents((prev) => [created, ...prev]);
      setEventId(created.id);
      setShowNewEvent(false);
      setNewEvent({ name: '', event_date: '', location: '' });
      success('Événement créé');
    } catch (e) { notifError(toUserError(e)); }
    finally { setSavingEvent(false); }
  }

  function handleDeleteEvent(ev: EventItem) {
    askConfirm(
      `Supprimer définitivement « ${ev.name} » ? Tous ses invités et l'historique de check-in seront perdus.`,
      async () => {
        if (!business) return;
        setDeleting(true);
        try {
          await deleteEvent(business.id, ev.id);
          const remaining = events.filter((e) => e.id !== ev.id);
          setEvents(remaining);
          setEventId(remaining[0]?.id ?? null);
          success('Événement supprimé');
        } catch (e) { notifError(toUserError(e)); }
        finally { setDeleting(false); }
      },
      { confirmLabel: 'Supprimer', danger: true }
    );
  }

  function handleArchiveEvent(ev: EventItem) {
    askConfirm(
      `Archiver « ${ev.name} » ? Il n'apparaîtra plus dans la liste active mais ses invités et l'historique de check-in restent intacts — vous pourrez le restaurer depuis les archives.`,
      async () => {
        if (!business) return;
        setDeleting(true);
        try {
          await archiveEvent(business.id, ev.id);
          const remaining = events.filter((e) => e.id !== ev.id);
          setEvents(remaining);
          setEventId(remaining[0]?.id ?? null);
          success('Événement archivé');
        } catch (e) { notifError(toUserError(e)); }
        finally { setDeleting(false); }
      },
      { confirmLabel: 'Archiver', danger: false }
    );
  }

  async function openArchived() {
    if (!business) return;
    setShowArchived(true);
    setLoadingArchived(true);
    try {
      setArchivedEvents(await listArchivedEvents(business.id));
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoadingArchived(false); }
  }

  async function handleUnarchive(ev: EventItem) {
    if (!business) return;
    try {
      await unarchiveEvent(business.id, ev.id);
      setArchivedEvents((prev) => prev.filter((e) => e.id !== ev.id));
      setEvents((prev) => [{ ...ev, archived_at: null }, ...prev]);
      success('Événement restauré');
    } catch (e) { notifError(toUserError(e)); }
  }

  const total  = guests.length;
  const used   = guests.filter((g) => g.status === 'used').length;
  const pending = total - used;

  const isSearching = query.trim().length >= 2;
  const canBrowseList = can('manage_evenements');

  const results = useMemo(() => {
    const term = normalize(query.trim());
    const byStatus = (g: EventGuest) => statusFilter === 'all' || g.status === statusFilter;
    // La liste complète (avec filtre validé/non validé) est réservée à l'admin —
    // le staff au poste de check-in reste sur la recherche rapide uniquement.
    if (!isSearching && !canBrowseList) return [];
    return guests
      .filter(byStatus)
      .filter((g) => !term || normalize(g.full_name).includes(term) || (g.company && normalize(g.company).includes(term)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [guests, query, statusFilter, isSearching, canBrowseList]);

  const totalPages     = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const paginatedGuests = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, statusFilter, eventId]);

  async function handleCheckIn(guest: EventGuest) {
    setChecking(true);
    try {
      const updated = await checkInGuest(guest.id);
      if (!updated) {
        // Déjà validé entre-temps par un autre poste
        notifError('Cet invité a déjà été enregistré à l\'instant.');
        if (eventId) await loadGuests(eventId);
        setSelected(null);
        return;
      }
      setGuests((prev) => prev.map((g) => g.id === updated.id ? updated : g));
      setSelected(updated);
      success(`${guest.full_name} — entrée validée`);
    } catch (e) { notifError(toUserError(e)); }
    finally { setChecking(false); }
  }

  async function handleUndo(guest: EventGuest) {
    setChecking(true);
    try {
      await undoCheckIn(guest.id);
      const reverted = { ...guest, status: 'pending' as const, checked_in_at: null, checked_in_by: null };
      setGuests((prev) => prev.map((g) => g.id === guest.id ? reverted : g));
      setSelected(reverted);
      success('Entrée annulée');
    } catch (e) { notifError(toUserError(e)); }
    finally { setChecking(false); }
  }

  return (
    <div className="h-full flex flex-col">

      {/* -- Header -- */}
      <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-content-primary flex items-center gap-2">
            <Ticket className="w-5 h-5 text-content-brand" /> Check-in Invités
          </h1>
          <p className="text-xs text-content-secondary">Recherchez un invité et validez son entrée à l&apos;événement</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="input h-9 text-sm max-w-[220px]"
            value={eventId ?? ''}
            onChange={(e) => setEventId(e.target.value || null)}
          >
            <option value="" disabled>Sélectionner un événement</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
          {can('manage_evenements') && (
            <button onClick={() => setShowNewEvent(true)} className="btn-secondary h-9 text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Événement
            </button>
          )}
          {eventId && can('manage_evenements') && (
            <button onClick={() => setShowImport(true)} className="btn-primary h-9 text-sm flex items-center gap-1.5">
              <Upload className="w-4 h-4" /> Importer
            </button>
          )}
          {eventId && can('manage_evenements') && guests.length > 0 && (
            <button
              onClick={() => exportGuestsCSV(guests, events.find((ev) => ev.id === eventId)?.name ?? 'evenement')}
              className="btn-secondary h-9 text-sm flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Exporter
            </button>
          )}
          {can('manage_evenements') && (
            <button onClick={openArchived} className="btn-secondary h-9 text-sm flex items-center gap-1.5">
              <Archive className="w-4 h-4" /> Archives
            </button>
          )}
          {eventId && can('manage_evenements') && (
            <button
              onClick={() => {
                const ev = events.find((e) => e.id === eventId);
                if (ev) handleArchiveEvent(ev);
              }}
              disabled={deleting}
              className="btn-secondary h-9 text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <Archive className="w-4 h-4" /> Archiver
            </button>
          )}
          {eventId && can('manage_evenements') && (
            <button
              onClick={() => {
                const ev = events.find((e) => e.id === eventId);
                if (ev) handleDeleteEvent(ev);
              }}
              disabled={deleting}
              className="h-9 px-3 text-sm rounded-xl border border-status-error text-status-error hover:bg-badge-error flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Supprimer
            </button>
          )}
        </div>
      </div>

      {/* -- Corps -- */}
      <div className="flex-1 overflow-y-auto p-6">

        {!loading && events.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-surface-input flex items-center justify-center">
              <Ticket className="w-8 h-8 text-content-muted" />
            </div>
            <div>
              <p className="text-lg font-semibold text-content-primary">Aucun événement</p>
              <p className="text-sm text-content-secondary mt-1 max-w-sm">
                {can('manage_evenements')
                  ? "Créez un événement puis importez la liste de vos invités pour démarrer le check-in."
                  : "Aucun événement n'est disponible pour le moment. Contactez un administrateur."}
              </p>
            </div>
            {can('manage_evenements') && (
              <button onClick={() => setShowNewEvent(true)} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Créer un événement
              </button>
            )}
          </div>
        )}

        {eventId && (
          <div className="max-w-3xl mx-auto space-y-5">

            {/* Stats */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-sm text-content-secondary">
                <Users className="w-4 h-4" />
                <span className="font-semibold text-content-primary">{used}</span> / {total} invité{total !== 1 ? 's' : ''} validé{used !== 1 ? 's' : ''}
              </div>
              {total === 0 && (
                <span className="text-xs text-status-warning">Importez la liste des invités pour commencer</span>
              )}
            </div>

            {/* Recherche */}
            <div className="relative">
              <Search className="w-5 h-5 text-content-muted absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                className="input h-14 pl-12 text-lg"
                placeholder="Tapez le nom de l'invité…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* Filtres de statut — réservé à l'admin/manager */}
            {total > 0 && canBrowseList && (
              <div className="flex items-center gap-2">
                {([
                  ['all',     `Tous (${total})`],
                  ['pending', `Non validés (${pending})`],
                  ['used',    `Validés (${used})`],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                      ${statusFilter === value
                        ? 'bg-brand-600 border-brand-600 text-content-primary'
                        : 'bg-surface-input border-surface-border text-content-secondary hover:text-content-primary'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Résultats */}
            {results.length === 0 ? (
              (isSearching || canBrowseList) && (
                <p className="text-center text-content-muted py-6">
                  {isSearching ? <>Aucun invité trouvé pour « {query} »</> : 'Aucun invité pour ce filtre'}
                </p>
              )
            ) : (
              <div className="rounded-2xl border border-surface-border overflow-hidden bg-surface-card flex flex-col">

                {/* Mobile — liste empilée, tout tient à l'écran sans scroll horizontal */}
                <div className="sm:hidden divide-y divide-surface-border">
                  {paginatedGuests.map((g) => {
                    const isActive = selected?.id === g.id;
                    const isChecking = isActive && checking;
                    return (
                      <button
                        key={g.id}
                        onClick={() => setSelected(g)}
                        aria-current={isActive}
                        className={`w-full flex items-center gap-3 p-3 text-left transition-colors active:bg-surface-hover/70 border-l-4
                          ${isActive ? 'bg-brand-500/10 border-l-brand-600' : 'border-l-transparent'}`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold
                          ${isActive ? 'bg-brand-600 text-white' : 'bg-surface-input text-content-brand'}`}>
                          {g.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-content-primary truncate">{g.full_name}</p>
                          <p className="text-xs text-content-secondary truncate">
                            {[g.category, g.company, g.phone].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {isChecking
                            ? <Loader2 className="w-4 h-4 animate-spin text-content-brand" />
                            : g.status === 'used'
                              ? <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warning"><CheckCircle2 className="w-3.5 h-3.5" /> Validé</span>
                              : <span className="text-xs font-medium text-status-success">Valider →</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Desktop / tablette — tableau complet */}
                <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-input text-[10px] font-black uppercase tracking-widest text-content-secondary">
                      <th className="px-4 py-3 text-left">Invité</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">Entreprise</th>
                      <th className="px-4 py-3 text-left hidden md:table-cell">Téléphone</th>
                      <th className="px-4 py-3 text-left hidden lg:table-cell">Catégorie</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {paginatedGuests.map((g) => {
                      const isActive = selected?.id === g.id;
                      const isChecking = isActive && checking;
                      return (
                      <tr
                        key={g.id}
                        onClick={() => setSelected(g)}
                        aria-current={isActive}
                        className={`group cursor-pointer transition-colors active:bg-surface-hover/70
                          ${isActive ? 'bg-brand-500/10 border-l-4 border-l-brand-600' : 'border-l-4 border-l-transparent hover:bg-surface-hover/40'}`}
                      >
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold
                              ${isActive ? 'bg-brand-600 text-white' : 'bg-surface-input text-content-brand'}`}>
                              {g.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-content-primary truncate">{g.full_name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-content-secondary hidden sm:table-cell truncate max-w-[160px]">
                          {g.company || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-content-secondary hidden md:table-cell whitespace-nowrap">
                          {g.phone || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-content-secondary hidden lg:table-cell truncate max-w-[140px]">
                          {g.category || '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isChecking
                            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-content-brand"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Validation…</span>
                            : g.status === 'used'
                              ? <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warning"><CheckCircle2 className="w-3.5 h-3.5" /> Validé</span>
                              : <span className="text-xs font-medium text-status-success group-hover:underline">Valider →</span>}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border bg-surface-input text-sm">
                    <span className="text-xs text-content-secondary">
                      {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, results.length)} sur {results.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-1.5 rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                        .reduce<(number | '...')[]>((acc, p, i, arr) => {
                          if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          p === '...' ? (
                            <span key={`ellipsis-${i}`} className="px-1 text-content-muted text-xs">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setPage(p as number)}
                              className={`min-w-[30px] h-[30px] rounded-lg text-xs font-semibold transition-colors ${
                                page === p
                                  ? 'bg-brand-600 text-white'
                                  : 'border border-surface-border text-content-secondary hover:bg-surface-hover'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-1.5 rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* -- Panneau confirmation invité -- */}
      <SideDrawer
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title="Détail invité"
        maxWidth="max-w-sm"
        footer={selected ? (
          selected.status === 'pending' ? (
            <button
              onClick={() => handleCheckIn(selected)}
              disabled={checking}
              className="w-full h-12 rounded-xl font-semibold text-base flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-content-primary shadow-lg shadow-green-900/30 disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" /> {checking ? 'Validation…' : 'Valider l\'entrée'}
            </button>
          ) : can('manage_evenements') ? (
            <button
              onClick={() => handleUndo(selected)}
              disabled={checking}
              className="w-full h-11 rounded-xl font-medium text-sm flex items-center justify-center gap-2 btn-secondary disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" /> Annuler la validation
            </button>
          ) : null
        ) : null}
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-input flex items-center justify-center text-lg font-bold text-content-brand shrink-0">
                {selected.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-content-primary">{selected.full_name}</p>
                {selected.category && <p className="text-xs text-content-secondary">{selected.category}</p>}
              </div>
            </div>

            {selected.company && (
              <div className="flex items-center gap-2 text-sm text-content-primary">
                <Building2 className="w-4 h-4 text-content-muted shrink-0" /> {selected.company}
              </div>
            )}
            {selected.phone && (
              <a href={`tel:${selected.phone}`} className="flex items-center gap-2 text-sm text-content-primary hover:text-content-brand">
                <Phone className="w-4 h-4 text-content-muted shrink-0" /> {selected.phone}
              </a>
            )}

            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border ${
              selected.status === 'used'
                ? 'bg-badge-warning border-status-warning text-status-warning'
                : 'bg-badge-success border-status-success text-status-success'
            }`}>
              {selected.status === 'used'
                ? <><XCircle className="w-4 h-4 shrink-0" /> Pass déjà utilisé{selected.checked_in_at ? ` — ${new Date(selected.checked_in_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}</>
                : <><CheckCircle2 className="w-4 h-4 shrink-0" /> Pass non utilisé</>}
            </div>
          </div>
        )}
      </SideDrawer>

      {/* -- Panneau nouvel événement -- */}
      <SideDrawer
        isOpen={showNewEvent}
        onClose={() => setShowNewEvent(false)}
        title="Nouvel événement"
        maxWidth="max-w-sm"
        footer={
          <button
            onClick={handleCreateEvent}
            disabled={savingEvent || !newEvent.name.trim()}
            className="btn-primary w-full h-10"
          >
            {savingEvent ? 'Création…' : 'Créer l\'événement'}
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nom <span className="text-status-error">*</span></label>
            <input
              className="input"
              value={newEvent.name}
              onChange={(e) => setNewEvent((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex : Samsung Unpacked"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={newEvent.event_date}
              onChange={(e) => setNewEvent((f) => ({ ...f, event_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Lieu</label>
            <input
              className="input"
              value={newEvent.location}
              onChange={(e) => setNewEvent((f) => ({ ...f, location: e.target.value }))}
              placeholder="Ex : King Fahd Palace, Dakar"
            />
          </div>
        </div>
      </SideDrawer>

      {/* -- Import Excel -- */}
      {showImport && eventId && business && (
        <ImportGuestsModal
          businessId={business.id}
          eventId={eventId}
          existingCount={guests.length}
          onClose={() => setShowImport(false)}
          onDone={(count) => {
            setShowImport(false);
            success(`${count} invité(s) importé(s)`);
            loadGuests(eventId);
          }}
        />
      )}

      {/* -- Événements archivés -- */}
      <SideDrawer
        isOpen={showArchived}
        onClose={() => setShowArchived(false)}
        title="Événements archivés"
        maxWidth="max-w-sm"
      >
        {loadingArchived ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-content-muted" /></div>
        ) : archivedEvents.length === 0 ? (
          <p className="text-center text-content-muted py-8 text-sm">Aucun événement archivé</p>
        ) : (
          <div className="space-y-2">
            {archivedEvents.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-surface-border bg-surface-input/30">
                <div className="min-w-0">
                  <p className="font-medium text-content-primary truncate">{ev.name}</p>
                  {ev.event_date && <p className="text-xs text-content-secondary">{new Date(ev.event_date).toLocaleDateString('fr-FR')}</p>}
                </div>
                <button
                  onClick={() => handleUnarchive(ev)}
                  className="btn-secondary h-8 text-xs shrink-0 flex items-center gap-1.5"
                >
                  <ArchiveRestore className="w-3.5 h-3.5" /> Restaurer
                </button>
              </div>
            ))}
          </div>
        )}
      </SideDrawer>

      <ConfirmDialog />
    </div>
  );
}
