'use client';

import { useState } from 'react';
import {
  HelpCircle, ChevronDown, ShoppingCart, Package, ClipboardList,
  Truck, Tag, BarChart2, Settings, Warehouse, LayoutGrid,
  Users, Monitor, CreditCard, Search,
  AlertCircle, CheckCircle, Info, MapPin, Vault,
  Store, BedDouble, BookOpen, History,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  color: string;
  roles?: ('owner' | 'admin' | 'staff')[];
  topics: Topic[];
}

interface Topic {
  question: string;
  answer: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'productivite',
    icon: LayoutGrid,
    title: 'Productivité & Raccourcis',
    color: 'text-brand-400',
    topics: [
      {
        question: 'Comment utiliser la Palette de Commandes (Ctrl+K) ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>La palette de commandes est l&apos;outil le plus rapide pour naviguer dans l&apos;application sans utiliser la souris.</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Appuyez sur <kbd className="px-1.5 py-0.5 rounded bg-surface-input border border-surface-border text-[10px] font-bold text-white">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-surface-input border border-surface-border text-[10px] font-bold text-white">K</kbd> (ou Cmd+K sur Mac).</li>
              <li>Saisissez le nom d&apos;un module (ex: &quot;Stock&quot;, &quot;Caisse&quot;, &quot;Compta&quot;).</li>
              <li>Utilisez les flèches <kbd className="px-1.5 py-0.5 rounded bg-surface-input border border-surface-border text-[10px] font-bold text-white">↑</kbd><kbd className="px-1.5 py-0.5 rounded bg-surface-input border border-surface-border text-[10px] font-bold text-white">↓</kbd> pour choisir.</li>
              <li>Appuyez sur <kbd className="px-1.5 py-0.5 rounded bg-surface-input border border-surface-border text-[10px] font-bold text-white">Entrée</kbd> pour valider.</li>
            </ul>
          </div>
        ),
      },
      {
        question: 'Quels sont les raccourcis clavier globaux ?',
        answer: (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="p-3 bg-surface-input/50 rounded-xl border border-surface-border">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Navigation</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300">Ouvrir la palette</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-[10px] font-bold text-white whitespace-nowrap">Ctrl + K</kbd>
              </div>
            </div>
            <div className="p-3 bg-surface-input/50 rounded-xl border border-surface-border">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Affichage</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300">Changer de thème</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-[10px] font-bold text-white whitespace-nowrap">Ctrl + T</kbd>
              </div>
            </div>
            <div className="p-3 bg-surface-input/50 rounded-xl border border-surface-border">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Journal</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300">Voir l&apos;audit (Journal)</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-[10px] font-bold text-white whitespace-nowrap">Ctrl + J</kbd>
              </div>
            </div>
            <div className="p-3 bg-surface-input/50 rounded-xl border border-surface-border">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Système</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300">Paramètres</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-[10px] font-bold text-white whitespace-nowrap">Ctrl + ,</kbd>
              </div>
            </div>
          </div>
        ),
      },
      {
        question: 'Raccourcis spécifiques à la Caisse',
        answer: (
          <div className="space-y-3 text-slate-300">
            <p>Optimisez vos encaissements avec ces touches rapides :</p>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between border-b border-surface-border pb-1">
                <span>Focus sur la recherche produit</span>
                <kbd className="text-white font-bold">F1</kbd>
              </li>
              <li className="flex justify-between border-b border-surface-border pb-1">
                <span>Ouvrir le modal de paiement</span>
                <kbd className="text-white font-bold">F12</kbd>
              </li>
              <li className="flex justify-between border-b border-surface-border pb-1">
                <span>Vider la recherche / Fermer modal</span>
                <kbd className="text-white font-bold">Echap</kbd>
              </li>
              <li className="flex justify-between border-b border-surface-border pb-1">
                <span>Focus recherche (si pas en saisie)</span>
                <kbd className="text-white font-bold">/</kbd>
              </li>
            </ul>
          </div>
        ),
      },
    ],
  },
  {
    id: 'caisse',
    icon: ShoppingCart,
    title: 'Caisse (POS)',
    color: 'text-brand-400',
    topics: [
      {
        question: 'Comment effectuer une vente ?',
        answer: (
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Allez dans <strong className="text-white">Caisse</strong> depuis le menu.</li>
            <li>Recherchez un produit par nom, code-barres ou SKU dans la barre de recherche, ou parcourez la liste.</li>
            <li>Cliquez sur un produit pour l&apos;ajouter au panier (colonne droite).</li>
            <li>Ajustez la quantité avec <strong className="text-white">+</strong> / <strong className="text-white">−</strong> dans le panier.</li>
            <li>Cliquez sur <strong className="text-white">Encaisser</strong> pour ouvrir le modal de paiement.</li>
            <li>Choisissez le mode de paiement (espèces, mobile money, carte…) et confirmez.</li>
          </ol>
        ),
      },
      {
        question: 'Comment appliquer un code promo ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Dans le panneau panier, cliquez sur <strong className="text-white">Ajouter une promotion</strong>.</p>
            <p>Une liste déroulante affiche tous les coupons actifs et éligibles selon le montant et le nombre d&apos;articles.</p>
            <p>Cliquez sur un coupon pour l&apos;appliquer — vous pouvez en appliquer <strong className="text-white">plusieurs à la fois</strong>.</p>
            <p>Les coupons appliqués s&apos;affichent sous forme de badges dans le panier. Cliquez sur <strong className="text-white">×</strong> pour en retirer un.</p>
            <div className="flex gap-2 mt-3 p-3 bg-surface-input rounded-lg">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm">Les coupons de type <em>Article offert</em> ajoutent automatiquement le produit gratuit au panier et le déduisent du stock.</p>
            </div>
          </div>
        ),
      },
      {
        question: 'Comment gérer les sessions et clôturer la caisse ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Allez dans <strong className="text-white">Clôture caisse</strong> pour voir l&apos;état de la session actuelle.</p>
            <p>Vous y verrez le fonds de caisse initial, le total des ventes par mode de paiement et le solde théorique.</p>
            <p>Pour clôturer, cliquez sur <strong className="text-white">Clôturer la session</strong>. Un rapport détaillé est généré.</p>
            <div className="flex gap-2 p-3 bg-red-900/10 border border-red-800 rounded-lg mt-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">Une session ouverte trop longtemps (plus de 24h) déclenchera une alerte dans l&apos;application.</p>
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: 'personnel',
    icon: Users,
    title: 'Personnel & Paie',
    color: 'text-orange-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Comment gérer les fiches employés ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Dans l&apos;onglet <strong className="text-white">Équipe</strong>, vous pouvez ajouter vos employés avec leurs coordonnées, poste et type de rémunération (horaire, journalier ou mensuel).</p>
            <p>Vous pouvez également leur <strong className="text-white">lier un compte utilisateur</strong> pour qu&apos;ils puissent se connecter à l&apos;application.</p>
          </div>
        ),
      },
      {
        question: 'Comment suivre les présences ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Dans l&apos;onglet <strong className="text-white">Présences</strong>, cliquez sur les cases du registre pour cycler entre les statuts : <em>Présent, Absent, Demi-journée, Congé, Férié</em>.</p>
            <p>L&apos;application calcule automatiquement les jours travaillés pour le calcul de la paie.</p>
            <p>Vous pouvez imprimer une <strong className="text-white">feuille de présence mensuelle</strong> signable via l&apos;icône imprimante.</p>
          </div>
        ),
      },
      {
        question: 'Comment générer les bulletins de paie ?',
        answer: (
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Allez dans l&apos;onglet <strong className="text-white">Paie & Salaires</strong>.</li>
            <li>Sélectionnez le mois concerné.</li>
            <li>Cliquez sur <strong className="text-white">Enregistrer le paiement</strong> pour un employé.</li>
            <li>Ajustez les primes ou retenues si nécessaire et validez.</li>
            <li>Une fois payé, cliquez sur <strong className="text-white">Bulletin</strong> pour imprimer la fiche de paie au format A4.</li>
          </ol>
        ),
      },
    ],
  },
  {
    id: 'tracking',
    icon: MapPin,
    title: 'Tracking terrain (GPS)',
    color: 'text-cyan-400',
    topics: [
      {
        question: 'Comment activer mon tracking ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Le tracking permet de partager votre position avec votre équipe pendant vos missions terrain.</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Dans la barre latérale, cliquez sur <strong className="text-white">Tracking Terrain</strong> (icône localisation).</li>
              <li>Autorisez l&apos;accès à votre position GPS.</li>
              <li>L&apos;icône s&apos;anime pour indiquer que le partage est actif.</li>
            </ol>
            <p className="text-xs text-slate-500 italic mt-2">Le tracking s&apos;arrête dès que vous fermez l&apos;application.</p>
          </div>
        ),
      },
      {
        question: 'Comment suivre les membres sur le terrain ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Allez dans le module <strong className="text-white">Tracking terrain</strong> depuis le menu.</p>
            <p>Vous y verrez en temps réel la position des membres actifs, la précision de leur signal GPS, et sur quelle page de l&apos;application ils travaillent.</p>
            <p>Un bouton <strong className="text-white">Navigation</strong> permet d&apos;ouvrir leur position exacte dans Google Maps.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'revendeurs',
    icon: Store,
    title: 'Vente en gros & Revendeurs',
    color: 'text-teal-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Comment appliquer un tarif revendeur ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Dans la <strong className="text-white">Caisse</strong>, cliquez sur l&apos;icône utilisateur au-dessus du panier pour sélectionner un client ou un revendeur.</p>
            <p>Si le client est enregistré comme revendeur, les prix du panier s&apos;ajustent automatiquement selon ses conditions tarifaires (ex: prix de gros).</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'hotel',
    icon: BedDouble,
    title: 'Hébergement (Hôtel)',
    color: 'text-sky-400',
    topics: [
      {
        question: 'Comment gérer les chambres ?',
        answer: (
          <p className="text-slate-300">
            Le module <strong className="text-white">Hôtel</strong> permet de visualiser l&apos;état des chambres (Libre, Occupée, Ménage).
            Vous pouvez effectuer des Check-in, enregistrer les consommations et générer la facture finale au Check-out.
          </p>
        ),
      },
    ],
  },
  {
    id: 'commandes',
    icon: ClipboardList,
    title: 'Commandes',
    color: 'text-blue-400',
    topics: [
      {
        question: 'Comment voir toutes les commandes ?',
        answer: (
          <p className="text-slate-300">
            Allez dans <strong className="text-white">Commandes</strong> depuis le menu. Utilisez les onglets pour filtrer par statut :
            <em> Toutes, Payées, Attente, Annulées</em>. La barre de recherche filtre par client ou numéro de commande.
          </p>
        ),
      },
      {
        question: 'Comment rembourser ou annuler ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Cliquez sur une commande pour voir ses détails. Utilisez le bouton <strong className="text-white">Rembourser</strong> (pour une vente payée) ou <strong className="text-white">Annuler</strong> (pour une vente en attente).</p>
            <p>Le stock est automatiquement restitué lors d&apos;un remboursement ou d&apos;une annulation.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'produits',
    icon: Package,
    title: 'Produits & Stock',
    color: 'text-green-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Comment ajouter un produit ?',
        answer: (
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Allez dans <strong className="text-white">Produits</strong> et cliquez sur <strong className="text-white">Nouveau produit</strong>.</li>
            <li>Remplissez le nom, prix, catégorie, et éventuellement le code-barres et le SKU.</li>
            <li>Activez <em>Suivre le stock</em> si vous gérez les niveaux de stock.</li>
            <li>Ajoutez une image si nécessaire et enregistrez.</li>
          </ol>
        ),
      },
      {
        question: 'Comment importer des produits (CSV) ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Cliquez sur <strong className="text-white">Importer</strong> dans la page Produits. Utilisez un fichier CSV encodé en <strong className="text-white">UTF-8</strong>.</p>
            <div className="bg-surface-input rounded-lg p-3 overflow-x-auto text-[10px]">
              <code className="text-green-400 whitespace-pre">{`nom,description,prix,categorie,code_barres,sku,stock,suivre_stock,actif
"Coca-Cola 50cl","Boisson gazeuse",500,"Boissons","123456","CC50",100,oui,oui`}</code>
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: 'compta',
    icon: BookOpen,
    title: 'Comptabilité',
    color: 'text-indigo-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Comment consulter le journal des ventes ?',
        answer: (
          <p className="text-slate-300">
            Allez dans <strong className="text-white">Comptabilité</strong> pour voir le journal détaillé de toutes les transactions,
            les flux de trésorerie et exporter des rapports pour votre comptable.
          </p>
        ),
      },
    ],
  },
  {
    id: 'parametres',
    icon: Settings,
    title: 'Paramètres',
    color: 'text-slate-400',
    topics: [
      {
        question: 'Comment configurer l\'imprimante ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Branchez votre imprimante thermique USB. Allez dans <strong className="text-white">Paramètres → Imprimante</strong> et testez l&apos;impression.</p>
            <p>Compatible avec les imprimantes standard ESC/POS (Epson, Star, etc.).</p>
          </div>
        ),
      },
    ],
  },
];

