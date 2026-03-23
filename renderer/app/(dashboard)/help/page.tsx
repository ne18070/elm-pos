'use client';

import { useState } from 'react';
import {
  HelpCircle, ChevronDown, ShoppingCart, Package, ClipboardList,
  Truck, Tag, BarChart2, Settings, Warehouse, LayoutGrid,
  Upload, Download, Users, Monitor, CreditCard, Search,
  AlertCircle, CheckCircle, Info,
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
            <li>Cliquez sur un produit pour l'ajouter au panier (colonne droite).</li>
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
            <p>Une liste déroulante affiche tous les coupons actifs et éligibles selon le montant et le nombre d'articles.</p>
            <p>Cliquez sur un coupon pour l'appliquer — vous pouvez en appliquer <strong className="text-white">plusieurs à la fois</strong>.</p>
            <p>Les coupons appliqués s'affichent sous forme de badges dans le panier. Cliquez sur <strong className="text-white">×</strong> pour en retirer un.</p>
            <div className="flex gap-2 mt-3 p-3 bg-surface-input rounded-lg">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm">Les coupons de type <em>Article offert</em> ajoutent automatiquement le produit gratuit au panier et le déduisent du stock.</p>
            </div>
          </div>
        ),
      },
      {
        question: 'Comment mettre une commande en attente ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Cliquez sur <strong className="text-white">Mettre en attente</strong> (icône horloge) en haut du panier.</p>
            <p>Pour rappeler une commande en attente, cliquez sur <strong className="text-white">Commandes en attente</strong> (icône tiroir) et choisissez la commande à rappeler.</p>
          </div>
        ),
      },
      {
        question: 'Comment gérer un paiement partiel (acompte) ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Dans le modal de paiement, sélectionnez <strong className="text-white">Acompte / partiel</strong>.</p>
            <p>Saisissez le montant versé. Le solde restant sera affiché et la commande sera en statut <em>Attente</em>.</p>
            <p>Pour compléter le paiement plus tard, retrouvez la commande dans <strong className="text-white">Commandes</strong> et cliquez sur <em>Compléter le paiement</em>.</p>
          </div>
        ),
      },
      {
        question: 'Comment ouvrir l\'écran client (affichage client) ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Cliquez sur <strong className="text-white">Écran client</strong> en bas du menu latéral (icône moniteur).</p>
            <p>Une nouvelle fenêtre s'ouvre et affiche en temps réel le contenu du panier, le total et le logo de votre établissement.</p>
            <p>Idéalement placée sur un second écran face au client.</p>
          </div>
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
        question: 'Comment rembourser une commande ?',
        answer: (
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Trouvez la commande payée dans la liste.</li>
            <li>Cliquez sur la commande puis sur <strong className="text-white">Rembourser</strong>.</li>
            <li>Sélectionnez les articles à rembourser et confirmez. Le stock est automatiquement réajusté.</li>
          </ol>
        ),
      },
      {
        question: 'Comment annuler une commande ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Sur la commande, cliquez sur <strong className="text-white">Annuler</strong>. Seules les commandes en attente ou non livrées peuvent être annulées.</p>
            <p>L'annulation restitue le stock des articles.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'livraison',
    icon: Truck,
    title: 'Livraisons',
    color: 'text-orange-400',
    topics: [
      {
        question: 'Comment gérer les livraisons ?',
        answer: (
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Allez dans <strong className="text-white">Livraisons</strong>.</li>
            <li>Les commandes avec livraison en attente apparaissent dans la liste.</li>
            <li>Cliquez sur <strong className="text-white">Commencer la préparation</strong> pour passer une commande en statut <em>En cours</em>.</li>
            <li>Une fois livrée, cliquez sur <strong className="text-white">Marquer comme livrée</strong>.</li>
          </ol>
        ),
      },
    ],
  },
  {
    id: 'produits',
    icon: Package,
    title: 'Produits',
    color: 'text-green-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Comment ajouter un produit ?',
        answer: (
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Allez dans <strong className="text-white">Produits</strong> et cliquez sur <strong className="text-white">Nouveau produit</strong>.</li>
            <li>Remplissez le nom, prix, catégorie, et éventuellement le code-barres et le SKU.</li>
            <li>Activez <em>Suivre le stock</em> si vous gérez les niveaux de stock pour ce produit.</li>
            <li>Ajoutez une image en cliquant sur la zone image.</li>
            <li>Cliquez sur <strong className="text-white">Enregistrer</strong>.</li>
          </ol>
        ),
      },
      {
        question: 'Comment importer des produits en masse (CSV) ?',
        answer: (
          <div className="space-y-3 text-slate-300">
            <p>Cliquez sur <strong className="text-white">Importer</strong> (icône flèche montante) dans la page Produits.</p>
            <p className="font-medium text-white">Format du fichier CSV attendu :</p>
            <div className="bg-surface-input rounded-lg p-3 overflow-x-auto">
              <code className="text-xs text-green-400 whitespace-pre">{`nom,description,prix,categorie,code_barres,sku,stock,suivre_stock,actif
"Coca-Cola 50cl","Boisson gazeuse",500,"Boissons","123456","CC50",100,oui,oui
"Eau minérale","Eau plate 1,5L",200,"Boissons",,,,non,oui`}</code>
            </div>
            <ul className="space-y-1 text-sm">
              <li><strong className="text-white">nom</strong> — obligatoire</li>
              <li><strong className="text-white">prix</strong> — nombre sans symbole monétaire</li>
              <li><strong className="text-white">suivre_stock</strong> — <code className="text-green-400">oui</code> ou <code className="text-red-400">non</code></li>
              <li><strong className="text-white">actif</strong> — <code className="text-green-400">oui</code> ou <code className="text-red-400">non</code></li>
              <li>Les colonnes optionnelles peuvent être laissées vides.</li>
            </ul>
            <div className="flex gap-2 p-3 bg-amber-900/20 border border-amber-800 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-300">Encodage requis : <strong>UTF-8</strong>. Ouvrez le fichier dans Excel ou Google Sheets, puis exportez en CSV UTF-8.</p>
            </div>
          </div>
        ),
      },
      {
        question: 'Comment exporter les produits ?',
        answer: (
          <p className="text-slate-300">
            Cliquez sur <strong className="text-white">Exporter CSV</strong> (icône flèche descendante). Un fichier CSV est téléchargé avec tous les produits visibles (selon votre recherche actuelle).
            Le fichier peut être ouvert dans Excel, LibreOffice ou Google Sheets.
          </p>
        ),
      },
    ],
  },
  {
    id: 'approvisionnement',
    icon: Warehouse,
    title: 'Approvisionnement',
    color: 'text-cyan-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Comment enregistrer une entrée de stock ?',
        answer: (
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Allez dans <strong className="text-white">Approvisionnement</strong> et cliquez sur <strong className="text-white">Nouvelle entrée</strong>.</li>
            <li>Sélectionnez le produit concerné.</li>
            <li>Saisissez la quantité reçue, le conditionnement (ex. : cartons de 12), le fournisseur et le coût unitaire.</li>
            <li>Confirmez — le stock du produit est automatiquement mis à jour.</li>
          </ol>
        ),
      },
    ],
  },
  {
    id: 'categories',
    icon: LayoutGrid,
    title: 'Catégories',
    color: 'text-purple-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Comment créer une catégorie ?',
        answer: (
          <p className="text-slate-300">
            Allez dans <strong className="text-white">Catégories</strong> et cliquez sur <strong className="text-white">Nouvelle catégorie</strong>.
            Donnez-lui un nom et éventuellement une couleur ou icône. Les catégories permettent de filtrer les produits à la caisse.
          </p>
        ),
      },
    ],
  },
  {
    id: 'coupons',
    icon: Tag,
    title: 'Coupons & Promotions',
    color: 'text-rose-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Comment créer un coupon de réduction ?',
        answer: (
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Allez dans <strong className="text-white">Coupons</strong> et cliquez sur <strong className="text-white">Nouveau coupon</strong>.</li>
            <li>Choisissez le type : <em>Pourcentage</em>, <em>Montant fixe</em> ou <em>Article offert</em>.</li>
            <li>Définissez le code, la valeur et les conditions (montant minimum, quantité minimale, date d'expiration, utilisations max).</li>
            <li>Activez le coupon et enregistrez.</li>
          </ol>
        ),
      },
      {
        question: 'Comment fonctionne le coupon "Article offert" ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Ce type de coupon permet d'offrir un article spécifique gratuitement (ex. : achetez 10 cartons, recevez 1 bouteille offerte).</p>
            <p>Lors de l'application à la caisse, le produit offert est automatiquement ajouté au panier à prix 0 et son stock est décompté.</p>
            <p>Configurez les conditions : <em>Quantité minimum</em> dans le panier avant que le coupon soit éligible.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'analytics',
    icon: BarChart2,
    title: 'Statistiques',
    color: 'text-yellow-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Quelles statistiques sont disponibles ?',
        answer: (
          <ul className="list-disc list-inside space-y-1.5 text-slate-300">
            <li>Chiffre d'affaires par jour, semaine ou mois</li>
            <li>Nombre de ventes et panier moyen</li>
            <li>Top produits les plus vendus</li>
            <li>Répartition par mode de paiement</li>
            <li>Évolution du stock (alertes de rupture)</li>
          </ul>
        ),
      },
    ],
  },
  {
    id: 'paiement',
    icon: CreditCard,
    title: 'Modes de paiement',
    color: 'text-emerald-400',
    topics: [
      {
        question: 'Quels modes de paiement sont supportés ?',
        answer: (
          <ul className="list-disc list-inside space-y-1.5 text-slate-300">
            <li><strong className="text-white">Espèces</strong> — calcul automatique du rendu monnaie</li>
            <li><strong className="text-white">Mobile money</strong> — (Orange Money, Wave, etc.)</li>
            <li><strong className="text-white">Carte bancaire</strong></li>
            <li><strong className="text-white">Paiement mixte</strong> — combinez plusieurs modes pour une même vente</li>
            <li><strong className="text-white">Acompte / partiel</strong> — encaissez une partie maintenant, le reste plus tard</li>
          </ul>
        ),
      },
    ],
  },
  {
    id: 'admin',
    icon: Users,
    title: 'Administration & Équipe',
    color: 'text-slate-400',
    roles: ['owner', 'admin'],
    topics: [
      {
        question: 'Comment inviter un membre de l\'équipe ?',
        answer: (
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Allez dans <strong className="text-white">Administration → Équipe</strong>.</li>
            <li>Cliquez sur <strong className="text-white">Inviter un agent</strong>.</li>
            <li>Saisissez l'adresse e-mail de la personne et son rôle (<em>Admin</em> ou <em>Caissier</em>).</li>
            <li>La personne reçoit un e-mail d'invitation pour créer son compte.</li>
          </ol>
        ),
      },
      {
        question: 'Quels sont les rôles disponibles ?',
        answer: (
          <div className="space-y-3">
            <div className="flex gap-3 p-3 bg-surface-input rounded-lg">
              <span className="text-xs font-bold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded h-fit">Propriétaire</span>
              <p className="text-sm text-slate-300">Accès complet. Peut créer de nouveaux établissements, gérer l'équipe, voir toutes les statistiques.</p>
            </div>
            <div className="flex gap-3 p-3 bg-surface-input rounded-lg">
              <span className="text-xs font-bold text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded h-fit">Administrateur</span>
              <p className="text-sm text-slate-300">Accès à tout sauf la création d'établissement. Peut gérer produits, coupons, équipe.</p>
            </div>
            <div className="flex gap-3 p-3 bg-surface-input rounded-lg">
              <span className="text-xs font-bold text-slate-400 bg-slate-700 px-2 py-0.5 rounded h-fit">Caissier</span>
              <p className="text-sm text-slate-300">Accès à la caisse, commandes et livraisons uniquement.</p>
            </div>
          </div>
        ),
      },
      {
        question: 'Comment gérer plusieurs établissements ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Cliquez sur le <strong className="text-white">nom de votre établissement</strong> en haut du menu latéral pour ouvrir le sélecteur.</p>
            <p>Pour créer un nouvel établissement, cliquez sur <strong className="text-white">Nouvel établissement</strong> en bas du sélecteur (visible pour les propriétaires).</p>
            <p>Pour basculer vers un autre établissement, cliquez simplement sur son nom dans la liste. Toutes les données (produits, commandes, stock) sont séparées par établissement.</p>
          </div>
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
        question: 'Comment configurer mon établissement ?',
        answer: (
          <p className="text-slate-300">
            Dans <strong className="text-white">Paramètres</strong>, vous pouvez modifier le nom, le type d'activité, la devise, le taux de TVA, le logo et le pied de page du ticket de caisse.
            Ces informations apparaissent sur les reçus imprimés.
          </p>
        ),
      },
      {
        question: 'Comment configurer l\'imprimante de reçus ?',
        answer: (
          <div className="space-y-2 text-slate-300">
            <p>Branchez votre imprimante thermique USB. L'application détecte automatiquement les imprimantes USB compatibles ESC/POS.</p>
            <p>Dans <strong className="text-white">Paramètres → Imprimante</strong>, testez l'impression avec le bouton <em>Imprimer un test</em>.</p>
            <div className="flex gap-2 p-3 bg-surface-input rounded-lg">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm">Compatible avec la plupart des imprimantes thermiques ESC/POS 80mm (Epson, Star, Bixolon, etc.).</p>
            </div>
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
            <h1 className="text-xl font-bold text-white">Centre d'aide</h1>
            <p className="text-xs text-slate-500 mt-0.5">Guides d'utilisation de l'application</p>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher dans l'aide…"
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
            <p className="font-medium">Aucun résultat pour "{search}"</p>
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
