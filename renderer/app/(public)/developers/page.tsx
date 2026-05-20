'use client';

import { useState } from 'react';
import type { ComponentType } from 'react';
import Image from 'next/image';
import {
  KeyRound, Shield, Zap, ChevronDown, ChevronRight,
  Copy, Check, BookOpen, AlertTriangle, Globe,
  Package, ShoppingCart, Users, Wrench, Building2, UtensilsCrossed,
  Store, GraduationCap, BarChart3, AlertCircle, type LucideProps,
} from 'lucide-react';

// ─── Data ─────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.elm-app.click';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Endpoint {
  method:      Method;
  path:        string;
  scope:       string;
  description: string;
  query?:      { name: string; description: string }[];
  body?:       object;
  response:    object;
}

interface Section {
  id:        string;
  title:     string;
  icon:      ComponentType<LucideProps>;
  endpoints: Endpoint[];
}

const SECTIONS: Section[] = [
  {
    id: 'products', title: 'Produits', icon: Package,
    endpoints: [
      {
        method: 'GET', path: '/api/v1/products', scope: 'read:products',
        description: "Liste tous les produits actifs du business.",
        query: [
          { name: 'page',        description: 'Page (défaut : 1)' },
          { name: 'limit',       description: 'Résultats par page, max 100 (défaut : 50)' },
          { name: 'search',      description: 'Recherche par nom' },
          { name: 'category_id', description: 'Filtrer par catégorie' },
          { name: 'in_stock',    description: 'true pour afficher uniquement les produits en stock' },
        ],
        response: { data: [{ id: 'uuid', name: 'Café Touba', price: 500, stock: 120, category: { id: 'uuid', name: 'Boissons' } }], total: 1, page: 1, limit: 50 },
      },
      {
        method: 'GET', path: '/api/v1/products/:id', scope: 'read:products',
        description: "Détail d'un produit.",
        response: { data: { id: 'uuid', name: 'Café Touba', price: 500, stock: 120 } },
      },
      {
        method: 'PATCH', path: '/api/v1/products/:id/stock', scope: 'write:products',
        description: "Mise à jour du stock. Fournir stock (valeur absolue) ou delta (variation relative).",
        body: { stock: 150 },
        response: { data: { id: 'uuid', name: 'Café Touba', stock: 150 } },
      },
    ],
  },
  {
    id: 'orders', title: 'Commandes', icon: ShoppingCart,
    endpoints: [
      {
        method: 'GET', path: '/api/v1/orders', scope: 'read:orders',
        description: "Liste les commandes.",
        query: [
          { name: 'page',   description: 'Page (défaut : 1)' },
          { name: 'limit',  description: 'Max 100 (défaut : 50)' },
          { name: 'status', description: 'paid | pending | cancelled' },
          { name: 'from',   description: 'Date de début ISO (ex : 2024-01-01T00:00:00Z)' },
          { name: 'to',     description: 'Date de fin ISO' },
        ],
        response: { data: [{ id: 'uuid', order_number: 42, total: 5000, status: 'paid', created_at: '2024-01-15T10:30:00Z' }], total: 1, page: 1, limit: 50 },
      },
      {
        method: 'GET', path: '/api/v1/orders/:id', scope: 'read:orders',
        description: "Détail d'une commande avec ses articles et paiements.",
        response: { data: { id: 'uuid', total: 5000, status: 'paid', items: [], payments: [] } },
      },
      {
        method: 'POST', path: '/api/v1/orders', scope: 'write:orders',
        description: "Crée une nouvelle commande. Le prix des articles est résolu depuis le catalogue si omis.",
        body: { customer_name: 'Fatou Diop', customer_phone: '+221771234567', items: [{ product_id: 'uuid', quantity: 2 }], payment_method: 'cash', source: 'woocommerce' },
        response: { data: { id: 'uuid', total: 1000, status: 'paid' } },
      },
    ],
  },
  {
    id: 'clients', title: 'Clients', icon: Users,
    endpoints: [
      {
        method: 'GET', path: '/api/v1/clients', scope: 'read:clients',
        description: "Liste les clients.",
        query: [
          { name: 'search', description: 'Recherche nom, téléphone ou email' },
          { name: 'page',   description: 'Page (défaut : 1)' },
          { name: 'limit',  description: 'Max 100 (défaut : 50)' },
        ],
        response: { data: [{ id: 'uuid', name: 'Fatou Diop', phone: '+221771234567', email: null }], total: 1, page: 1, limit: 50 },
      },
      {
        method: 'POST', path: '/api/v1/clients', scope: 'write:clients',
        description: "Crée ou met à jour un client (upsert par téléphone).",
        body: { name: 'Fatou Diop', phone: '+221771234567', email: 'fatou@example.com', address: 'Dakar' },
        response: { data: { id: 'uuid', name: 'Fatou Diop', phone: '+221771234567' } },
      },
    ],
  },
  {
    id: 'service-orders', title: 'Ordres de travail', icon: Wrench,
    endpoints: [
      {
        method: 'GET', path: '/api/v1/service-orders', scope: 'read:services',
        description: "Liste les ordres de travail.",
        query: [
          { name: 'status',      description: 'attente | en_cours | pause | termine | paye | annule' },
          { name: 'assigned_to', description: 'UUID du technicien assigné' },
          { name: 'search',      description: 'Recherche client ou référence sujet' },
          { name: 'from',        description: 'Date de début ISO' },
          { name: 'to',          description: 'Date de fin ISO' },
        ],
        response: { data: [{ id: 'uuid', order_number: 12, client_name: 'Modou Fall', status: 'en_cours', total: 25000, paid_amount: 0 }], total: 1, page: 1, limit: 50 },
      },
      {
        method: 'POST', path: '/api/v1/service-orders', scope: 'write:services',
        description: "Crée un ordre de travail avec ses articles.",
        body: { client_name: 'Modou Fall', client_phone: '+221771234567', subject_ref: 'DK-4521-AB', subject_type: 'vehicule', subject_info: 'Toyota Corolla noire', items: [{ name: 'Vidange moteur', price: 15000, quantity: 1 }, { name: 'Filtre huile', price: 5000, quantity: 2 }] },
        response: { data: { id: 'uuid', order_number: 13, status: 'attente', total: 25000 } },
      },
      {
        method: 'GET', path: '/api/v1/service-orders/:id', scope: 'read:services',
        description: "Détail d'un ordre de travail avec articles et paiements.",
        response: { data: { id: 'uuid', status: 'en_cours', items: [], payments: [] } },
      },
      {
        method: 'PATCH', path: '/api/v1/service-orders/:id', scope: 'write:services',
        description: "Met à jour le statut ou les informations. Les timestamps (started_at, finished_at, paid_at) sont gérés automatiquement selon le statut.",
        body: { status: 'termine' },
        response: { data: { id: 'uuid', status: 'termine', finished_at: '2024-01-15T14:00:00Z' } },
      },
    ],
  },
  {
    id: 'hotel', title: 'Hôtel', icon: Building2,
    endpoints: [
      {
        method: 'GET', path: '/api/v1/hotel/rooms', scope: 'read:hotel',
        description: "Liste les chambres.",
        query: [
          { name: 'status', description: 'available | occupied | cleaning | maintenance' },
          { name: 'type',   description: 'simple | double | twin | suite | familiale' },
        ],
        response: { data: [{ id: 'uuid', number: '101', type: 'double', status: 'available', price_per_night: 45000 }], total: 1 },
      },
      {
        method: 'POST', path: '/api/v1/hotel/rooms', scope: 'write:hotel',
        description: "Crée une chambre.",
        body: { number: '102', type: 'suite', price_per_night: 85000, capacity: 2, amenities: ['wifi', 'clim', 'minibar'] },
        response: { data: { id: 'uuid', number: '102', type: 'suite', status: 'available' } },
      },
      {
        method: 'GET', path: '/api/v1/hotel/guests', scope: 'read:hotel',
        description: "Liste les clients hôtel.",
        query: [{ name: 'search', description: 'Recherche nom, téléphone ou email' }],
        response: { data: [{ id: 'uuid', full_name: 'Aminata Sow', phone: '+221771234567', nationality: 'SN' }], total: 1, page: 1, limit: 50 },
      },
      {
        method: 'POST', path: '/api/v1/hotel/guests', scope: 'write:hotel',
        description: "Crée un client hôtel.",
        body: { full_name: 'Aminata Sow', phone: '+221771234567', nationality: 'SN', id_type: 'passport', id_number: 'A1234567' },
        response: { data: { id: 'uuid', full_name: 'Aminata Sow' } },
      },
      {
        method: 'GET', path: '/api/v1/hotel/reservations', scope: 'read:hotel',
        description: "Liste les réservations.",
        query: [
          { name: 'status',  description: 'confirmed | checked_in | checked_out | cancelled | no_show' },
          { name: 'room_id', description: 'Filtrer par chambre' },
          { name: 'from',    description: 'Date check-in >= (ISO)' },
          { name: 'to',      description: 'Date check-out <= (ISO)' },
        ],
        response: { data: [{ id: 'uuid', status: 'confirmed', check_in: '2024-02-01', check_out: '2024-02-03', total: 90000 }], total: 1, page: 1, limit: 50 },
      },
      {
        method: 'POST', path: '/api/v1/hotel/reservations', scope: 'write:hotel',
        description: "Crée une réservation. Vérifie que la chambre est disponible. Calcule le total automatiquement.",
        body: { room_id: 'uuid', guest_id: 'uuid', check_in: '2024-02-01', check_out: '2024-02-03', num_guests: 2, source: 'booking.com' },
        response: { data: { id: 'uuid', status: 'confirmed', total: 90000, room: { number: '101' }, guest: { full_name: 'Aminata Sow' } } },
      },
      {
        method: 'PATCH', path: '/api/v1/hotel/reservations/:id', scope: 'write:hotel',
        description: "Modifie le statut ou le montant payé. Champs autorisés : status, paid_amount, actual_check_in, actual_check_out, notes, num_guests.",
        body: { status: 'checked_in', paid_amount: 90000 },
        response: { data: { id: 'uuid', status: 'checked_in', paid_amount: 90000 } },
      },
    ],
  },
  {
    id: 'restaurant', title: 'Restaurant', icon: UtensilsCrossed,
    endpoints: [
      {
        method: 'GET', path: '/api/v1/restaurant/floors', scope: 'read:restaurant',
        description: "Liste les salles avec les tables imbriquées.",
        response: { data: [{ id: 'uuid', name: 'Terrasse', tables: [{ id: 'uuid', name: 'T1', capacity: 4, status: 'available' }] }], total: 1 },
      },
      {
        method: 'GET', path: '/api/v1/restaurant/tables', scope: 'read:restaurant',
        description: "Liste les tables.",
        query: [
          { name: 'floor_id', description: 'Filtrer par salle' },
          { name: 'status',   description: 'available | occupied | reserved | cleaning' },
        ],
        response: { data: [{ id: 'uuid', name: 'T1', capacity: 4, status: 'available', floor: { name: 'Terrasse' } }], total: 1 },
      },
      {
        method: 'PATCH', path: '/api/v1/restaurant/tables', scope: 'write:restaurant',
        description: "Met à jour le statut d'une table.",
        body: { table_id: 'uuid', status: 'occupied', current_order_id: 'uuid' },
        response: { data: { id: 'uuid', name: 'T1', status: 'occupied' } },
      },
    ],
  },
  {
    id: 'resellers', title: 'Revendeurs', icon: Store,
    endpoints: [
      {
        method: 'GET', path: '/api/v1/resellers', scope: 'read:resellers',
        description: "Liste les revendeurs.",
        query: [
          { name: 'search', description: 'Recherche nom ou téléphone' },
          { name: 'zone',   description: 'Filtrer par zone géographique' },
          { name: 'type',   description: 'gros | demi_gros | detaillant' },
          { name: 'active', description: 'true | false' },
        ],
        response: { data: [{ id: 'uuid', name: 'Diallo Distribution', type: 'gros', zone: 'Médina', is_active: true }], total: 1, page: 1, limit: 50 },
      },
      {
        method: 'POST', path: '/api/v1/resellers', scope: 'write:resellers',
        description: "Crée un revendeur.",
        body: { name: 'Diallo Distribution', phone: '+221771234567', type: 'gros', zone: 'Médina', address: 'Marché Sandaga' },
        response: { data: { id: 'uuid', name: 'Diallo Distribution', type: 'gros' } },
      },
      {
        method: 'PATCH', path: '/api/v1/resellers/:id', scope: 'write:resellers',
        description: "Met à jour un revendeur.",
        body: { zone: 'Plateau', is_active: false },
        response: { data: { id: 'uuid', name: 'Diallo Distribution', zone: 'Plateau', is_active: false } },
      },
      {
        method: 'DELETE', path: '/api/v1/resellers/:id', scope: 'write:resellers',
        description: "Supprime un revendeur et tous ses clients.",
        response: {},
      },
      {
        method: 'GET', path: '/api/v1/resellers/:id/clients', scope: 'read:resellers',
        description: "Liste les clients d'un revendeur.",
        response: { data: [{ id: 'uuid', name: 'Super Ndiaye', phone: '+221770001234' }], total: 1, page: 1, limit: 50 },
      },
      {
        method: 'POST', path: '/api/v1/resellers/:id/clients', scope: 'write:resellers',
        description: "Ajoute un client à un revendeur.",
        body: { name: 'Super Ndiaye', phone: '+221770001234', address: 'HLM Grand-Yoff' },
        response: { data: { id: 'uuid', name: 'Super Ndiaye' } },
      },
    ],
  },
  {
    id: 'students', title: 'Élèves', icon: GraduationCap,
    endpoints: [
      {
        method: 'GET', path: '/api/v1/students', scope: 'read:students',
        description: "Liste les élèves.",
        query: [
          { name: 'classroom_id', description: 'Filtrer par classe' },
          { name: 'status',       description: 'active | inactive | transferred' },
        ],
        response: { data: [{ id: 'uuid', first_name: 'Ibrahima', last_name: 'Diallo', classroom: { name: 'CM2-A' } }], total: 1, page: 1, limit: 50 },
      },
      {
        method: 'POST', path: '/api/v1/students', scope: 'write:students',
        description: "Inscrit un élève.",
        body: { first_name: 'Ibrahima', last_name: 'Diallo', classroom_id: 'uuid', parent_phone: '+221771234567', gender: 'M', birth_date: '2015-03-12' },
        response: { data: { id: 'uuid', first_name: 'Ibrahima', last_name: 'Diallo' } },
      },
      {
        method: 'GET', path: '/api/v1/students/:id', scope: 'read:students',
        description: "Détail d'un élève avec sa classe.",
        response: { data: { id: 'uuid', first_name: 'Ibrahima', last_name: 'Diallo', classroom: { id: 'uuid', name: 'CM2-A' } } },
      },
    ],
  },
  {
    id: 'analytics', title: 'Analytiques', icon: BarChart3,
    endpoints: [
      {
        method: 'GET', path: '/api/v1/analytics', scope: 'read:analytics',
        description: "Résumé des ventes pour une période donnée. Par défaut : mois en cours.",
        query: [
          { name: 'from', description: 'Date de début ISO (défaut : 1er du mois courant)' },
          { name: 'to',   description: 'Date de fin ISO (défaut : maintenant)' },
        ],
        response: { data: { revenue: 1250000, orders_count: 87, avg_basket: 14367, top_products: [{ product_id: 'uuid', name: 'Café Touba', revenue: 320000, count: 64 }], from: '2024-01-01T00:00:00Z', to: '2024-01-31T23:59:59Z' } },
      },
    ],
  },
];

