import { NextRequest, NextResponse } from 'next/server';
import { claimPendingJobs, updateJob, getInstance, updateInstance, log } from '@services/supabase/workflows';
import { getEdge, getEligibleEdges } from '@/lib/workflow-engine';
import { sendEmail } from '@services/resend';
import type { WorkflowJob } from '@pos-types';

// ── Vérification du token Vercel Cron ─────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

// ── Processeur de job individuel ──────────────────────────────────────────────
async function processJob(job: WorkflowJob): Promise<void> {
  const p = job.payload;

  switch (job.job_type) {

    case 'SEND_NOTIFICATION': {
      if (p.channel === 'whatsapp') {
        // WhatsApp = partage manuel via wa.me, pas d'API Business
        // On log uniquement — l'envoi est géré côté UI (bouton wa.me)
        await log({
          instance_id: job.instance_id, event_type: 'ACTION_EXEC',
          message: `WhatsApp préparé pour ${p.phone}`,
          context_snapshot: p as Record<string, unknown>,
        });
      } else if (p.channel === 'email') {
        await sendEmail({
          type:    'marketing',
          to:      String(p.email),
          subject: String(p.subject ?? 'Notification dossier'),
          data:    { html_content: String(p.body ?? '') },
        });
      }
      break;
    }

    case 'GENERATE_DOC': {
      // Hook : déléguer à ton service de génération PDF
      // ex: await generatePdf(job.instance_id, p.pretention_id, p.context)
      await log({
        instance_id: job.instance_id, event_type: 'ACTION_EXEC',
        message: `Document "${p.document_name}" en file de génération`,
        context_snapshot: p as Record<string, unknown>,
      });
      break;
    }

    case 'CALL_WEBHOOK': {
      const res = await fetch(String(p.url), {
        method:  String(p.method ?? 'POST'),
        headers: { 'Content-Type': 'application/json', ...(p.headers as Record<string, string> ?? {}) },
        body:    typeof p.body === 'string' ? p.body : JSON.stringify(p.body ?? {}),
      });
      if (!res.ok) throw new Error(`Webhook ${p.url} → ${res.status}`);
      break;
    }

    case 'RESUME_DELAY': {
      // Reprendre l'instance après un délai DELAY ou timeout WAIT_EVENT
      const instance = await getInstance(job.instance_id);
      if (instance.status !== 'PAUSED' && instance.status !== 'WAITING') break;

      const def  = instance.workflow_snapshot;
      const edge = getEdge(def, String(p.next_edge));
      if (!edge) break;

      const ctx = instance.context;
      await log({
        instance_id: job.instance_id, event_type: 'RESUME',
        from_node_id: instance.current_node_id, to_node_id: edge.to,
        message: p.is_timeout ? `Timeout — reprise automatique` : `Délai écoulé — reprise`,
        context_snapshot: ctx,
      });

      const eligible = getEligibleEdges(def, edge.to, ctx);
      const nextNode = def.nodes.find(n => n.id === edge.to);
      const newStatus = nextNode?.type === 'END' ? 'COMPLETED' :
                        nextNode?.type === 'USER_TASK' || nextNode?.type === 'LEGAL_CLAIM' ? 'WAITING' : 'RUNNING';

      await updateInstance(job.instance_id, {
        current_node_id:     edge.to,
        status:              newStatus as WorkflowJob['status'] extends string ? never : never,
        paused_at:           null,
        scheduled_resume_at: null,
        ...(newStatus === 'COMPLETED' ? { completed_at: new Date().toISOString() } : {}),
      });
      void eligible; // utilisé dans une version étendue
      break;
    }

    case 'CREATE_TRACKING_LINK': {
      const { createTrackingToken } = await import('@services/supabase/workflows');
      await createTrackingToken(
        String(p.dossier_id), job.instance_id,
        p.phone ? String(p.phone) : undefined,
        p.email ? String(p.email) : undefined,
      );
      break;
    }

    default:
      throw new Error(`Job type inconnu: ${job.job_type}`);
  }
}

// ── GET /api/cron/workflow-processor ─────────────────────────────────────────
// Déclenché par Vercel Cron (vercel.json) ou manuellement.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const jobs = await claimPendingJobs(20);
  const results = { processed: 0, failed: 0 };

  await Promise.allSettled(
    jobs.map(async (job) => {
      // Marquer comme en cours
      await updateJob(job.id, { status: 'PROCESSING' });
      try {
        await processJob(job);
        await updateJob(job.id, { status: 'DONE', processed_at: new Date().toISOString() });
        results.processed++;
      } catch (err) {
        const newRetry = job.retry_count + 1;
        const failed   = newRetry >= job.max_retries;
        await updateJob(job.id, {
          status:      failed ? 'FAILED' : 'PENDING',
          retry_count: newRetry,
          last_error:  String(err),
        });
        if (failed) {
          await log({
            instance_id:      job.instance_id,
            level:            'ERROR',
            event_type:       'ERROR',
            message:          `Job ${job.job_type} échoué après ${newRetry} tentatives`,
            context_snapshot: job.payload,
            error_details:    { error: String(err), job_id: job.id },
          });
          // Passer l'instance en FAILED si job critique
          if (['RESUME_DELAY', 'PROCESS_NODE'].includes(job.job_type)) {
            await updateInstance(job.instance_id, {
              status:     'FAILED',
              last_error: String(err),
            });
          }
        }
        results.failed++;
      }
    })
  );

  return NextResponse.json({ ok: true, ...results, total: jobs.length });
}
