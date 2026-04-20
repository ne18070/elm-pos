import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const FROM_EMAIL = 'ELM APP <contact@elm-app.click>';

// ── Types ─────────────────────────────────────────────────────────────────────
type WorkflowStatus = 'RUNNING' | 'PAUSED' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface WorkflowJob {
  id: string;
  instance_id: string;
  job_type: string;
  payload: Record<string, any>;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  retry_count: number;
  max_retries: number;
  process_after: string;
}

// ── Workflow Engine Logic ─────────────────────────────────────────────────────
function resolvePath(ctx: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc, key) => {
    if (acc !== null && typeof acc === 'object') {
      return acc[key];
    }
    return undefined;
  }, ctx);
}

function evalRule(rule: any, ctx: Record<string, any>): boolean {
  const fact = resolvePath(ctx, rule.fact);
  const { operator, value } = rule;

  switch (operator) {
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

function evaluateConditionGroup(group: any, ctx: Record<string, any>): boolean {
  const isRule = (item: any): item is any => 'fact' in item && 'operator' in item;

  const eval_ = (item: any): boolean =>
    isRule(item) ? evalRule(item, ctx) : evaluateConditionGroup(item, ctx);

  if (group.all && group.all.length > 0) return group.all.every(eval_);
  if (group.any && group.any.length > 0) return group.any.some(eval_);
  if (group.none && group.none.length > 0) return !group.none.some(eval_);
  return true;
}

function getEligibleEdges(def: any, nodeId: string, ctx: Record<string, any>): any[] {
  return (def.edges || [])
    .filter((e: any) => e.from === nodeId)
    .filter((e: any) => !e.condition || evaluateConditionGroup(e.condition, ctx));
}

// ── Email Template Logic ──────────────────────────────────────────────────────
function baseLayout(content: string) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ELM APP</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
        <tr><td style="background:#0a0f1e;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
          <div style="display:inline-flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;background:#2563eb;border-radius:10px;display:inline-block;vertical-align:middle;"></div>
            <span style="color:#ffffff;font-size:20px;font-weight:800;vertical-align:middle;margin-left:8px;">
              ELM <span style="color:#38bdf8;">APP</span>
            </span>
          </div>
        </td></tr>
        <tr><td style="background:#ffffff;padding:40px;border-radius:0 0 16px 16px;">
          ${content}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;" />
          <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
            ELM APP · Gestion simplifiée pour l'Afrique<br/>
            <a href="mailto:contact@elm-app.click" style="color:#2563eb;">contact@elm-app.click</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildVars(type: string, data: Record<string, any>): Record<string, string> {
  const str = (v: any) => (v != null ? String(v) : '');
  const base = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, escapeHtml(str(v))]));

  if (type === 'marketing') {
    const btnLabel = data.button_label;
    const btnUrl = data.button_url;
    const safeUrl = btnUrl && /^https?:\/\//.test(btnUrl) ? btnUrl : '';
    return {
      ...base,
      button_block: btnLabel && safeUrl
        ? `<p style="text-align:center;margin:32px 0 24px;"><a href="${escapeHtml(safeUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">${escapeHtml(btnLabel)}</a></p>`
        : '',
    };
  }
  return base;
}

async function sendTemplatedEmail(supabase: any, type: string, to: string, subject: string, data: Record<string, any>) {
  const { data: tpl, error: tplError } = await supabase
    .from('email_templates')
    .select('html_body')
    .eq('key', type)
    .eq('is_active', true)
    .single();

  if (tplError || !tpl) {
    // Fallback to simple body if template not found
    return sendRawEmail(to, subject, data.html_content || data.body || '');
  }

  const vars = buildVars(type, data);
  const html = baseLayout(renderTemplate(tpl.html_body, vars));
  return sendRawEmail(to, subject, html);
}

