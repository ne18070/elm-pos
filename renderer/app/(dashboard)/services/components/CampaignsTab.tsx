'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MessageCircle, Plus, Save, Trash2, Search, ChevronRight,
  X, Send, Users, Eye, EyeOff, ExternalLink,
  CheckCircle2, Circle, ChevronLeft, Copy,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { getDistinctServiceClients, type ServiceOrderClient } from '@services/supabase/service-orders';

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateCategory = 'rappel' | 'termine' | 'devis' | 'avis' | 'promo' | 'autre';

type MessageTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  body: string;
  updatedAt: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES: { key: TemplateCategory; label: string; color: string }[] = [
  { key: 'rappel',  label: 'Rappel',     color: 'text-status-warning  bg-badge-warning  border-status-warning/30'  },
  { key: 'termine', label: 'Terminé',    color: 'text-status-success  bg-badge-success  border-status-success/30'  },
  { key: 'devis',   label: 'Devis',      color: 'text-content-brand   bg-brand-500/10   border-brand-500/30'        },
  { key: 'avis',    label: 'Avis client',color: 'text-status-info     bg-badge-info     border-status-info/30'      },
  { key: 'promo',   label: 'Promotion',  color: 'text-purple-400      bg-purple-400/10  border-purple-400/30'       },
  { key: 'autre',   label: 'Autre',      color: 'text-content-muted   bg-surface-hover  border-surface-border'      },
];

const VARIABLES: { key: string; label: string; example: string; emoji: string; hint: string }[] = [
  { key: '{prenom}',    label: 'Prénom',          example: 'Amadou',         emoji: '👤', hint: 'Le prénom du client'             },
  { key: '{nom}',       label: 'Nom complet',     example: 'Amadou Diallo',  emoji: '👤', hint: 'Prénom + nom du client'          },
  { key: '{reference}', label: 'N° de l\'OT',     example: 'OT-0042',        emoji: '📋', hint: 'Le numéro de l\'ordre de travail'},
  { key: '{service}',   label: 'Prestation',      example: 'Vidange moteur', emoji: '🔧', hint: 'Le service demandé'              },
  { key: '{montant}',   label: 'Montant',         example: '25 000 FCFA',    emoji: '💰', hint: 'Le total de la facture'          },
  { key: '{statut}',    label: 'Statut',          example: 'Terminé',        emoji: '📊', hint: 'L\'état actuel de l\'OT'        },
  { key: '{business}',  label: 'Nom du garage',   example: 'Garage Alpha',   emoji: '🏢', hint: 'Le nom de votre établissement'  },
  { key: '{date}',      label: 'Date du jour',    example: '19 mai 2026',    emoji: '📅', hint: 'La date d\'aujourd\'hui'        },
];

const STATUS_LABELS: Record<string, string> = {
  attente:  'En attente',
  en_cours: 'En cours',
  pause:    'En pause',
  termine:  'Terminé',
  paye:     'Payé',
  annule:   'Annulé',
};