const ERROR_CODES = [
  { code: 400, label: 'Bad Request',       description: "Corps JSON invalide ou paramètre manquant." },
  { code: 401, label: 'Unauthorized',      description: "Clé API manquante, invalide ou révoquée." },
  { code: 402, label: 'Payment Required',  description: "Abonnement expiré ou inexistant." },
  { code: 403, label: 'Forbidden',         description: "La clé ne possède pas le scope requis." },
  { code: 404, label: 'Not Found',         description: "Ressource introuvable ou n'appartient pas au business." },
  { code: 409, label: 'Conflict',          description: "Conflit d'état (ex : chambre déjà occupée)." },
  { code: 422, label: 'Unprocessable',     description: "Valeur invalide (ex : stock négatif, statut inconnu)." },
  { code: 429, label: 'Too Many Requests', description: "Limite de 120 requêtes/minute dépassée." },
  { code: 502, label: 'Bad Gateway',       description: "Erreur Supabase temporaire." },
];

// ─── Components ───────────────────────────────────────────────────────────────

const METHOD_STYLE: Record<Method, string> = {
  GET:    'bg-sky-500/10 text-sky-700 border-sky-500/30',
  POST:   'bg-green-500/10 text-green-700 border-green-500/30',
  PATCH:  'bg-amber-500/10 text-amber-700 border-amber-500/30',
  DELETE: 'bg-red-500/10 text-red-600 border-red-500/30',
};