function TopicItem({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-hover transition-colors"
      >
        <span className="text-sm font-medium text-white pr-4">{topic.question}</span>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-surface-border bg-surface-card/50 text-sm leading-relaxed">
          {topic.answer}
        </div>
      )}
    </div>
  );
}

function SectionCard({ section, userRole }: { section: Section; userRole: string }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  if (section.roles && !section.roles.includes(userRole as 'owner' | 'admin' | 'staff')) {
    return null;
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-xl bg-surface-input', section.color)}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-white">{section.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{section.topics.length} rubrique{section.topics.length > 1 ? 's' : ''}</p>
          </div>
        </div>
        <ChevronDown className={cn('w-5 h-5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-2 border-t border-surface-border pt-4">
          {section.topics.map((topic, i) => (
            <TopicItem key={i} topic={topic} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const { user } = useAuthStore();
  const role = user?.role ?? 'staff';
  const [search, setSearch] = useState('');

  const filtered = SECTIONS.map((s) => ({
    ...s,
    topics: search
      ? s.topics.filter(
          (t) =>
            t.question.toLowerCase().includes(search.toLowerCase())
        )
      : s.topics,
  })).filter((s) => {
    if (s.roles && !s.roles.includes(role as 'owner' | 'admin' | 'staff')) return false;
    return !search || s.topics.length > 0;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-brand-600/20 text-brand-400">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Centre d&apos;aide</h1>
            <p className="text-xs text-slate-500 mt-0.5">Guides d&apos;utilisation de l&apos;application</p>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher dans l&apos;aide…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {/* Démarrage rapide */}
        {!search && (
          <div className="card p-5 bg-brand-600/10 border-brand-700/40">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white mb-2">Démarrage rapide</p>
                <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-300">
                  <li>Configurez votre établissement dans <strong className="text-white">Paramètres</strong></li>
                  <li>Créez vos <strong className="text-white">Catégories</strong> de produits</li>
                  <li>Ajoutez vos <strong className="text-white">Produits</strong> (ou importez-les en CSV)</li>
                  <li>Effectuez votre première vente depuis la <strong className="text-white">Caisse</strong></li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <HelpCircle className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Aucun résultat pour &quot;{search}&quot;</p>
          </div>
        ) : (
          filtered.map((section) => (
            <SectionCard key={section.id} section={section} userRole={role} />
          ))
        )}
      </div>
    </div>
  );
}
