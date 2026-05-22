'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, Send, X, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { usePermissionsStore } from '@/store/permissions';
import { checkPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { getProducts } from '@services/supabase/products';
import { getOrders } from '@services/supabase/orders';
import { getClients } from '@services/supabase/clients';
import { getAnalyticsSummary } from '@services/supabase/analytics';
import { saveAiFeedback, saveAiKnowledge } from '@services/supabase/ai-assistant';
import { supabase } from '@/lib/supabase';
import { getPageInfo } from '@/lib/ai-page-context';
import type { AnalyticsSummary, Business, Order, Product, User } from '@pos-types';

type Role = 'user' | 'assistant';
type Message = { id: string; role: Role; content: string; conversationId?: string | null };
type ClientList = Awaited<ReturnType<typeof getClients>>;

type AssistantContext = {
  business: Pick<Business, 'id' | 'name' | 'type' | 'currency' | 'tax_rate' | 'tax_inclusive' | 'features' | 'types'>;
  user: Pick<User, 'id' | 'full_name' | 'role'>;
  generated_at: string;
  analytics: AnalyticsSummary | null;
  products: Array<{ name: string; price: number; stock?: number; category?: string }>;
  low_stock: Array<{ name: string; stock?: number }>;
  recent_orders: Array<{
    status: string; total: number;
    customer_name?: string; created_at: string;
  }>;
  clients_count: number;
  sample_clients: Array<{ name: string; phone?: string | null; email?: string | null }>;
  current_page?: { name: string; actions: string } | null;
};

const WELCOME_BY_TYPE: Record<string, string> = {
  restaurant: "Bonjour ! Je peux analyser vos commandes, ventes du jour, menus et performance de votre restaurant.",
  retail: "Bonjour ! Je peux analyser vos ventes, niveaux de stock, produits et clients de votre commerce.",
  service: "Bonjour ! Je peux analyser vos ordres de travail, réparations en cours, chiffre d'affaires et clients de votre atelier.",
  hotel: "Bonjour ! Je peux analyser vos réservations, disponibilité des chambres et revenus de votre hôtel.",
  juridique: "Bonjour ! Je peux analyser vos dossiers, honoraires, clients et activité de votre cabinet.",
  education: "Bonjour ! Je peux analyser vos élèves, scolarités, classes et activité de votre établissement.",
};

function buildWelcome(businessType?: string | null): Message {
  return {
    id: 'welcome',
    role: 'assistant',
    content: (businessType && WELCOME_BY_TYPE[businessType])
      ?? "Bonjour ! Je peux analyser vos ventes, stocks, clients et commandes. Posez-moi une question.",
  };
}

const SUGGESTIONS_BY_TYPE: Record<string, string[]> = {
  restaurant: ["Ventes du jour", "Plats les plus commandés", "Commandes en attente"],
  retail: ["Ventes du jour", "Stock bas", "Meilleurs produits"],
  service: ["Ordres en cours", "Encaissements du jour", "Ordres en attente"],
  hotel: ["Chambres occupées", "Réservations du jour", "Revenus du mois"],
  juridique: ["Dossiers en cours", "Honoraires du mois", "Clients actifs"],
  education: ["Élèves inscrits", "Scolarités impayées", "Classes actives"],
};

const DEFAULT_SUGGESTIONS = ["Ventes du jour", "Stock bas", "Commandes récentes"];

function buildSuggestions(businessType?: string | null): string[] {
  return (businessType ? SUGGESTIONS_BY_TYPE[businessType] : undefined) ?? DEFAULT_SUGGESTIONS;
}

async function callAssistant(messages: Message[], context: AssistantContext) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session introuvable.');

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      businessId: context.business.id,
      messages: messages.map(({ role, content }) => ({ role, content })),
      context,
    }),
  });

  const payload = await response.json() as { answer?: string; error?: string; conversationId?: string | null; retryAfter?: number };
  if (!response.ok || !payload.answer) {
    const err = new Error(payload.error ?? 'Réponse IA indisponible.') as Error & { retryAfter?: number };
    err.retryAfter = payload.retryAfter;
    throw err;
  }
  return { answer: payload.answer, conversationId: payload.conversationId ?? null };
}

