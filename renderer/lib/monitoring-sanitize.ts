/**
 * RGPD / Confidentialité — sanitisation des données de monitoring.
 * Garantit qu'aucune donnée sensible ne remonte dans les logs techniques.
 */

const SENSITIVE_KEYS = /password|passwd|pwd|secret|token|key|auth|credit|card|cvv|pin|ssn|ninea|nif|iban|rib|bearer/i;
const EMAIL_RE   = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
const PHONE_RE   = /(?:\+|00)?[\d\s()./-]{8,16}/g;

/**
 * Nettoie récursivement un objet de contexte avant envoi vers la DB.
 * - Remplace les valeurs de clés sensibles par '[REDACTED]'
 * - Masque les emails et téléphones dans les valeurs string
 * - Tronque les strings longues (ex: stack traces)
 */
export function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

  if (typeof obj === 'string') {
    return obj
      .slice(0, 2000)
      .replace(EMAIL_RE,  '[EMAIL]')
      .replace(PHONE_RE, (m) => m.replace(/\d/g, '*'));
  }

  if (Array.isArray(obj)) {
    return obj.slice(0, 20).map((v) => sanitize(v, depth + 1));
  }

  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : sanitize(v, depth + 1);
    }
    return out;
  }

  return String(obj).slice(0, 500);
}

/** Extrait le domaine d'un email sans exposer la partie locale */
export function emailDomain(email: string): string {
  return email.includes('@') ? email.split('@')[1] : '[unknown]';
}

/** Extrait le pathname sans query string ni fragments (potentiel PII) */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url.split('?')[0].split('#')[0].slice(0, 200);
  }
}
