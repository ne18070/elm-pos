'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, RefreshCw, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
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

type Message = {
  id: string;
  role: Role;
  content: string;
  conversationId?: string | null;
};

type ClientList = Awaited<ReturnType<typeof getClients>>;

type AssistantContext = {
  business: Pick<Business, 'id' | 'name' | 'type' | 'currency' | 'tax_rate' | 'tax_inclusive' | 'features' | 'types'>;
  user: Pick<User, 'id' | 'full_name' | 'role'>;
  generated_at: string;
  analytics: AnalyticsSummary | null;
  products: Array<{
    name: string;
    price: number;
    stock?: number;
    category?: string;
  }>;
  low_stock: Array<{
    name: string;
    stock?: number;
  }>;
  recent_orders: Array<{
    status: string;
    total: number;
    customer_name?: string;
    created_at: string;
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
      ?? "Bonjour ! Je suis l'assistant IA d'ELM APP. Je peux analyser vos ventes, commandes, produits et clients.",
  };
}

const SUGGESTIONS_BY_TYPE: Record<string, string[]> = {
  restaurant: [
    "Résumé des ventes du jour",
    "Plats les plus commandés ce mois",
    "Commandes en attente",
    "Chiffre d'affaires des 30 derniers jours",
  ],
  retail: [
    "Résumé des ventes des 30 derniers jours",
    "Quels produits sont en stock bas ?",
    "Meilleurs produits du mois",
    "Donne-moi 5 actions prioritaires",
  ],
  service: [
    "Ordres de travail en cours",
    "Encaissements du jour",
    "Ordres en attente depuis plus de 3 jours",
    "Chiffre d'affaires des 30 derniers jours",
  ],
  hotel: [
    "Chambres occupées aujourd'hui",
    "Réservations à venir cette semaine",
    "Revenus du mois en cours",
    "Taux d'occupation du dernier mois",
  ],
  juridique: [
    "Dossiers en cours",
    "Honoraires facturés ce mois",
    "Clients avec honoraires en attente",
    "Résumé de l'activité du cabinet",
  ],
  education: [
    "Élèves inscrits cette année",
    "Scolarités impayées",
    "Résumé par classe",
    "Activité de l'établissement ce mois",
  ],
};

const DEFAULT_SUGGESTIONS = [
  "Résumé des ventes des 30 derniers jours",
  "Quels produits dois-je surveiller ?",
  "Analyse les commandes récentes",
  "Donne-moi 5 actions prioritaires",
];

function buildSuggestions(businessType?: string | null): string[] {
  return (businessType ? SUGGESTIONS_BY_TYPE[businessType] : undefined) ?? DEFAULT_SUGGESTIONS;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

async function callAssistant(messages: Message[], context: AssistantContext) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session utilisateur introuvable.');

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      businessId: context.business.id,
      messages: messages.map(({ role, content }) => ({ role, content })),
      context,
    }),
  });

  const payload = await response.json() as {
    answer?: string;
    error?: string;
    conversationId?: string | null;
  };
  if (!response.ok || !payload.answer) {
    throw new Error(payload.error ?? 'Réponse IA indisponible.');
  }

  return {
    answer: payload.answer,
    conversationId: payload.conversationId ?? null,
  };
}

function buildContext(
  business: Business,
  user: User,
  products: Product[],
  orders: Order[],
  analytics: AnalyticsSummary | null,
  clients: ClientList,
): AssistantContext {
  const lowStock = products
    .filter((product) => product.track_stock && Number(product.stock ?? 0) <= 5)
    .slice(0, 20);

  return {
    business: {
      id: business.id,
      name: business.name,
      type: business.type,
      currency: business.currency,
      tax_rate: business.tax_rate,
      tax_inclusive: business.tax_inclusive,
      features: business.features ?? [],
      types: business.types ?? [],
    },
    user: {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
    },
    generated_at: new Date().toISOString(),
    analytics,
    products: products.slice(0, 40).map((product) => ({
      name: product.name,
      price: product.price,
      stock: product.stock,
      category: product.category?.name,
    })),
    low_stock: lowStock.map((product) => ({
      name: product.name,
      stock: product.stock,
    })),
    recent_orders: orders.slice(0, 12).map((order) => ({
      status: order.status,
      total: order.total,
      customer_name: order.customer_name,
      created_at: order.created_at,
    })),
    clients_count: clients.length,
    sample_clients: clients.slice(0, 10).map((client) => ({
      name: client.name,
      phone: client.phone,
      email: client.email,
    })),
    current_page: getPageInfo('/assistant'),
  };
}