const DEFAULT_TEMPLATES: Omit<MessageTemplate, 'id' | 'updatedAt'>[] = [
  {
    name: 'OT en cours — rappel',
    category: 'rappel',
    body: 'Bonjour {prenom},\n\nNous tenions à vous informer que votre prestation {reference} est actuellement en cours de traitement chez {business}.\n\nNous vous contacterons dès la fin des travaux.\n\nMerci de votre confiance 🙏',
  },
  {
    name: 'Travaux terminés',
    category: 'termine',
    body: 'Bonjour {prenom} 👋\n\nBonne nouvelle ! Votre prestation {reference} ({service}) est terminée.\n\nVous pouvez passer récupérer votre bien à votre convenance.\nMontant à régler : *{montant}*\n\nÀ bientôt chez {business} !',
  },
  {
    name: 'Demande d\'avis',
    category: 'avis',
    body: 'Bonjour {prenom},\n\nMerci pour votre visite chez {business} !\n\nComment s\'est passée votre prestation {reference} ?\nVotre retour nous aide à nous améliorer.\n\nBonne journée ! 🙏',
  },
  {
    name: 'Envoi de devis',
    category: 'devis',
    body: 'Bonjour {prenom},\n\nSuite à votre passage chez {business}, voici le devis estimatif pour votre prestation :\n\n• {service}\n• Montant estimé : *{montant}*\n\nMerci de nous confirmer si vous souhaitez procéder.\n\nCordialement,\n{business}',
  },
  {
    name: 'Offre promotionnelle',
    category: 'promo',
    body: 'Bonjour {prenom} 🎉\n\nChez {business}, nous avons une offre spéciale pour vous !\n\n📌 {service}\n\nContactez-nous pour en profiter.\n\nÀ bientôt !',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function storageKey(bid: string) { return `wa_tpl_v1_${bid}`; }

function loadTemplates(bid: string): MessageTemplate[] {
  try {
    const raw = localStorage.getItem(storageKey(bid));
    if (raw) return JSON.parse(raw);
  } catch {}
  const seeds = DEFAULT_TEMPLATES.map(t => ({
    ...t, id: crypto.randomUUID(), updatedAt: new Date().toISOString(),
  }));
  localStorage.setItem(storageKey(bid), JSON.stringify(seeds));
  return seeds;
}

function saveTemplates(bid: string, tpls: MessageTemplate[]) {
  localStorage.setItem(storageKey(bid), JSON.stringify(tpls));
}

function substituteVars(body: string, client: ServiceOrderClient, bizName: string, currency: string): string {
  return body
    .replace(/\{nom\}/g,       client.name)
    .replace(/\{prenom\}/g,    client.name.split(' ')[0])
    .replace(/\{telephone\}/g, client.phone)
    .replace(/\{reference\}/g, client.lastRef)
    .replace(/\{service\}/g,   client.lastService || '—')
    .replace(/\{montant\}/g,   formatCurrency(client.lastTotal, currency))
    .replace(/\{statut\}/g,    STATUS_LABELS[client.lastStatus] ?? client.lastStatus)
    .replace(/\{business\}/g,  bizName)
    .replace(/\{date\}/g,      new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }));
}

