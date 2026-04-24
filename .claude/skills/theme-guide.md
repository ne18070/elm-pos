---
name: theme-guide
description: Reference guide for building theme-compatible screens. Use when creating a new page, component, or UI element to ensure it works correctly in both light and dark mode without adding !important overrides.
---

# Règle fondamentale
**Ne jamais utiliser de classes Tailwind non-sémantiques pour les couleurs de surface ou de texte.**
Si tu utilises `text-white`, `bg-slate-800`, `text-green-400` directement, tu devras ajouter un override dans globals.css. Utilise les tokens sémantiques à la place.

---

## Tokens disponibles

### Surfaces (fond de page, cartes, inputs)
| Classe | Usage |
|---|---|
| `bg-surface` | Fond principal de la page |
| `bg-surface-card` | Fond de carte / panneau |
| `bg-surface-input` | Fond d'input, select, textarea |
| `border-surface-border` | Bordure standard |
| `bg-surface-hover` | Fond au survol d'une ligne/item |

### Texte
| Classe | Usage |
|---|---|
| `text-content-primary` | Texte principal (titres, valeurs) |
| `text-content-secondary` | Texte secondaire (labels, sous-titres) |
| `text-content-muted` | Texte désactivé / placeholder |

### Marque
| Classe | Usage |
|---|---|
| `text-brand-400` / `text-brand-300` | Lien, accent de marque |
| `bg-brand-600` | Bouton primaire, action principale |
| `border-brand-500` | Focus ring de marque |

### Statut — texte & icônes
| Classe | Dark | Light |
|---|---|---|
| `text-status-success` | green-400 (vif) | green-600 (foncé) |
| `text-status-warning` | amber-400 | amber-700 |
| `text-status-error` | red-400 | red-600 |
| `text-status-info` | sky-400 | sky-600 |

### Statut — fonds de pastille
| Classe | Dark | Light |
|---|---|---|
| `bg-badge-success` | teinte verte sombre | green-100 pastel |
| `bg-badge-warning` | teinte ambrée sombre | amber-100 pastel |
| `bg-badge-error` | teinte rouge sombre | red-100 pastel |
| `bg-badge-info` | teinte bleue sombre | sky-100 pastel |

---

## Patterns copy-paste

### Carte standard
```tsx
<div className="bg-surface-card rounded-xl border border-surface-border p-4">
  <h2 className="text-content-primary font-semibold">Titre</h2>
  <p className="text-content-secondary text-sm">Description</p>
</div>
```

### Pastille statut (badge)
```tsx
// ✅ Correct — fonctionne dark ET light sans override
<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium
                 bg-badge-success text-status-success border border-status-success/30">
  Actif
</span>

// ❌ À éviter — ne fonctionne qu'en dark
<span className="bg-green-900/20 text-green-400 border border-green-800">Actif</span>
```

### Input / champ de formulaire
```tsx
// Utiliser la classe .input de globals.css (déjà sémantique)
<input className="input" placeholder="..." />

// Ou manuellement :
<input className="bg-surface-input border border-surface-border rounded-xl px-4 py-2.5
                  text-content-primary placeholder:text-content-muted
                  focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
```

### Label
```tsx
<label className="label">Nom du champ</label>
// Équivalent : text-sm font-medium text-content-secondary
```

### Boutons
```tsx
// Primaire
<button className="btn-primary">Enregistrer</button>

// Secondaire
<button className="btn-secondary">Annuler</button>

// Danger
<button className="btn-danger">Supprimer</button>
```

### Ligne de tableau
```tsx
<tr className="border-b border-surface-border hover:bg-surface-hover transition-colors">
  <td className="px-4 py-3 text-content-primary">Valeur</td>
  <td className="px-4 py-3 text-content-secondary text-sm">Secondaire</td>
</tr>
```

### Section toujours sombre (sidebar, header POS)
```tsx
// Ajouter .theme-dark sur le conteneur — les tokens surface/text restent dark même en mode light
<aside className="theme-dark bg-surface w-64 h-screen">
  <span className="text-content-primary">Toujours en dark</span>
</aside>
```

---

## Ce qu'il ne faut PAS faire

| ❌ À éviter | ✅ Remplacer par |
|---|---|
| `text-white` | `text-content-primary` |
| `text-slate-400` | `text-content-secondary` |
| `text-slate-500` | `text-content-muted` |
| `bg-slate-800` | `bg-surface-card` |
| `bg-slate-700` | `bg-surface-input` |
| `border-slate-700` | `border-surface-border` |
| `text-green-400` | `text-status-success` |
| `bg-green-900/20` | `bg-badge-success` |
| `text-red-400` | `text-status-error` |
| `bg-red-900/20` | `bg-badge-error` |
| `text-amber-400` | `text-status-warning` |
| `text-sky-400` / `text-blue-400` | `text-status-info` |

---

## Quand utiliser `.theme-dark`
Ajouter `className="theme-dark"` sur un conteneur quand il doit **toujours** rester en mode sombre, indépendamment du thème global. Exemples : sidebar, header POS, landing page, modales de branding.

Les tokens `text-content-*`, `bg-surface-*` et `bg-badge-*` à l'intérieur d'un `.theme-dark` utiliseront automatiquement les valeurs dark.
