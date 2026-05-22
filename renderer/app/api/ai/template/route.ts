import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';
const GROQ_MODEL   = process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Rate limit : 5 générations par business par heure ─────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(businessId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(businessId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(businessId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans la rédaction de messages WhatsApp professionnels pour des petites entreprises en Afrique de l'Ouest.

Ta tâche : générer UN message WhatsApp court, naturel et chaleureux en français, selon la description donnée.

Variables disponibles à utiliser dans le message (utilise uniquement celles qui sont pertinentes) :
- {prenom} → le prénom du client
- {nom} → le nom complet du client
- {reference} → le numéro de l'ordre de travail (ex: OT-0042)
- {service} → la prestation réalisée (ex: Vidange moteur)
- {montant} → le montant total (ex: 25 000 FCFA)
- {statut} → le statut de l'OT (ex: Terminé)
- {business} → le nom de l'établissement
- {date} → la date du jour

Règles strictes :
- Réponds UNIQUEMENT avec le corps du message, aucun commentaire avant ou après
- Maximum 5 lignes
- Ton chaleureux et professionnel, adapté au contexte sénégalais/africain
- Utilise {prenom} de préférence à {nom} pour la salutation
- Inclure un emoji WhatsApp si approprié (pas plus de 2)
- Ne jamais inventer de variables autres que celles listées ci-dessus`;

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const admin = getSupabaseAdmin();
  if (!admin || !token) {
    return NextResponse.json({ error: 'Configuration serveur incomplète.' }, { status: 500 });
  }
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: 'Clé API Groq non configurée.' }, { status: 500 });
  }

  let body: { businessId?: string; description?: string; businessName?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const { businessId, description, businessName } = body;
  if (!businessId || !description?.trim()) {
    return NextResponse.json({ error: 'businessId et description requis.' }, { status: 400 });
  }

  // Auth
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  // Membership check
  const { data: membership } = await admin
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  // Rate limit
  if (!checkRateLimit(businessId)) {
    return NextResponse.json(
      { error: 'Limite atteinte : 5 générations par heure. Réessayez plus tard.' },
      { status: 429 },
    );
  }

  try {
    const userPrompt = [
      description.trim(),
      businessName ? `Nom de l'établissement : ${businessName}` : '',
    ].filter(Boolean).join('\n');

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        temperature: 0.7,
        max_tokens:  300,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return NextResponse.json({ error: 'Service IA surchargé. Réessayez dans quelques secondes.' }, { status: 429 });
      }
      await response.body?.cancel();
      return NextResponse.json({ error: 'Service IA indisponible.' }, { status: 502 });
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const template = data.choices?.[0]?.message?.content?.trim();
    if (!template) {
      return NextResponse.json({ error: "L'IA n'a pas retourné de résultat." }, { status: 502 });
    }

    return NextResponse.json({ template });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    return NextResponse.json({ error: `Impossible de joindre l'API Groq.${msg ? ` ${msg}` : ''}` }, { status: 503 });
  }
}