function buildContext(
  business: Business, user: User, products: Product[],
  orders: Order[], analytics: AnalyticsSummary | null, clients: ClientList,
  pathname?: string,
): AssistantContext {
  const lowStock = products.filter((p) => p.track_stock && Number(p.stock ?? 0) <= 5).slice(0, 10);
  return {
    business: {
      id: business.id, name: business.name, type: business.type,
      currency: business.currency, tax_rate: business.tax_rate,
      tax_inclusive: business.tax_inclusive,
      features: business.features ?? [], types: business.types ?? [],
    },
    user: { id: user.id, full_name: user.full_name, role: user.role },
    generated_at: new Date().toISOString(),
    analytics,
    products: products.slice(0, 40).map((p) => ({
      name: p.name, price: p.price, stock: p.stock, category: p.category?.name,
    })),
    low_stock: lowStock.map((p) => ({ name: p.name, stock: p.stock })),
    recent_orders: orders.slice(0, 12).map((o) => ({
      status: o.status, total: o.total,
      customer_name: o.customer_name, created_at: o.created_at,
    })),
    clients_count: clients.length,
    sample_clients: clients.slice(0, 10).map((c) => ({ name: c.name, phone: c.phone, email: c.email })),
    current_page: pathname ? getPageInfo(pathname) : null,
  };
}