function CopyButton({ text, size = 'sm' }: { text: string; size?: 'sm' | 'xs' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const cls = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  return (
    <button
      onClick={copy}
      title="Copier"
      className="p-1.5 rounded text-content-muted hover:text-content-secondary hover:bg-black/5 transition-colors"
    >
      {copied ? <Check className={cls + ' text-status-success'} /> : <Copy className={cls} />}
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
            onClick={async () => {
              try { await navigator.clipboard.writeText(code); }
              catch {
                const ta = document.createElement('textarea');
                ta.value = code; ta.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta);
              }
            }}
            className="p-1.5 rounded transition-colors"
            style={{ color: '#475569' }}
            title="Copier"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
      )}
      {!lang && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <CopyButton text={code} size="xs" />
        </div>
      )}
      <pre className="px-4 py-3 text-sm font-mono overflow-x-auto leading-relaxed" style={{ background: '#0f172a', color: '#94a3b8', whiteSpace: 'pre', wordBreak: 'normal', overflowWrap: 'normal' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-brand-600 bg-surface-input px-1.5 py-0.5 rounded text-[13px] font-mono">
      {children}
    </code>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);

  const curlLines = [
    `curl -X ${ep.method} \\`,
    `  "${BASE_URL}${ep.path.replace(':id', '<id>')}" \\`,
    `  -H "X-API-Key: elm_live_votre_cle_ici"${ep.body ? ' \\' : ''}`,
    ...(ep.body ? [
      `  -H "Content-Type: application/json" \\`,
      `  -d '${JSON.stringify(ep.body, null, 2)}'`,
    ] : []),
  ];
  const curlExample = curlLines.join('\n');

  const jsLines = [
    `const res = await fetch("${BASE_URL}${ep.path.replace(':id', '<id>')}", {`,
    `  method: "${ep.method}",`,
    `  headers: {`,
    `    "X-API-Key": "elm_live_votre_cle_ici",`,
    ...(ep.body ? [`    "Content-Type": "application/json",`] : []),
    `  },`,
    ...(ep.body ? [`  body: JSON.stringify(${JSON.stringify(ep.body, null, 2)}),`] : []),
    `});`,
    `const { data } = await res.json();`,
  ];
  const jsExample = jsLines.join('\n');

  return (
    <div className="rounded-xl border border-surface-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
      >
        <span className={`shrink-0 px-2 py-0.5 rounded border text-[11px] font-bold font-mono min-w-[52px] text-center ${METHOD_STYLE[ep.method]}`}>
          {ep.method}
        </span>
        <code className="flex-1 text-sm text-content-primary font-mono">{ep.path}</code>
        <span className="text-[10px] text-content-muted font-mono hidden sm:block shrink-0">{ep.scope}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-content-muted shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-content-muted shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-surface-border p-4 space-y-5">
          <p className="text-sm text-content-secondary leading-relaxed">{ep.description}</p>

          {ep.query && ep.query.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">Paramètres de requête</p>
              <div className="rounded-lg border border-surface-border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {ep.query.map((q, i) => (
                      <tr key={q.name} className={i < (ep.query?.length ?? 0) - 1 ? 'border-b border-surface-border' : ''}>
                        <td className="px-3 py-2 font-mono text-brand-600 text-xs whitespace-nowrap w-36">{q.name}</td>
                        <td className="px-3 py-2 text-content-muted text-xs">{q.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">cURL</p>
              <CodeBlock code={curlExample} lang="bash" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">JavaScript</p>
              <CodeBlock code={jsExample} lang="js" />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">Réponse</p>
            <CodeBlock code={JSON.stringify(ep.response, null, 2)} lang="json" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const NAV_GUIDES = [
  { id: 'overview', label: "Vue d'ensemble", icon: BookOpen },
  { id: 'auth',     label: 'Authentification', icon: KeyRound },
  { id: 'errors',   label: "Codes d'erreur",   icon: AlertCircle },
];

export default function DevelopersPage() {
  const [activeSection, setActiveSection] = useState('');

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div data-theme="light" className="min-h-screen bg-surface text-content-primary">

      {/* Header */}
      <header className="border-b border-surface-border bg-surface-card">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="ELM" width={32} height={32} className="rounded-lg" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-content-primary">ELM</span>
                <span className="text-content-muted font-normal">API Reference</span>
              </div>
              <p className="text-xs text-content-muted">REST · v1 · Intégration e-commerce, ERP, outils internes</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-content-muted border border-surface-border rounded-md px-2.5 py-1">
              <Zap className="w-3 h-3" />
              120 req / min
            </div>
            <span className="text-xs font-mono font-semibold text-brand-600 border border-brand-500/30 rounded-md px-2.5 py-1">
              v1.0
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 flex gap-10">

        {/* Sidebar */}
        <aside className="hidden lg:block w-48 shrink-0 sticky top-8 self-start">
          <nav className="space-y-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-1.5 px-2">Guides</p>
              <div className="space-y-0.5">
                {NAV_GUIDES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-left transition-colors ${
                      activeSection === id
                        ? 'bg-brand-500/10 text-brand-600'
                        : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-1.5 px-2">Référence</p>
              <div className="space-y-0.5">
                {SECTIONS.map(({ id, title, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-left transition-colors ${
                      activeSection === id
                        ? 'bg-brand-500/10 text-brand-900'
                        : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {title}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 space-y-16">

          {/* Overview */}
          <section id="overview">
            <h2 className="text-xl font-bold text-content-primary mb-6 flex items-center gap-2.5">
              <BookOpen className="w-5 h-5 text-brand-600" />
              Vue d&apos;ensemble
            </h2>

            <div className="grid sm:grid-cols-3 gap-3 mb-8">
              {[
                { icon: Globe, label: 'Base URL',         value: BASE_URL },
                { icon: KeyRound, label: 'Auth',          value: 'X-API-Key header' },
                { icon: Shield, label: 'Stockage des clés', value: 'SHA-256 hash' },
              ].map(card => (
                <div key={card.label} className="p-4 rounded-xl border border-surface-border bg-surface-card">
                  <div className="flex items-center gap-2 mb-2">
                    <card.icon className="w-3.5 h-3.5 text-content-muted" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-content-muted">{card.label}</span>
                  </div>
                  <p className="text-sm font-mono text-content-primary break-all">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4 text-sm text-content-secondary leading-relaxed">
              <p>
                L&apos;API ELM permet à des systèmes externes - boutiques en ligne, logiciels de comptabilité,
                ERP, outils internes - de lire et d&apos;écrire des données dans votre business de manière sécurisée.
              </p>
              <p>
                Chaque clé est liée à un seul business et porte des <strong className="text-content-primary">scopes</strong> précis.
                Une intégration e-commerce ne voit que les produits et commandes.
                L&apos;accès est automatiquement bloqué si l&apos;abonnement ELM expire.
              </p>
              <div className="p-4 rounded-xl border border-surface-border bg-surface-card">
                <p className="text-xs font-bold uppercase tracking-widest text-content-muted mb-2">Format des réponses</p>
                <p className="text-content-secondary">
                  Listes : <InlineCode>data</InlineCode>, <InlineCode>total</InlineCode>, <InlineCode>page</InlineCode>, <InlineCode>limit</InlineCode>.
                  {' '}Ressource unique : <InlineCode>data</InlineCode>.
                  {' '}Erreurs : <InlineCode>error</InlineCode> (string).
                </p>
              </div>
            </div>
          </section>

          {/* Auth */}
          <section id="auth">
            <h2 className="text-xl font-bold text-content-primary mb-6 flex items-center gap-2.5">
              <KeyRound className="w-5 h-5 text-brand-600" />
              Authentification
            </h2>

            <div className="space-y-6 text-sm text-content-secondary">
              <p>
                Toutes les requêtes doivent inclure l&apos;en-tête <InlineCode>X-API-Key</InlineCode>.
                Les clés suivent le format <InlineCode>elm_live_</InlineCode> suivi de 48 caractères hexadécimaux.
              </p>

              <CodeBlock lang="bash" code={`curl "${BASE_URL}/api/v1/products" \\
  -H "X-API-Key: elm_live_a1b2c3d4e5f6..."`} />

              <div className="p-4 rounded-xl border border-surface-border bg-surface-card flex gap-3">
                <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-content-primary font-semibold mb-1 text-sm">Sécurité</p>
                  <p className="text-content-secondary text-sm">
                    Les clés sont stockées sous forme de hash SHA-256 - la valeur brute n&apos;est affichée
                    qu&apos;une seule fois à la création. Stockez-la dans vos variables d&apos;environnement,
                    jamais dans le code source.
                  </p>
                </div>
              </div>

              <div>
                <p className="font-semibold text-content-primary mb-3">Obtenir une clé API</p>
                <ol className="space-y-2 text-content-muted list-decimal list-inside">
                  <li>Connectez-vous à ELM en tant que propriétaire.</li>
                  <li>Allez dans <strong className="text-content-secondary">Paramètres → Intégrations API</strong>.</li>
                  <li>Cliquez <strong className="text-content-secondary">Nouvelle clé API</strong>, choisissez un nom et les permissions requises.</li>
                  <li>Copiez immédiatement la clé affichée - elle ne sera plus visible.</li>
                </ol>
              </div>

              <div>
                <p className="font-semibold text-content-primary mb-3">Scopes disponibles</p>
                <div className="rounded-xl border border-surface-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-border bg-surface-card">
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-content-muted">Scope</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-content-muted">Accès accordé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['read:products',    'Lire les produits et le stock'],
                        ['write:products',   'Modifier le stock'],
                        ['read:orders',      'Lire les commandes'],
                        ['write:orders',     'Créer des commandes'],
                        ['read:clients',     'Lire les clients'],
                        ['write:clients',    'Créer / mettre à jour les clients'],
                        ['read:services',    'Lire les ordres de travail'],
                        ['write:services',   'Créer / modifier les OT'],
                        ['read:hotel',       'Chambres, réservations, clients hôtel'],
                        ['write:hotel',      'Créer réservations et clients hôtel'],
                        ['read:restaurant',  'Tables et salles'],
                        ['write:restaurant', 'Modifier le statut des tables'],
                        ['read:resellers',   'Lire les revendeurs et leurs clients'],
                        ['write:resellers',  'Créer / modifier les revendeurs'],
                        ['read:students',    'Lire les élèves et les classes'],
                        ['write:students',   'Inscrire des élèves'],
                        ['read:analytics',   'Accéder aux statistiques de vente'],
                      ].map(([scope, desc], i, arr) => (
                        <tr key={scope} className={i < arr.length - 1 ? 'border-b border-surface-border' : ''}>
                          <td className="px-4 py-2 font-mono text-brand-600 text-xs whitespace-nowrap">{scope}</td>
                          <td className="px-4 py-2 text-content-muted text-xs">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* Error codes */}
          <section id="errors">
            <h2 className="text-xl font-bold text-content-primary mb-6 flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-brand-600" />
              Codes d&apos;erreur
            </h2>

            <div className="rounded-xl border border-surface-border overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-card">
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-content-muted w-16">Code</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-content-muted w-40">Statut HTTP</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-content-muted">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {ERROR_CODES.map((e, i) => (
                    <tr key={e.code} className={i < ERROR_CODES.length - 1 ? 'border-b border-surface-border' : ''}>
                      <td className="px-4 py-2.5 font-mono text-content-primary font-semibold text-sm">{e.code}</td>
                      <td className="px-4 py-2.5 font-mono text-brand-600 text-xs">{e.label}</td>
                      <td className="px-4 py-2.5 text-content-muted text-sm">{e.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-content-muted mb-2">Format d&apos;erreur</p>
              <CodeBlock lang="json" code={`{ "error": "Missing required scope: write:orders." }`} />
            </div>
          </section>

          {/* Endpoint sections */}
          {SECTIONS.map(section => {
            const Icon = section.icon;
            const scopes = [...new Set(section.endpoints.map(e => e.scope))];
            return (
              <section key={section.id} id={section.id}>
                <div className="mb-5">
                  <h2 className="text-xl font-bold text-content-primary flex items-center gap-2.5 mb-1">
                    <Icon className="w-5 h-5 text-brand-900" />
                    {section.title}
                  </h2>
                  <p className="text-xs font-mono text-content-muted pl-[30px]">
                    {scopes.join(' · ')}
                  </p>
                </div>
                <div className="space-y-2.5">
                  {section.endpoints.map(ep => (
                    <EndpointCard key={`${ep.method}${ep.path}`} ep={ep} />
                  ))}
                </div>
              </section>
            );
          })}

          <div className="border-t border-surface-border pt-8 text-center text-xs text-content-muted">
            ELM API v1 &nbsp;·&nbsp;{' '}
            <a
              href="https://wa.me/221772211126"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline"
            >
              Questions ? Contactez le support
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
