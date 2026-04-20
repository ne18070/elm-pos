import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  try {
    const rawBody = await req.text();
    const secret = Deno.env.get('WEBHOOK_SECRET');
    
    if (secret) {
      const signature = req.headers.get('x-workflow-signature');
      if (!signature) return new Response('Unauthorized', { status: 401 });

      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
      const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      if (signature !== expected) return new Response('Unauthorized', { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const { instance_id, edge_id, event_data = {} } = body;

    if (!instance_id || !edge_id) {
      return new Response('instance_id and edge_id required', { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Instead of calling a Next.js server, we directly enqueue a job
    // that the workflow-processor (Edge Function) will pick up.
    const { error } = await supabase.from('workflow_jobs').insert({
      instance_id,
      job_type: 'RESUME_DELAY', // Use the same job type as delay resumption
      payload: {
        next_edge: edge_id,
        event_data: {
          ...event_data,
          _webhook_received_at: new Date().toISOString()
        }
      },
      priority: 1, // High priority
      process_after: new Date().toISOString()
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