function buildWaLink(phone: string, message: string) {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function insertAtCursor(ta: HTMLTextAreaElement, text: string, body: string): { newBody: string; pos: number } {
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const newBody = body.slice(0, s) + text + body.slice(e);
  return { newBody, pos: s + text.length };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CategoryPill({ cat, active, onClick }: { cat: typeof CATEGORIES[0]; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
        active ? cat.color : 'text-content-muted bg-surface-hover border-surface-border hover:text-content-secondary',
      )}
    >
      {cat.label}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    attente: 'bg-status-warning', en_cours: 'bg-status-info',
    termine: 'bg-status-success', paye: 'bg-status-success',
    annule: 'bg-status-error', pause: 'bg-status-orange',
  };
  return <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', colors[status] ?? 'bg-content-muted')} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CampaignsTab({ businessId }: { businessId: string }) {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const currency = business?.currency ?? 'XOF';
  const bizName  = business?.name ?? '';

  // ── Help banner state ─────────────────────────────────────────────────────
  const [showHelp, setShowHelp] = useState(() => {
    try { return localStorage.getItem('wa_campaigns_help_dismissed') !== '1'; } catch { return true; }
  });

  function dismissHelp() {
    setShowHelp(false);
    try { localStorage.setItem('wa_campaigns_help_dismissed', '1'); } catch {}
  }

  // ── Templates state ──────────────────────────────────────────────────────
  const [templates,       setTemplates]       = useState<MessageTemplate[]>([]);
  const [activeTpl,       setActiveTpl]       = useState<MessageTemplate | null>(null);
  const [activeCat,       setActiveCat]       = useState<TemplateCategory | 'all'>('all');
  const [editName,        setEditName]        = useState('');
  const [editCategory,    setEditCategory]    = useState<TemplateCategory>('autre');
  const [editBody,        setEditBody]        = useState('');
  const [isDirty,         setIsDirty]         = useState(false);
  const [showPreview,     setShowPreview]     = useState(false);

  // ── Clients state ────────────────────────────────────────────────────────
  const [clients,         setClients]         = useState<ServiceOrderClient[]>([]);
  const [clientsLoading,  setClientsLoading]  = useState(true);
  const [clientSearch,    setClientSearch]    = useState('');
  const [statusFilter,    setStatusFilter]    = useState<string>('all');
  const [selectedPhones,  setSelectedPhones]  = useState<Set<string>>(new Set());

  // ── Send queue state ─────────────────────────────────────────────────────
  const [sendMode,        setSendMode]        = useState(false);
  const [sendQueue,       setSendQueue]       = useState<ServiceOrderClient[]>([]);
  const [sendIndex,       setSendIndex]       = useState(0);
  const [sentPhones,      setSentPhones]      = useState<Set<string>>(new Set());

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId) return;
    const tpls = loadTemplates(businessId);
    setTemplates(tpls);
    if (tpls.length > 0) selectTemplate(tpls[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    getDistinctServiceClients(businessId)
      .then(setClients)
      .catch(() => notifError('Impossible de charger les clients'))
      .finally(() => setClientsLoading(false));
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Template actions ──────────────────────────────────────────────────────
  function selectTemplate(tpl: MessageTemplate) {
    setActiveTpl(tpl);
    setEditName(tpl.name);
    setEditCategory(tpl.category);
    setEditBody(tpl.body);
    setIsDirty(false);
    setShowPreview(false);
  }

  function handleBodyChange(val: string) {
    setEditBody(val);
    setIsDirty(true);
  }

  function insertVariable(varKey: string) {
    const ta = textareaRef.current;
    if (!ta) { setEditBody(b => b + varKey); setIsDirty(true); return; }
    const { newBody, pos } = insertAtCursor(ta, varKey, editBody);
    setEditBody(newBody);
    setIsDirty(true);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = pos;
      ta.focus();
    });
  }

  function saveTemplate() {
    if (!editName.trim() || !editBody.trim()) return;
    const now = new Date().toISOString();
    let updated: MessageTemplate[];
    if (activeTpl) {
      updated = templates.map(t =>
        t.id === activeTpl.id
          ? { ...t, name: editName.trim(), category: editCategory, body: editBody, updatedAt: now }
          : t
      );
    } else {
      const newTpl: MessageTemplate = {
        id: crypto.randomUUID(), name: editName.trim(),
        category: editCategory, body: editBody, updatedAt: now,
      };
      updated = [...templates, newTpl];
      setActiveTpl(newTpl);
    }
    setTemplates(updated);
    saveTemplates(businessId, updated);
    setIsDirty(false);
    success('Modèle sauvegardé');
  }

  function deleteTemplate(id: string) {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    saveTemplates(businessId, updated);
    const next = updated[0] ?? null;
    if (next) selectTemplate(next);
    else { setActiveTpl(null); setEditName(''); setEditBody(''); setEditCategory('autre'); }
  }

  function newTemplate() {
    setActiveTpl(null);
    setEditName('');
    setEditCategory('autre');
    setEditBody('');
    setIsDirty(false);
    setShowPreview(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function duplicateTemplate() {
    if (!activeTpl) return;
    const now = new Date().toISOString();
    const dup: MessageTemplate = {
      id: crypto.randomUUID(),
      name: `${activeTpl.name} (copie)`,
      category: activeTpl.category,
      body: activeTpl.body,
      updatedAt: now,
    };
    const updated = [...templates, dup];
    setTemplates(updated);
    saveTemplates(businessId, updated);
    selectTemplate(dup);
  }

  // ── Client filtering ──────────────────────────────────────────────────────
  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase();
    return clients.filter(c => {
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.lastRef.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || c.lastStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [clients, clientSearch, statusFilter]);

  const allSelected = filteredClients.length > 0 && filteredClients.every(c => selectedPhones.has(c.phone));

  function toggleClient(phone: string) {
    setSelectedPhones(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedPhones(prev => {
        const next = new Set(prev);
        filteredClients.forEach(c => next.delete(c.phone));
        return next;
      });
    } else {
      setSelectedPhones(prev => {
        const next = new Set(prev);
        filteredClients.forEach(c => next.add(c.phone));
        return next;
      });
    }
  }

  // ── Send queue ────────────────────────────────────────────────────────────
  const selectedClients = useMemo(
    () => clients.filter(c => selectedPhones.has(c.phone)),
    [clients, selectedPhones],
  );

  function startSend() {
    if (!editBody.trim() || selectedClients.length === 0) return;
    setSendQueue(selectedClients);
    setSendIndex(0);
    setSentPhones(new Set());
    setSendMode(true);
  }

  function sendCurrent() {
    const client = sendQueue[sendIndex];
    if (!client) return;
    const message = substituteVars(editBody, client, bizName, currency);
    const url = buildWaLink(client.phone, message);
    window.open(url, '_blank');
    setSentPhones(prev => new Set([...prev, client.phone]));
    if (sendIndex < sendQueue.length - 1) setSendIndex(i => i + 1);
  }

  function exitSend() {
    setSendMode(false);
    setSendQueue([]);
    setSentPhones(new Set());
    setSendIndex(0);
  }

  // ── Filtered templates ─────────────────────────────────────────────────
  const displayedTemplates = useMemo(() =>
    activeCat === 'all' ? templates : templates.filter(t => t.category === activeCat),
    [templates, activeCat],
  );

  // ── Preview client (first selected or first overall) ──────────────────────
  const previewClient = selectedClients[0] ?? clients[0] ?? null;
  const previewBody = previewClient
    ? substituteVars(editBody, previewClient, bizName, currency)
    : editBody.replace(/\{[\w]+\}/g, m => VARIABLES.find(v => v.key === m)?.example ?? m);

  const catOf = (key: TemplateCategory) => CATEGORIES.find(c => c.key === key);

  // ─────────────────────────────────────────────────────────────────────────
  // SEND MODE UI
  // ─────────────────────────────────────────────────────────────────────────
  if (sendMode) {
    const current = sendQueue[sendIndex];
    const sentCount = sentPhones.size;
    const progress = Math.round((sentCount / sendQueue.length) * 100);

    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-card shrink-0">
          <button onClick={exitSend} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-content-primary">File d'envoi WhatsApp</p>
            <p className="text-xs text-content-muted">{sentCount}/{sendQueue.length} envoyés</p>
          </div>
          {sentCount === sendQueue.length && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-status-success bg-badge-success px-3 py-1 rounded-full border border-status-success/30">
              <CheckCircle2 className="w-3.5 h-3.5" /> Terminé
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-surface-hover shrink-0">
          <div className="h-full bg-status-success transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* Current client */}
          {current && sentCount < sendQueue.length && (
            <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-border bg-surface-hover">
                <Send className="w-3.5 h-3.5 text-content-brand" />
                <span className="text-xs font-semibold text-content-primary">Prochain envoi — {sendIndex + 1}/{sendQueue.length}</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-600 font-bold text-sm shrink-0">
                    {current.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-content-primary text-sm">{current.name}</p>
                    <p className="text-xs text-content-muted">{current.phone} · {current.lastRef}</p>
                  </div>
                </div>
                {/* Message preview */}
                <div className="bg-[#d9fdd3] dark:bg-[#005c4b] rounded-xl rounded-tl-sm p-3 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed font-sans">
                  {substituteVars(editBody, current, bizName, currency)}
                </div>
                <button
                  onClick={sendCurrent}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold text-sm transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Ouvrir WhatsApp pour {current.name.split(' ')[0]}
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </button>
              </div>
            </div>
          )}

          {/* Queue list */}
          <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-border flex items-center justify-between">
              <span className="text-xs font-semibold text-content-muted uppercase tracking-wide">File d'attente</span>
              <span className="text-xs text-content-muted">{sendQueue.length} destinataires</span>
            </div>
            <div className="divide-y divide-surface-border max-h-80 overflow-y-auto">
              {sendQueue.map((c, i) => {
                const isSent    = sentPhones.has(c.phone);
                const isCurrent = i === sendIndex && !isSent;
                return (
                  <div key={c.phone} className={cn('flex items-center gap-3 px-4 py-2.5 transition-colors', isCurrent && 'bg-brand-500/5', isSent && 'opacity-40')}>
                    <div className={cn('w-5 h-5 rounded-full flex items-center justify-center shrink-0', isSent ? 'text-status-success' : isCurrent ? 'text-brand-600' : 'text-content-muted')}>
                      {isSent ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', isSent ? 'line-through text-content-muted' : 'text-content-primary')}>{c.name}</p>
                      <p className="text-xs text-content-muted">{c.phone}</p>
                    </div>
                    {isCurrent && <span className="text-[10px] font-bold text-brand-600 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">En cours</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {sentCount === sendQueue.length && (
            <button onClick={exitSend} className="w-full py-3 rounded-xl border-2 border-surface-border text-content-secondary font-semibold text-sm hover:border-brand-500/40 transition-colors">
              ← Retour à l'éditeur
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN UI
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-hidden flex flex-col">

      {/* ══ Bandeau d'aide (dismissible) ══════════════════════════════════ */}
      {showHelp && (
        <div className="shrink-0 border-b border-surface-border bg-surface-card px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#25D366]/15 border border-[#25D366]/30 flex items-center justify-center shrink-0 mt-0.5">
              <MessageCircle className="w-4 h-4 text-[#25D366]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-content-primary mb-2">
                Comment envoyer un message à vos clients ?
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                {[
                  { step: '1', title: 'Choisissez un modèle', desc: 'Sélectionnez un modèle à gauche, ou créez le vôtre. Il y en a déjà 5 prêts à l\'emploi.' },
                  { step: '2', title: 'Personnalisez le texte', desc: 'Cliquez sur les boutons colorés (Prénom, N° OT, Montant…) pour ajouter des infos automatiques.' },
                  { step: '3', title: 'Envoyez à vos clients', desc: 'Cochez les clients à droite, puis cliquez "Démarrer l\'envoi". WhatsApp s\'ouvre pour chacun.' },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex items-start gap-2 flex-1">
                    <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{step}</span>
                    <div>
                      <p className="text-xs font-semibold text-content-primary">{title}</p>
                      <p className="text-xs text-content-secondary leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={dismissHelp}
              className="p-1 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
              title="Masquer cette aide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

      {/* ══ LEFT — Template library ══════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col w-56 shrink-0 border-r border-surface-border bg-surface-card">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-border">
          <span className="text-xs font-semibold text-content-muted uppercase tracking-wide">Modèles</span>
          <button
            onClick={newTemplate}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-content-brand hover:bg-brand-500/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nouveau
          </button>
        </div>

        {/* Category filter */}
        <div className="flex flex-col gap-0.5 px-2 py-2 border-b border-surface-border">
          <button
            onClick={() => setActiveCat('all')}
            className={cn('flex items-center px-2 py-1.5 rounded-lg text-xs font-medium transition-colors text-left', activeCat === 'all' ? 'bg-surface-hover text-content-primary font-semibold' : 'text-content-muted hover:text-content-secondary hover:bg-surface-hover')}
          >
            Tous les modèles
            <span className="ml-auto text-content-muted">{templates.length}</span>
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCat(cat.key)}
              className={cn('flex items-center px-2 py-1.5 rounded-lg text-xs font-medium transition-colors text-left', activeCat === cat.key ? 'bg-surface-hover text-content-primary font-semibold' : 'text-content-muted hover:text-content-secondary hover:bg-surface-hover')}
            >
              {cat.label}
              <span className="ml-auto text-content-muted">{templates.filter(t => t.category === cat.key).length}</span>
            </button>
          ))}
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto py-1">
          {displayedTemplates.length === 0 ? (
            <p className="text-center text-xs text-content-muted py-6">Aucun modèle</p>
          ) : displayedTemplates.map(tpl => {
            const cat = catOf(tpl.category);
            return (
              <button
                key={tpl.id}
                onClick={() => selectTemplate(tpl)}
                className={cn(
                  'w-full flex flex-col gap-0.5 px-3 py-2.5 text-left border-b border-surface-border transition-colors',
                  activeTpl?.id === tpl.id ? 'bg-brand-500/8 border-l-2 border-l-brand-500' : 'hover:bg-surface-hover',
                )}
              >
                <span className="text-sm font-medium text-content-primary truncate leading-tight">{tpl.name}</span>
                {cat && (
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border w-fit', cat.color)}>
                    {cat.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ CENTER — Editor ══════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-surface-border">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-border bg-surface-card shrink-0 flex-wrap">
          <input
            value={editName}
            onChange={e => { setEditName(e.target.value); setIsDirty(true); }}
            placeholder="Nom du modèle…"
            className="flex-1 min-w-0 text-sm font-semibold bg-transparent outline-none text-content-primary placeholder:text-content-muted"
          />
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={editCategory}
              onChange={e => { setEditCategory(e.target.value as TemplateCategory); setIsDirty(true); }}
              className="text-xs border border-surface-border bg-surface-input rounded-lg px-2 py-1.5 text-content-secondary outline-none"
            >
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <button
              onClick={() => setShowPreview(v => !v)}
              title={showPreview ? 'Masquer l\'aperçu' : 'Afficher l\'aperçu'}
              className={cn('p-1.5 rounded-lg transition-colors text-xs', showPreview ? 'bg-brand-500/10 text-content-brand' : 'text-content-muted hover:bg-surface-hover hover:text-content-secondary')}
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            {activeTpl && (
              <button onClick={duplicateTemplate} title="Dupliquer" className="p-1.5 rounded-lg text-content-muted hover:bg-surface-hover hover:text-content-secondary transition-colors">
                <Copy className="w-4 h-4" />
              </button>
            )}
            {activeTpl && (
              <button onClick={() => deleteTemplate(activeTpl.id)} title="Supprimer" className="p-1.5 rounded-lg text-content-muted hover:bg-badge-error hover:text-status-error transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={saveTemplate}
              disabled={!isDirty || !editName.trim() || !editBody.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {activeTpl ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>

        {/* Textarea + live preview */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Editor */}
          <div className={cn('flex flex-col', showPreview ? 'w-full md:w-1/2 border-r border-surface-border' : 'flex-1')}>
            <textarea
              ref={textareaRef}
              value={editBody}
              onChange={e => handleBodyChange(e.target.value)}
              placeholder={'Rédigez votre message ici…\n\nExemple :\nBonjour 👋\nCliquez sur "Prénom" ci-dessous pour personnaliser automatiquement.'}
              className="flex-1 resize-none px-4 py-3 bg-transparent text-sm text-content-primary placeholder:text-content-muted outline-none leading-relaxed"
            />
          </div>

          {/* Live preview panel */}
          {showPreview && (
            <div className="w-full md:w-1/2 overflow-auto p-4 bg-[#f0ece4] dark:bg-[#0d1117] flex flex-col">
              <p className="text-[10px] font-semibold text-content-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Eye className="w-3 h-3" />
                Aperçu live — {previewClient ? previewClient.name : 'client exemple'}
              </p>
              <div className="flex flex-col gap-1 flex-1">
                <div className="bg-[#d9fdd3] dark:bg-[#005c4b] rounded-2xl rounded-tl-sm p-3 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed shadow-sm self-end max-w-full">
                  {previewBody || <span className="text-content-muted italic text-xs">Commencez à écrire…</span>}
                  {previewBody && (
                    <p className="text-[10px] text-content-muted text-right mt-2">
                      {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ✓✓
                    </p>
                  )}
                </div>
              </div>
              {!previewClient && (
                <p className="text-[11px] text-content-muted mt-3 text-center">
                  Sélectionnez un client à droite pour voir son message personnalisé
                </p>
              )}
            </div>
          )}
        </div>

        {/* Variables panel */}
        <div className="border-t border-surface-border bg-surface-card shrink-0">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-content-muted uppercase tracking-wide">
              Ajouter une info personnalisée — cliquez pour insérer
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap px-3 pb-2">
            {VARIABLES.map(v => (
              <button
                key={v.key}
                onClick={() => insertVariable(v.key)}
                title={v.hint}
                className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-hover border border-surface-border text-xs font-medium text-content-secondary hover:bg-brand-500/8 hover:border-brand-500/40 hover:text-content-primary transition-colors"
              >
                <span>{v.emoji}</span>
                <span>{v.label}</span>
                <span className="text-[10px] text-content-muted group-hover:text-brand-500 transition-colors font-mono ml-0.5">→ {v.example}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ RIGHT — Clients + Send ═══════════════════════════════════════════ */}
      <div className="w-full md:w-72 shrink-0 flex flex-col overflow-hidden border-t md:border-t-0 border-surface-border">

        {/* Header */}
        <div className="px-3 py-2.5 border-b border-surface-border bg-surface-card shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-content-muted" />
              <span className="text-xs font-semibold text-content-muted uppercase tracking-wide">Destinataires</span>
            </div>
            <span className="text-xs font-semibold text-content-secondary">
              {selectedPhones.size > 0 && <span className="text-brand-600">{selectedPhones.size} sél. · </span>}
              {clients.length} clients
            </span>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
            <input
              type="text"
              placeholder="Nom, téléphone, N° OT…"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs bg-surface-input border border-surface-border text-content-primary placeholder:text-content-muted outline-none focus:border-brand-500/50"
            />
            {clientSearch && (
              <button onClick={() => setClientSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {[
              { key: 'all',      label: 'Tous'      },
              { key: 'en_cours', label: 'En cours'  },
              { key: 'termine',  label: 'Terminés'  },
              { key: 'paye',     label: 'Payés'     },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn('shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors', statusFilter === f.key ? 'bg-brand-500 text-white border-brand-500' : 'bg-surface-hover text-content-muted border-surface-border hover:text-content-secondary')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Select all row */}
        {filteredClients.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-border bg-surface-hover shrink-0">
            <button onClick={toggleAll} className="flex items-center gap-2 flex-1 text-left">
              <div className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0', allSelected ? 'bg-brand-500 border-brand-500' : 'border-surface-border bg-surface-input')}>
                {allSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs font-medium text-content-secondary">
                {allSelected ? 'Tout désélectionner' : `Tout sélectionner (${filteredClients.length})`}
              </span>
            </button>
          </div>
        )}

        {/* Client list */}
        <div className="flex-1 overflow-y-auto divide-y divide-surface-border">
          {clientsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Users className="w-8 h-8 text-content-muted opacity-30" />
              <p className="text-xs text-content-muted">{clientSearch ? 'Aucun résultat' : 'Aucun client avec un OT'}</p>
            </div>
          ) : filteredClients.map(client => {
            const isSelected = selectedPhones.has(client.phone);
            return (
              <button
                key={client.phone}
                onClick={() => toggleClient(client.phone)}
                className={cn('w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover', isSelected && 'bg-brand-500/5')}
              >
                <div className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5', isSelected ? 'bg-brand-500 border-brand-500' : 'border-surface-border bg-surface-input')}>
                  {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-sm font-medium text-content-primary truncate leading-tight">{client.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-content-muted">{client.phone}</span>
                    <span className="text-[11px] text-content-muted">·</span>
                    <span className="text-[11px] font-mono text-content-secondary">{client.lastRef}</span>
                    <StatusDot status={client.lastStatus} />
                    <span className="text-[11px] text-content-muted">{STATUS_LABELS[client.lastStatus] ?? client.lastStatus}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Send CTA */}
        <div className="px-3 py-3 border-t border-surface-border bg-surface-card shrink-0">
          {selectedPhones.size === 0 ? (
            <p className="text-xs text-content-muted text-center py-1">Sélectionnez des clients pour envoyer</p>
          ) : !editBody.trim() ? (
            <p className="text-xs text-status-warning text-center py-1">Rédigez d'abord un message</p>
          ) : (
            <button
              onClick={startSend}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold text-sm transition-colors shadow-sm"
            >
              <MessageCircle className="w-4 h-4" />
              Démarrer l'envoi — {selectedPhones.size} client{selectedPhones.size > 1 ? 's' : ''}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}
