'use client';

import { useState, useRef, useCallback, useId, useEffect } from 'react';
import {
  Plus, Trash2, Save, Loader2, AlertTriangle, CheckCircle2,
  User, Zap, FileText, GitBranch, Clock, Timer, X, Link2,
  ZoomIn, ZoomOut, Maximize, Expand, Shrink, GripVertical,
  Undo2, Redo2, LocateFixed, Printer, UserCircle, Globe, Cpu,
  MousePointer2,
} from 'lucide-react';
import { saveWorkflow } from '@services/supabase/workflows';
import { getStaff, type Staff } from '@services/supabase/staff';
import { validateDefinition } from '@/lib/workflow-engine';
import type {
  WorkflowDefinition, WorkflowNode, WorkflowEdge,
  NodeType, WorkflowRole,
  UserTaskNode, DelayNode, WaitEventNode, EndNode, ActionNode,
} from '@pos-types';

// ── Configuration ─────────────────────────────────────────────────────────────

const EDGE_COLORS = [
  { label: 'Défaut', value: '#94a3b8' }, { label: 'Succès', value: '#10b981' },
  { label: 'Erreur', value: '#f43f5e' }, { label: 'Alerte', value: '#f59e0b' },
  { label: 'Info',   value: '#3b82f6' }, { label: 'Violet', value: '#8b5cf6' },
  { label: 'Cyan',   value: '#06b6d4' }, { label: 'Orange', value: '#f97316' },
  { label: 'Rose',   value: '#ec4899' }, { label: 'Indigo', value: '#6366f1' },
  { label: 'Teal',   value: '#14b8a6' }, { label: 'Sombre', value: '#475569' },
];

