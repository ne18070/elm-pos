'use client';

import { toUserError } from '@/lib/user-error';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import {
  MessageCircle, Send, RefreshCw, Search, ShoppingCart,
  ChevronRight, ArrowLeft, Phone, Loader2, Filter, X, Bell,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { hasRole } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import {
  getWhatsAppConfig, getConversations, getMessages, markMessagesRead, sendWhatsAppReply,
  type WhatsAppConfig, type WhatsAppMessage, type WhatsAppConversation, type ConversationFilter,
} from '@services/supabase/whatsapp';

// --- Helpers ------------------------------------------------------------------

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d))     return "Aujourd'hui";
  if (isYesterday(d)) return 'Hier';
  return format(d, 'EEEE d MMMM yyyy', { locale: fr });
}

function timeStr(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm', { locale: fr });
}

function groupByDay(convos: WhatsAppConversation[]): { label: string; items: WhatsAppConversation[] }[] {
  const groups: { label: string; items: WhatsAppConversation[] }[] = [];
  let currentLabel = '';
  for (const conv of convos) {
    const label = dayLabel(conv.last_at);
    if (label !== currentLabel) {
      groups.push({ label, items: [] });
      currentLabel = label;
    }
    groups[groups.length - 1].items.push(conv);
  }
  return groups;
}

const PAGE_SIZE = 25;

// --- Page ---------------------------------------------------------------------

