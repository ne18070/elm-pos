import { ServiceOrderStatus, SubjectType } from '@services/supabase/service-orders';

export const STATUS_CFG: Record<ServiceOrderStatus, { label: string; color: string; dot: string }> = {
  attente:  { label: 'En attente', color: 'bg-badge-warning  text-status-warning  border-status-warning/30',  dot: 'bg-status-warning'  },
  en_cours: { label: 'En cours',   color: 'bg-badge-info     text-status-info     border-status-info/30',     dot: 'bg-status-info'     },
  termine:  { label: 'Terminé',    color: 'bg-badge-success  text-status-success  border-status-success/30',  dot: 'bg-status-success'  },
  paye:     { label: 'Payé',       color: 'bg-badge-success  text-status-success  border-status-success/30',  dot: 'bg-status-success'  },
  annule:   { label: 'Annulé',     color: 'bg-badge-error    text-status-error    border-status-error/30',    dot: 'bg-status-error'    },
};

export const SUBJECT_TYPES: { value: SubjectType; label: string; refLabel: string; infoLabel: string }[] = [
  { value: 'vehicule',  label: 'Véhicule',   refLabel: 'Plaque / Immat.', infoLabel: 'Marque & modèle'    },
  { value: 'appareil',  label: 'Appareil',   refLabel: 'N° série / IMEI', infoLabel: 'Marque & modèle'    },
  { value: 'billet',    label: 'Billet',     refLabel: 'N° billet / Réf', infoLabel: 'Compagnie & trajet' },
  { value: 'client',    label: 'Client',     refLabel: 'Nom / CIN',       infoLabel: 'Informations'        },
  { value: 'autre',     label: 'Autre',      refLabel: 'Référence',       infoLabel: 'Description'         },
];

export const PAY_METHODS = [
  { value: 'cash',   label: 'Espèces'      },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'card',   label: 'Carte'        },
  { value: 'bank',   label: 'Virement'     },
  { value: 'check',  label: 'Chèque'       },
];

export function subjectTypeCfg(type: string | null | undefined) {
  return SUBJECT_TYPES.find(t => t.value === type) ?? SUBJECT_TYPES[4];
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
