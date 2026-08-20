'use client';

import { useEffect, useState } from 'react';
import {
  KeyRound, Copy, Check, AlertTriangle, ChevronDown, ChevronRight,
  ShieldCheck, Smartphone, Webhook, Search,
} from 'lucide-react';
import { getPaydunyaSettingsAdmin, type PaydunyaSettingsAdmin } from '@services/supabase/paydunya-admin';

// ─── Petits composants réutilisables (mêmes conventions que /developers) ──────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title="Copier" className="p-1.5 rounded text-content-muted hover:text-content-secondary hover:bg-black/5 transition-colors shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative group rounded-lg min-w-0" style={{ border: '1px solid #1e293b', overflow: 'clip' }}>
      {lang && (
        <div className="flex items-center justify-between px-4 py-1.5" style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
          <span className="text-[10px] font-mono font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>{lang}</span>
          <button
            onClick={() => navigator.clipboard.writeText(code).catch(() => {})}
            className="p-1.5 rounded transition-colors" style={{ color: '#475569' }} title="Copier"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
      )}
      <pre className="px-4 py-3 text-sm font-mono overflow-x-auto leading-relaxed" style={{ background: '#0f172a', color: '#94a3b8', whiteSpace: 'pre' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="text-brand-600 bg-surface-input px-1.5 py-0.5 rounded text-[13px] font-mono">{children}</code>;
}

const METHOD_STYLE: Record<string, string> = {
  GET:  'bg-sky-500/10 text-sky-700 border-sky-500/30',
  POST: 'bg-green-500/10 text-green-700 border-green-500/30',
};

function EndpointCard({ method, path, description, children, defaultOpen }: {
  method: 'GET' | 'POST'; path: string; description: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-xl border border-surface-border overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors">
        <span className={`shrink-0 px-2 py-0.5 rounded border text-[11px] font-bold font-mono min-w-[52px] text-center ${METHOD_STYLE[method]}`}>{method}</span>
        <code className="flex-1 text-sm text-content-primary font-mono">{path}</code>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-content-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-content-muted shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-surface-border p-4 space-y-4">
          <p className="text-sm text-content-secondary leading-relaxed">{description}</p>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const METHODS = [
  { value: 'orange-money', label: 'Orange Money',  flow: 'redirect', note: 'QR code + lien app Orange Money / Maxit' },
  { value: 'wave',         label: 'Wave',           flow: 'redirect', note: 'Page de paiement Wave' },
  { value: 'free-money',   label: 'Free Money',     flow: 'pending',  note: 'Code USSD reçu par SMS, à valider sur le téléphone' },
  { value: 'expresso',     label: 'Expresso',       flow: 'pending',  note: 'Validation sur le téléphone' },
  { value: 'djamo',        label: 'Djamo',          flow: 'redirect', note: 'Page de paiement Djamo' },
] as const;

export default function PaydunyaDocsPage() {
  const [settings, setSettings] = useState<PaydunyaSettingsAdmin | null>(null);
  const [loading, setLoading]   = useState(true);
  const [origin, setOrigin]     = useState('https://votre-domaine.tld');

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
    getPaydunyaSettingsAdmin().then(setSettings).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const apiKey = settings?.proxy_api_key || 'AUCUNE_CLE_CONFIGUREE';
  const hasKey = !!settings?.proxy_api_key;

  const initiateBody = {
    method: 'wave',
    amount: 5000,
    description: 'Paiement commande #123',
    customer_name: 'Fatou Diop',
    customer_email: 'fatou@example.com',
    customer_phone: '771234567',
    external_reference: 'votre-id-interne-123',
    return_url: 'https://votre-app.tld/merci',
    cancel_url: 'https://votre-app.tld/annule',
  };

  const initiateCurl = [
    `curl -X POST "${origin}/api/payments/paydunya/initiate" \\`,
    `  -H "X-API-Key: ${apiKey}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${JSON.stringify(initiateBody, null, 2)}'`,
  ].join('\n');

  const initiateResponse = {
    data: {
      transaction_id: 'uuid',
      invoice_token: 'test_xxxxxxxx',
      status: 'pending',
      flow: 'redirect',
      redirect_url: 'https://paydunya.com/sandbox-checkout/invoice/test_xxxxxxxx',
      om_url: null,
      maxit_url: null,
      message: 'Rediriger vers cette URL pour compléter le paiement',
    },
  };

  const statusCurl = [
    `curl "${origin}/api/payments/paydunya/status/test_xxxxxxxx" \\`,
    `  -H "X-API-Key: ${apiKey}"`,
  ].join('\n');

  const statusResponse = {
    data: {
      id: 'uuid',
      external_reference: 'votre-id-interne-123',
      invoice_token: 'test_xxxxxxxx',
      provider: 'wave-senegal',
      amount: 5000,
      currency: 'XOF',
      status: 'completed',
      customer_name: 'Fatou Diop',
      created_at: '2026-08-20T10:00:00Z',
      updated_at: '2026-08-20T10:03:00Z',
    },
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase flex items-center gap-3">
          <KeyRound className="w-6 h-6 text-content-brand" /> Documentation API PayDunya
        </h1>
        <p className="text-content-muted text-sm mt-1">
          Endpoints réutilisables par vos autres applications pour initier des paiements Orange Money, Wave, Free Money, Expresso et Djamo via PayDunya.
        </p>
      </div>

      {/* Statut config */}
      {!loading && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          hasKey ? 'border-status-success/50 bg-badge-success' : 'border-status-error/50 bg-badge-error'
        }`}>
          <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${hasKey ? 'text-status-success' : 'text-status-error'}`} />
          <div>
            <p className="text-sm font-semibold text-content-primary">
              {hasKey ? `Proxy configuré — mode ${settings?.mode === 'live' ? 'PRODUCTION' : 'TEST'}` : 'Aucune clé proxy configurée'}
            </p>
            <p className="text-xs text-content-secondary mt-0.5">
              {hasKey
                ? "Les clés et le mode se gèrent dans Paramètres → PayDunya."
                : "Générez une clé dans Paramètres → PayDunya avant d'intégrer ces endpoints."}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-status-warning/50 bg-badge-warning p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-content-primary">Pré-requis PayDunya : compte vérifié KYC</p>
          <p className="text-xs text-content-secondary mt-0.5">
            PayDunya bloque tout appel SOFTPAY (donc <InlineCode>/initiate</InlineCode>) tant que le compte business n'est pas
            vérifié KYC — même en mode test. Sans KYC, l'appel renvoie <InlineCode>"Vous devez valider vos informations de KYC..."</InlineCode>.
            En attendant, ELM utilise la page de paiement hébergée PayDunya (pas de SOFTPAY) pour <InlineCode>/subscribe</InlineCode> et <InlineCode>/billing</InlineCode> — un contournement possible pour vos autres apps aussi si besoin.
          </p>
        </div>
      </div>

      {/* Authentification */}
      <div className="card p-6 space-y-3">
        <h2 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-content-brand" /> Authentification
        </h2>
        <p className="text-sm text-content-secondary">
          Chaque requête vers <InlineCode>/api/payments/paydunya/*</InlineCode> doit porter le header <InlineCode>X-API-Key</InlineCode> avec
          la clé proxy générée dans Paramètres → PayDunya. Cette clé est indépendante des clés PayDunya elles-mêmes, qui ne quittent jamais le serveur.
        </p>
        <div className="flex items-center gap-2 bg-surface-input rounded-lg px-3 py-2">
          <code className="text-xs font-mono text-content-primary flex-1 truncate">X-API-Key: {apiKey}</code>
          <CopyButton text={apiKey} />
        </div>
        <p className="text-xs text-content-muted">Base URL : <InlineCode>{origin}</InlineCode></p>
      </div>

      {/* Méthodes supportées */}
      <div className="card p-6 space-y-3">
        <h2 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-content-brand" /> Moyens de paiement
        </h2>
        <div className="rounded-lg border border-surface-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-input text-content-secondary text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">"method"</th>
                <th className="text-left px-3 py-2">Flow</th>
                <th className="text-left px-3 py-2">Comportement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {METHODS.map((m) => (
                <tr key={m.value}>
                  <td className="px-3 py-2 font-mono text-brand-600 text-xs">{m.value}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${m.flow === 'redirect' ? 'bg-badge-info text-status-info' : 'bg-badge-warning text-status-warning'}`}>
                      {m.flow}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-content-muted text-xs">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-content-muted">
          <InlineCode>flow: "redirect"</InlineCode> → ouvrez/redirigez vers <InlineCode>redirect_url</InlineCode>.{' '}
          <InlineCode>flow: "pending"</InlineCode> → aucune URL, le client valide directement sur son téléphone ; sondez le statut via <InlineCode>/status</InlineCode>.
        </p>
      </div>

      {/* Endpoints */}
      <div className="space-y-3">
        <h2 className="text-sm font-black text-content-primary uppercase tracking-widest">Endpoints</h2>

        <EndpointCard method="POST" path="/api/payments/paydunya/initiate" description="Crée une facture PayDunya et déclenche le paiement pour le moyen choisi." defaultOpen>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">Champs du body</p>
            <div className="rounded-lg border border-surface-border overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-surface-border">
                  {[
                    ['method', 'orange-money | wave | free-money | expresso | djamo'],
                    ['amount', 'Montant en XOF (nombre positif)'],
                    ['description', "Libellé affiché sur la facture"],
                    ['customer_name / customer_email / customer_phone', 'Coordonnées du payeur'],
                    ['external_reference', "(optionnel) Votre propre id, renvoyé tel quel dans /status"],
                    ['return_url / cancel_url', "(optionnel) Redirections après paiement / annulation"],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="px-3 py-2 font-mono text-brand-600 text-xs whitespace-nowrap w-56">{k}</td>
                      <td className="px-3 py-2 text-content-muted text-xs">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">cURL</p>
            <CodeBlock code={initiateCurl} lang="bash" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">Réponse</p>
            <CodeBlock code={JSON.stringify(initiateResponse, null, 2)} lang="json" />
          </div>
        </EndpointCard>

        <EndpointCard method="GET" path="/api/payments/paydunya/status/:invoice_token" description="Statut d'un paiement. Lit notre base par défaut (rapide) ; ajoutez ?live=1 pour forcer une vérification directe auprès de PayDunya si le webhook n'est pas encore arrivé.">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">cURL</p>
            <CodeBlock code={statusCurl} lang="bash" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">Réponse</p>
            <CodeBlock code={JSON.stringify(statusResponse, null, 2)} lang="json" />
          </div>
          <p className="text-xs text-content-muted">
            <InlineCode>status</InlineCode> : <InlineCode>pending</InlineCode> · <InlineCode>completed</InlineCode> · <InlineCode>failed</InlineCode> · <InlineCode>cancelled</InlineCode>
          </p>
        </EndpointCard>

        <div className="rounded-xl border border-surface-border overflow-hidden opacity-80">
          <div className="w-full flex items-center gap-3 px-4 py-3">
            <span className="shrink-0 px-2 py-0.5 rounded border text-[11px] font-bold font-mono min-w-[52px] text-center bg-green-500/10 text-green-700 border-green-500/30">POST</span>
            <code className="flex-1 text-sm text-content-primary font-mono">/api/payments/paydunya/webhook</code>
            <Webhook className="w-3.5 h-3.5 text-content-muted shrink-0" />
          </div>
          <div className="border-t border-surface-border p-4">
            <p className="text-sm text-content-secondary leading-relaxed">
              Récepteur IPN interne — <strong>vous n'appelez jamais cette route vous-même</strong>. Elle est automatiquement passée comme
              <InlineCode> callback_url</InlineCode> de chaque facture créée par <InlineCode>/initiate</InlineCode>, et PayDunya l'appelle
              de son côté pour confirmer le paiement. Le statut est ensuite disponible via <InlineCode>/status</InlineCode>.
            </p>
          </div>
        </div>
      </div>

      {/* Polling recommandé */}
      <div className="card p-6 space-y-3">
        <h2 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
          <Search className="w-4 h-4 text-content-brand" /> Confirmer un paiement côté client
        </h2>
        <p className="text-sm text-content-secondary leading-relaxed">
          Après <InlineCode>/initiate</InlineCode>, redirigez l'utilisateur (flow <InlineCode>redirect</InlineCode>) ou affichez un écran d'attente
          (flow <InlineCode>pending</InlineCode>), puis sondez <InlineCode>GET /status/:invoice_token</InlineCode> toutes les 2-3 secondes jusqu'à
          obtenir <InlineCode>completed</InlineCode>, <InlineCode>failed</InlineCode> ou <InlineCode>cancelled</InlineCode> — le webhook met généralement
          à jour le statut avant même que l'utilisateur ne revienne sur votre page.
        </p>
      </div>

      {/* Erreurs */}
      <div className="card p-6 space-y-3">
        <h2 className="text-sm font-black text-content-primary uppercase tracking-widest">Codes d'erreur</h2>
        <div className="rounded-lg border border-surface-border overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-surface-border">
              {[
                ['400', "Champ requis manquant ou invalide (method, amount, customer_*...)"],
                ['401', 'X-API-Key manquante ou invalide'],
                ['402', "Paiement refusé par PayDunya (ex : KYC non validé, solde insuffisant)"],
                ['404', 'Transaction introuvable (status)'],
                ['409', 'Facture déjà payée'],
                ['503', "PayDunya n'est pas configuré (clés manquantes dans Paramètres → PayDunya)"],
                ['500 / 502', "Erreur interne ou PayDunya injoignable"],
              ].map(([code, desc]) => (
                <tr key={code}>
                  <td className="px-3 py-2 font-mono text-brand-600 text-xs whitespace-nowrap w-20">{code}</td>
                  <td className="px-3 py-2 text-content-muted text-xs">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