const NODE_CONFIG: Record<NodeType, { label: string; color: string; icon: React.ReactNode; bg: string; text: string }> = {
  USER_TASK:    { label: 'Tâche',       color: 'border-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-900',   icon: <User      className="w-3.5 h-3.5" /> },
  ACTION:       { label: 'Action auto', color: 'border-purple-400', bg: 'bg-purple-50', text: 'text-purple-900', icon: <Zap       className="w-3.5 h-3.5" /> },
  LEGAL_CLAIM:  { label: 'Prétention',  color: 'border-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-900',  icon: <FileText  className="w-3.5 h-3.5" /> },
  CONDITION:    { label: 'Condition',   color: 'border-orange-400', bg: 'bg-orange-50', text: 'text-orange-900', icon: <GitBranch className="w-3.5 h-3.5" /> },
  WAIT_EVENT:   { label: 'Attente',     color: 'border-cyan-500',   bg: 'bg-cyan-50',   text: 'text-cyan-900',   icon: <Clock     className="w-3.5 h-3.5" /> },
  DELAY:        { label: 'Délai',       color: 'border-rose-400',   bg: 'bg-rose-50',   text: 'text-rose-900',   icon: <Timer     className="w-3.5 h-3.5" /> },
  END:          { label: 'Fin',         color: 'border-emerald-500',bg: 'bg-emerald-50',text: 'text-emerald-900',icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

const NODE_W = 148;
const NODE_H = 64;

function uid() { return Math.random().toString(36).slice(2, 8); }

function getBezierPath(fx: number, fy: number, tx: number, ty: number) {
  const cy = fy + (ty - fy) / 2;
  return `M ${fx} ${fy} C ${fx} ${cy}, ${tx} ${cy}, ${tx} ${ty}`;
}

interface Snapshot { nodes: WorkflowNode[]; edges: WorkflowEdge[]; initialNodeId: string; name: string; }

const inputStyle = "w-full bg-slate-100 border border-slate-200 rounded-xl text-sm text-black px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all";
const labelStyle = "text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1.5 block";
const sectionStyle = "p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-sm";

// ── Nœud visuel ───────────────────────────────────────────────────────────────

function CanvasNode({
  node, selected, onSelect, onMouseDown, onStartConnection, onDelete, isInitial, isPotentialTarget,
}: {
  node: WorkflowNode; selected: boolean; isInitial: boolean; zoom: number; isPotentialTarget: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onStartConnection: (nodeId: string, e: React.MouseEvent) => void;
  onDelete: () => void;
}) {
  const cfg = NODE_CONFIG[node.type];
  const pos = node.position ?? { x: 0, y: 0 };
  return (
    <div
      onMouseDown={onMouseDown} onClick={onSelect}
      style={{ position: 'absolute', left: pos.x, top: pos.y, width: NODE_W, height: NODE_H, cursor: 'grab', zIndex: selected ? 10 : 1, userSelect: 'none', WebkitUserDrag: 'none' } as React.CSSProperties}
      className={`rounded-xl border-2 ${cfg.color} ${cfg.bg} flex flex-col justify-between p-2.5 transition-all group shadow-sm
        ${selected ? 'shadow-xl ring-2 ring-slate-400/30 brightness-[0.98]' : 'hover:shadow-md'}
        ${isInitial ? 'ring-2 ring-blue-500/50' : ''}
        ${isPotentialTarget ? 'scale-105 border-blue-600 ring-4 ring-blue-500/20' : ''}`}
    >
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-400 z-20 group-hover:border-slate-600 transition-colors" />
      <div className="flex items-center gap-1.5 min-w-0 pointer-events-none">
        <span className={`shrink-0 ${cfg.text} opacity-80`}>{cfg.icon}</span>
        <span className={`text-[11px] font-bold ${cfg.text} truncate`}>{node.label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-[9px] ${cfg.text} opacity-50 uppercase font-bold tracking-tight`}>{cfg.label}</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {node.type !== 'END' && (
        <div
          onMouseDown={(e) => onStartConnection(node.id, e)}
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-slate-400 hover:border-blue-500 hover:scale-125 z-20 cursor-crosshair transition-all flex items-center justify-center shadow-sm group-hover:border-slate-600"
        >
          <div className="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-blue-500" />
        </div>
      )}
    </div>
  );
}

// ── Panneau d'édition d'arête ─────────────────────────────────────────────────

function EdgeEditor({
  edge, onUpdate, onDelete, onClose,
}: {
  edge: WorkflowEdge;
  onUpdate: (patch: Partial<WorkflowEdge>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="bg-slate-50 rounded-2xl p-5 space-y-5 border border-slate-200 shadow-xl animate-in slide-in-from-right-4 overflow-y-auto max-h-full scrollbar-thin">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-500"><Link2 className="w-4 h-4" /></span>
          <div>
            <p className="font-bold text-black text-sm leading-none">Transition</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-1">Configuration</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-black transition-colors"><X className="w-4 h-4" /></button>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelStyle}>Libellé</label>
          <input className={inputStyle} value={edge.label} onChange={e => onUpdate({ label: e.target.value })} placeholder="Nom de la transition" />
        </div>

        <div>
          <label className={labelStyle}>Couleur</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {EDGE_COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => onUpdate({ color: c.value })}
                style={{ backgroundColor: c.value, width: 20, height: 20 }}
                className={`rounded-full border-2 transition-all hover:scale-110 ${edge.color === c.value || (!edge.color && c.value === '#94a3b8') ? 'border-black scale-110' : 'border-transparent'}`}
                title={c.label}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="edge-default"
            checked={edge.is_default ?? false}
            onChange={e => onUpdate({ is_default: e.target.checked })}
            className="w-4 h-4 accent-blue-500"
          />
          <label htmlFor="edge-default" className="text-sm text-slate-600 font-medium cursor-pointer">Transition par défaut (fallback)</label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="edge-confirm"
            checked={edge.requires_confirmation ?? false}
            onChange={e => onUpdate({ requires_confirmation: e.target.checked })}
            className="w-4 h-4 accent-blue-500"
          />
          <label htmlFor="edge-confirm" className="text-sm text-slate-600 font-medium cursor-pointer">Confirmation requise</label>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-200">
        <button
          onClick={onDelete}
          className="flex items-center gap-2 text-xs text-red-500 hover:text-red-700 font-bold transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Supprimer cette transition
        </button>
      </div>
    </div>
  );
}

// ── Panneau d'édition de nœud ─────────────────────────────────────────────────

function NodeEditor({
  node, isInitial, outgoingEdges, staffList, onUpdate, onSetInitial, onDeleteEdge, onUpdateEdge, onDelete, onClose,
}: {
  node: WorkflowNode; isInitial: boolean; outgoingEdges: WorkflowEdge[]; staffList: Staff[];
  onUpdate: (patch: Partial<WorkflowNode>) => void;
  onSetInitial: () => void;
  onDeleteEdge: (id: string) => void;
  onUpdateEdge: (id: string, patch: Partial<WorkflowEdge>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const cfg = NODE_CONFIG[node.type];

  const getActorType = () => {
    if (!node.assigned_role || node.assigned_role === 'SYSTEM') return 'SYSTEM';
    if (node.assigned_role === 'CLIENT') return 'CLIENT';
    if (node.assigned_role === 'EXTERNAL') return 'EXTERNAL';
    return 'STAFF';
  };
  const actorType = getActorType();

  return (
    <div className="bg-slate-50 rounded-2xl p-5 space-y-5 border border-slate-200 shadow-xl animate-in slide-in-from-right-4 overflow-y-auto max-h-full scrollbar-thin">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <span className={`p-2 rounded-xl ${cfg.bg} border ${cfg.color} ${cfg.text}`}>{cfg.icon}</span>
          <div>
            <p className="font-bold text-black text-sm leading-none">{cfg.label}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-1">Configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {node.type !== 'END' && !isInitial && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              title="Supprimer ce nœud (Del)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-black transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Champs communs */}
      <div className="space-y-3">
        <div>
          <label className={labelStyle}>Libellé de l&apos;étape</label>
          <input className={inputStyle} value={node.label} onChange={e => onUpdate({ label: e.target.value } as Partial<WorkflowNode>)} />
        </div>
        <div>
          <label className={labelStyle}>Description (optionnel)</label>
          <textarea
            className={`${inputStyle} resize-y min-h-[60px]`}
            value={node.description ?? ''}
            onChange={e => onUpdate({ description: e.target.value } as Partial<WorkflowNode>)}
            placeholder="Instructions, notes pour l'intervenant…"
          />
        </div>
      </div>

      {/* Champs par type */}
      {node.type === 'USER_TASK' && (
        <div className={sectionStyle}>
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Tâche</p>
          <div>
            <label className={labelStyle}>SLA — délai de traitement (heures)</label>
            <input
              type="number" min={0}
              className={inputStyle}
              value={(node as UserTaskNode).due_hours ?? ''}
              onChange={e => onUpdate({ due_hours: parseInt(e.target.value) || undefined } as Partial<WorkflowNode>)}
              placeholder="Ex : 48 → alerte après 48 h"
            />
          </div>
        </div>
      )}

      {node.type === 'DELAY' && (
        <div className={sectionStyle}>
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Délai temporel</p>
          <div>
            <label className={labelStyle}>Durée (heures)</label>
            <input
              type="number" min={0}
              className={inputStyle}
              value={(node as DelayNode).delay_hours ?? 0}
              onChange={e => onUpdate({ delay_hours: parseFloat(e.target.value) || 0 } as Partial<WorkflowNode>)}
            />
          </div>
          <div>
            <label className={labelStyle}>Libellé du délai</label>
            <input
              type="text"
              className={inputStyle}
              value={(node as DelayNode).delay_label ?? ''}
              onChange={e => onUpdate({ delay_label: e.target.value } as Partial<WorkflowNode>)}
              placeholder="Ex : 48 h de délai légal"
            />
          </div>
        </div>
      )}

      {node.type === 'WAIT_EVENT' && (
        <div className={sectionStyle}>
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">Événement attendu</p>
          <div>
            <label className={labelStyle}>Clé de l&apos;événement</label>
            <input
              type="text"
              className={inputStyle}
              value={(node as WaitEventNode).event_key ?? ''}
              onChange={e => onUpdate({ event_key: e.target.value } as Partial<WorkflowNode>)}
              placeholder="Ex : whatsapp_reply, payment_received"
            />
          </div>
          <div>
            <label className={labelStyle}>Timeout (heures, optionnel)</label>
            <input
              type="number" min={0}
              className={inputStyle}
              value={(node as WaitEventNode).timeout_hours ?? ''}
              onChange={e => onUpdate({ timeout_hours: parseInt(e.target.value) || undefined } as Partial<WorkflowNode>)}
              placeholder="Vide = attente indéfinie"
            />
          </div>
        </div>
      )}

      {node.type === 'ACTION' && (
        <div className={sectionStyle}>
          <p className="text-[10px] font-black uppercase tracking-widest text-purple-600">Action automatisée</p>
          <div>
            <label className={labelStyle}>En cas d&apos;erreur</label>
            <select
              className={inputStyle}
              value={(node as ActionNode).on_error ?? 'FAIL'}
              onChange={e => onUpdate({ on_error: e.target.value as 'FAIL' | 'CONTINUE' | 'RETRY' } as Partial<WorkflowNode>)}
            >
              <option value="FAIL">Échouer le workflow</option>
              <option value="CONTINUE">Continuer malgré tout</option>
              <option value="RETRY">Réessayer (3 fois)</option>
            </select>
          </div>
        </div>
      )}

      {node.type === 'END' && (
        <div className={sectionStyle}>
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Résultat final</p>
          <div>
            <label className={labelStyle}>Issue</label>
            <select
              className={inputStyle}
              value={(node as EndNode).outcome ?? ''}
              onChange={e => onUpdate({ outcome: (e.target.value as 'SUCCESS' | 'FAILURE' | 'CANCELLED') || undefined } as Partial<WorkflowNode>)}
            >
              <option value="">— Non définie —</option>
              <option value="SUCCESS">Succès</option>
              <option value="FAILURE">Échec</option>
              <option value="CANCELLED">Annulé</option>
            </select>
          </div>
          <div>
            <label className={labelStyle}>Message de clôture</label>
            <textarea
              className={`${inputStyle} resize-y min-h-[60px]`}
              value={(node as EndNode).message ?? ''}
              onChange={e => onUpdate({ message: e.target.value } as Partial<WorkflowNode>)}
              placeholder="Message affiché à la fin du workflow"
            />
          </div>
        </div>
      )}

      {/* Intervenant */}
      {node.type !== 'END' && node.type !== 'CONDITION' && (
        <div className={sectionStyle}>
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <UserCircle className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Intervenant</span>
          </div>
          <div>
            <label className={`${labelStyle} mb-1`}>Type d&apos;acteur</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'SYSTEM',   label: 'Système',   icon: <Cpu className="w-3 h-3" /> },
                { id: 'STAFF',    label: 'Personnel',  icon: <User className="w-3 h-3" /> },
                { id: 'CLIENT',   label: 'Client',     icon: <UserCircle className="w-3 h-3" /> },
                { id: 'EXTERNAL', label: 'Externe',    icon: <Globe className="w-3 h-3" /> },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => onUpdate({ assigned_role: t.id === 'STAFF' ? (staffList[0]?.id || 'STAFF') : t.id } as Partial<WorkflowNode>)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold transition-all
                    ${actorType === t.id ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
          {actorType === 'STAFF' && (
            <div className="animate-in slide-in-from-top-1 duration-200">
              <label className={labelStyle}>Membre du personnel</label>
              <select
                className={inputStyle}
                value={node.assigned_role}
                onChange={e => onUpdate({ assigned_role: e.target.value } as Partial<WorkflowNode>)}
              >
                <option value="STAFF" disabled>— Choisir un employé —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.position ? ` (${s.position})` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {actorType === 'EXTERNAL' && (
            <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg">
              <p className="text-[10px] text-amber-700 leading-relaxed italic">
                Un lien de suivi sécurisé sera envoyé à l&apos;intervenant externe.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Transitions sortantes */}
      {outgoingEdges.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-slate-200">
          <label className={labelStyle}>Transitions sortantes</label>
          {outgoingEdges.map(edge => (
            <div key={edge.id} className="p-3 bg-slate-100/50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-white border border-slate-200 rounded-lg text-[11px] px-2 py-1.5 outline-none focus:border-blue-400 transition-all font-bold text-black"
                  value={edge.label}
                  onChange={e => onUpdateEdge(edge.id, { label: e.target.value })}
                  placeholder="Nom de l'action"
                />
                <button onClick={() => onDeleteEdge(edge.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EDGE_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => onUpdateEdge(edge.id, { color: c.value })}
                    style={{ backgroundColor: c.value, width: 18, height: 18 }}
                    className={`rounded-full border-2 transition-all hover:scale-110 ${edge.color === c.value || (!edge.color && c.value === '#94a3b8') ? 'border-black scale-110' : 'border-transparent'}`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Point de départ */}
      <div className="pt-3 border-t border-slate-100">
        {!isInitial && node.type !== 'END' ? (
          <button
            onClick={onSetInitial}
            className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-2 py-1"
          >
            <Maximize className="w-3 h-3" /> Définir comme point de départ
          </button>
        ) : isInitial ? (
          <p className="text-xs text-blue-600 font-bold flex items-center gap-1.5">⭐ Étape de lancement</p>
        ) : null}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export function WorkflowBuilder({
  businessId, workflowId, initialName = 'Nouveau workflow', initialDef, onSaved,
}: {
  businessId: string; workflowId?: string; initialName?: string; initialDef?: WorkflowDefinition; onSaved?: (id: string) => void;
}) {
  useId();
  const defaultDef: WorkflowDefinition = initialDef ?? {
    nodes: [
      { id: 'start', type: 'USER_TASK', label: 'Démarrage', position: { x: 120, y: 80 } },
      { id: 'end1',  type: 'END',       label: 'Terminé',   position: { x: 120, y: 300 } },
    ],
    edges: [], initial_node_id: 'start',
  };

  const [name, setName]                   = useState(initialName);
  const [nodes, setNodes]                 = useState<WorkflowNode[]>(defaultDef.nodes);
  const [edges, setEdges]                 = useState<WorkflowEdge[]>(defaultDef.edges);
  const [initialNodeId, setInitialNodeId] = useState(defaultDef.initial_node_id);
  const [selectedNode, setSelectedNode]   = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge]   = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [errors, setErrors]               = useState<string[]>([]);
  const [saved, setSaved]                 = useState(false);
  const [zoom, setZoom]                   = useState(1);
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [staffList, setStaffList]         = useState<Staff[]>([]);

  useEffect(() => {
    getStaff(businessId).then(setStaffList).catch(console.error);
  }, [businessId]);

  // ── Historique undo/redo ──────────────────────────────────────────────────

  const [history, setHistory]       = useState<Snapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUpdatingFromHistory = useRef(false);

  const nodesRef      = useRef(nodes);
  const edgesRef      = useRef(edges);
  const initNodeRef   = useRef(initialNodeId);
  const nameRef       = useRef(name);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { initNodeRef.current = initialNodeId; }, [initialNodeId]);
  useEffect(() => { nameRef.current = name; }, [name]);

  const historyRef      = useRef<Snapshot[]>([]);
  const historyIndexRef = useRef(-1);

  const snap = useCallback(() => {
    if (isUpdatingFromHistory.current) return;
    const snapshot: Snapshot = {
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
      initialNodeId: initNodeRef.current,
      name: nameRef.current,
    };
    const newHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), snapshot].slice(-50);
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    isUpdatingFromHistory.current = true;
    const prev = historyRef.current[historyIndexRef.current - 1];
    historyIndexRef.current -= 1;
    setHistoryIndex(historyIndexRef.current);
    setNodes(prev.nodes); setEdges(prev.edges); setInitialNodeId(prev.initialNodeId); setName(prev.name);
    setTimeout(() => { isUpdatingFromHistory.current = false; }, 0);
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    isUpdatingFromHistory.current = true;
    const next = historyRef.current[historyIndexRef.current + 1];
    historyIndexRef.current += 1;
    setHistoryIndex(historyIndexRef.current);
    setNodes(next.nodes); setEdges(next.edges); setInitialNodeId(next.initialNodeId); setName(next.name);
    setTimeout(() => { isUpdatingFromHistory.current = false; }, 0);
  }, []);

  useEffect(() => {
    if (historyRef.current.length === 0) {
      const initial: Snapshot = { nodes: defaultDef.nodes, edges: defaultDef.edges, initialNodeId: defaultDef.initial_node_id, name: initialName };
      historyRef.current = [initial];
      historyIndexRef.current = 0;
      setHistory([initial]);
      setHistoryIndex(0);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers de suppression (sans confirm) ─────────────────────────────────

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    setSelectedNode(null);
    setTimeout(snap, 0);
  }, [snap]);

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId));
    setSelectedEdge(null);
    setTimeout(snap, 0);
  }, [snap]);

  // ── Zoom ──────────────────────────────────────────────────────────────────

  const canvasRef = useRef<HTMLDivElement>(null);

  const zoomIn    = useCallback(() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1))), []);
  const zoomOut   = useCallback(() => setZoom(z => Math.max(0.2, +(z - 0.1).toFixed(1))), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  const centerDiagram = useCallback(() => {
    if (!canvasRef.current || nodes.length === 0) return;
    const minX = Math.min(...nodes.map(n => n.position?.x ?? 0));
    const maxX = Math.max(...nodes.map(n => (n.position?.x ?? 0) + NODE_W));
    const minY = Math.min(...nodes.map(n => n.position?.y ?? 0));
    const maxY = Math.max(...nodes.map(n => (n.position?.y ?? 0) + NODE_H));
    canvasRef.current.scrollTo({
      left: ((minX + maxX) / 2 * zoom) - canvasRef.current.clientWidth / 2,
      top:  ((minY + maxY) / 2 * zoom) - canvasRef.current.clientHeight / 2,
      behavior: 'smooth',
    });
  }, [nodes, zoom]);

  // ── Raccourcis clavier ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'Escape' && isFullscreen) { setIsFullscreen(false); return; }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        e.preventDefault();
        if (selectedNode && selectedNode !== initialNodeId) {
          deleteNode(selectedNode);
        } else if (selectedEdge) {
          deleteEdge(selectedEdge);
        }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
        else if (e.key === '-') { e.preventDefault(); zoomOut(); }
        else if (e.key === '0') { e.preventDefault(); resetZoom(); }
        else if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
        else if (e.key === 'y') { e.preventDefault(); redo(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom, isFullscreen, undo, redo, selectedNode, selectedEdge, initialNodeId, deleteNode, deleteEdge]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && canvasRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        e.deltaY < 0 ? zoomIn() : zoomOut();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [zoomIn, zoomOut]);

  // ── Drag & connection ─────────────────────────────────────────────────────

  const [dragging, setDragging]         = useState<{ id: string; offsetX: number; offsetY: number; startPos: { x: number; y: number } } | null>(null);
  const [draggingNew, setDraggingNew]   = useState<{ type: NodeType; x: number; y: number } | null>(null);
  const [activeConnection, setActiveConnection] = useState<{ fromId: string; currentX: number; currentY: number; targetId: string | null } | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sl = canvasRef.current.scrollLeft;
    const st = canvasRef.current.scrollTop;

    if (draggingNew) { setDraggingNew(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null); return; }

    if (activeConnection) {
      const mx = (e.clientX - rect.left + sl) / zoom;
      const my = (e.clientY - rect.top + st) / zoom;
      const target = nodesRef.current.find(n =>
        n.id !== activeConnection.fromId &&
        mx >= (n.position?.x ?? 0) && mx <= (n.position?.x ?? 0) + NODE_W &&
        my >= (n.position?.y ?? 0) && my <= (n.position?.y ?? 0) + NODE_H
      );
      setActiveConnection(prev => prev ? { ...prev, currentX: mx, currentY: my, targetId: target?.id ?? null } : null);
      return;
    }

    if (dragging) {
      const x = Math.max(0, Math.round(((e.clientX - rect.left + sl) / zoom - dragging.offsetX) / 20) * 20);
      const y = Math.max(0, Math.round(((e.clientY - rect.top + st) / zoom - dragging.offsetY) / 20) * 20);
      setNodes(prev => prev.map(n => n.id === dragging.id ? { ...n, position: { x, y } } : n));
    }
  }, [dragging, draggingNew, activeConnection, zoom]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!canvasRef.current) return;
    let changed = false;

    if (activeConnection) {
      if (activeConnection.targetId) {
        setEdges(prev => [...prev, { id: uid(), from: activeConnection.fromId, to: activeConnection.targetId!, label: 'Suivant', color: '#94a3b8' }]);
        changed = true;
      }
      setActiveConnection(null);
    } else if (draggingNew) {
      const rect = canvasRef.current.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const x = Math.max(0, Math.round(((e.clientX - rect.left + canvasRef.current.scrollLeft) / zoom - NODE_W / 2) / 20) * 20);
        const y = Math.max(0, Math.round(((e.clientY - rect.top + canvasRef.current.scrollTop) / zoom - NODE_H / 2) / 20) * 20);
        const newId = uid();
        setNodes(prev => [...prev, { id: newId, type: draggingNew.type, label: NODE_CONFIG[draggingNew.type].label, position: { x, y } } as WorkflowNode]);
        setSelectedNode(newId); setSelectedEdge(null);
        changed = true;
      }
      setDraggingNew(null);
    } else if (dragging) {
      const node = nodesRef.current.find(n => n.id === dragging.id);
      if (node && (node.position!.x !== dragging.startPos.x || node.position!.y !== dragging.startPos.y)) changed = true;
      setDragging(null);
    }

    if (changed) setTimeout(snap, 0);
  }, [draggingNew, activeConnection, dragging, zoom, snap]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [handleMouseMove, handleMouseUp]);

  const edgePath = useCallback((from: string, to: string) => {
    const fn = nodesRef.current.find(n => n.id === from);
    const tn = nodesRef.current.find(n => n.id === to);
    if (!fn || !tn) return '';
    return getBezierPath(fn.position!.x + NODE_W / 2, fn.position!.y + NODE_H, tn.position!.x + NODE_W / 2, tn.position!.y);
  }, []);

  const handleStartConnection = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setActiveConnection({ fromId: nodeId, currentX: node.position!.x + NODE_W / 2, currentY: node.position!.y + NODE_H, targetId: null });
  };

  // ── Double-clic sur canvas → créer un USER_TASK ──────────────────────────

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.round(((e.clientX - rect.left + canvasRef.current.scrollLeft) / zoom - NODE_W / 2) / 20) * 20);
    const y = Math.max(0, Math.round(((e.clientY - rect.top + canvasRef.current.scrollTop) / zoom - NODE_H / 2) / 20) * 20);
    const newId = uid();
    setNodes(prev => [...prev, { id: newId, type: 'USER_TASK', label: 'Nouvelle étape', position: { x, y } } as WorkflowNode]);
    setSelectedNode(newId); setSelectedEdge(null);
    setTimeout(snap, 0);
  };

  // ── Sauvegarde ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const def: WorkflowDefinition = { nodes, edges, initial_node_id: initialNodeId };
    const errs = validateDefinition(def);
    if (errs.length > 0) { setErrors(errs.map(e => e.message)); return; }
    setErrors([]);
    setSaving(true);
    try {
      const wf = await saveWorkflow(businessId, def, name, undefined, workflowId);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
      onSaved?.(wf.id);
    } catch (e) { setErrors([String(e)]); } finally { setSaving(false); }
  };

  // ── Nœud / arête actifs ───────────────────────────────────────────────────

  const activeNode = selectedNode ? nodes.find(n => n.id === selectedNode) ?? null : null;
  const activeEdge = selectedEdge ? edges.find(e => e.id === selectedEdge) ?? null : null;

  const showRightPanel = !!(activeNode || activeEdge);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={`flex flex-col gap-4 transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50 bg-[#faf9f6] p-8' : ''}`}
      style={{ height: isFullscreen ? '100vh' : 'calc(100vh - 160px)' }}
    >
      {/* ── Barre d'outils ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap shrink-0">
        <div className="flex-1 min-w-48">
          <input
            className="w-full bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 px-4 py-2.5 shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            value={name} onChange={e => setName(e.target.value)} onBlur={snap}
            placeholder="Nom du workflow…"
          />
        </div>

        {/* Contrôles */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          <button onClick={() => window.print()} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all" title="Imprimer"><Printer className="w-4 h-4" /></button>
          <div className="w-px h-4 bg-slate-100 mx-1" />
          <button onClick={undo} disabled={historyIndex <= 0} className="p-2 rounded-lg text-black hover:text-slate-600 hover:bg-slate-50 disabled:opacity-20 transition-all" title="Annuler (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-20 transition-all border-r border-slate-100 mr-1" title="Rétablir (Ctrl+Shift+Z)"><Redo2 className="w-4 h-4" /></button>
          <button onClick={zoomOut} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all" title="Zoom -"><ZoomOut className="w-4 h-4" /></button>
          <span className="text-xs font-bold w-12 text-center text-slate-600 tracking-tighter">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all" title="Zoom +"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={centerDiagram} className="p-2 ml-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all border-r border-slate-100 mr-1" title="Centrer"><LocateFixed className="w-4 h-4" /></button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-2 rounded-lg transition-all ${isFullscreen ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
            title="Plein écran"
          >
            {isFullscreen ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>
        </div>

        {/* Palette de nœuds */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto max-w-full">
          <span className="text-[9px] font-black text-slate-400 uppercase px-1 mr-1 tracking-[0.2em] shrink-0 flex items-center gap-1">
            <MousePointer2 className="w-3 h-3" /> Glisser
          </span>
          {(Object.keys(NODE_CONFIG) as NodeType[]).map(type => (
            <button
              key={type}
              onMouseDown={(e) => setDraggingNew({ type, x: e.clientX, y: e.clientY })}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-grab active:cursor-grabbing transition-all ${NODE_CONFIG[type].bg} ${NODE_CONFIG[type].color} ${NODE_CONFIG[type].text} hover:shadow-md active:scale-95 whitespace-nowrap`}
            >
              <GripVertical className="w-3 h-3 opacity-30" /> {NODE_CONFIG[type].label}
            </button>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-2 px-6 py-2.5 text-sm font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 ml-auto"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </button>
      </div>

      {/* ── Aide contextuelle ────────────────────────────────────────────── */}
      <div className="flex gap-3 items-center text-[10px] text-slate-400 shrink-0 -mt-2">
        <span>Double-clic sur le canvas → créer une étape</span>
        <span>·</span>
        <span>Poignée basse d'un nœud → relier</span>
        <span>·</span>
        <span>Del / Backspace → supprimer la sélection</span>
        <span>·</span>
        <span>Ctrl+Z / Ctrl+Shift+Z → annuler/rétablir</span>
      </div>

      {/* ── Erreurs ──────────────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3 shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {errors.map((err, i) => <p key={i} className="text-xs text-red-700">{err}</p>)}
          </div>
          <button onClick={() => setErrors([])} className="ml-auto text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Canvas + panneau droit ───────────────────────────────────────── */}
      <div className="flex gap-6 flex-1 min-h-0 min-w-0">

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-auto rounded-3xl border border-slate-200 bg-[#fdfaf6] relative scrollbar-thin scrollbar-thumb-slate-200 shadow-inner"
        >
          <div
            style={{
              width: 5000, height: 4000,
              transform: `scale(${zoom})`, transformOrigin: '0 0',
              backgroundImage: 'radial-gradient(circle, #e5e2da 1.5px, transparent 1.5px)',
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              position: 'relative',
            }}
            onClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
            onDoubleClick={handleCanvasDoubleClick}
          >
            {/* SVG des arêtes */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.1" />
                </filter>
                {EDGE_COLORS.map(c => (
                  <marker key={`arrow-${c.value}`} id={`arrow-${c.value.replace('#', '')}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L6,3 z" fill={c.value} />
                  </marker>
                ))}
                <marker id="arrow-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#3b82f6" />
                </marker>
              </defs>

              {edges.map(edge => {
                const isSelected = selectedEdge === edge.id;
                const color = isSelected ? '#3b82f6' : (edge.color || '#94a3b8');
                const markerId = `arrow-${color.replace('#', '')}`;
                const fn = nodes.find(n => n.id === edge.from);
                const tn = nodes.find(n => n.id === edge.to);
                if (!fn || !tn) return null;
                const midX = ((fn.position?.x ?? 0) + (tn.position?.x ?? 0)) / 2 + NODE_W / 2;
                const midY = ((fn.position?.y ?? 0) + (tn.position?.y ?? 0) + NODE_H) / 2;

                return (
                  <g key={edge.id} style={{ pointerEvents: 'all' }}>
                    {/* Hit zone large */}
                    <path
                      d={edgePath(edge.from, edge.to)}
                      fill="none" stroke="transparent" strokeWidth={15 / zoom}
                      className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setSelectedEdge(edge.id); setSelectedNode(null); }}
                    />
                    {/* Arête visible */}
                    <path
                      d={edgePath(edge.from, edge.to)}
                      fill="none" stroke={color}
                      strokeWidth={(isSelected ? 4 : 2.5) / zoom}
                      markerEnd={`url(#${markerId})`}
                      style={{ pointerEvents: 'none' }}
                      className="transition-all"
                    />
                    {/* Label */}
                    {edge.label && (
                      <foreignObject
                        x={midX - 60 / zoom} y={midY - 20 / zoom}
                        width={120 / zoom} height={60 / zoom}
                        style={{ pointerEvents: 'none' }}
                      >
                        <div className="flex justify-center items-center h-full w-full p-1">
                          <div
                            onClick={(e) => { e.stopPropagation(); setSelectedEdge(edge.id); setSelectedNode(null); }}
                            style={{
                              backgroundColor: 'white', borderColor: color,
                              borderWidth: (isSelected ? 2 : 1) / zoom,
                              fontSize: 9 / zoom, color,
                              boxShadow: isSelected ? '0 4px 12px rgba(59,130,246,.2)' : '0 2px 4px rgba(0,0,0,.1)',
                              pointerEvents: 'all', cursor: 'pointer',
                              borderStyle: 'solid', borderRadius: 6, padding: `${4 / zoom}px ${8 / zoom}px`,
                              fontWeight: 700, wordBreak: 'break-word', maxWidth: '100%', textAlign: 'center',
                            }}
                          >
                            {edge.label}
                          </div>
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}

              {/* Connexion en cours */}
              {activeConnection && (() => {
                const fn = nodes.find(n => n.id === activeConnection.fromId);
                if (!fn) return null;
                const tx = activeConnection.targetId ? nodes.find(n => n.id === activeConnection.targetId)!.position!.x + NODE_W / 2 : activeConnection.currentX;
                const ty = activeConnection.targetId ? nodes.find(n => n.id === activeConnection.targetId)!.position!.y : activeConnection.currentY;
                return (
                  <path
                    d={getBezierPath(fn.position!.x + NODE_W / 2, fn.position!.y + NODE_H, tx, ty)}
                    fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray="6,4"
                    markerEnd="url(#arrow-active)"
                    className="animate-[dash_10s_linear_infinite]"
                  />
                );
              })()}
            </svg>

            {/* Nœuds */}
            {nodes.map(node => (
              <CanvasNode
                key={node.id} node={node} zoom={zoom}
                selected={selectedNode === node.id}
                isInitial={node.id === initialNodeId}
                isPotentialTarget={activeConnection?.targetId === node.id}
                onSelect={(e) => { setSelectedNode(node.id === selectedNode ? null : node.id); setSelectedEdge(null); e.stopPropagation(); }}
                onMouseDown={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setDragging({ id: node.id, offsetX: (e.clientX - r.left) / zoom, offsetY: (e.clientY - r.top) / zoom, startPos: { x: node.position!.x, y: node.position!.y } });
                  e.preventDefault(); e.stopPropagation();
                }}
                onStartConnection={handleStartConnection}
                onDelete={() => deleteNode(node.id)}
              />
            ))}
          </div>
        </div>

        {/* Panneau droit */}
        {showRightPanel && (
          <div className="w-80 shrink-0 overflow-y-auto">
            {activeNode && (
              <NodeEditor
                node={activeNode}
                isInitial={selectedNode === initialNodeId}
                outgoingEdges={edges.filter(e => e.from === selectedNode)}
                staffList={staffList}
                onUpdate={patch => { setNodes(prev => prev.map(n => n.id === selectedNode ? { ...n, ...patch } as WorkflowNode : n)); setTimeout(snap, 0); }}
                onSetInitial={() => { setInitialNodeId(selectedNode!); setTimeout(snap, 0); }}
                onDeleteEdge={id => deleteEdge(id)}
                onUpdateEdge={(id, patch) => { setEdges(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e)); setTimeout(snap, 0); }}
                onDelete={() => deleteNode(selectedNode!)}
                onClose={() => setSelectedNode(null)}
              />
            )}
            {activeEdge && !activeNode && (
              <EdgeEditor
                edge={activeEdge}
                onUpdate={patch => { setEdges(prev => prev.map(e => e.id === selectedEdge ? { ...e, ...patch } : e)); setTimeout(snap, 0); }}
                onDelete={() => deleteEdge(selectedEdge!)}
                onClose={() => setSelectedEdge(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Ghost de drag */}
      {draggingNew && (
        <div
          style={{
            position: 'fixed', left: draggingNew.x - (NODE_W / 2) * zoom, top: draggingNew.y - (NODE_H / 2) * zoom,
            width: NODE_W * zoom, height: NODE_H * zoom, pointerEvents: 'none', zIndex: 100,
          }}
          className={`rounded-xl border-2 shadow-2xl ${NODE_CONFIG[draggingNew.type].color} ${NODE_CONFIG[draggingNew.type].bg} opacity-70 flex items-center justify-center`}
        >
          {NODE_CONFIG[draggingNew.type].icon}
        </div>
      )}

      <style jsx global>{`
        @keyframes dash { to { stroke-dashoffset: -100; } }
        @media print {
          body * { visibility: hidden; }
          .flex-1.overflow-auto, .flex-1.overflow-auto * { visibility: visible; }
          .flex-1.overflow-auto { position: absolute; left: 0; top: 0; width: 100% !important; height: auto !important; overflow: visible !important; border: none !important; background: white !important; }
          nav, aside, header, .shrink-0, .w-80 { display: none !important; }
        }
      `}</style>
    </div>
  );
}