export default function WhatsAppPage() {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [config, setConfig]               = useState<WhatsAppConfig | null>(null);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [hasMore, setHasMore]             = useState(false);
  const [page, setPage]                   = useState(0);
  const [selected, setSelected]           = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages]           = useState<WhatsAppMessage[]>([]);

  // Filtres
  const [search, setSearch]         = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [reply, setReply]         = useState('');
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const bottomRef        = useRef<HTMLDivElement>(null);
  const msgContainerRef  = useRef<HTMLDivElement>(null);
  const msgRefs          = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const instantScroll    = useRef(false);
  const selectedRef      = useRef<WhatsAppConversation | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const canReply         = hasRole(user?.role, 'manager');

  // Garde selectedRef synchronisé pour les callbacks Realtime (évite stale closure)
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      console.error('Failed to play sound', e);
    }
  }, []);

  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  // Vérifier la permission au montage
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  async function requestPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const resp = await Notification.requestPermission();
      setNotifPermission(resp);
    }
  }

  // -- Chargement initial + refresh -------------------------------------------
  const loadConversations = useCallback(async (
    filter: ConversationFilter,
    append = false,
  ) => {
    if (!business?.id) return;
    try {
      const [cfg, result] = await Promise.all([
        append ? Promise.resolve(config) : getWhatsAppConfig(business.id),
        getConversations(business.id, filter),
      ]);
      if (!append && cfg !== config) setConfig(cfg as WhatsAppConfig | null);
      setConversations((prev) => append ? [...prev, ...result.items] : result.items);
      setHasMore(result.hasMore);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, config, notifError]);

  // Premier chargement
  useEffect(() => {
    loadConversations({ page: 0, pageSize: PAGE_SIZE, unreadOnly });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime — nouveaux messages WhatsApp
  useEffect(() => {
    if (!business?.id) return;

    const channel = supabase
      .channel(`wa-messages-${business.id}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'whatsapp_messages',
          filter: `business_id=eq.${business.id}`,
        },
        (payload) => {
          const msg = payload.new as WhatsAppMessage;
          if (msg.direction !== 'inbound') return;

          const msgPhone = msg.from_phone.startsWith('+') ? msg.from_phone : `+${msg.from_phone}`;

          // Son et notification système
          playNotificationSound();
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(`WhatsApp: ${msg.from_name || msg.from_phone}`, {
              body: msg.body || 'Nouveau message reçu',
              icon: '/logo.png',
            });
          }

          // Si la conversation est ouverte, ajouter le message directement
          const conv = selectedRef.current;
          if (conv) {
            const convPhone = conv.from_phone.startsWith('+') ? conv.from_phone : `+${conv.from_phone}`;
            if (msgPhone === convPhone) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
              // Marquer comme lu car l'utilisateur voit la conversation
              if (msg.direction === 'inbound' && business?.id) {
                markMessagesRead(business.id, conv.from_phone).catch(() => {});
                setConversations((prev) =>
                  prev.map((c) => {
                    const cp = c.from_phone.startsWith('+') ? c.from_phone : `+${c.from_phone}`;
                    return cp === convPhone ? { ...c, unread: 0 } : c;
                  })
                );
              }
            }
          }

          // Rafraîchir la liste des conversations (debounce 800ms pour éviter les appels en rafale)
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => {
            setPage(0);
            loadConversations({ search: search || undefined, unreadOnly, page: 0, pageSize: PAGE_SIZE });
          }, 800);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  // Recherche avec debounce 350ms
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(0);
      loadConversations({ search: search || undefined, unreadOnly, page: 0, pageSize: PAGE_SIZE });
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, unreadOnly]);

  async function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    setLoadingMore(true);
    try {
      await loadConversations(
        { search: search || undefined, unreadOnly, page: nextPage, pageSize: PAGE_SIZE },
        true,
      );
    } finally {
      setLoadingMore(false);
    }
  }

  function handleRefresh() {
    setPage(0);
    setLoading(true);
    loadConversations({ search: search || undefined, unreadOnly, page: 0, pageSize: PAGE_SIZE });
  }

  // -- Conversation -----------------------------------------------------------
  async function openConversation(conv: WhatsAppConversation) {
    if (!business?.id) return;
    setSelected(conv);
    setLoadingMsg(true);
    try {
      const msgs = await getMessages(business.id, conv.from_phone);
      // Si une recherche est active, trouver le message correspondant pour le jump
      if (search) {
        const q = search.toLowerCase();
        const match = msgs.find((m) =>
          m.body?.toLowerCase().includes(q) ||
          m.order_id?.toLowerCase().startsWith(q.toLowerCase())
        );
        if (match) {
          setHighlightId(match.id);
        } else {
          instantScroll.current = true;
        }
      } else {
        instantScroll.current = true;
      }
      setMessages(msgs);
      await markMessagesRead(business.id, conv.from_phone);
      setConversations((prev) =>
        prev.map((c) => c.from_phone === conv.from_phone ? { ...c, unread: 0 } : c)
      );
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoadingMsg(false);
    }
  }

  useLayoutEffect(() => {
    if (!msgContainerRef.current || loadingMsg) return;
    if (instantScroll.current) {
      instantScroll.current = false;
      msgContainerRef.current.scrollTop = msgContainerRef.current.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loadingMsg]);

  // Scroll vers le message matché par la recherche
  useLayoutEffect(() => {
    if (!highlightId || loadingMsg) return;
    const el = msgRefs.current.get(highlightId);
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  }, [highlightId, loadingMsg]);

  async function handleSend() {
    if (!config || !selected || !reply.trim() || !user?.id) return;
    setSending(true);
    const text = reply.trim();
    setReply('');
    try {
      await sendWhatsAppReply(config, selected.from_phone, text, user.id);
      success('Message envoyé');
      setMessages((prev) => [...prev, {
        id:            crypto.randomUUID(),
        business_id:   business!.id,
        wa_message_id: null,
        from_phone:    selected.from_phone,
        from_name:     null,
        direction:     'outbound',
        message_type:  'text',
        body:          text,
        payload:       null,
        order_id:      null,
        replied_by:    user.id,
        status:        'sent',
        created_at:    new Date().toISOString(),
      }]);
    } catch (err) {
      notifError(toUserError(err));
      setReply(text);
    } finally {
      setSending(false);
    }
  }

  // -- Séparateurs de date dans le fil ---------------------------------------
  const messageRows: ({ type: 'separator'; label: string } | { type: 'msg'; msg: WhatsAppMessage })[] = [];
  let lastDay: Date | null = null;
  for (const msg of messages) {
    const d = new Date(msg.created_at);
    if (!lastDay || !isSameDay(d, lastDay)) {
      messageRows.push({ type: 'separator', label: dayLabel(msg.created_at) });
      lastDay = d;
    }
    messageRows.push({ type: 'msg', msg });
  }

  const totalUnread    = conversations.reduce((s, c) => s + c.unread, 0);
  const groupedConvos  = groupByDay(conversations);
  const activeFilters  = (search ? 1 : 0) + (unreadOnly ? 1 : 0);

  // -- États de chargement / config ------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-content-secondary">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!config?.is_active) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-badge-success border border-status-success/40 flex items-center justify-center">
          <MessageCircle className="w-8 h-8 text-status-success" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-content-primary mb-1">WhatsApp Business non configuré</h2>
          <p className="text-sm text-content-secondary max-w-sm">
            Configurez votre intégration WhatsApp Business dans les Paramètres pour recevoir et répondre aux messages.
          </p>
        </div>
        <a href="/settings" className="btn-primary px-5 py-2">Aller aux Paramètres</a>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* -- Liste des conversations ----------------------------------------- */}
      <div className={`w-full md:w-80 shrink-0 border-r border-surface-border flex flex-col ${selected ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="p-4 border-b border-surface-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8 rounded-xl bg-badge-success flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-status-success" />
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 text-content-primary text-[10px] font-bold flex items-center justify-center">
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-sm font-semibold text-content-primary flex items-center gap-2">
                  WhatsApp
                  {totalUnread > 0 && (
                    <span className="text-xs font-normal text-status-success">{totalUnread} non lu{totalUnread > 1 ? 's' : ''}</span>
                  )}
                </h1>
                {config.display_phone && (
                  <p className="text-xs text-content-secondary flex items-center gap-1">
                    <Phone className="w-3 h-3" />{config.display_phone}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {notifPermission === 'default' && (
                <button
                  onClick={requestPermission}
                  className="p-1.5 rounded-lg bg-brand-500/10 text-content-brand hover:bg-brand-500/20 transition-colors"
                  title="Activer les notifications sonores"
                >
                  <Bell className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setShowFilters((f) => !f)}
                className={`relative p-1.5 rounded-lg hover:bg-surface-hover transition-colors ${showFilters ? 'text-content-brand' : 'text-content-secondary'}`}
                title="Filtres"
              >
                <Filter className="w-4 h-4" />
                {activeFilters > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-brand-500 text-content-primary text-[9px] font-bold flex items-center justify-center">
                    {activeFilters}
                  </span>
                )}
              </button>
              <button onClick={handleRefresh} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary" />
            <input
              type="text"
              placeholder="Nom, téléphone, message, n° commande…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-8 pr-8 text-sm h-8"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content-primary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtres avancés */}
          {showFilters && (
            <div className="space-y-2 pt-1">
              <button
                onClick={() => setUnreadOnly((v) => !v)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  unreadOnly
                    ? 'bg-badge-success border border-status-success/50 text-status-success'
                    : 'bg-surface-hover text-content-secondary hover:text-content-primary'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${unreadOnly ? 'bg-green-400' : 'bg-slate-600'}`} />
                Non lus uniquement
              </button>
            </div>
          )}
        </div>

        {/* Conversations groupées par date */}
        <div className="flex-1 overflow-y-auto">
          {groupedConvos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-content-muted text-sm gap-2">
              <MessageCircle className="w-8 h-8 opacity-30" />
              <span>{search || unreadOnly ? 'Aucun résultat' : 'Aucune conversation'}</span>
              {(search || unreadOnly) && (
                <button
                  onClick={() => { setSearch(''); setUnreadOnly(false); }}
                  className="text-xs text-content-brand hover:text-content-brand"
                >
                  Effacer les filtres
                </button>
              )}
            </div>
          ) : (
            <>
              {groupedConvos.map((group) => (
                <div key={group.label}>
                  <div className="sticky top-0 z-10 px-4 py-1.5 bg-surface-card/90 backdrop-blur-sm border-b border-surface-border">
                    <span className="text-xs font-medium text-content-muted uppercase tracking-wide">{group.label}</span>
                  </div>

                  {group.items.map((conv) => (
                    <button
                      key={conv.from_phone}
                      onClick={() => openConversation(conv)}
                      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-surface-border hover:bg-surface-hover transition-colors text-left ${
                        selected?.from_phone === conv.from_phone ? 'bg-surface-hover' : ''
                      }`}
                    >
                      <div className="relative w-9 h-9 rounded-full bg-badge-success border border-status-success/40 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-status-success">
                          {(conv.from_name ?? conv.from_phone).charAt(0).toUpperCase()}
                        </span>
                        {conv.unread > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border border-surface-card" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm truncate ${conv.unread > 0 ? 'font-semibold text-content-primary' : 'font-medium text-content-primary'}`}>
                            {conv.from_name ?? conv.from_phone}
                          </p>
                          <span className="text-xs text-content-muted shrink-0 ml-2">{timeStr(conv.last_at)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className={`text-xs truncate ${conv.unread > 0 ? 'text-content-primary' : 'text-content-secondary'}`}>
                            {conv.last_message ?? '—'}
                          </p>
                          {conv.unread > 0 && (
                            <span className="ml-2 shrink-0 min-w-[20px] h-5 px-1 rounded-full bg-green-600 text-content-primary text-xs flex items-center justify-center font-bold">
                              {conv.unread}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-content-muted shrink-0" />
                    </button>
                  ))}
                </div>
              ))}

              {/* Pagination — Charger plus */}
              {hasMore && (
                <div className="p-3 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-hover text-content-secondary hover:text-content-primary text-sm transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {loadingMore ? 'Chargement…' : 'Charger plus'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* -- Zone de conversation -------------------------------------------- */}
      <div className={`flex-1 flex flex-col min-w-0 ${!selected ? 'hidden md:flex' : 'flex'}`}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-content-muted gap-2">
            <MessageCircle className="w-12 h-12 opacity-20" />
            <p className="text-sm">Sélectionnez une conversation</p>
          </div>
        ) : (
          <>
            {/* Header conversation */}
            <div className="p-4 border-b border-surface-border flex items-center gap-3">
              <button
                onClick={() => setSelected(null)}
                className="md:hidden p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-9 h-9 rounded-full bg-badge-success border border-status-success/40 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-status-success">
                  {(selected.from_name ?? selected.from_phone).charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-content-primary text-sm">{selected.from_name ?? selected.from_phone}</p>
                <p className="text-xs text-content-secondary flex items-center gap-1">
                  <Phone className="w-3 h-3" />{selected.from_phone}
                </p>
              </div>
            </div>

            {/* Messages avec séparateurs de date */}
            <div ref={msgContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1">
              {loadingMsg ? (
                <div className="flex justify-center text-content-secondary py-8">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : messageRows.map((row, i) => {
                if (row.type === 'separator') {
                  return (
                    <div key={`sep-${i}`} className="flex items-center gap-3 py-3">
                      <div className="flex-1 h-px bg-surface-border" />
                      <span className="text-xs text-content-muted font-medium px-2 shrink-0">{row.label}</span>
                      <div className="flex-1 h-px bg-surface-border" />
                    </div>
                  );
                }

                const msg = row.msg;
                const isHighlighted = msg.id === highlightId;
                return (
                  <div
                    key={msg.id}
                    ref={(el) => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); }}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'} ${isHighlighted ? 'animate-pulse-once' : ''}`}
                  >
                    <div className={`max-w-[75%] rounded-2xl overflow-hidden transition-all ${
                      msg.direction === 'outbound'
                        ? 'bg-green-700 text-content-primary rounded-br-sm'
                        : 'bg-surface-input text-content-primary rounded-bl-sm'
                    } ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-transparent' : ''}`}>
                      {(msg.payload as { image_url?: string } | null)?.image_url && (
                        <img
                          src={(msg.payload as { image_url: string }).image_url}
                          alt={msg.body ?? ''}
                          className="w-full max-h-48 object-cover"
                        />
                      )}
                      <div className="px-4 py-2.5 space-y-1">
                        {msg.order_id && (
                          <Link
                            href={`/orders?order=${msg.order_id}`}
                            className="flex items-center gap-1 text-xs font-medium mb-1 px-2 py-0.5 rounded-full bg-green-600 hover:bg-green-500 text-content-primary w-fit transition-colors"
                          >
                            <ShoppingCart className="w-3 h-3" />
                            <span>Commande #{msg.order_id.slice(0, 8).toUpperCase()}</span>
                          </Link>
                        )}
                        {msg.message_type === 'location' && (() => {
                          const loc = (msg.payload as { location?: { latitude?: number; longitude?: number; name?: string; address?: string } } | null)?.location;
                          const lat = loc?.latitude;
                          const lng = loc?.longitude;
                          if (lat && lng) return (
                            <a
                              href={`https://www.google.com/maps?q=${lat},${lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm underline underline-offset-2 hover:opacity-80"
                            >
                              <span>📍</span>
                              <span>{loc?.name ?? loc?.address ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`}</span>
                            </a>
                          );
                          return <p className="text-sm">{msg.body ?? '📍 Localisation'}</p>;
                        })()}
                        {msg.message_type !== 'location' && (
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.body ?? '—'}</p>
                        )}
                        <p className={`text-xs ${msg.direction === 'outbound' ? 'text-green-200' : 'text-content-secondary'} text-right`}>
                          {timeStr(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Zone de réponse */}
            {canReply && config ? (
              <div className="p-4 border-t border-surface-border">
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    placeholder="Tapez votre réponse…"
                    rows={2}
                    className="input flex-1 resize-none text-sm"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!reply.trim() || sending}
                    className="btn-primary h-10 w-10 flex items-center justify-center shrink-0 disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-content-muted mt-1">Entrée pour envoyer · Maj+Entrée pour saut de ligne</p>
              </div>
            ) : (
              <div className="p-4 border-t border-surface-border text-center text-xs text-content-muted">
                Seuls les managers et supérieurs peuvent répondre.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
