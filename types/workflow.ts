// ─── Legal Workflow Engine v2 — Types stricts ─────────────────────────────────

// ── Rôles ─────────────────────────────────────────────────────────────────────
export type WorkflowRole = 'LAWYER' | 'MANAGER' | 'SECRETARY' | 'CLIENT' | string;

// ── Types de nœuds ────────────────────────────────────────────────────────────
export type NodeType =
  | 'USER_TASK'     // Action manuelle par un utilisateur
  | 'ACTION'        // Action automatisée (notif, doc, webhook)
  | 'LEGAL_CLAIM'   // Génération d'un texte juridique
  | 'CONDITION'     // Branchement conditionnel
  | 'WAIT_EVENT'    // Pause jusqu'à un événement externe
  | 'DELAY'         // Délai temporel avant la suite
  | 'END';          // Nœud terminal

// ── Statuts d'instance ────────────────────────────────────────────────────────
export type WorkflowStatus =
  | 'PENDING'    // Créée, pas encore démarrée
  | 'RUNNING'    // En cours d'exécution
  | 'WAITING'    // En attente d'une action humaine
  | 'PAUSED'     // Mise en pause (DELAY ou WAIT_EVENT)
  | 'COMPLETED'  // Terminée avec succès
  | 'FAILED'     // Échec non récupérable
  | 'CANCELLED'; // Annulée manuellement

// ── Triggers ─────────────────────────────────────────────────────────────────
export type TriggerType =
  | 'ON_DOSSIER_CREATE'
  | 'ON_STEP_CHANGE'
  | 'TIMER'
  | 'EXTERNAL_EVENT'
  | 'AUTO_ON_CREATE'
  | 'MANUAL';

// ── Moteur de règles (sans eval) ──────────────────────────────────────────────
export type ConditionOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains'
  | 'exists' | 'not_exists'
  | 'in' | 'not_in';

export interface ConditionRule {
  fact:     string;    // dot-notation dans le contexte, ex: "client.montant"
  operator: ConditionOperator;
  value?:   unknown;   // undefined pour exists / not_exists
}

export interface ConditionGroup {
  all?: Array<ConditionRule | ConditionGroup>;  // AND
  any?: Array<ConditionRule | ConditionGroup>;  // OR
  none?: Array<ConditionRule | ConditionGroup>; // NONE (NOR)
}

// ── Types d'actions automatisées ──────────────────────────────────────────────
export type ActionType =
  | 'SEND_WHATSAPP'
  | 'SEND_EMAIL'
  | 'GENERATE_PDF'
  | 'CALL_WEBHOOK'
  | 'CREATE_TRACKING_LINK'
  | 'UPDATE_CONTEXT';

export interface ActionConfig {
  type: ActionType;
  // SEND_WHATSAPP / SEND_EMAIL
  to?:          string;   // dot-notation vers le num/email dans le contexte
  template?:    string;   // texte avec {{variables}}
  subject?:     string;   // pour email
  // GENERATE_PDF
  pretention_id?: string;
  document_name?: string;
  // CALL_WEBHOOK
  url?:         string;
  method?:      'GET' | 'POST' | 'PUT';
  headers?:     Record<string, string>;
  body_template?: string;
  // UPDATE_CONTEXT
  updates?:     Array<{ key: string; value: unknown | string }>; // string = template
}

// ── Champs de formulaire (USER_TASK) ──────────────────────────────────────────
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean' | 'phone' | 'email';

export interface FormField {
  key:          string;
  label:        string;
  type:         FieldType;
  required?:    boolean;
  options?:     string[];
  placeholder?: string;
  default?:     unknown;
}

// ── Nœuds ─────────────────────────────────────────────────────────────────────
interface BaseNode {
  id:             string;
  type:           NodeType;
  label:          string;
  description?:   string;
  assigned_role?: WorkflowRole;
  // Position pour le builder visuel
  position?:      { x: number; y: number };
}

export interface UserTaskNode extends BaseNode {
  type:         'USER_TASK';
  form_fields?: FormField[];
  due_hours?:   number;  // SLA : heures avant alerte
}

export interface ActionNode extends BaseNode {
  type:     'ACTION';
  actions:  ActionConfig[];  // exécutées en séquence
  on_error: 'FAIL' | 'CONTINUE' | 'RETRY';
}

export interface LegalClaimNode extends BaseNode {
  type:            'LEGAL_CLAIM';
  template:        string;
  pretention_id?:  string;   // référence bibliothèque
  share_method?:   'WHATSAPP_SHARE' | 'EMAIL' | 'DOWNLOAD';
  phone_field?:    string;
  email_field?:    string;
  document_name?:  string;
}

export interface ConditionNode extends BaseNode {
  type: 'CONDITION';
  // Les règles sont sur les edges sortants
}

