import {
  getInstance, updateInstance, log, enqueueJob,
  startWorkflow as dbStartWorkflow, getWorkflow,
} from '@services/supabase/workflows';
import { getBusiness } from '@services/supabase/business';
import { supabase } from '@/lib/supabase'; // Import direct pour insertion honoraires
import { displayCurrency } from '@/lib/utils';
import {
  getNode, getEdge, getEligibleEdges,
  resolveConditionEdge, interpolate, applyContextUpdates,
} from '@/lib/workflow-engine';
import type {
  TransitionPayload, TransitionResult, WorkflowStatus,
  WorkflowDefinition, WorkflowInstance,
  ActionNode, TriggerWorkflowPayload,
  FormField, UserTaskNode, Business, FeeRequestNode, DelayNode as WorkflowDelayNode
} from '@pos-types';

// -- Validation des données de formulaire -------------------------------------
function validateFormData(fields: FormField[], data: Record<string, unknown>): string[] {
  return fields.flatMap(f => {
    const value = data[f.key];
    if (f.required && (value === undefined || value === null || value === '')) {
      return [`Champ requis : ${f.label}`];
    }
    if (f.type === 'number' && value !== undefined && value !== null && value !== '') {
      if (isNaN(Number(value))) return [`${f.label} doit être un nombre`];
    }
    return [];
  });
}

// -- Exécution des actions automatisées ----------------------------------------
async function executeActionNode(
  node: ActionNode,
  instance: WorkflowInstance,
  ctx: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  let business: Business | null = null;
  const actions = node.actions ?? [];

  if (actions.some(a => a.type === 'CALL_WEBHOOK')) {
    const workflow = await getWorkflow(instance.workflow_id);
    business = await getBusiness(workflow.business_id);
  }

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'SEND_WHATSAPP': {
          const phone = action.to ? String(ctx[action.to] ?? '') : '';
          const text  = interpolate(action.template ?? '', ctx);
          await enqueueJob(instance.id, 'SEND_NOTIFICATION', {
            channel: 'whatsapp', phone, text,
          }, { priority: 2 });
          break;
        }
        case 'SEND_EMAIL': {
          const email   = action.to ? String(ctx[action.to] ?? '') : '';
          const subject = interpolate(action.subject ?? '', ctx);
          const body    = interpolate(action.template ?? '', ctx);
          await enqueueJob(instance.id, 'SEND_NOTIFICATION', {
            channel: 'email', email, subject, body,
          }, { priority: 3 });
          break;
        }
        case 'GENERATE_PDF': {
          await enqueueJob(instance.id, 'GENERATE_DOC', {
            pretention_id: action.pretention_id,
            document_name: action.document_name,
            context: ctx,
          }, { priority: 4 });
          break;
        }
        case 'CALL_WEBHOOK': {
          const url = action.url ?? '';
          const whitelist = business?.webhook_whitelist ?? [];
          if (whitelist.length > 0) {
            const isAllowed = whitelist.some(pattern => url.startsWith(pattern));
            if (!isAllowed) {
              throw new Error(`URL de webhook non autorisée : ${url}`);
            }
          }
          await enqueueJob(instance.id, 'CALL_WEBHOOK', {
            url,
            method:  action.method ?? 'POST',
            headers: action.headers ?? {},
            body:    action.body_template ? interpolate(action.body_template, ctx) : '{}',
          }, { priority: 5 });
          break;
        }
        case 'CREATE_TRACKING_LINK': {
          await enqueueJob(instance.id, 'CREATE_TRACKING_LINK', {
            dossier_id: instance.dossier_id,
            phone:      ctx['client.phone'] ?? ctx['phone'],
            email:      ctx['client.email'] ?? ctx['email'],
          }, { priority: 3 });
          break;
        }
        case 'UPDATE_CONTEXT': {
          Object.assign(ctx, applyContextUpdates(ctx, action.updates));
          break;
        }
      }
    } catch (err) {
      if (node.on_error === 'FAIL') return { ok: false, error: String(err) };
      if (node.on_error === 'RETRY') {
        const backoff = Math.min(Math.pow(2, instance.retry_count || 0) * 60, 3600); // 1min, 2min, 4min... max 1h
        await enqueueJob(instance.id, 'PROCESS_NODE', {
          node_id: node.id, action_index: actions.indexOf(action),
        }, { 
          priority: 1,
          processAfter: new Date(Date.now() + backoff * 1000)
        });
      }
      // CONTINUE : on ignore l'erreur et on passe à l'action suivante
    }
  }
  return { ok: true };
}

