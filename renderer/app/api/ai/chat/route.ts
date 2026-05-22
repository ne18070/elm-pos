import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type RequestBody = {
  businessId?: string;
  messages?: ChatMessage[];
  context?: unknown;
};

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';


const BUSINESS_TYPE_LABELS: Record<string, string> = {
  restaurant: 'restauration (menus, commandes salle/emporter, tickets)',
  retail: 'commerce de détail (produits, stocks, caisse, ventes)',
  service: 'atelier de services (ordres de travail, réparations, techniciens)',
  hotel: 'hôtellerie (chambres, réservations, séjours)',
  juridique: 'cabinet juridique (dossiers, honoraires, clients)',
  education: 'établissement scolaire (élèves, scolarité, classes)',
};

const MODULE_LABELS: Record<string, string> = {
  view_pos: 'caisse/ventes',
  view_services: 'ordres de travail',
  view_hotel: 'gestion hôtelière',
  view_honoraires: 'honoraires',
  view_dossiers: 'dossiers',
  view_voitures: 'parc automobile',
  view_eleves: 'élèves',
  view_contrats: 'contrats',
  view_livraisons: 'livraisons',
  view_commandes_emporter: 'commandes à emporter',
  view_menu_du_jour: 'menu du jour',
  view_analytics: 'analytiques',
  view_clients: 'clients',
  view_comptabilite: 'comptabilité',
  view_depenses: 'dépenses',
};

function buildBusinessTypeInstruction(context: unknown): string {
  if (!context || typeof context !== 'object') return '';
  const ctx = context as { business?: { type?: string; types?: string[] } };
  const type = ctx.business?.type ?? '';
  const types = (ctx.business?.types ?? []) as string[];

  const lines: string[] = [];
  if (type && BUSINESS_TYPE_LABELS[type]) {
    lines.push(`Ce business est de type ${BUSINESS_TYPE_LABELS[type]}.`);
  }
  const activeModules = types.filter((t) => MODULE_LABELS[t]).map((t) => MODULE_LABELS[t]);
  if (activeModules.length > 0) {
    lines.push(`Modules actifs : ${activeModules.join(', ')}.`);
  }
  if (lines.length > 0) {
    lines.push('Adapte ton vocabulaire, tes analyses et tes recommandations à ce contexte métier spécifique.');
  }
  return lines.join(' ');
}

function compactMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.content.trim())
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000),
    }));
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Configuration IA serveur incomplète.' }, { status: 500 });
  }
  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Configuration IA serveur incomplète.' }, { status: 500 });
  }
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: 'Clé API Groq non configurée (GROQ_API_KEY).' }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const businessId = body.businessId;
  const messages = compactMessages(body.messages ?? []);
  const question = messages[messages.length - 1]?.content ?? '';
  if (!businessId || messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Question ou business manquant.' }, { status: 400 });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const userId = authData.user.id;
  const { data: membership } = await admin
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership || !['owner', 'admin', 'manager', 'staff'].includes(String(membership.role))) {
    return NextResponse.json({ error: 'Accès assistant refusé.' }, { status: 403 });
  }

  const { data: knowledge } = await admin
    .from('ai_knowledge')
    .select('title, content')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(8);

  const businessTypeInstruction = buildBusinessTypeInstruction(body.context);
  const system = [
    "Tu es l'assistant IA intégré à la plateforme ELM APP.",
    "TON UNIQUE RÔLE : analyser les données du business courant fournies dans le contexte (ventes, commandes, stocks, clients, finances, performance).",
    "HORS SUJET STRICT : si la question ne concerne pas directement les données du business courant, réponds exactement ceci et rien d'autre : \"Je suis uniquement disponible pour analyser les données de votre business. Posez-moi une question sur vos ventes, stocks, clients ou commandes.\"",
    "Exemples de questions hors sujet à refuser : météo, actualités, recettes, conseils généraux, code informatique, politique, tout sujet externe au business.",
    "Réponds en français clair, avec des montants et dates quand ils sont fournis dans le contexte.",
    "Tu es en lecture seule : ne dis jamais que tu as modifié, supprimé, créé ou encaissé quelque chose.",
    "N'invente aucune donnée. Utilise uniquement le contexte fourni et la mémoire validée. Si une information manque, dis exactement ce qui manque.",
    "Si la question demande une action, propose les étapes dans la plateforme au lieu de prétendre agir.",
    ...(businessTypeInstruction ? [businessTypeInstruction] : []),
  ].join(' ');

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: 'system', content: system },
          {
            role: 'system',
            content: `Mémoire:${JSON.stringify(knowledge ?? []).slice(0, 2000)}`,
          },
          {
            role: 'system',
            content: `Contexte:${JSON.stringify(body.context ?? {}).slice(0, 6000)}`,
          },
          ...((() => {
            const ctx = body.context as { current_page?: { name: string; actions: string } | null } | null;
            const page = ctx?.current_page;
            if (!page) return [];
            return [{
              role: 'system' as const,
              content: `L'utilisateur est actuellement sur la page "${page.name}". Actions réellement disponibles sur cette page : ${page.actions}. Ne mentionne QUE ces actions dans tes directives — ne propose rien d'autre.`,
            }];
          })()),
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after') ?? '15';
        return NextResponse.json(
          { error: `Trop de questions en peu de temps. Veuillez patienter ${retryAfter} secondes avant de réessayer.`, retryAfter: parseInt(retryAfter, 10) },
          { status: 429 },
        );
      }
      await response.body?.cancel();
      return NextResponse.json(
        { error: `Service IA indisponible (${response.status}). Réessayez dans un moment.` },
        { status: 502 },
      );
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return NextResponse.json({ error: "Le modèle IA n'a pas retourné de réponse." }, { status: 502 });
    }

    const { data: conversation } = await admin
      .from('ai_conversations')
      .insert({
        business_id: businessId,
        user_id: userId,
        question,
        answer,
        model: GROQ_MODEL,
      })
      .select('id')
      .single();

    return NextResponse.json({ answer, model: GROQ_MODEL, conversationId: conversation?.id ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    return NextResponse.json(
      { error: `Impossible de joindre l'API Groq. Vérifiez GROQ_API_KEY et la connexion réseau.${msg ? ` ${msg}` : ''}` },
      { status: 503 },
    );
  }
}
