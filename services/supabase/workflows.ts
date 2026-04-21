import { supabase } from './client';
import type {
  Workflow, WorkflowInstance, WorkflowLog, WorkflowJob,
  WorkflowDefinition, WorkflowStatus, Pretention,
  ClientTrackingToken, WorkflowMonitoringStats, WorkflowNode,
} from '@pos-types';

// ── Cast helpers ──────────────────────────────────────────────────────────────
const cast = <T>(v: unknown): T => v as T;

// ── Workflows ─────────────────────────────────────────────────────────────────
export async function getWorkflows(businessId: string, onlyActive = false): Promise<Workflow[]> {
  let q = supabase.from('workflows').select('*').eq('business_id', businessId);
  if (onlyActive) q = q.eq('is_active', true);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return cast<Workflow[]>(data ?? []);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const { error } = await supabase.from('workflows').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function toggleWorkflowStatus(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('workflows').update({ is_active: isActive }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const { data, error } = await supabase
    .from('workflows').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return cast<Workflow>(data);
}

export async function saveWorkflow(
  businessId: string,
  definition: WorkflowDefinition,
  name: string,
  description?: string,
  existingId?: string
): Promise<Workflow> {
  if (existingId) {
    // Incrémenter la version à chaque sauvegarde
    const current = await getWorkflow(existingId);
    const newVersion = (current.version || 0) + 1;
    const { data, error } = await supabase
      .from('workflows')
      .update({ 
        definition: cast(definition), 
        name, 
        description: description ?? null, 
        version: newVersion,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingId).select().single();
    if (error) throw new Error(error.message);
    return cast<Workflow>(data);
  }
  const { data, error } = await supabase
    .from('workflows')
    .insert({ business_id: businessId, name, description: description ?? null, definition: cast(definition) })
    .select().single();
  if (error) throw new Error(error.message);
  return cast<Workflow>(data);
}

// ── Instances ─────────────────────────────────────────────────────────────────
export async function startWorkflow(
  dossierId: string,
  workflow: Workflow,
  initialContext: Record<string, unknown> = {},
  startedBy?: string,
  triggeredBy?: string
): Promise<WorkflowInstance> {
  const { data, error } = await supabase
    .from('workflow_instances')
    .insert({
      dossier_id:        dossierId,
      workflow_id:       workflow.id,
      workflow_version:  workflow.version,
      workflow_snapshot: cast(workflow.definition),
      current_node_id:   workflow.definition.initial_node_id,
      context:           cast(initialContext),
      status:            'RUNNING' as WorkflowStatus,
      started_by:        startedBy ?? null,
      triggered_by:      triggeredBy ?? 'MANUAL',
    })
    .select().single();
  if (error) throw new Error(error.message);
  const instance = cast<WorkflowInstance>(data);

  await log({
    instance_id:      instance.id,
    level:            'INFO',
    event_type:       'TRIGGER',
    to_node_id:       workflow.definition.initial_node_id,
    message:          `Processus démarré (trigger: ${triggeredBy ?? 'MANUAL'})`,
    context_snapshot: initialContext,
    performed_by:     startedBy ?? null,
  });

  return instance;
}

export async function getInstance(id: string): Promise<WorkflowInstance> {
  const { data, error } = await supabase
    .from('workflow_instances').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return cast<WorkflowInstance>(data);
}

export async function getInstancesByDossier(dossierId: string): Promise<WorkflowInstance[]> {
  const { data, error } = await supabase
    .from('workflow_instances').select('*')
    .eq('dossier_id', dossierId)
    .order('started_at', { ascending: false });
  if (error) throw new Error(error.message);
  return cast<WorkflowInstance[]>(data ?? []);
}

export async function updateInstance(
  id: string,
  patch: Partial<WorkflowInstance>,
  expectedVersion?: number
): Promise<WorkflowInstance> {
  const updatePayload: any = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (expectedVersion !== undefined) {
    updatePayload.version = expectedVersion + 1;
  }

  let q = supabase.from('workflow_instances' as any).update(updatePayload).eq('id', id);

  if (expectedVersion !== undefined) {
    q = (q as any).eq('version', expectedVersion);
  }

  const { data, error } = await q.select().single();
  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error("Conflit de modification (race condition) : l'instance a été mise à jour par un autre processus.");
    }
    throw new Error(error.message);
  }
  return cast<WorkflowInstance>(data);
}

// ── Logs ──────────────────────────────────────────────────────────────────────
interface LogParams {
  instance_id:       string;
  level?:            WorkflowLog['level'];
  event_type:        string;
  from_node_id?:     string | null;
  to_node_id?:       string | null;
  edge_id?:          string | null;
  message?:          string | null;
  context_snapshot:  Record<string, unknown>;
  error_details?:    Record<string, unknown> | null;
  performed_by?:     string | null;
}

export async function log(params: LogParams): Promise<void> {
  await supabase.from('workflow_logs').insert({
    instance_id:       params.instance_id,
    level:             params.level ?? 'INFO',
    event_type:        params.event_type,
    from_node_id:      params.from_node_id ?? null,
    to_node_id:        params.to_node_id ?? null,
    edge_id:           params.edge_id ?? null,
    message:           params.message ?? null,
    context_snapshot:  cast(params.context_snapshot),
    error_details:     params.error_details ? cast(params.error_details) : null,
    performed_by:      params.performed_by ?? null,
  });
}

export async function getLogs(instanceId: string): Promise<WorkflowLog[]> {
  const { data, error } = await supabase
    .from('workflow_logs').select('*')
    .eq('instance_id', instanceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return cast<WorkflowLog[]>(data ?? []);
}

// ── Queue de jobs ─────────────────────────────────────────────────────────────
export async function enqueueJob(
  instanceId: string,
  jobType: string,
  payload: Record<string, unknown>,
  options: { priority?: number; processAfter?: Date; maxRetries?: number } = {}
): Promise<WorkflowJob> {
  const { data, error } = await supabase
    .from('workflow_jobs')
    .insert({
      instance_id:   instanceId,
      job_type:      jobType,
      payload:       cast(payload),
      priority:      options.priority   ?? 5,
      max_retries:   options.maxRetries ?? 3,
      process_after: options.processAfter?.toISOString() ?? new Date().toISOString(),
    })
    .select().single();
  if (error) throw new Error(error.message);
  return cast<WorkflowJob>(data);
}

export async function claimPendingJobs(limit = 50): Promise<WorkflowJob[]> {
  const { data, error } = await supabase
    .from('workflow_jobs').select('*')
    .eq('status', 'PENDING')
    .lte('process_after', new Date().toISOString())
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return cast<WorkflowJob[]>(data ?? []);
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<WorkflowJob, 'status' | 'retry_count' | 'last_error' | 'processed_at'>>
): Promise<void> {
  await supabase.from('workflow_jobs').update(patch as any).eq('id', id);
}

// ── Pretentions ───────────────────────────────────────────────────────────────
export async function getPretentions(businessId: string, category?: string): Promise<Pretention[]> {
  let q = supabase.from('pretentions').select('*')
    .eq('business_id', businessId).eq('is_active', true);
  if (category) q = q.eq('category', category as any);
  const { data, error } = await q.order('name');
  if (error) throw new Error(error.message);
  return cast<Pretention[]>(data ?? []);
}

export async function upsertPretention(
  params: Partial<Pretention> & { business_id: string; name: string; template: string }
): Promise<Pretention> {
  const { id, ...rest } = params;
  const payload = { ...rest, variables: cast(rest.variables) };
  const { data, error } = id
    ? await supabase.from('pretentions').update(payload as any).eq('id', id).select().single()
    : await supabase.from('pretentions').insert(payload as any).select().single();
  if (error) throw new Error(error.message);
  return cast<Pretention>(data);
}

export async function deletePretention(id: string): Promise<void> {
  const { error } = await supabase.from('pretentions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Client tracking ───────────────────────────────────────────────────────────
export async function createTrackingToken(
  dossierId: string,
  instanceId: string,
  clientPhone?: string,
  clientEmail?: string
): Promise<ClientTrackingToken> {
  const { data, error } = await supabase
    .from('client_tracking_tokens')
    .insert({ dossier_id: dossierId, instance_id: instanceId, client_phone: clientPhone ?? null, client_email: clientEmail ?? null })
    .select().single();
  if (error) throw new Error(error.message);
  return cast<ClientTrackingToken>(data);
}

export async function getTrackingToken(token: string): Promise<ClientTrackingToken | null> {
  const { data } = await supabase
    .from('client_tracking_tokens').select('*').eq('token', token).single();
  if (!data) return null;
  // Incrémenter le compteur de vues
  await supabase.from('client_tracking_tokens')
    .update({ last_viewed: new Date().toISOString(), view_count: (cast<ClientTrackingToken>(data).view_count ?? 0) + 1 })
    .eq('token', token);
  return cast<ClientTrackingToken>(data);
}

// ── Monitoring ────────────────────────────────────────────────────────────────
export async function getMonitoringStats(businessId: string): Promise<WorkflowMonitoringStats> {
  const workflowIds = await supabase
    .from('workflows').select('id').eq('business_id', businessId)
    .then(r => (r.data ?? []).map((w: { id: string }) => w.id));

  if (workflowIds.length === 0) {
    return {
      total_active: 0, waiting: 0, failed: 0, paused: 0,
      overdue: 0, completed_today: 0, recent_errors: [], blocked_instances: [],
    };
  }

  const [active, failed, paused, completedToday, errors] = await Promise.all([
    supabase.from('workflow_instances').select('*', { count: 'exact', head: false })
      .in('workflow_id', workflowIds).in('status', ['RUNNING', 'WAITING']),
    supabase.from('workflow_instances').select('id', { count: 'exact', head: true })
      .in('workflow_id', workflowIds).eq('status', 'FAILED'),
    supabase.from('workflow_instances').select('id', { count: 'exact', head: true })
      .in('workflow_id', workflowIds).eq('status', 'PAUSED'),
    supabase.from('workflow_instances').select('id', { count: 'exact', head: true })
      .in('workflow_id', workflowIds).eq('status', 'COMPLETED')
      .gte('completed_at', new Date(Date.now() - 86400000).toISOString()),
    supabase.from('workflow_logs').select('*').eq('level', 'ERROR')
      .in('instance_id',
        (await supabase.from('workflow_instances').select('id').in('workflow_id', workflowIds))
          .data?.map((i: { id: string }) => i.id) ?? []
      ).order('created_at', { ascending: false }).limit(10),
  ]);

  const activeInstances = cast<WorkflowInstance[]>(active.data ?? []);
  const waitingInstances = activeInstances.filter(i => i.status === 'WAITING');

  // Instances bloquées (WAITING > 2h)
  const blocked = waitingInstances
    .map(inst => {
      const node = inst.workflow_snapshot.nodes.find(n => n.id === inst.current_node_id) as WorkflowNode | undefined;
      const updatedAt = new Date(inst.updated_at).getTime();
      const hoursWaiting = (Date.now() - updatedAt) / 3600000;
      return { instance: inst, node: node!, hours_waiting: hoursWaiting };
    })
    .filter(b => b.node && b.hours_waiting > 2)
    .sort((a, b) => b.hours_waiting - a.hours_waiting);

  return {
    total_active:     activeInstances.length,
    waiting:          waitingInstances.length,
    failed:           failed.count ?? 0,
    paused:           paused.count ?? 0,
    overdue:          blocked.length,
    completed_today:  completedToday.count ?? 0,
    recent_errors:    cast<WorkflowLog[]>(errors.data ?? []),
    blocked_instances: blocked,
  };
}
