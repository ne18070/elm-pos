import { NextRequest, NextResponse } from 'next/server';
import { resumeFromEvent } from '@/app/actions/workflow';

// ── Vérification de la signature HMAC ─────────────────────────────────────────
async function verifySignature(req: NextRequest, body: string): Promise<boolean> {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // désactivé si pas de secret configuré

  const signature = req.headers.get('x-workflow-signature');
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = Buffer.from(sig).toString('hex');
  return signature === expected;
}

// ── POST /api/webhooks/workflow ───────────────────────────────────────────────
// Payload attendu :
// { instance_id, edge_id, event_key, event_data? }
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!(await verifySignature(req, rawBody))) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
  }

  let body: {
    instance_id: string;
    edge_id:     string;
    event_key:   string;
    event_data?: Record<string, unknown>;
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const { instance_id, edge_id, event_data = {} } = body;

  if (!instance_id || !edge_id) {
    return NextResponse.json({ error: 'instance_id et edge_id requis' }, { status: 400 });
  }

  const result = await resumeFromEvent(instance_id, edge_id, {
    ...event_data,
    _webhook_received_at: new Date().toISOString(),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    ok:          true,
    new_node_id: result.new_node_id,
    new_status:  result.new_status,
  });
}