export default function AssistantPage() {
  const { user, business } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>(() => [buildWelcome(business?.type)]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [context, setContext] = useState<AssistantContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const canUseAssistant = user && ['owner', 'manager', 'admin', 'staff'].includes(user.role);

  async function refreshContext() {
    if (!business?.id || !user?.id) return;

    setIsLoadingContext(true);
    setContextError(null);
    try {
      const [products, ordersResult, analytics, clients] = await Promise.all([
        getProducts(business.id),
        getOrders(business.id, { limit: 30 }),
        getAnalyticsSummary(business.id, 30).catch(() => null),
        getClients(business.id).catch(() => []),
      ]);

      setContext(buildContext(business, user, products, ordersResult.orders, analytics, clients));
    } catch (error) {
      setContextError(error instanceof Error ? error.message : 'Impossible de charger le contexte.');
    } finally {
      setIsLoadingContext(false);
    }
  }

  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].id === 'welcome' ? [buildWelcome(business?.type)] : prev,
    );
  }, [business?.type]);

  useEffect(() => {
    refreshContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, user?.id]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isSending]);

  const stats = useMemo(() => {
    if (!context) return null;
    return [
      { label: 'CA 30 jours', value: formatCurrency(context.analytics?.total_sales ?? 0, context.business.currency) },
      { label: 'Commandes', value: String(context.analytics?.order_count ?? context.recent_orders.length) },
      { label: 'Produits', value: String(context.products.length) },
      { label: 'Stock bas', value: String(context.low_stock.length) },
    ];
  }, [context]);

  async function askAssistant(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isSending || !context) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const result = await callAssistant(nextMessages, context);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', content: result.answer, conversationId: result.conversationId },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error instanceof Error
            ? error.message
            : "L'assistant est temporairement indisponible.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    askAssistant(input);
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
      if (saved) {
        setMemoryStatus('Réponse mémorisée. Elle sera réutilisée dans les prochaines conversations.');
        return;
      }
    }

    setMemoryStatus(rating === 'bad'
      ? 'Feedback enregistré. Ajoutez une correction dans votre prochain message pour améliorer la mémoire.'
      : 'Feedback enregistré.');
  }

  if (!canUseAssistant) {
    return (
      <div className="flex-1 overflow-auto bg-surface-base p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-surface-border bg-surface-card p-6">
          <h1 className="text-xl font-bold text-content-primary">Assistant IA</h1>
          <p className="mt-2 text-sm text-content-secondary">{"Votre rôle ne permet pas d'utiliser l'assistant."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 bg-surface-base overflow-hidden">
      <div className="h-full flex flex-col">
        <header className="border-b border-surface-border bg-surface-card px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-xl bg-brand-500/10 text-content-brand flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-content-primary truncate">Assistant IA</h1>
                <p className="text-sm text-content-secondary truncate">
                  {business?.name ?? 'Business courant'} — lecture seule
                </p>
              </div>
            </div>
            <button
              onClick={refreshContext}
              disabled={isLoadingContext}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover disabled:opacity-60"
            >
              {isLoadingContext ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualiser
            </button>
          </div>
          {stats && (
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {stats.map((item) => (
                <div key={item.label} className="rounded-lg border border-surface-border bg-surface-base px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-content-muted">{item.label}</p>
                  <p className="text-sm font-bold text-content-primary truncate">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </header>

        <main ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-brand-500/20 bg-brand-500/5 px-3 py-2 text-xs text-content-secondary">
              <ShieldCheck className="h-4 w-4 text-content-brand shrink-0" />
              {"L'assistant ne modifie aucune donnée. Il utilise uniquement le contexte chargé depuis vos permissions."}
            </div>

            {contextError && (
              <div className="rounded-lg border border-status-error/30 bg-red-500/10 px-3 py-2 text-sm text-status-error">
                {contextError}
              </div>
            )}

            {memoryStatus && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-600">
                {memoryStatus}
              </div>
            )}

            {!context && !contextError && (
              <div className="flex items-center gap-2 text-sm text-content-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement du contexte business...
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[86%] rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-wrap',
                    message.role === 'user'
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-card border border-surface-border text-content-primary',
                  )}
                >
                  {message.content}
                  {message.role === 'assistant' && message.id !== 'welcome' && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-surface-border/60 pt-2">
                      <button
                        onClick={() => handleFeedback(message, 'good')}
                        className="rounded-md border border-surface-border px-2 py-1 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                      >
                        Mémoriser
                      </button>
                      <button
                        onClick={() => handleFeedback(message, 'bad')}
                        className="rounded-md border border-surface-border px-2 py-1 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                      >
                        Signaler erreur
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface-card px-4 py-3 text-sm text-content-secondary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyse en cours...
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="border-t border-surface-border bg-surface-card px-4 py-4 md:px-6">
          <div className="mx-auto max-w-4xl space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {buildSuggestions(business?.type).map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => askAssistant(suggestion)}
                  disabled={!context || isSending}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-surface-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-hover hover:text-content-primary disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {suggestion}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    askAssistant(input);
                  }
                }}
                placeholder="Posez une question sur vos ventes, stocks, clients ou commandes..."
                rows={1}
                className="min-h-[44px] max-h-32 flex-1 resize-none rounded-lg border border-surface-border bg-surface-base px-3 py-3 text-sm text-content-primary outline-none focus:border-brand-500"
                disabled={!context || isSending}
              />
              <button
                type="submit"
                disabled={!context || isSending || !input.trim()}
                className="h-11 w-11 shrink-0 rounded-lg bg-brand-500 text-white inline-flex items-center justify-center hover:bg-brand-600 disabled:opacity-60"
                aria-label="Envoyer"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
            <p className="text-xs text-content-muted">
              {"L'assistant analyse uniquement les données du business courant. Il ne peut pas modifier vos données."}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
