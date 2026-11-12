/**
 * Scènes dessinées des métiers (landing › section Métiers).
 * Style commun : formes plates monochromes déclinées en opacités de la teinte
 * `fg` de la carte + accents blancs, ombre au sol, viewBox carré 160×160.
 */

export type MetierId =
  | 'pret-a-porter' | 'quincaillerie' | 'restaurant' | 'supermarche'
  | 'epicerie' | 'boulangerie' | 'cafeteria' | 'fast-food'
  | 'maison-de-beaute' | 'maison-de-mode' | 'patisserie';

const SCENES: Record<MetierId, (fg: string) => React.ReactNode> = {
  /* Boubou / chemise sur cintre, penderie */
  'pret-a-porter': (fg) => (
    <g>
      <rect x="22" y="22" width="116" height="5" rx="2.5" fill={fg} />
      <rect x="26" y="27" width="5" height="108" rx="2.5" fill={fg} opacity="0.35" />
      <rect x="129" y="27" width="5" height="108" rx="2.5" fill={fg} opacity="0.35" />
      <path d="M80 27 v9" stroke={fg} strokeWidth="3" strokeLinecap="round" />
      <path d="M63 44 L80 36 L97 44 L112 56 L104 68 L97 62 V116 Q97 121 92 121 H68 Q63 121 63 116 V62 L56 68 L48 56 Z" fill={fg} opacity="0.55" />
      <path d="M71 40 L80 50 L89 40" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx="72" cy="80" r="2.2" fill="#fff" opacity="0.8" />
      <circle cx="88" cy="90" r="2.2" fill="#fff" opacity="0.8" />
      <circle cx="74" cy="104" r="2.2" fill="#fff" opacity="0.8" />
      <circle cx="90" cy="72" r="2.2" fill="#fff" opacity="0.8" />
      <ellipse cx="80" cy="142" rx="38" ry="5" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Panneau d'outils, caisse et seau de peinture */
  quincaillerie: (fg) => (
    <g>
      <rect x="28" y="24" width="104" height="74" rx="8" fill={fg} opacity="0.15" />
      {[40, 56, 72, 88, 104, 120].map((x) => (
        <circle key={x} cx={x} cy="31" r="1.6" fill={fg} opacity="0.3" />
      ))}
      <rect x="44" y="40" width="28" height="11" rx="3" fill={fg} />
      <rect x="55" y="51" width="7" height="38" rx="3.5" fill={fg} opacity="0.55" />
      <circle cx="100" cy="46" r="9" fill="none" stroke={fg} strokeWidth="6" />
      <rect x="96.5" y="54" width="7" height="34" rx="3.5" fill={fg} opacity="0.55" />
      <rect x="34" y="114" width="44" height="22" rx="4" fill={fg} opacity="0.55" />
      <rect x="34" y="110" width="44" height="7" rx="3.5" fill={fg} />
      <rect x="48" y="104" width="16" height="6" rx="3" fill={fg} />
      <path d="M96 116 h30 l-3 22 h-24 Z" fill={fg} opacity="0.55" />
      <ellipse cx="111" cy="116" rx="15" ry="4" fill={fg} />
      <path d="M100 113 q11 -12 22 0" stroke={fg} strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="80" cy="144" rx="44" ry="5" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Bol fumant sur la table, cuillère */
  restaurant: (fg) => (
    <g>
      <path d="M68 26 q-5 8 0 16 q5 8 0 14" stroke={fg} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M92 22 q-5 8 0 16 q5 8 0 14" stroke={fg} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M80 30 q-5 7 0 14 q5 7 0 12" stroke={fg} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.3" />
      <ellipse cx="80" cy="114" rx="46" ry="8" fill={fg} opacity="0.18" />
      <path d="M44 78 a36 36 0 0 0 72 0 Z" fill={fg} />
      <ellipse cx="80" cy="78" rx="36" ry="7" fill={fg} opacity="0.55" />
      <ellipse cx="80" cy="76" rx="28" ry="5" fill="#fff" opacity="0.85" />
      <ellipse cx="129" cy="70" rx="6.5" ry="9" fill={fg} opacity="0.55" />
      <rect x="126.5" y="78" width="5" height="30" rx="2.5" fill={fg} opacity="0.55" />
      <rect x="26" y="120" width="108" height="7" rx="3.5" fill={fg} opacity="0.35" />
      <ellipse cx="80" cy="144" rx="44" ry="4" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Caddie rempli */
  supermarche: (fg) => (
    <g>
      <rect x="52" y="42" width="20" height="20" rx="3" fill={fg} opacity="0.55" />
      <rect x="74" y="34" width="18" height="28" rx="3" fill={fg} />
      <circle cx="101" cy="52" r="10" fill={fg} opacity="0.35" />
      <path d="M38 60 L116 60 L107 98 L47 98 Z" fill={fg} opacity="0.15" stroke={fg} strokeWidth="4" strokeLinejoin="round" />
      <path d="M58 60 L62 98 M77 60 L77 98 M96 60 L92 98 M44 73 L111 73 M42 86 L109 86" stroke={fg} strokeWidth="2" opacity="0.4" />
      <path d="M116 60 L131 42" stroke={fg} strokeWidth="5" strokeLinecap="round" />
      <circle cx="132" cy="41" r="4" fill={fg} />
      <circle cx="56" cy="112" r="8" fill={fg} />
      <circle cx="56" cy="112" r="3" fill="#fff" opacity="0.9" />
      <circle cx="100" cy="112" r="8" fill={fg} />
      <circle cx="100" cy="112" r="3" fill="#fff" opacity="0.9" />
      <ellipse cx="80" cy="134" rx="44" ry="5" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Étagère garnie + sac de riz */
  epicerie: (fg) => (
    <g>
      <rect x="30" y="26" width="100" height="5" rx="2.5" fill={fg} />
      <rect x="30" y="64" width="100" height="5" rx="2.5" fill={fg} />
      <rect x="40" y="40" width="16" height="24" rx="2" fill={fg} opacity="0.55" />
      <rect x="40" y="40" width="16" height="5" rx="2" fill={fg} />
      <rect x="64" y="44" width="18" height="20" rx="4" fill={fg} opacity="0.25" />
      <rect x="67" y="39" width="12" height="6" rx="2" fill={fg} />
      <rect x="90" y="40" width="16" height="24" rx="2" fill={fg} />
      <rect x="90" y="48" width="16" height="8" fill="#fff" opacity="0.85" />
      <rect x="112" y="36" width="10" height="28" rx="4" fill={fg} opacity="0.55" />
      <rect x="115" y="30" width="4" height="7" fill={fg} />
      <path d="M58 100 q-8 28 8 36 h28 q16 -8 8 -36 q-4 -8 -22 -8 t-22 8 Z" fill={fg} opacity="0.55" />
      <path d="M68 96 l-6 -8 M92 96 l6 -8" stroke={fg} strokeWidth="4" strokeLinecap="round" />
      <rect x="68" y="110" width="24" height="12" rx="2" fill="#fff" opacity="0.85" />
      <ellipse cx="80" cy="144" rx="42" ry="4" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Panier de baguettes */
  boulangerie: (fg) => (
    <g>
      <g transform="rotate(-18 80 100)">
        <rect x="72" y="38" width="15" height="64" rx="7.5" fill={fg} opacity="0.5" />
        <path d="M76 50 l8 5 M76 64 l8 5 M76 78 l8 5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      </g>
      <g transform="rotate(14 80 100)">
        <rect x="72" y="32" width="15" height="70" rx="7.5" fill={fg} opacity="0.75" />
        <path d="M76 44 l8 5 M76 58 l8 5 M76 72 l8 5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      </g>
      <path d="M42 96 h76 l-9 36 h-58 Z" fill={fg} />
      <path d="M46 107 h68 M50 119 h60" stroke="#fff" strokeWidth="2.5" opacity="0.35" />
      <ellipse cx="80" cy="142" rx="46" ry="4" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Tasse fumante sur soucoupe */
  cafeteria: (fg) => (
    <g>
      <path d="M70 28 q-5 8 0 16 q5 8 0 14" stroke={fg} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M90 24 q-5 8 0 16 q5 8 0 14" stroke={fg} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M50 72 v18 q0 22 30 22 q30 0 30 -22 v-18 Z" fill={fg} />
      <ellipse cx="80" cy="72" rx="30" ry="7" fill="#fff" opacity="0.9" />
      <circle cx="72" cy="71" r="2" fill={fg} opacity="0.35" />
      <circle cx="86" cy="73" r="2.5" fill={fg} opacity="0.35" />
      <path d="M110 78 q16 2 12 14 q-3 10 -15 8" fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="80" cy="118" rx="42" ry="8" fill={fg} opacity="0.3" />
      <ellipse cx="80" cy="142" rx="44" ry="4" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Burger + cornet de frites */
  'fast-food': (fg) => (
    <g>
      <path d="M34 78 a30 18 0 0 1 60 0 Z" fill={fg} />
      <circle cx="52" cy="68" r="1.8" fill="#fff" opacity="0.85" />
      <circle cx="64" cy="63" r="1.8" fill="#fff" opacity="0.85" />
      <circle cx="76" cy="68" r="1.8" fill="#fff" opacity="0.85" />
      <rect x="34" y="80" width="60" height="8" rx="4" fill="#fff" opacity="0.85" />
      <rect x="36" y="90" width="56" height="10" rx="5" fill={fg} opacity="0.7" />
      <rect x="34" y="102" width="60" height="12" rx="6" fill={fg} opacity="0.45" />
      <rect x="104" y="66" width="6" height="26" rx="3" fill={fg} opacity="0.5" />
      <rect x="112" y="58" width="6" height="34" rx="3" fill={fg} opacity="0.65" />
      <rect x="120" y="66" width="6" height="26" rx="3" fill={fg} opacity="0.5" />
      <path d="M98 86 h34 l-5 30 h-24 Z" fill={fg} />
      <ellipse cx="80" cy="136" rx="46" ry="5" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Miroir de coiffeuse à ampoules */
  'maison-de-beaute': (fg) => (
    <g>
      <ellipse cx="80" cy="60" rx="30" ry="36" fill={fg} opacity="0.15" stroke={fg} strokeWidth="5" />
      <path d="M68 44 q-6 10 -2 22" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      {([[52, 32], [80, 20], [108, 32], [46, 66], [114, 66]] as const).map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" fill="#fff" stroke={fg} strokeWidth="1.5" />
      ))}
      <rect x="76" y="96" width="8" height="14" fill={fg} opacity="0.55" />
      <rect x="36" y="110" width="88" height="8" rx="4" fill={fg} />
      <rect x="44" y="118" width="6" height="20" fill={fg} opacity="0.55" />
      <rect x="110" y="118" width="6" height="20" fill={fg} opacity="0.55" />
      <rect x="52" y="98" width="7" height="12" rx="2" fill={fg} />
      <rect x="53.5" y="91" width="4" height="7" rx="2" fill={fg} opacity="0.55" />
      <rect x="100" y="94" width="12" height="16" rx="3" fill={fg} opacity="0.55" />
      <rect x="104" y="88" width="4" height="6" fill={fg} />
      <ellipse cx="80" cy="146" rx="44" ry="4" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Mannequin de couture, ciseaux et bobine */
  'maison-de-mode': (fg) => (
    <g>
      <rect x="76" y="26" width="8" height="10" rx="3" fill={fg} />
      <path d="M60 38 Q80 48 100 38 L96 62 Q94 72 100 82 Q102 92 80 94 Q58 92 60 82 Q66 72 64 62 Z" fill={fg} opacity="0.55" />
      <path d="M80 48 V90" stroke="#fff" strokeWidth="2" opacity="0.7" />
      <circle cx="80" cy="56" r="1.8" fill="#fff" opacity="0.85" />
      <circle cx="80" cy="68" r="1.8" fill="#fff" opacity="0.85" />
      <circle cx="80" cy="80" r="1.8" fill="#fff" opacity="0.85" />
      <rect x="78" y="94" width="4" height="30" fill={fg} />
      <path d="M80 124 L62 138 M80 124 L98 138" stroke={fg} strokeWidth="4" strokeLinecap="round" />
      <path d="M34 58 L52 78 M52 58 L34 78" stroke={fg} strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="55" r="4" fill="none" stroke={fg} strokeWidth="2.5" />
      <circle cx="54" cy="55" r="4" fill="none" stroke={fg} strokeWidth="2.5" />
      <rect x="112" y="62" width="14" height="18" rx="2" fill={fg} opacity="0.55" />
      <path d="M112 67 h14 M112 72 h14" stroke="#fff" strokeWidth="2" opacity="0.7" />
      <path d="M126 64 q14 10 6 26" stroke={fg} strokeWidth="2" fill="none" opacity="0.5" />
      <ellipse cx="80" cy="146" rx="40" ry="4" fill={fg} opacity="0.12" />
    </g>
  ),

  /* Gâteau à étages sur présentoir */
  patisserie: (fg) => (
    <g>
      <circle cx="80" cy="44" r="5" fill={fg} />
      <path d="M80 39 q4 -6 9 -8" stroke={fg} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="64" y="52" width="32" height="22" rx="4" fill={fg} opacity="0.4" />
      <circle cx="73" cy="63" r="1.8" fill="#fff" opacity="0.85" />
      <circle cx="87" cy="63" r="1.8" fill="#fff" opacity="0.85" />
      <rect x="52" y="74" width="56" height="28" rx="5" fill={fg} opacity="0.65" />
      <path d="M52 80 q4.7 8 9.3 0 q4.7 8 9.3 0 q4.7 8 9.3 0 q4.7 8 9.3 0 q4.7 8 9.3 0 q4.7 8 9.5 0 v-7 h-56 Z" fill="#fff" opacity="0.85" />
      <ellipse cx="80" cy="104" rx="40" ry="7" fill={fg} />
      <rect x="76" y="108" width="8" height="16" fill={fg} opacity="0.55" />
      <ellipse cx="80" cy="126" rx="18" ry="5" fill={fg} />
      <ellipse cx="80" cy="144" rx="44" ry="4" fill={fg} opacity="0.12" />
    </g>
  ),
};

export function MetierIllustration({ id, fg, className }: { id: MetierId; fg: string; className?: string }) {
  return (
    <svg viewBox="0 0 160 160" fill="none" className={className} aria-hidden>
      {SCENES[id](fg)}
    </svg>
  );
}
