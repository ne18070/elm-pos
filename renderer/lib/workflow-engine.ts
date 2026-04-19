// ─── Workflow Engine v2 ───────────────────────────────────────────────────────
// Moteur de règles sécurisé sans eval().
// Supporte: AND/OR/NONE imbriqués, 12 opérateurs, interpolation, WhatsApp.

import type {
  ConditionGroup,
  ConditionRule,
  ConditionOperator,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  ActionConfig,
} from '@pos-types';

// ── Résolution dot-notation ───────────────────────────────────────────────────
export function resolvePath(ctx: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ctx);
}

// ── Évaluation d'une règle atomique ──────────────────────────────────────────
function evalRule(rule: ConditionRule, ctx: Record<string, unknown>): boolean {
  const fact  = resolvePath(ctx, rule.fact);
  const { operator, value } = rule;

  switch (operator as ConditionOperator) {
    case 'eq':          return fact === value;
    case 'neq':         return fact !== value;
    case 'gt':          return typeof fact === 'number' && typeof value === 'number' && fact > value;
    case 'gte':         return typeof fact === 'number' && typeof value === 'number' && fact >= value;
    case 'lt':          return typeof fact === 'number' && typeof value === 'number' && fact < value;
    case 'lte':         return typeof fact === 'number' && typeof value === 'number' && fact <= value;
    case 'contains':
      if (Array.isArray(fact)) return fact.includes(value);
      if (typeof fact === 'string' && typeof value === 'string') return fact.includes(value);
      return false;
    case 'not_contains':
      if (Array.isArray(fact)) return !fact.includes(value);
      if (typeof fact === 'string' && typeof value === 'string') return !fact.includes(value);
      return true;
    case 'in':          return Array.isArray(value) && value.includes(fact);
    case 'not_in':      return Array.isArray(value) && !value.includes(fact);
    case 'exists':      return fact !== undefined && fact !== null && fact !== '';
    case 'not_exists':  return fact === undefined || fact === null || fact === '';
    default:            return false;
  }
}

// ── Évaluation récursive d'un groupe ─────────────────────────────────────────
export function evaluateConditionGroup(
  group: ConditionGroup,
  ctx: Record<string, unknown>
): boolean {
  const isRule = (item: ConditionRule | ConditionGroup): item is ConditionRule =>
    'fact' in item && 'operator' in item;

  const eval_ = (item: ConditionRule | ConditionGroup): boolean =>
    isRule(item) ? evalRule(item, ctx) : evaluateConditionGroup(item, ctx);

  if (group.all  && group.all.length  > 0) return group.all.every(eval_);
  if (group.any  && group.any.length  > 0) return group.any.some(eval_);
  if (group.none && group.none.length > 0) return !group.none.some(eval_);
  return true; // groupe vide = toujours vrai
}

// ── Edges éligibles depuis un nœud ───────────────────────────────────────────
export function getEligibleEdges(
  def: WorkflowDefinition,
  nodeId: string,
  ctx: Record<string, unknown>
): WorkflowEdge[] {
  return def.edges
    .filter(e => e.from === nodeId)
    .filter(e => !e.condition || evaluateConditionGroup(e.condition, ctx));
}

// ── Résolution auto pour nœud CONDITION ───────────────────────────────────────
// Retourne le premier edge éligible, ou l'edge is_default en fallback.
export function resolveConditionEdge(
  def: WorkflowDefinition,
  nodeId: string,
  ctx: Record<string, unknown>
): WorkflowEdge | null {
  const outgoing = def.edges.filter(e => e.from === nodeId);
  const eligible = outgoing.filter(
    e => e.condition ? evaluateConditionGroup(e.condition, ctx) : !e.is_default
  );
  if (eligible.length > 0) return eligible[0];
  return outgoing.find(e => e.is_default) ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function getNode(def: WorkflowDefinition, id: string): WorkflowNode | undefined {
  return def.nodes.find(n => n.id === id);
}

export function getEdge(def: WorkflowDefinition, id: string): WorkflowEdge | undefined {
  return def.edges.find(e => e.id === id);
}

export function getOutgoingEdges(def: WorkflowDefinition, nodeId: string): WorkflowEdge[] {
  return def.edges.filter(e => e.from === nodeId);
}

// ── Interpolation de template ──────────────────────────────────────────────────
// Remplace {{variable}} et {{nested.key}} par les valeurs du contexte.
// Les valeurs manquantes restent sous forme {{key}} pour débogage.
export function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, path: string) => {
    const v = resolvePath(ctx, path);
    return v !== undefined && v !== null ? String(v) : `{{${path}}}`;
  });
}

// ── Génération lien wa.me ─────────────────────────────────────────────────────
export function buildWhatsAppUrl(phone: string, message: string): string {
  const clean   = phone.replace(/[^\d+]/g, '');
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${clean}?text=${encoded}`;
}

// ── Résolution d'une action UPDATE_CONTEXT ────────────────────────────────────
export function applyContextUpdates(
  ctx: Record<string, unknown>,
  updates: ActionConfig['updates'] = []
): Record<string, unknown> {
  const result = { ...ctx };
  for (const { key, value } of updates) {
    // Si value est une string avec {{...}}, l'interpoler
    result[key] = typeof value === 'string' ? interpolate(value, ctx) : value;
  }
  return result;
}

// ── Validation de la définition ───────────────────────────────────────────────
export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export function validateDefinition(def: WorkflowDefinition): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(def.nodes.map(n => n.id));

  if (!def.initial_node_id) {
    errors.push({ message: 'initial_node_id manquant' });
  } else if (!nodeIds.has(def.initial_node_id)) {
    errors.push({ message: `initial_node_id "${def.initial_node_id}" introuvable` });
  }

  for (const edge of def.edges) {
    if (!nodeIds.has(edge.from))
      errors.push({ edgeId: edge.id, message: `Edge "${edge.id}" : from="${edge.from}" introuvable` });
    if (!nodeIds.has(edge.to))
      errors.push({ edgeId: edge.id, message: `Edge "${edge.id}" : to="${edge.to}" introuvable` });
  }

  const endNodes = def.nodes.filter(n => n.type === 'END');
  if (endNodes.length === 0) {
    errors.push({ message: 'Aucun nœud END dans le workflow' });
  }

  return errors;
}