// -- Exécution de la génération d'honoraires ----------------------------------
async function executeFeeRequestNode(
  node: FeeRequestNode,
  instance: WorkflowInstance,
  ctx: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  try {
    let amount = node.amount ?? 0;
    if (node.amount_template) {
      const interpolated = interpolate(node.amount_template, ctx);
      amount = parseFloat(interpolated) || 0;
    }

    if (amount <= 0) {
      await log({
        instance_id: instance.id, level: 'WARN', event_type: 'FEE_SKIP',
        to_node_id: node.id, message: `Honoraire ignoré (montant nul ou invalide)`,
        context_snapshot: ctx,
      });
      return { ok: true };
    }

    const workflow = await getWorkflow(instance.workflow_id);
    const business = await getBusiness(workflow.business_id);

    const payload = {
      business_id:     workflow.business_id,
      dossier_id:      instance.dossier_id,
      client_name:     (ctx['client_name'] as string) || 'Client Inconnu',
      type_prestation: node.prestation_type || 'provision',
      description:     node.description || node.label,
      montant:         amount,
      montant_paye:    0,
      status:          'impayé',
      date_facture:    new Date().toISOString().slice(0, 10),
    };

    const { error } = await (supabase as any).from('honoraires_cabinet').insert(payload);
    if (error) throw error;

    await log({
      instance_id: instance.id, event_type: 'FEE_CREATED',
      to_node_id: node.id, message: `Honoraire créé automatique : ${amount.toLocaleString('fr-FR')} ${displayCurrency(business.currency ?? 'XOF')} (${payload.type_prestation})`,
      context_snapshot: ctx,
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// -- Traversée automatique des nœuds non-humains -------------------------------
async function autoTraverse(
  def: WorkflowDefinition,
  startNodeId: string,
  instance: WorkflowInstance,
  ctx: Record<string, unknown>
): Promise<{ nodeId: string; status: WorkflowStatus; ctx: Record<string, unknown> }> {
  let nodeId = startNodeId;
  let hops = 0;

  while (hops < 30) {
    const node = getNode(def, nodeId);
    if (!node) break;

    if (node.type === 'CONDITION') {
      const edge = resolveConditionEdge(def, nodeId, ctx);
      if (!edge) {
        await log({
          instance_id: instance.id, level: 'ERROR', event_type: 'CONDITION_DEADEND',
          from_node_id: nodeId,
          message: `Condition sans issue sur le nœud "${nodeId}". Vérifiez les règles ou ajoutez un edge par défaut.`,
          context_snapshot: ctx,
        });
        return { nodeId, status: 'FAILED' as WorkflowStatus, ctx };
      }
      await log({
        instance_id: instance.id, event_type: 'TRANSITION',
        from_node_id: nodeId, to_node_id: edge.to, edge_id: edge.id,
        message: `[AUTO CONDITION] ${edge.label}`, context_snapshot: ctx,
      });
      nodeId = edge.to;

    } else if (node.type === 'ACTION') {
      await log({
        instance_id: instance.id, event_type: 'ACTION_EXEC',
        to_node_id: nodeId, message: `Exécution: ${node.label}`, context_snapshot: ctx,
      });
      const result = await executeActionNode(node as ActionNode, instance, ctx);
      if (!result.ok) {
        return { nodeId, status: 'FAILED' as WorkflowStatus, ctx };
      }
      const edges = getEligibleEdges(def, nodeId, ctx);
      if (edges.length === 0) break;
      nodeId = edges[0].to;

    } else if (node.type === 'FEE_REQUEST') {
      await log({
        instance_id: instance.id, event_type: 'ACTION_EXEC',
        to_node_id: nodeId, message: `Génération honoraire: ${node.label}`, context_snapshot: ctx,
      });
      const result = await executeFeeRequestNode(node as FeeRequestNode, instance, ctx);
      if (!result.ok) {
        return { nodeId, status: 'FAILED' as WorkflowStatus, ctx };
      }
      const edges = getEligibleEdges(def, nodeId, ctx);
      if (edges.length === 0) break;
      nodeId = edges[0].to;

    } else if (node.type === 'DELAY') {
      const d = node as WorkflowDelayNode;
      let resumeAt: Date | null = null;
      const eligible = getEligibleEdges(def, nodeId, ctx);

      // 1. Priorité à la date dynamique du dossier
      if (d.date_field && ctx[d.date_field]) {
        const val = ctx[d.date_field];
        const date = new Date(String(val));
        if (!isNaN(date.getTime())) {
          // On attend jusqu'à cette date + un petit buffer (ex: 1h du matin le lendemain si date pure)
          resumeAt = date;
          if (String(val).length <= 10) resumeAt.setHours(23, 59, 59); // Fin de journée si date seule
        }
      }

      // 2. Sinon calcul par durée + unité
      if (!resumeAt && d.delay_hours) {
        let ms = d.delay_hours * 3600000;
        if (d.delay_unit === 'DAYS')   ms = d.delay_hours * 86400000;
        if (d.delay_unit === 'WEEKS')  ms = d.delay_hours * 604800000;
        resumeAt = new Date(Date.now() + ms);
      }

      // Si déjà passé ou non configuré, on skip
      if (!resumeAt || resumeAt.getTime() <= Date.now()) {
        if (eligible.length === 0) return { nodeId, status: 'PAUSED' as WorkflowStatus, ctx };
        nodeId = eligible[0].to;
        continue;
      }

      await enqueueJob(instance.id, 'RESUME_DELAY', { node_id: nodeId, next_edge: eligible[0]?.id }, {
        processAfter: resumeAt, priority: 8,
      });
      return { nodeId, status: 'PAUSED' as WorkflowStatus, ctx };

    } else if (node.type === 'WAIT_EVENT') {
      if (node.timeout_hours && node.timeout_edge_id) {
        const timeoutAt = new Date(Date.now() + node.timeout_hours * 3600000);
        await enqueueJob(instance.id, 'RESUME_DELAY', { node_id: nodeId, next_edge: node.timeout_edge_id, is_timeout: true }, {
          processAfter: timeoutAt, priority: 8,
        });
      }
      return { nodeId, status: 'WAITING' as WorkflowStatus, ctx };

    } else if (node.type === 'USER_TASK') {
      return { nodeId, status: 'WAITING' as WorkflowStatus, ctx };

    } else if (node.type === 'LEGAL_CLAIM') {
      // Si on arrive sur une prétention, on s'arrête pour permettre la lecture/partage,
      // SAUF si c'est le nœud de départ exact de cet autoTraverse (on vient d'y arriver via un bouton "Suivant")
      if (nodeId !== startNodeId) {
        return { nodeId, status: 'WAITING' as WorkflowStatus, ctx };
      }
      // Sinon on continue vers l'éligible suivant si possible
      const edges = getEligibleEdges(def, nodeId, ctx);
      if (edges.length === 0) return { nodeId, status: 'WAITING' as WorkflowStatus, ctx };
      nodeId = edges[0].to;

    } else if (node.type === 'END') {
      return { nodeId, status: 'COMPLETED' as WorkflowStatus, ctx };
    } else {
      break;
    }
    hops++;
  }

  return { nodeId, status: 'RUNNING' as WorkflowStatus, ctx };
}

// -- Fonction principale --------------------------------------------------
export async function transitionToNextStep(
  payload: TransitionPayload
): Promise<TransitionResult> {
  const { instance_id, edge_id, form_data = {}, performed_by } = payload;

  try {
    const instance = await getInstance(instance_id);

    if (instance.status === 'COMPLETED' || instance.status === 'CANCELLED') {
      return { ok: false, error: `Instance déjà ${instance.status}` };
    }

    const def = instance.workflow_snapshot;
    const currentNode = getNode(def, instance.current_node_id);

    // Validation des données si on est sur un USER_TASK
    if (currentNode?.type === 'USER_TASK') {
      const errors = validateFormData((currentNode as UserTaskNode).form_fields ?? [], form_data);
      if (errors.length > 0) return { ok: false, error: errors.join('. ') };
    }

    const edge = getEdge(def, edge_id);
    if (!edge) return { ok: false, error: `Edge "${edge_id}" introuvable` };
    if (edge.from !== instance.current_node_id) {
      return { ok: false, error: `Edge "${edge_id}" ne part pas du nœud courant` };
    }

    const ctx: Record<string, unknown> = { ...instance.context, ...form_data };

    // Vérifier l'éligibilité
    const eligible = getEligibleEdges(def, instance.current_node_id, ctx);
    if (!eligible.find(e => e.id === edge_id)) {
      return { ok: false, error: `Conditions non remplies pour cet edge` };
    }

    // Log de la transition humaine
    await log({
      instance_id, event_type: 'TRANSITION',
      from_node_id: instance.current_node_id,
      to_node_id: edge.to, edge_id,
      message: edge.label, context_snapshot: ctx,
      performed_by: performed_by ?? null,
    });

    // Traversée automatique depuis le nœud cible
    const result = await autoTraverse(def, edge.to, instance, ctx);

    const completedAt = result.status === 'COMPLETED' ? new Date().toISOString() : null;
    const pausedAt    = result.status === 'PAUSED'    ? new Date().toISOString() : null;

    await updateInstance(instance_id, {
      current_node_id: result.nodeId,
      context:         result.ctx,
      status:          result.status,
      ...(completedAt ? { completed_at: completedAt } : {}),
      ...(pausedAt    ? { paused_at: pausedAt }        : {}),
      ...(result.status !== 'PAUSED' ? { paused_at: null, scheduled_resume_at: null } : {}),
    }, instance.version);

    return { ok: true, new_node_id: result.nodeId, new_status: result.status };
  } catch (err) {
    console.error('[transitionToNextStep]', err);
    return { ok: false, error: String(err) };
  }
}

// -- Démarrer un workflow ------------------------------------------------------
export async function triggerWorkflow(
  payload: TriggerWorkflowPayload
): Promise<TransitionResult> {
  try {
    const workflow = await getWorkflow(payload.workflow_id);
    const instance = await dbStartWorkflow(
      payload.dossier_id, workflow,
      payload.initial_context ?? {},
      payload.started_by,
      payload.triggered_by ?? 'MANUAL'
    );

    // Traversée depuis le nœud initial si c'est automatisable
    const def = workflow.definition;
    const ctx = payload.initial_context ?? {};
    const result = await autoTraverse(def, workflow.definition.initial_node_id, instance, ctx);

    if (result.nodeId !== workflow.definition.initial_node_id || result.status !== 'WAITING') {
      await updateInstance(instance.id, {
        current_node_id: result.nodeId,
        context:         result.ctx,
        status:          result.status,
        ...(result.status === 'COMPLETED' ? { completed_at: new Date().toISOString() } : {}),
      }, instance.version);
    }

    return { ok: true, new_node_id: result.nodeId, new_status: result.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// -- Annulation ----------------------------------------------------------------
export async function cancelWorkflowInstance(
  instanceId: string,
  performedBy?: string
): Promise<TransitionResult> {
  try {
    const instance = await getInstance(instanceId);
    if (instance.status === 'COMPLETED' || instance.status === 'CANCELLED') {
      return { ok: false, error: `Instance déjà ${instance.status}` };
    }
    await updateInstance(instanceId, { status: 'CANCELLED' as WorkflowStatus, completed_at: new Date().toISOString() }, instance.version);
    await log({
      instance_id: instanceId, event_type: 'TRANSITION', level: 'WARN',
      from_node_id: instance.current_node_id, to_node_id: instance.current_node_id,
      message: 'Processus annulé', context_snapshot: instance.context,
      performed_by: performedBy ?? null,
    });
    return { ok: true, new_status: 'CANCELLED' as WorkflowStatus };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// -- Réessayer l'étape actuelle ----------------------------------------------
export async function retryCurrentStep(
  instanceId: string,
  performedBy?: string
): Promise<TransitionResult> {
  try {
    const instance = await getInstance(instanceId);
    const def = instance.workflow_snapshot;
    const nodeId = instance.current_node_id;
    const ctx = instance.context;

    await log({
      instance_id: instanceId, event_type: 'RETRY',
      to_node_id: nodeId, message: `Relance manuelle de l'étape`,
      performed_by: performedBy ?? null,
      context_snapshot: ctx,
    });

    // On relance la traversée auto à partir du nœud actuel (pas le suivant)
    const result = await autoTraverse(def, nodeId, instance, ctx);

    await updateInstance(instanceId, {
      current_node_id: result.nodeId,
      context:         result.ctx,
      status:          result.status,
      last_error:      null,
      ...(result.status === 'COMPLETED' ? { completed_at: new Date().toISOString() } : {}),
    }, instance.version);

    return { ok: true, new_node_id: result.nodeId, new_status: result.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// -- Résumer après WAIT_EVENT (reprise) -----------------------------
export async function resumeFromEvent(
  instanceId: string,
  edgeId: string,
  eventData: Record<string, unknown> = {}
): Promise<TransitionResult> {
  try {
    const instance = await getInstance(instanceId);
    if (instance.status !== 'WAITING' && instance.status !== 'PAUSED') {
      return { ok: false, error: `Instance non en attente (${instance.status})` };
    }

    const def = instance.workflow_snapshot;
    const edge = getEdge(def, edgeId);
    if (!edge || edge.from !== instance.current_node_id) {
      return { ok: false, error: `Edge invalide pour la reprise` };
    }

    const ctx = { ...instance.context, ...eventData };
    await log({
      instance_id: instanceId, event_type: 'RESUME',
      from_node_id: instance.current_node_id, to_node_id: edge.to,
      message: `Reprise via événement externe`, context_snapshot: ctx,
    });

    const result = await autoTraverse(def, edge.to, instance, ctx);
    await updateInstance(instanceId, {
      current_node_id: result.nodeId, context: result.ctx, status: result.status,
      paused_at: null, scheduled_resume_at: null,
      ...(result.status === 'COMPLETED' ? { completed_at: new Date().toISOString() } : {}),
    }, instance.version);

    return { ok: true, new_node_id: result.nodeId, new_status: result.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
