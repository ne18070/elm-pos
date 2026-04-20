'use client';

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import {
  ChevronRight, CheckCircle2, XCircle, Clock, MessageCircle,
  AlertTriangle, Loader2, User, FileText, GitBranch, Zap,
  Timer, Radio, Ban, PauseCircle, RefreshCw, Send,
} from 'lucide-react';
import { transitionToNextStep, cancelWorkflowInstance } from '@/lib/workflow-runtime';
import {
  getNode, getEligibleEdges, interpolate, buildWhatsAppUrl,
} from '@/lib/workflow-engine';
import type {
  WorkflowInstance, WorkflowNode, WorkflowEdge,
  UserTaskNode, LegalClaimNode, WaitEventNode, DelayNode, ActionNode,
  FormField, WorkflowStatus,
} from '@pos-types';

// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowRunnerProps {
  instance:      WorkflowInstance;
  currentUserId?: string;
  onTransition?: (newNodeId: string, newStatus: WorkflowStatus) => void;
  onCancel?:     () => void;
  readOnly?:     boolean;
}

// ── Badge de statut ───────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<WorkflowStatus, { label: string; className: string; icon: React.ReactNode }> = {
  PENDING:   { label: 'En attente',  className: 'border-slate-600 bg-slate-800/50 text-slate-400',    icon: <Clock className="w-3 h-3" /> },
  RUNNING:   { label: 'En cours',    className: 'border-blue-700 bg-blue-900/20 text-blue-300',       icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  WAITING:   { label: 'Action req.', className: 'border-amber-700 bg-amber-900/20 text-amber-300',    icon: <Clock className="w-3 h-3" /> },
  PAUSED:    { label: 'En pause',    className: 'border-purple-700 bg-purple-900/20 text-purple-300', icon: <PauseCircle className="w-3 h-3" /> },
  COMPLETED: { label: 'Terminé',     className: 'border-green-700 bg-green-900/20 text-green-300',    icon: <CheckCircle2 className="w-3 h-3" /> },
  FAILED:    { label: 'Échoué',      className: 'border-red-700 bg-red-900/20 text-red-400',          icon: <XCircle className="w-3 h-3" /> },
  CANCELLED: { label: 'Annulé',      className: 'border-red-800 bg-red-950/20 text-red-500',          icon: <Ban className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: WorkflowStatus }) {
  const { label, className, icon } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${className}`}>
      {icon}{label}
    </span>
  );
}

// ── Icône de nœud ─────────────────────────────────────────────────────────────
function NodeIcon({ type }: { type: WorkflowNode['type'] }) {
  const cls = 'w-4 h-4';
  switch (type) {
    case 'USER_TASK':   return <User className={cls} />;
    case 'LEGAL_CLAIM': return <FileText className={cls} />;
    case 'CONDITION':   return <GitBranch className={cls} />;
    case 'ACTION':      return <Zap className={cls} />;
    case 'DELAY':       return <Timer className={cls} />;
    case 'WAIT_EVENT':  return <Radio className={cls} />;
    case 'END':         return <CheckCircle2 className={cls} />;
  }
}

// ── Rendu champ de formulaire ─────────────────────────────────────────────────
function FormFieldInput({
  field, value, onChange,
}: {
  field: FormField; value: unknown; onChange: (key: string, val: unknown) => void;
}) {
  const base = 'w-full bg-surface-input border border-surface-border rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  if (field.type === 'select') {
    return (
      <select className={base} value={String(value ?? '')} onChange={e => onChange(field.key, e.target.value)} required={field.required}>
        <option value="">— Choisir —</option>
        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        className={`${base} resize-y min-h-[80px]`}
        value={String(value ?? '')}
        placeholder={field.placeholder}
        onChange={e => onChange(field.key, e.target.value)}
        required={field.required}
      />
    );
  }
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(field.key, e.target.checked)} className="w-4 h-4 accent-brand-500" />
        <span className="text-sm text-slate-300">{field.label}</span>
      </label>
    );
  }
  return (
    <input
      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
      className={base}
      value={String(value ?? '')}
      placeholder={field.placeholder}
      onChange={e => onChange(field.key, field.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
      required={field.required}
    />
  );
}

// ── Panel USER_TASK ───────────────────────────────────────────────────────────
function UserTaskPanel({ node, formData, onFieldChange }: {
  node: UserTaskNode; formData: Record<string, unknown>; onFieldChange: (k: string, v: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      {node.description && <p className="text-sm text-slate-400">{node.description}</p>}
      {node.due_hours && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400">
          <Clock className="w-3.5 h-3.5" />
          SLA : {node.due_hours}h
        </div>
      )}
      {node.form_fields && node.form_fields.length > 0 && (
        <div className="space-y-3">
          {node.form_fields.map(field => (
            <div key={field.key}>
              {field.type !== 'boolean' && (
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
                </label>
              )}
              <FormFieldInput field={field} value={formData[field.key]} onChange={onFieldChange} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Panel LEGAL_CLAIM ─────────────────────────────────────────────────────────
function LegalClaimPanel({ node, context }: { node: LegalClaimNode; context: Record<string, unknown> }) {
  const text  = interpolate(node.template, context);
  const phone = node.phone_field ? String(context[node.phone_field] ?? '') : '';
  const waUrl = node.share_method === 'WHATSAPP_SHARE' && phone ? buildWhatsAppUrl(phone, text) : null;

  return (
    <div className="space-y-4">
      {node.document_name && (
        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">{node.document_name}</p>
      )}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 max-h-60 overflow-y-auto">
        <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
      </div>
      {waUrl ? (
        <a href={waUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors">
          <MessageCircle className="w-4 h-4" />
          Envoyer via WhatsApp
        </a>
      ) : node.share_method === 'WHATSAPP_SHARE' && !phone ? (
        <p className="text-xs text-amber-400 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          Numéro manquant ({node.phone_field ?? 'phone_field non défini'})
        </p>
      ) : null}
    </div>
  );
}

// ── Panel ACTION ─────────────────────────────────────────────────────────────
function ActionPanel({ node, context }: { node: ActionNode; context: Record<string, unknown> }) {
  const waActions   = node.actions?.filter(a => a.type === 'SEND_WHATSAPP') ?? [];
  const otherCount  = (node.actions?.length ?? 0) - waActions.length;

  if (waActions.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
        <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
        Actions automatisées en cours…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {node.description && <p className="text-sm text-slate-400">{node.description}</p>}
      {waActions.map((action, i) => {
        const rawPhone = action.to ? context[action.to] : (context['client.phone'] ?? context['phone']);
        const phone    = String(rawPhone ?? '').replace(/\s+/g, '');
        const message  = action.template ? interpolate(action.template, context) : '';
        const waUrl    = phone ? buildWhatsAppUrl(phone, message) : null;
        return (
          <div key={i} className="space-y-3">
            <div className="bg-green-950/30 border border-green-800/40 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-400 text-[10px] font-black uppercase tracking-widest mb-3">
                <MessageCircle className="w-3.5 h-3.5" />
                Message WhatsApp prêt
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {message || <span className="italic text-slate-500">Template non défini</span>}
              </p>
            </div>
            {waUrl ? (
              <a
                href={waUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 px-4 py-3 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-green-900/30"
              >
                <Send className="w-4 h-4" />
                Ouvrir WhatsApp et envoyer
              </a>
            ) : (
              <p className="text-xs text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Numéro introuvable dans le contexte ({action.to ?? 'client.phone'})
              </p>
            )}
          </div>
        );
      })}
      {otherCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
          <RefreshCw className="w-3 h-3 animate-spin" />
          {otherCount} action{otherCount > 1 ? 's' : ''} automatique{otherCount > 1 ? 's' : ''} en attente
        </div>
      )}
      <p className="text-[10px] text-slate-600 italic pt-1">
        Une fois le message envoyé, confirmez ci-dessous pour continuer.
      </p>
    </div>
  );
}

// ── Panel WAIT_EVENT ──────────────────────────────────────────────────────────
function WaitEventPanel({ node, instance }: { node: WaitEventNode; instance: WorkflowInstance }) {
  const resumeAt = instance.scheduled_resume_at ? new Date(instance.scheduled_resume_at) : null;
  const isClientReply = node.event_key?.toLowerCase().includes('reply') || node.event_key?.toLowerCase().includes('response') || node.event_key?.toLowerCase().includes('reponse');

  return (
    <div className="space-y-3">
      {node.description && <p className="text-sm text-slate-400">{node.description}</p>}
      <div className="bg-purple-900/20 border border-purple-700/50 rounded-xl px-4 py-4 space-y-2.5">
        <div className="flex items-center gap-2 text-purple-300 text-sm font-semibold">
          <Radio className="w-4 h-4" />
          {isClientReply ? 'En attente de la réponse client' : `Attente de : ${node.event_key}`}
        </div>
        {isClientReply && (
          <p className="text-xs text-slate-400 leading-relaxed">
            Quand le client répond (par WhatsApp, email ou en personne), cliquez sur le bouton ci-dessous pour enregistrer la réponse et continuer.
          </p>
        )}
        {resumeAt && (
          <p className="text-xs text-slate-500">
            Timeout automatique le {resumeAt.toLocaleString('fr-FR')}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Panel DELAY ───────────────────────────────────────────────────────────────
function DelayPanel({ node, instance }: { node: DelayNode; instance: WorkflowInstance }) {
  const resumeAt = instance.scheduled_resume_at ? new Date(instance.scheduled_resume_at) : null;

  return (
    <div className="space-y-3">
      <div className="bg-purple-900/20 border border-purple-700 rounded-xl px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-purple-300 text-sm font-medium">
          <Timer className="w-4 h-4" />
          {node.delay_label ?? `Délai de ${node.delay_hours}h`}
        </div>
        {resumeAt ? (
          <p className="text-xs text-slate-500">
            Reprise automatique le {resumeAt.toLocaleString('fr-FR')}
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Durée : {node.delay_hours} heure{node.delay_hours > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Panel FAILED ──────────────────────────────────────────────────────────────
function FailedPanel({ instance }: { instance: WorkflowInstance }) {
  return (
    <div className="bg-red-900/20 border border-red-800 rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
        <XCircle className="w-4 h-4" />
        Erreur — Processus en échec
      </div>
      {instance.last_error && (
        <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono bg-red-950/30 rounded p-2 max-h-32 overflow-y-auto">
          {instance.last_error}
        </pre>
      )}
      {instance.retry_count > 0 && (
        <p className="text-xs text-slate-500">{instance.retry_count} tentative{instance.retry_count > 1 ? 's' : ''} effectuée{instance.retry_count > 1 ? 's' : ''}</p>
      )}
    </div>
  );
}

// ── Panel COMPLETED ───────────────────────────────────────────────────────────
function CompletedPanel({ instance, onRestart }: { instance: WorkflowInstance; onRestart?: () => void }) {
  const definition = instance.workflow_snapshot;

  const durationLabel = useMemo(() => {
    if (!instance.completed_at || !instance.started_at) return null;
    const ms = new Date(instance.completed_at).getTime() - new Date(instance.started_at).getTime();
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    if (days  > 0) return `${days}j ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins % 60}min`;
    if (mins  > 0) return `${mins} min`;
    return 'moins d\'une minute';
  }, [instance.completed_at, instance.started_at]);

  const steps = useMemo(() => {
    const path: typeof definition.nodes = [];
    let nodeId = definition.initial_node_id;
    const visited = new Set<string>();
    while (nodeId && !visited.has(nodeId)) {
      visited.add(nodeId);
      const node = definition.nodes.find(n => n.id === nodeId);
      if (!node) break;
      if (node.type !== 'CONDITION') path.push(node);
      if (node.type === 'END') break;
      const eligible = getEligibleEdges(definition, nodeId, instance.context);
      if (!eligible.length) break;
      nodeId = eligible[0].to;
    }
    return path;
  }, [definition, instance.context]);

  const DEVISE_LABELS: Record<string, string> = { XOF: 'FCFA', XAF: 'FCFA', EUR: '€', USD: '$' };
  const devise = useMemo(() => {
    const raw = String(instance.context['devise'] ?? '');
    return DEVISE_LABELS[raw] ?? raw;
  }, [instance.context]);

  const contextEntries = useMemo(() => {
    const SKIP = ['__', 'workflow_id', 'instance_id', 'business_id', 'dossier_id', 'devise'];
    const seen = new Set<string>();
    return Object.entries(instance.context)
      .filter(([k, v]) => {
        if (SKIP.some(p => k.startsWith(p))) return false;
        if (v === null || v === undefined || v === '' || v === '—') return false;
        // dédupliquer client.phone / client_phone
        const canonical = k.replace(/\./g, '_');
        if (seen.has(canonical)) return false;
        seen.add(canonical);
        return true;
      })
      .map(([k, v]) => {
        const label = k.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        // montant → formater avec devise
        const isAmount = /montant|amount|somme|total/i.test(k);
        const isDate   = /^\d{4}-\d{2}-\d{2}$/.test(String(v));
        let display = String(v);
        if (isAmount && !isNaN(Number(v))) {
          display = Number(v).toLocaleString('fr-FR') + (devise ? ` ${devise}` : '');
        } else if (isDate) {
          display = new Date(String(v)).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        }
        return { label, display };
      });
  }, [instance.context, devise]);

  return (
    <div className="space-y-4">
      {/* Header succès */}
      <div className="bg-gradient-to-br from-green-950/60 to-emerald-900/30 border border-green-700/50 rounded-2xl p-5 text-center space-y-2">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
        </div>
        <p className="text-lg font-black text-white">Processus terminé avec succès</p>

        <div className="flex items-center justify-center gap-4 pt-1">
          {instance.completed_at && (
            <span className="text-xs text-slate-400">
              {new Date(instance.completed_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {durationLabel && (
            <span className="text-xs bg-green-900/40 border border-green-800/50 text-green-300 px-2.5 py-0.5 rounded-full font-bold">
              ⏱ {durationLabel}
            </span>
          )}
        </div>
      </div>

      {/* Étapes parcourues */}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Étapes complétées</p>
          <div className="space-y-1">
            {steps.map((node, i) => (
              <div key={node.id} className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-slate-900/40">
                <div className="w-5 h-5 rounded-full bg-green-900/50 border border-green-700/50 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                </div>
                <span className="text-xs text-slate-300 font-medium">{node.label}</span>
                <span className="ml-auto text-[9px] text-slate-600 font-mono">{i + 1}/{steps.length}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Données collectées */}
      {contextEntries.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Données collectées</p>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl divide-y divide-slate-800/60">
            {contextEntries.map(({ label, display }: { label: string; display: string }) => (
              <div key={label} className="flex items-start justify-between gap-4 px-3 py-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide shrink-0">{label}</span>
                <span className="text-xs text-slate-200 text-right break-all">{display}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {onRestart && (
        <button
          onClick={onRestart}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900/50 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-bold transition-all"
        >
          <RefreshCw className="w-4 h-4" /> Relancer le processus
        </button>
      )}
    </div>
  );
}

// ── Panel CANCELLED ───────────────────────────────────────────────────────────
function CancelledPanel({ instance }: { instance: WorkflowInstance }) {
  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-5 text-center space-y-2">
      <Ban className="w-8 h-8 text-slate-500 mx-auto" />
      <p className="font-bold text-slate-300">Processus annulé</p>
      {instance.completed_at && (
        <p className="text-xs text-slate-500">
          {new Date(instance.completed_at).toLocaleString('fr-FR')}
        </p>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export function WorkflowRunner({
  instance: initialInstance,
  currentUserId,
  onTransition,
  onCancel,
  readOnly = false,
}: WorkflowRunnerProps) {
  const [instance, setInstance]      = useState<WorkflowInstance>(initialInstance);
  // Pré-remplir formData avec les valeurs du contexte si elles existent
  const [formData, setFormData]      = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    const definition = initialInstance.workflow_snapshot;
    const currentNode = definition.nodes.find(n => n.id === initialInstance.current_node_id);
    if (currentNode?.type === 'USER_TASK' && currentNode.form_fields) {
      currentNode.form_fields.forEach(f => {
        if (initialInstance.context[f.key] !== undefined) {
          initial[f.key] = initialInstance.context[f.key];
        }
      });
    }
    return initial;
  });
  const [error, setError]            = useState<string | null>(null);
  const [confirm, setConfirm]        = useState<WorkflowEdge | null>(null);
  const [isPending, startTransition] = useTransition();

  // Mettre à jour formData quand l'instance change (si on change de nœud)
  useEffect(() => {
    const definition = instance.workflow_snapshot;
    const currentNode = definition.nodes.find(n => n.id === instance.current_node_id);
    if (currentNode?.type === 'USER_TASK' && currentNode.form_fields) {
      setFormData(prev => {
        const next = { ...prev };
        currentNode.form_fields?.forEach(f => {
          if (instance.context[f.key] !== undefined && next[f.key] === undefined) {
            next[f.key] = instance.context[f.key];
          }
        });
        return next;
      });
    }
  }, [instance.current_node_id, instance.context]);

  const definition    = instance.workflow_snapshot;
  const currentNode   = useMemo(() => getNode(definition, instance.current_node_id), [definition, instance.current_node_id]);
  const eligibleEdges = useMemo(() =>
    currentNode && (instance.status === 'RUNNING' || instance.status === 'WAITING')
      ? getEligibleEdges(definition, instance.current_node_id, { ...instance.context, ...formData })
      : [],
  [currentNode, instance.status, instance.current_node_id, instance.context, definition, formData]);

  const handleFieldChange = useCallback((key: string, val: unknown) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleTransition = (edge: WorkflowEdge) => {
    if (edge.requires_confirmation && confirm?.id !== edge.id) {
      setConfirm(edge);
      return;
    }
    setConfirm(null);
    setError(null);

    startTransition(async () => {
      const result = await transitionToNextStep({
        instance_id:  instance.id,
        edge_id:      edge.id,
        form_data:    formData,
        performed_by: currentUserId,
      });

      if (!result.ok) { setError(result.error ?? 'Erreur inconnue'); return; }

      setInstance(prev => ({
        ...prev,
        current_node_id: result.new_node_id ?? prev.current_node_id,
        status:          result.new_status  ?? prev.status,
        context:         { ...prev.context, ...formData },
      }));
      setFormData({});
      onTransition?.(result.new_node_id!, result.new_status!);
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelWorkflowInstance(instance.id, currentUserId);
      if (!result.ok) { setError(result.error ?? 'Erreur'); return; }
      setInstance(prev => ({ ...prev, status: 'CANCELLED' }));
      onCancel?.();
    });
  };

  // ── Terminaux ─────────────────────────────────────────────────────────────
  if (instance.status === 'COMPLETED') {
    return <div className="card p-4"><CompletedPanel instance={instance} onRestart={onCancel ? undefined : undefined} /></div>;
  }
  if (instance.status === 'CANCELLED') {
    return <div className="card p-4"><CancelledPanel instance={instance} /></div>;
  }

  if (!currentNode) {
    return (
      <div className="card p-6 text-red-400 text-sm">
        Nœud introuvable : <code>{instance.current_node_id}</code>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-5">

      {/* ── En-tête ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-brand-900/30 border border-brand-700 text-brand-400">
            <NodeIcon type={currentNode.type} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Étape actuelle</p>
            <p className="font-semibold text-white">{currentNode.label}</p>
          </div>
        </div>
        <StatusBadge status={instance.status} />
      </div>

      {/* ── Spinner pendant traitement ── */}
      {isPending && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Traitement en cours…
        </div>
      )}

      {/* ── Contenu du nœud ── */}
      {!isPending && (
        <div>
          {instance.status === 'FAILED' && <FailedPanel instance={instance} />}

          {instance.status !== 'FAILED' && currentNode.type === 'USER_TASK' && (
            <UserTaskPanel node={currentNode} formData={formData} onFieldChange={handleFieldChange} />
          )}
          {instance.status !== 'FAILED' && currentNode.type === 'LEGAL_CLAIM' && (
            <LegalClaimPanel node={currentNode} context={{ ...instance.context, ...formData }} />
          )}
          {instance.status !== 'FAILED' && currentNode.type === 'WAIT_EVENT' && (
            <WaitEventPanel node={currentNode as WaitEventNode} instance={instance} />
          )}
          {instance.status !== 'FAILED' && currentNode.type === 'DELAY' && (
            <DelayPanel node={currentNode as DelayNode} instance={instance} />
          )}
          {instance.status !== 'FAILED' && currentNode.type === 'ACTION' && (
            <ActionPanel node={currentNode as ActionNode} context={{ ...instance.context, ...formData }} />
          )}
          {instance.status !== 'FAILED' && currentNode.type === 'CONDITION' && (
            <p className="text-sm text-slate-400 italic py-2">
              Évaluation automatique des conditions…
            </p>
          )}
        </div>
      )}

      {/* ── Erreur ── */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Confirmation ── */}
      {confirm && (
        <div className="bg-amber-900/20 border border-amber-700 rounded-xl px-4 py-3 space-y-3">
          <p className="text-sm text-amber-300 font-medium">
            Confirmer : <span className="font-bold">"{confirm.label}"</span> ?
          </p>
          <div className="flex gap-2">
            <button onClick={() => handleTransition(confirm)} disabled={isPending} className="btn-primary px-4 py-1.5 text-sm">
              Confirmer
            </button>
            <button onClick={() => setConfirm(null)} className="btn-secondary px-4 py-1.5 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Boutons d'action ── */}
      {!readOnly && !confirm && !isPending && eligibleEdges.length > 0 && (
        <div className="space-y-2 pt-1">
          {eligibleEdges.map(edge => (
            <button
              key={edge.id}
              onClick={() => handleTransition(edge)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-brand-700 bg-brand-900/20 hover:bg-brand-800/30 text-brand-300 hover:text-white text-sm font-medium transition-all group"
            >
              <span>{edge.label}</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ))}
        </div>
      )}

      {/* ── Aucune action disponible ── */}
      {!readOnly && !confirm && !isPending &&
        (instance.status === 'RUNNING' || instance.status === 'WAITING') &&
        eligibleEdges.length === 0 && (
        <p className="text-xs text-slate-500 italic pt-1">
          Aucune action disponible dans ce contexte.
        </p>
      )}

      {/* ── Annulation ── */}
      {!readOnly && !isPending && instance.status !== 'FAILED' && (
        <button
          onClick={handleCancel}
          className="w-full text-xs text-slate-600 hover:text-red-400 py-1 transition-colors"
        >
          Annuler ce workflow
        </button>
      )}
    </div>
  );
}