async function sendRawEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Email failed: ${JSON.stringify(error)}`);
  }
}

// ── Job Processor ─────────────────────────────────────────────────────────────
async function processJob(supabase: any, job: WorkflowJob): Promise<void> {
  const p = job.payload;

  switch (job.job_type) {
    case 'SEND_NOTIFICATION': {
      if (p.channel === 'email') {
        await sendTemplatedEmail(supabase, 'marketing', String(p.email), String(p.subject ?? 'Notification dossier'), p);
      }
      break;
    }

    case 'GENERATE_DOC': {
      await supabase.from('workflow_logs').insert({
        instance_id: job.instance_id,
        event_type: 'ACTION_EXEC',
        message: `Document "${p.document_name}" en file de génération`,
        context_snapshot: p,
      });
      break;
    }

    case 'CALL_WEBHOOK': {
      const res = await fetch(String(p.url), {
        method: String(p.method ?? 'POST'),
        headers: { 'Content-Type': 'application/json', ...(p.headers ?? {}) },
        body: typeof p.body === 'string' ? p.body : JSON.stringify(p.body ?? {}),
      });
      if (!res.ok) throw new Error(`Webhook ${p.url} → ${res.status}`);
      break;
    }

    case 'RESUME_DELAY': {
      const { data: instance, error: instError } = await supabase
        .from('workflow_instances')
        .select('*')
        .eq('id', job.instance_id)
        .single();
      
      if (instError || !instance) throw new Error('Instance not found');
      if (instance.status !== 'PAUSED' && instance.status !== 'WAITING') break;

      const def = instance.workflow_snapshot;
      const edge = (def.edges || []).find((e: any) => e.id === p.next_edge);
      if (!edge) break;

      const ctx = instance.context;
      await supabase.from('workflow_logs').insert({
        instance_id: job.instance_id,
        event_type: 'RESUME',
        from_node_id: instance.current_node_id,
        to_node_id: edge.to,
        message: p.is_timeout ? `Timeout — reprise automatique` : `Délai écoulé — reprise`,
        context_snapshot: ctx,
      });

      const nextNode = (def.nodes || []).find((n: any) => n.id === edge.to);
      const newStatus = nextNode?.type === 'END' ? 'COMPLETED' :
                        nextNode?.type === 'USER_TASK' || nextNode?.type === 'LEGAL_CLAIM' ? 'WAITING' : 'RUNNING';

      await supabase.from('workflow_instances').update({
        current_node_id: edge.to,
        status: newStatus,
        paused_at: null,
        scheduled_resume_at: null,
        ...(newStatus === 'COMPLETED' ? { completed_at: new Date().toISOString() } : {}),
      }).eq('id', job.instance_id);
      break;
    }

    case 'CREATE_TRACKING_LINK': {
      await supabase.from('client_tracking_tokens').insert({
        dossier_id: p.dossier_id,
        instance_id: job.instance_id,
        client_phone: p.phone ?? null,
        client_email: p.email ?? null,
      });
      break;
    }

    default:
      throw new Error(`Job type inconnu: ${job.job_type}`);
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // 1. Récupérer les jobs
  const { data: jobs, error: claimError } = await supabase
    .from('workflow_jobs')
    .select('*')
    .eq('status', 'PENDING')
    .lte('process_after', new Date().toISOString())
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(20);

  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 });
  }

  const results = { processed: 0, failed: 0 };

  for (const job of (jobs || [])) {
    await supabase.from('workflow_jobs').update({ status: 'PROCESSING' }).eq('id', job.id);
    
    try {
      await processJob(supabase, job);
      await supabase.from('workflow_jobs').update({ 
        status: 'DONE', 
        processed_at: new Date().toISOString() 
      }).eq('id', job.id);
      results.processed++;
    } catch (err) {
      const newRetry = (job.retry_count || 0) + 1;
      const failed = newRetry >= (job.max_retries || 3);
      
      await supabase.from('workflow_jobs').update({
        status: failed ? 'FAILED' : 'PENDING',
        retry_count: newRetry,
        last_error: String(err),
      }).eq('id', job.id);

      if (failed) {
        await supabase.from('workflow_logs').insert({
          instance_id: job.instance_id,
          level: 'ERROR',
          event_type: 'ERROR',
          message: `Job ${job.job_type} échoué après ${newRetry} tentatives`,
          context_snapshot: job.payload,
          error_details: { error: String(err), job_id: job.id },
        });
        
        if (['RESUME_DELAY', 'PROCESS_NODE'].includes(job.job_type)) {
          await supabase.from('workflow_instances').update({
            status: 'FAILED',
            last_error: String(err),
          }).eq('id', job.instance_id);
        }
      }
      results.failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, ...results, total: jobs?.length || 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