export function AssistantWidget() {
  const pathname = usePathname();
  const { user, business } = useAuthStore();
  const { overrides } = usePermissionsStore();

  const [isOpen, setIsOpen] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [context, setContext] = useState<AssistantContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [buildWelcome(business?.type)]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [memoryStatus, setMemoryStatus] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const hasDragged = useRef(false);
  const dragOrigin = useRef({ px: 0, py: 0, bx: 0, by: 0 });

  const canUse = !!user && checkPermission(user.role, 'view_ai_assistant', overrides, business);
  const isAssistantPage = pathname === '/assistant';

  // Cleanup cooldown interval on unmount
  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  // Keep current_page in sync as the user navigates between pages
  useEffect(() => {
    setContext((prev) => prev ? { ...prev, current_page: getPageInfo(pathname) } : prev);
  }, [pathname]);

  // Update welcome message when business type becomes known (only if no conversation yet)
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].id === 'welcome' ? [buildWelcome(business?.type)] : prev,
    );
  }, [business?.type]);

  // All hooks must be called unconditionally before any early return
  useEffect(() => {
    if (!isOpen || contextLoaded || !canUse || isAssistantPage || !business?.id || !user?.id) return;
    setContextLoaded(true);
    setIsLoadingContext(true);
    Promise.all([
      getProducts(business.id),
      getOrders(business.id, { limit: 20 }),
      getAnalyticsSummary(business.id, 30).catch(() => null),
      getClients(business.id).catch(() => []),
    ]).then(([products, ordersResult, analytics, clients]) => {
      setContext(buildContext(business, user, products, ordersResult.orders, analytics, clients, pathname));
    }).finally(() => setIsLoadingContext(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isSending]);

  useEffect(() => {
    const saved = localStorage.getItem('assistant-widget-pos');
    if (saved) {
      try { setPos(JSON.parse(saved)); return; } catch {}
    }
    setPos({ x: window.innerWidth - 64, y: window.innerHeight - 96 });
  }, []);

  if (isAssistantPage || !canUse) return null;

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    hasDragged.current = false;
    dragOrigin.current = { px: e.clientX, py: e.clientY, bx: pos.x, by: pos.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.buttons === 0) return;
    const dx = e.clientX - dragOrigin.current.px;
    const dy = e.clientY - dragOrigin.current.py;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    hasDragged.current = true;
    setPos({
      x: Math.max(4, Math.min(window.innerWidth - 52, dragOrigin.current.bx + dx)),
      y: Math.max(4, Math.min(window.innerHeight - 52, dragOrigin.current.by + dy)),
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!hasDragged.current) return;
    const x = Math.max(4, Math.min(window.innerWidth - 52, dragOrigin.current.bx + (e.clientX - dragOrigin.current.px)));
    const y = Math.max(4, Math.min(window.innerHeight - 52, dragOrigin.current.by + (e.clientY - dragOrigin.current.py)));
    localStorage.setItem('assistant-widget-pos', JSON.stringify({ x, y }));
  }

  function loadContext() {
    if (!business?.id || !user?.id) return;
    setIsLoadingContext(true);
    Promise.all([
      getProducts(business.id),
      getOrders(business.id, { limit: 20 }),
      getAnalyticsSummary(business.id, 30).catch(() => null),
      getClients(business.id).catch(() => []),
    ]).then(([products, ordersResult, analytics, clients]) => {
      setContext(buildContext(business, user, products, ordersResult.orders, analytics, clients, pathname));
    }).finally(() => setIsLoadingContext(false));
  }

  function startCooldown(seconds: number) {
    setCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); cooldownRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isSending || !context || cooldown > 0) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setIsSending(true);
    setMemoryStatus(null);

    try {
      const result = await callAssistant(next, context);
      setMessages((cur) => [
        ...cur,
        { id: crypto.randomUUID(), role: 'assistant', content: result.answer, conversationId: result.conversationId },
      ]);
    } catch (err) {
      const retryAfter = (err as Error & { retryAfter?: number }).retryAfter;
      if (retryAfter) startCooldown(retryAfter);
      setMessages((cur) => [
        ...cur,
        { id: crypto.randomUUID(), role: 'assistant', content: err instanceof Error ? err.message : "L'assistant est temporairement indisponible." },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleFeedback(message: Message, rating: 'good' | 'bad') {
    if (!business?.id || !user?.id) return;
    setMemoryStatus(null);
    await saveAiFeedback({
      business_id: business.id,
      conversation_id: message.conversationId ?? null,
      user_id: user.id,
      rating,
      comment: message.content.slice(0, 1000),
    });
    if (rating === 'good') {
      const saved = await saveAiKnowledge({
        business_id: business.id,
        created_by: user.id,
        title: `Réponse validée - ${new Date().toLocaleDateString('fr-FR')}`,
        content: message.content.slice(0, 3000),
        source: 'validated_answer',
      });
      if (saved) { setMemoryStatus('Mémorisé.'); return; }
    }
    setMemoryStatus(rating === 'bad' ? 'Signalé.' : 'Enregistré.');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <>
      {/* Floating trigger button (draggable) */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => { if (!hasDragged.current) setIsOpen(true); }}
        style={pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : undefined}
        className={cn(
          'fixed z-40 flex items-center justify-center rounded-full shadow-lg select-none touch-none',
          !pos && 'bottom-20 right-4 md:bottom-6 md:right-6',
          'h-12 w-12 bg-brand-500 text-white hover:bg-brand-600 cursor-grab active:cursor-grabbing',
          isOpen && 'opacity-0 pointer-events-none',
        )}
        aria-label="Ouvrir l'assistant IA"
      >
        <Bot className="h-5 w-5" />
      </button>

      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide panel */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full flex flex-col bg-surface-card shadow-2xl transition-transform duration-300',
          'w-full sm:w-96',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-surface-border px-4 py-3 shrink-0">
          <div className="h-8 w-8 rounded-lg bg-brand-500/10 text-content-brand flex items-center justify-center">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-content-primary">Assistant IA</p>
            <p className="text-xs text-content-muted truncate">{business?.name ?? 'Business courant'}</p>
          </div>
          <button
            onClick={() => { loadContext(); setContextLoaded(true); }}
            disabled={isLoadingContext}
            className="rounded-md p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-hover disabled:opacity-50"
            aria-label="Actualiser le contexte"
          >
            {isLoadingContext
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-hover"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {!context && !isLoadingContext && (
            <p className="text-xs text-content-muted text-center py-2">Contexte non chargé.</p>
          )}
          {isLoadingContext && (
            <div className="flex items-center gap-2 text-xs text-content-secondary py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Chargement du contexte...
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-base border border-surface-border text-content-primary',
                )}
              >
                {msg.content}
                {msg.role === 'assistant' && msg.id !== 'welcome' && (
                  <div className="mt-2 flex gap-1.5 border-t border-surface-border/60 pt-1.5">
                    <button
                      onClick={() => handleFeedback(msg, 'good')}
                      className="rounded px-1.5 py-0.5 text-[11px] text-content-muted hover:text-content-primary hover:bg-surface-hover"
                    >
                      Mémoriser
                    </button>
                    <button
                      onClick={() => handleFeedback(msg, 'bad')}
                      className="rounded px-1.5 py-0.5 text-[11px] text-content-muted hover:text-content-primary hover:bg-surface-hover"
                    >
                      Signaler
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface-base px-3 py-2 text-sm text-content-secondary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyse...
              </div>
            </div>
          )}

          {memoryStatus && (
            <p className="text-center text-xs text-green-600">{memoryStatus}</p>
          )}

        </div>

        {/* Quick suggestions */}
        {messages.length <= 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 shrink-0">
            {buildSuggestions(business?.type).map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={!context || isSending || cooldown > 0}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-surface-border px-2.5 py-1 text-[11px] text-content-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-surface-border px-4 py-3 shrink-0">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); }
            }}
            placeholder="Posez une question..."
            rows={1}
            className="min-h-[40px] max-h-28 flex-1 resize-none rounded-lg border border-surface-border bg-surface-base px-3 py-2 text-sm text-content-primary outline-none focus:border-brand-500"
            disabled={!context || isSending || cooldown > 0}
          />
          <button
            type="submit"
            disabled={!context || isSending || !input.trim() || cooldown > 0}
            className="h-10 w-10 shrink-0 rounded-lg bg-brand-500 text-white inline-flex items-center justify-center hover:bg-brand-600 disabled:opacity-50"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : cooldown > 0 ? <span className="text-xs font-bold">{cooldown}s</span> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </>
  );
}
