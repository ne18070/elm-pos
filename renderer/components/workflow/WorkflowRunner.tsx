'use client';

import { useState, useTransition, useCallback } from 'react';
import {
  ChevronRight, CheckCircle2, XCircle, Clock, MessageCircle,
  AlertTriangle, Loader2, User, FileText, GitBranch, Zap,
  Timer, Radio, Ban, PauseCircle, RefreshCw,
} from 'lucide-react';
import { transitionToNextStep, cancelWorkflowInstance } from '@/lib/workflow-runtime';
import {
  getNode, getEligibleEdges, interpolate, buildWhatsAppUrl,
} from '@/lib/workflow-engine';
import type {
  WorkflowInstance, WorkflowNode, WorkflowEdge,
  UserTaskNode, LegalClaimNode, WaitEventNode, DelayNode,
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

// ── Panel WAIT_EVENT ──────────────────────────────────────────────────────────
function WaitEventPanel({ node, instance }: { node: WaitEventNode; instance: WorkflowInstance }) {
  const resumeAt = instance.scheduled_resume_at ? new Date(instance.scheduled_resume_at) : null;

  return (
    <div className="space-y-3">
      {node.description && <p className="text-sm text-slate-400">{node.description}</p>}
      <div className="bg-purple-900/20 border border-purple-700 rounded-xl px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-purple-300 text-sm font-medium">
          <Radio className="w-4 h-4" />
          Attente de l'événement : <code className="text-purple-200">{node.event_key}</code>
        </div>
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
        Erreur — workflow en échec
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

// ── Composant principal ───────────────────────────────────────────────────────
export function WorkflowRunner({
  instance: initialInstance,
  currentUserId,
  onTransition,
  onCancel,
  readOnly = false,
}: WorkflowRunnerProps) {
  const [instance, setInstance]      = useState<WorkflowInstance>(initialInstance);
  const [formData, setFormData]      = useState<Record<string, unknown>>({});
  const [error, setError]            = useState<string | null>(null);
  const [confirm, setConfirm]        = useState<WorkflowEdge | null>(null);
  const [isPending, startTransition] = useTransition();

  const definition    = instance.workflow_snapshot;
  const currentNode   = getNode(definition, instance.current_node_id);
  const eligibleEdges = currentNode && (instance.status === 'RUNNING' || instance.status === 'WAITING')
    ? getEligibleEdges(definition, instance.current_node_id, { ...instance.context, ...formData })
    : [];

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
  if (instance.status === 'COMPLETED' || instance.status === 'CANCELLED') {
    return (
      <div className="card p-6 text-center space-y-3">
        {instance.status === 'COMPLETED'
          ? <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
          : <Ban className="w-12 h-12 text-red-400 mx-auto" />}
        <p className="text-lg font-semibold text-white">
          {instance.status === 'COMPLETED' ? 'Workflow terminé' : 'Workflow annulé'}
        </p>
        <StatusBadge status={instance.status} />
        {instance.completed_at && (
          <p className="text-xs text-slate-500">
            {new Date(instance.completed_at).toLocaleString('fr-FR')}
          </p>
        )}
      </div>
    );
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
            <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
              <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
              Actions automatisées en cours…
            </div>
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
