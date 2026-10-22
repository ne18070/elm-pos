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
}

export type FcmResult = 'sent' | 'unregistered' | 'error';

let cachedToken: { value: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    return null;
  }
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
              notification: { tag: message.tag },
            },
            apns: {
              headers: message.tag ? { 'apns-collapse-id': message.tag } : undefined,
              payload: { aps: { sound: 'default' } },
            },
          },
        }),
      },
    );
    if (res.ok) return 'sent';
    // Jeton périmé (app désinstallée, données effacées) — seul cas où l'on supprime l'appareil
    const error = (await res.json().catch(() => null)) as
      | { error?: { details?: Array<{ errorCode?: string }> } }
      | null;
    const unregistered =
      res.status === 404 ||
      error?.error?.details?.some((d) => d.errorCode === 'UNREGISTERED') === true;
    return unregistered ? 'unregistered' : 'error';
  } catch {
    return 'error';
  }
}
