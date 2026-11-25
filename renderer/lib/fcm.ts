import { createSign } from 'node:crypto';

/**
 * Firebase Cloud Messaging (API HTTP v1) — notifications de l'app « ELM Boutique ».
 * Serveur uniquement (routes app/api). Compte de service Firebase dans
 * FIREBASE_SERVICE_ACCOUNT_JSON : Console Firebase → Paramètres du projet →
 * Comptes de service → Générer une nouvelle clé privée (contenu brut du JSON).
 */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface FcmMessage {
  title: string;
  body: string;
  /** Lien ouvert au toucher de la notification (ex. /track/<jeton>) */
  url: string;
  /** Regroupe les notifications d'un même suivi (la plus récente remplace la précédente) */
  tag?: string;
  /** Nombre affiché sur l'icône de l'app (iOS, et lanceurs Android qui le gèrent) */
  badge?: number;
}

export type FcmResult = 'sent' | 'unregistered' | 'error';

let cachedToken: { value: string; expiresAt: number } | null = null;

let reportedConfigError = false;

/** Une seule fois par instance : la cause exacte, sans jamais logguer de valeur secrète */
function reportConfigError(reason: string) {
  if (reportedConfigError) return;
  reportedConfigError = true;
  console.error(`[fcm] FIREBASE_SERVICE_ACCOUNT_JSON inutilisable : ${reason}. Attendu : le JSON du compte de service ` +
    '(Console Firebase → Paramètres du projet → Comptes de service → Générer une nouvelle clé privée), ' +
    'pas google-services.json / GoogleService-Info.plist.');
}

/**
 * Lit le compte de service tel qu'il est souvent collé dans Vercel : JSON brut,
 * JSON encodé une seconde fois (entre guillemets) ou base64. La clé privée peut
 * arriver avec des « \n » littéraux au lieu de vrais retours à la ligne.
 */
function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  let parsed: unknown = raw;
  try {
    if (!raw.startsWith('{') && !raw.startsWith('"')) parsed = Buffer.from(raw, 'base64').toString('utf8');
    // Jusqu'à deux décodages : JSON brut, ou JSON stocké comme chaîne JSON
    for (let i = 0; i < 2 && typeof parsed === 'string'; i++) parsed = JSON.parse(parsed);
  } catch {
    reportConfigError('JSON illisible');
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    reportConfigError('ce n’est pas un objet JSON');
    return null;
  }

  // Clé enveloppée dans un objet ({ "FIREBASE_SERVICE_ACCOUNT_JSON": {…} }, { "serviceAccount": "…" }…)
  const looksLikeAccount = (o: unknown) => !!o && typeof o === 'object' && 'private_key' in o;
  if (!looksLikeAccount(parsed)) {
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      let inner: unknown = value;
      try { if (typeof inner === 'string') inner = JSON.parse(inner); } catch { /* pas du JSON */ }
      if (looksLikeAccount(inner)) { parsed = inner; break; }
    }
  }

  const account = parsed as Partial<ServiceAccount> & { type?: string };
  const missing = (['project_id', 'client_email', 'private_key'] as const).filter(k => !account[k]);
  if (missing.length) {
    // Noms des champs reçus et forme de la valeur (jamais leur contenu) : de quoi
    // reconnaître le fichier collé par erreur
    const keys = Object.keys(account).slice(0, 8).join(', ') || 'aucun';
    reportConfigError(`champ(s) manquant(s) : ${missing.join(', ')}${account.type ? ` (type « ${account.type} »)` : ''}` +
      ` — champs reçus : ${keys} — valeur de ${raw.length} caractères commençant par « ${raw[0]} »`);
    return null;
  }
  return {
    project_id: account.project_id!,
    client_email: account.client_email!,
    private_key: account.private_key!.replace(/\\n/g, '\n'),
  };
}

export const isFcmConfigured = () => serviceAccount() !== null;

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(account.private_key));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`OAuth Firebase: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/** Envoie une notification à un appareil. 'unregistered' = jeton à supprimer. */
export async function sendFcm(deviceToken: string, message: FcmMessage): Promise<FcmResult> {
  const account = serviceAccount();
  if (!account) return 'error';
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await accessToken(account)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title: message.title, body: message.body },
            data: { url: message.url },
            android: {
              priority: 'HIGH',
              notification: { tag: message.tag, notification_count: message.badge },
            },
            apns: {
              headers: message.tag ? { 'apns-collapse-id': message.tag } : undefined,
              payload: { aps: { sound: 'default', badge: message.badge } },
            },
          },
        }),
      },
    );
    if (res.ok) return 'sent';
    // Jeton périmé (app désinstallée, données effacées) — seul cas où l'on supprime l'appareil
    const error = (await res.json().catch(() => null)) as
      | { error?: { message?: string; details?: Array<{ errorCode?: string }> } }
      | null;
    const unregistered =
      res.status === 404 ||
      error?.error?.details?.some((d) => d.errorCode === 'UNREGISTERED') === true;
    // Jeton tronqué : assez pour recouper avec la base, sans exposer le jeton entier
    console.warn('[fcm] envoi refusé', res.status, error?.error?.details?.map((d) => d.errorCode).join(',') ?? '',
      error?.error?.message ?? '', deviceToken.slice(0, 12));
    return unregistered ? 'unregistered' : 'error';
  } catch (err) {
    console.error('[fcm] envoi impossible', String(err));
    return 'error';
  }
}