export interface WaitEventNode extends BaseNode {
  type:        'WAIT_EVENT';
  event_key:   string;   // clé de l'événement attendu, ex: 'whatsapp_reply'
  timeout_hours?: number;  // si défini, passe à timeout_edge après N heures
  timeout_edge_id?: string;
}

export interface DelayNode extends BaseNode {
  type:        'DELAY';
  delay_hours: number;
  delay_label?: string;  // ex: "48h de délai légal"
}

export interface EndNode extends BaseNode {
  type:     'END';
  outcome?: 'SUCCESS' | 'FAILURE' | 'CANCELLED';
  message?: string;
}

export type WorkflowNode =
  | UserTaskNode | ActionNode | LegalClaimNode
  | ConditionNode | WaitEventNode | DelayNode | EndNode;

// ── Transitions ───────────────────────────────────────────────────────────────
export interface WorkflowEdge {
  id:                      string;
  from:                    string;
  to:                      string;
  label:                   string;
  color?:                  string;   // Couleur personnalisée pour le builder
  condition?:              ConditionGroup;
  requires_confirmation?:  boolean;
  allowed_roles?:          WorkflowRole[];
  is_default?:             boolean;  // edge de fallback pour CONDITION
}

// ── Définition complète ───────────────────────────────────────────────────────
export interface WorkflowDefinition {
  nodes:           WorkflowNode[];
  edges:           WorkflowEdge[];
  initial_node_id: string;
  version?:        number;
}

// ── Entités DB ────────────────────────────────────────────────────────────────
export interface Workflow {
  id:          string;
  business_id: string;
  name:        string;
  description: string | null;
  definition:  WorkflowDefinition;
  version:     number;
  is_active:   boolean;
  created_by:  string | null;
  created_at:  string;
  updated_at:  string;
}

export interface WorkflowInstance {
  id:                   string;
  dossier_id:           string;
  workflow_id:          string;
  workflow_version:     number;
  workflow_snapshot:    WorkflowDefinition;
  current_node_id:      string;
  context:              Record<string, unknown>;
  status:               WorkflowStatus;
  retry_count:          number;
  last_error:           string | null;
  paused_at:            string | null;
  scheduled_resume_at:  string | null;
  triggered_by:         string | null;
  started_by:           string | null;
  started_at:           string;
  completed_at:         string | null;
  version:              number;
  created_at:           string;
  updated_at:           string;
}

export interface WorkflowLog {
  id:               string;
  instance_id:      string;
  level:            'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  event_type:       string;
  from_node_id:     string | null;
  to_node_id:       string | null;
  edge_id:          string | null;
  message:          string | null;
  context_snapshot: Record<string, unknown>;
  error_details:    Record<string, unknown> | null;
  performed_by:     string | null;
  created_at:       string;
}

export interface WorkflowJob {
  id:            string;
  instance_id:   string;
  job_type:      string;
  payload:       Record<string, unknown>;
  status:        'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  priority:      number;
  retry_count:   number;
  max_retries:   number;
  last_error:    string | null;
  process_after: string;
  created_at:    string;
  processed_at:  string | null;
}

// ── Pretentions ───────────────────────────────────────────────────────────────
export interface PretentionVariable {
  key:       string;
  label:     string;
  type:      FieldType;
  required?: boolean;
}

export interface Pretention {
  id:          string;
  business_id: string;
  name:        string;
  category:    string | null;
  description: string | null;
  template:    string;
  variables:   PretentionVariable[];
  tags:        string[];
  is_active:   boolean;
  created_by:  string | null;
  created_at:  string;
  updated_at:  string;
}

// ── Client tracking ───────────────────────────────────────────────────────────
export interface ClientTrackingToken {
  id:           string;
  token:        string;
  dossier_id:   string;
  instance_id:  string | null;
  client_phone: string | null;
  client_email: string | null;
  expires_at:   string;
  last_viewed:  string | null;
  view_count:   number;
  created_at:   string;
}

// ── Payloads Server Actions ───────────────────────────────────────────────────
export interface TransitionPayload {
  instance_id:   string;
  edge_id:       string;
  form_data?:    Record<string, unknown>;
  performed_by?: string;
}

export interface TransitionResult {
  ok:            boolean;
  new_node_id?:  string;
  new_status?:   WorkflowStatus;
  jobs_queued?:  number;
  error?:        string;
}

export interface TriggerWorkflowPayload {
  workflow_id:     string;
  dossier_id:      string;
  initial_context?: Record<string, unknown>;
  triggered_by?:   TriggerType;
  started_by?:     string;
}

// ── Monitoring ────────────────────────────────────────────────────────────────
export interface WorkflowMonitoringStats {
  total_active:     number;
  waiting:          number;
  failed:           number;
  paused:           number;
  overdue:          number;  // WAITING > SLA défini sur le nœud
  completed_today:  number;
  recent_errors:    WorkflowLog[];
  blocked_instances: Array<{
    instance: WorkflowInstance;
    node:     WorkflowNode;
    hours_waiting: number;
  }>;
}
