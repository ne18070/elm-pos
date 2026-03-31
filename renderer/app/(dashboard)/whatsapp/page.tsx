'use client';

import { toUserError } from '@/lib/user-error';
import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  MessageCircle, Send, RefreshCw, Search, ShoppingCart,
  ChevronRight, ArrowLeft, Phone, Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { hasRole } from '@/lib/permissions';
import {
  getWhatsAppConfig, getConversations, getMessages, markMessagesRead, sendWhatsAppReply,
  type WhatsAppConfig, type WhatsAppMessage, type WhatsAppConversation,
} from '@services/supabase/whatsapp';

export default function WhatsAppPage() {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [config, setConfig]               = useState<WhatsAppConfig | null>(null);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selected, setSelected]           = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages]           = useState<WhatsAppMessage[]>([]);
  const [search, setSearch]               = useState('');
  const [reply, setReply]                 = useState('');
  const [sending, setSending]             = useState(false);
  const [loading, setLoading]             = useState(true);
  const [loadingMsg, setLoadingMsg]       = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const canReply  = hasRole(user?.role, 'manager');

  const loadConversations = useCallback(async () => {
    if (!business?.id) return;
    try {
      const [cfg, convos] = await Promise.all([
        getWhatsAppConfig(business.id),
        getConversations(business.id),
      ]);
      setConfig(cfg);
      setConversations(convos);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, notifError]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  async function openConversation(conv: WhatsAppConversation) {
    if (!business?.id) return;
    setSelected(conv);
    setLoadingMsg(true);
    try {
      const msgs = await getMessages(business.id, conv.from_phone);
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

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function handleSend() {
    if (!config || !selected || !reply.trim() || !user?.id) return;
    setSending(true);
    const text = reply.trim();
    setReply('');
    try {
      await sendWhatsAppReply(config, selected.from_phone, text, user.id);
      success('Message envoyé');
      // Optimistic update
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

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.from_phone.includes(q) || (c.from_name?.toLowerCase().includes(q) ?? false);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!config?.is_active) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-green-900/30 border border-green-700/40 flex items-center justify-center">
          <MessageCircle className="w-8 h-8 text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">WhatsApp Business non configuré</h2>
          <p className="text-sm text-slate-400 max-w-sm">
            Configurez votre intégration WhatsApp Business dans les Paramètres pour recevoir et répondre aux messages.
          </p>
        </div>
        <a href="/settings" className="btn-primary px-5 py-2">Aller aux Paramètres</a>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Liste des conversations ───────────────────────────────────────── */}
      <div className={`w-full md:w-80 shrink-0 border-r border-surface-border flex flex-col ${selected ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-surface-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-green-900/40 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-white">WhatsApp</h1>
                {config.display_phone && (
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3" />{config.display_phone}
                  </p>
                )}
              </div>
            </div>
            <button onClick={loadConversations} className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-400">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-8 text-sm h-8"
            />
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-sm gap-2">
              <MessageCircle className="w-8 h-8 opacity-30" />
              <span>Aucune conversation</span>
            </div>
          ) : filtered.map((conv) => (
            <button
              key={conv.from_phone}
              onClick={() => openConversation(conv)}
              className={`w-full flex items-center gap-3 px-4 py-3 border-b border-surface-border hover:bg-surface-hover transition-colors text-left ${
                selected?.from_phone === conv.from_phone ? 'bg-surface-hover' : ''
              }`}
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-green-900/40 border border-green-700/40 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-green-400">
                  {(conv.from_name ?? conv.from_phone).charAt(0).toUpperCase()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white truncate">
                    {conv.from_name ?? conv.from_phone}
                  </p>
                  <span className="text-xs text-slate-500 shrink-0 ml-2">
                    {format(new Date(conv.last_at), 'HH:mm', { locale: fr })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400 truncate">{conv.last_message ?? '—'}</p>
                  {conv.unread > 0 && (
                    <span className="ml-2 shrink-0 w-5 h-5 rounded-full bg-green-600 text-white text-xs flex items-center justify-center font-bold">
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Zone de conversation ──────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-w-0 ${!selected ? 'hidden md:flex' : 'flex'}`}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
            <MessageCircle className="w-12 h-12 opacity-20" />
            <p className="text-sm">Sélectionnez une conversation</p>
          </div>
        ) : (
          <>
            {/* Header conversation */}
            <div className="p-4 border-b border-surface-border flex items-center gap-3">
              <button
                onClick={() => setSelected(null)}
                className="md:hidden p-1.5 rounded-lg hover:bg-surface-hover text-slate-400"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-9 h-9 rounded-full bg-green-900/40 border border-green-700/40 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-green-400">
                  {(selected.from_name ?? selected.from_phone).charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm">{selected.from_name ?? selected.from_phone}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Phone className="w-3 h-3" />{selected.from_phone}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsg ? (
                <div className="flex justify-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 space-y-1 ${
                    msg.direction === 'outbound'
                      ? 'bg-green-700 text-white rounded-br-sm'
                      : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                  }`}>
                    {/* Lien commande */}
                    {msg.order_id && (
                      <div className="flex items-center gap-1 text-xs font-medium mb-1 px-2 py-0.5 rounded-full bg-green-600 text-white w-fit">
                        <ShoppingCart className="w-3 h-3" />
                        <span>Commande #{msg.order_id.slice(0, 8).toUpperCase()}</span>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.body ?? '—'}</p>
                    <p className={`text-xs ${msg.direction === 'outbound' ? 'text-green-200' : 'text-slate-400'} text-right`}>
                      {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                    </p>
                  </div>
                </div>
              ))}
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
                <p className="text-xs text-slate-500 mt-1">Entrée pour envoyer · Maj+Entrée pour saut de ligne</p>
              </div>
            ) : (
              <div className="p-4 border-t border-surface-border text-center text-xs text-slate-500">
                Seuls les managers et supérieurs peuvent répondre.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
