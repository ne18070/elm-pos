'use client';

import { useState, useRef, useCallback, useId } from 'react';
import {
  Plus, Trash2, Save, Loader2, AlertTriangle, CheckCircle2,
  User, Zap, FileText, GitBranch, Clock, Timer, X, Link2,
} from 'lucide-react';
import { saveWorkflow } from '@services/supabase/workflows';
import { validateDefinition } from '@/lib/workflow-engine';
import type {
  WorkflowDefinition, WorkflowNode, WorkflowEdge,
  NodeType, WorkflowRole,
} from '@pos-types';

// ── Config visuelle des types de nœuds ───────────────────────────────────────
const NODE_CONFIG: Record<NodeType, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
  USER_TASK:    { label: 'Tâche',       color: 'border-blue-500',   bg: 'bg-blue-900/20',   icon: <User      className="w-3.5 h-3.5" /> },
  ACTION:       { label: 'Action auto', color: 'border-purple-500', bg: 'bg-purple-900/20', icon: <Zap       className="w-3.5 h-3.5" /> },
  LEGAL_CLAIM:  { label: 'Prétention',  color: 'border-brand-500',  bg: 'bg-brand-900/20',  icon: <FileText  className="w-3.5 h-3.5" /> },
  CONDITION:    { label: 'Condition',   color: 'border-amber-500',  bg: 'bg-amber-900/20',  icon: <GitBranch className="w-3.5 h-3.5" /> },
  WAIT_EVENT:   { label: 'Attente',     color: 'border-cyan-500',   bg: 'bg-cyan-900/20',   icon: <Clock     className="w-3.5 h-3.5" /> },
  DELAY:        { label: 'Délai',       color: 'border-orange-500', bg: 'bg-orange-900/20', icon: <Timer     className="w-3.5 h-3.5" /> },
  END:          { label: 'Fin',         color: 'border-green-500',  bg: 'bg-green-900/20',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

const ROLES: WorkflowRole[] = ['LAWYER', 'MANAGER', 'SECRETARY', 'CLIENT'];
const ROLE_LABELS: Record<WorkflowRole, string> = {
  LAWYER: 'Avocat', MANAGER: 'Gestionnaire', SECRETARY: 'Secrétaire', CLIENT: 'Client',
};

const GRID = 160;  // taille de la grille en px
const NODE_W = 148;
const NODE_H = 64;

// ── Génération d'ID court ─────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 8); }

// ── Nœud visuel sur le canvas ─────────────────────────────────────────────────
function CanvasNode({
  node, selected, onSelect, onDragStart, onStartEdge, onDelete, isInitial,
}: {
  node: WorkflowNode; selected: boolean; isInitial: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onStartEdge: (nodeId: string) => void;
  onDelete: () => void;
}) {
  const cfg = NODE_CONFIG[node.type];
  const pos = node.position ?? { x: 0, y: 0 };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      style={{
        position: 'absolute',
        left: pos.x, top: pos.y,
        width: NODE_W, height: NODE_H,
        cursor: 'grab',
        zIndex: selected ? 10 : 1,
      }}
      className={`rounded-xl border-2 ${cfg.color} ${cfg.bg} flex flex-col justify-between p-2.5
        transition-shadow select-none
        ${selected ? 'shadow-lg shadow-black/40 ring-2 ring-white/20' : 'hover:shadow-md'}
        ${isInitial ? 'ring-2 ring-brand-400/60' : ''}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0 opacity-70">{cfg.icon}</span>
        <span className="text-[11px] font-semibold text-white truncate">{node.label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-slate-500 uppercase">{cfg.label}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); onStartEdge(node.id); }}
            className="p-0.5 rounded text-slate-500 hover:text-brand-400 hover:bg-brand-900/30 transition-colors"
            title="Connecter"
          >
            <Link2 className="w-3 h-3" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/30 transition-colors"
            title="Supprimer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Panneau d'édition d'un nœud ───────────────────────────────────────────────
function NodeEditor({
  node, isInitial, onUpdate, onSetInitial, onClose,
}: {
  node: WorkflowNode; isInitial: boolean;
  onUpdate: (patch: Partial<WorkflowNode>) => void;
  onSetInitial: () => void;
  onClose: () => void;
}) {
  const cfg = NODE_CONFIG[node.type];
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`p-1.5 rounded-lg ${cfg.bg} border ${cfg.color}`}>{cfg.icon}</span>
          <p className="font-semibold text-white text-sm">{cfg.label}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="label text-xs">Libellé *</label>
        <input
          className="input text-sm"
          value={node.label}
          onChange={e => onUpdate({ label: e.target.value } as Partial<WorkflowNode>)}
        />
      </div>

      <div>
        <label className="label text-xs">Description</label>
        <textarea
          className="input text-sm resize-none"
          rows={2}
          value={node.description ?? ''}
          onChange={e => onUpdate({ description: e.target.value } as Partial<WorkflowNode>)}
        />
      </div>

      {node.type !== 'END' && node.type !== 'CONDITION' && (
        <div>
          <label className="label text-xs">Rôle assigné</label>
          <select
            className="input text-sm"
            value={node.assigned_role ?? ''}
            onChange={e => onUpdate({ assigned_role: (e.target.value || undefined) as WorkflowRole | undefined } as Partial<WorkflowNode>)}
          >
            <option value="">— Aucun —</option>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
      )}

      {node.type === 'LEGAL_CLAIM' && (
        <div>
          <label className="label text-xs">Template juridique</label>
          <textarea
            className="input text-sm font-mono resize-y min-h-[80px]"
            value={(node as Extract<WorkflowNode, { type: 'LEGAL_CLAIM' }>).template ?? ''}
            onChange={e => onUpdate({ template: e.target.value } as Partial<WorkflowNode>)}
            placeholder="Cher {{client.nom}}, ..."
          />
        </div>
      )}

      {node.type === 'DELAY' && (
        <div>
          <label className="label text-xs">Délai (heures)</label>
          <input
            type="number" min={1} className="input text-sm"
            value={(node as Extract<WorkflowNode, { type: 'DELAY' }>).delay_hours ?? 24}
            onChange={e => onUpdate({ delay_hours: parseInt(e.target.value) } as Partial<WorkflowNode>)}
          />
        </div>
      )}

      {node.type === 'WAIT_EVENT' && (
        <div>
          <label className="label text-xs">Clé d'événement attendu</label>
          <input
            className="input text-sm font-mono"
            value={(node as Extract<WorkflowNode, { type: 'WAIT_EVENT' }>).event_key ?? ''}
            onChange={e => onUpdate({ event_key: e.target.value } as Partial<WorkflowNode>)}
            placeholder="whatsapp_reply"
          />
        </div>
      )}

      {!isInitial && node.type !== 'END' && (
        <button onClick={onSetInitial} className="text-xs text-brand-400 hover:text-brand-300 underline">
          Définir comme nœud initial
        </button>
      )}
      {isInitial && (
        <p className="text-xs text-brand-400 font-semibold">⭐ Nœud de départ</p>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
interface WorkflowBuilderProps {
  businessId:   string;
  workflowId?:  string;
  initialName?: string;
  initialDef?:  WorkflowDefinition;
  onSaved?:     (id: string) => void;
}

export function WorkflowBuilder({
  businessId, workflowId, initialName = 'Nouveau workflow', initialDef, onSaved,
}: WorkflowBuilderProps) {
  const id = useId();

  const defaultDef: WorkflowDefinition = initialDef ?? {
    nodes: [
      { id: 'start', type: 'USER_TASK', label: 'Étape initiale', position: { x: 40, y: 40 } },
      { id: 'end1',  type: 'END',       label: 'Terminé',         position: { x: 40, y: 200 } },
    ],
    edges: [],
    initial_node_id: 'start',
  };

  const [name, setName]           = useState(initialName);
  const [nodes, setNodes]         = useState<WorkflowNode[]>(defaultDef.nodes);
  const [edges, setEdges]         = useState<WorkflowEdge[]>(defaultDef.edges);
  const [initialNodeId, setInitialNodeId] = useState(defaultDef.initial_node_id);
  const [selectedNode, setSelectedNode]   = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [errors, setErrors]       = useState<string[]>([]);
  const [saved, setSaved]         = useState(false);

  const dragNodeId = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const canvasRef  = useRef<HTMLDivElement>(null);

  // ── Drag & drop des nœuds ─────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    dragNodeId.current = nodeId;
    const node = nodes.find(n => n.id === nodeId);
    const pos  = node?.position ?? { x: 0, y: 0 };
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.dataTransfer.effectAllowed = 'move';
    void pos;
  }, [nodes]);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!dragNodeId.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left - dragOffset.current.x;
    const rawY = e.clientY - rect.top  - dragOffset.current.y;
    // Snap to grid
    const x = Math.max(0, Math.round(rawX / 20) * 20);
    const y = Math.max(0, Math.round(rawY / 20) * 20);

    setNodes(prev => prev.map(n =>
      n.id === dragNodeId.current ? { ...n, position: { x, y } } : n
    ));
    dragNodeId.current = null;
  }, []);

  // ── Ajout de nœud ────────────────────────────────────────────────────────
  const addNode = useCallback((type: NodeType) => {
    const newId = uid();
    const defaults: Partial<WorkflowNode> = type === 'LEGAL_CLAIM'
      ? { template: '' } as Partial<WorkflowNode>
      : type === 'DELAY' ? { delay_hours: 24 } as Partial<WorkflowNode>
      : type === 'WAIT_EVENT' ? { event_key: 'reply' } as Partial<WorkflowNode>
      : {};

    const newNode = {
      id: newId, type,
      label: NODE_CONFIG[type].label,
      position: { x: 40 + (nodes.length % 4) * (NODE_W + 20), y: 40 + Math.floor(nodes.length / 4) * (NODE_H + 40) },
      ...defaults,
    } as WorkflowNode;

    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newId);
  }, [nodes.length]);

  // ── Connexion de nœuds ───────────────────────────────────────────────────
  const handleStartEdge = useCallback((nodeId: string) => {
    setConnectingFrom(nodeId);
  }, []);

  const handleNodeClickForEdge = useCallback((nodeId: string) => {
    if (!connectingFrom || connectingFrom === nodeId) {
      setConnectingFrom(null);
      return;
    }
    const existing = edges.find(e => e.from === connectingFrom && e.to === nodeId);
    if (!existing) {
      setEdges(prev => [...prev, {
        id: uid(), from: connectingFrom, to: nodeId,
        label: 'Valider',
      }]);
    }
    setConnectingFrom(null);
  }, [connectingFrom, edges]);

  // ── Suppression ──────────────────────────────────────────────────────────
  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    if (selectedNode === nodeId) setSelectedNode(null);
    if (initialNodeId === nodeId) {
      const remaining = nodes.filter(n => n.id !== nodeId);
      if (remaining.length > 0) setInitialNodeId(remaining[0].id);
    }
  }, [selectedNode, initialNodeId, nodes]);

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId));
  }, []);

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    const def: WorkflowDefinition = { nodes, edges, initial_node_id: initialNodeId };
    const errs = validateDefinition(def);
    if (errs.length > 0) {
      setErrors(errs.map(e => e.message));
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const wf = await saveWorkflow(businessId, def, name, undefined, workflowId);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSaved?.(wf.id);
    } catch (e) {
      setErrors([String(e)]);
    } finally {
      setSaving(false);
    }
  };

  const selectedNodeObj = nodes.find(n => n.id === selectedNode);

  // ── SVG edges ────────────────────────────────────────────────────────────
  const canvasW = Math.max(800, ...nodes.map(n => (n.position?.x ?? 0) + NODE_W + 40));
  const canvasH = Math.max(500, ...nodes.map(n => (n.position?.y ?? 0) + NODE_H + 60));

  function edgePath(from: string, to: string) {
    const fn = nodes.find(n => n.id === from);
    const tn = nodes.find(n => n.id === to);
    if (!fn || !tn) return '';
    const fx = (fn.position?.x ?? 0) + NODE_W / 2;
    const fy = (fn.position?.y ?? 0) + NODE_H;
    const tx = (tn.position?.x ?? 0) + NODE_W / 2;
    const ty = tn.position?.y ?? 0;
    const cy = fy + (ty - fy) / 2;
    return `M ${fx} ${fy} C ${fx} ${cy}, ${tx} ${cy}, ${tx} ${ty}`;
  }

  return (
    <div className="flex flex-col h-full gap-4">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="input flex-1 min-w-48 text-sm font-semibold"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nom du workflow"
        />
        <div className="flex items-center gap-1 flex-wrap">
          {(Object.keys(NODE_CONFIG) as NodeType[]).map(type => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors
                ${NODE_CONFIG[type].color} ${NODE_CONFIG[type].bg} text-white hover:opacity-80`}
              title={`Ajouter ${NODE_CONFIG[type].label}`}
            >
              <Plus className="w-3 h-3" />
              {NODE_CONFIG[type].label}
            </button>
          ))}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 px-4 py-1.5 text-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      {/* ── Erreurs de validation ── */}
      {errors.length > 0 && (
        <div className="flex items-start gap-2 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <ul className="space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ── Info mode connexion ── */}
      {connectingFrom && (
        <div className="text-sm text-cyan-400 bg-cyan-900/20 border border-cyan-700 rounded-xl px-4 py-2">
          Cliquez sur un nœud de destination pour créer la connexion, ou sur le même nœud pour annuler.
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Canvas ── */}
        <div className="flex-1 overflow-auto rounded-xl border border-surface-border bg-[#0a0f1e] relative">
          <div
            ref={canvasRef}
            style={{ width: canvasW, height: canvasH, position: 'relative' }}
            onDragOver={e => e.preventDefault()}
            onDrop={handleCanvasDrop}
          >
            {/* SVG edges */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <marker id={`${id}-arrow`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#475569" />
                </marker>
              </defs>
              {edges.map(edge => (
                <g key={edge.id}>
                  <path
                    d={edgePath(edge.from, edge.to)}
                    fill="none" stroke="#475569" strokeWidth="1.5"
                    markerEnd={`url(#${id}-arrow)`}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={() => deleteEdge(edge.id)}
                  />
                  {/* Label centré */}
                  {(() => {
                    const fn = nodes.find(n => n.id === edge.from);
                    const tn = nodes.find(n => n.id === edge.to);
                    if (!fn || !tn) return null;
                    const cx = ((fn.position?.x ?? 0) + (tn.position?.x ?? 0)) / 2 + NODE_W / 2;
                    const cy = ((fn.position?.y ?? 0) + NODE_H + (tn.position?.y ?? 0)) / 2;
                    return (
                      <text x={cx} y={cy} textAnchor="middle" fontSize="10" fill="#64748b"
                        dominantBaseline="middle"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {edge.label}
                      </text>
                    );
                  })()}
                </g>
              ))}
            </svg>

            {/* Nœuds */}
            {nodes.map(node => (
              <CanvasNode
                key={node.id}
                node={node}
                selected={selectedNode === node.id}
                isInitial={node.id === initialNodeId}
                onSelect={() => {
                  if (connectingFrom) {
                    handleNodeClickForEdge(node.id);
                  } else {
                    setSelectedNode(node.id === selectedNode ? null : node.id);
                  }
                }}
                onDragStart={e => handleDragStart(e, node.id)}
                onStartEdge={handleStartEdge}
                onDelete={() => deleteNode(node.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Panneau d'édition ── */}
        {selectedNodeObj && (
          <div className="w-72 shrink-0">
            <NodeEditor
              node={selectedNodeObj}
              isInitial={selectedNodeObj.id === initialNodeId}
              onUpdate={patch => setNodes(prev => prev.map(n =>
                n.id === selectedNodeObj.id ? { ...n, ...patch } as WorkflowNode : n
              ))}
              onSetInitial={() => setInitialNodeId(selectedNodeObj.id)}
              onClose={() => setSelectedNode(null)}
            />
            {/* Édition des edges sortants */}
            {edges.filter(e => e.from === selectedNodeObj.id).length > 0 && (
              <div className="card p-3 mt-3 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase">Transitions sortantes</p>
                {edges.filter(e => e.from === selectedNodeObj.id).map(edge => (
                  <div key={edge.id} className="flex items-center gap-2">
                    <input
                      className="input flex-1 text-xs py-1"
                      value={edge.label}
                      onChange={ev => setEdges(prev => prev.map(e =>
                        e.id === edge.id ? { ...e, label: ev.target.value } : e
                      ))}
                      placeholder="Libellé du bouton"
                    />
                    <button onClick={() => deleteEdge(edge.id)} className="text-slate-500 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
