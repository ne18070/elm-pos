import type { AdCampaignGroup } from '@services/supabase/marketing';

/** Créée et acceptée, mais dont la date de début n'est pas encore arrivée. */
export function isScheduled(group: AdCampaignGroup): boolean {
  if (group.status !== 'active') return false;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return group.startDate > today;
}

/**
 * Une publicité fraîchement publiée n'affiche rien pendant des heures : la
 * plateforme l'examine d'abord. Sans explication, le commerçant conclut que
 * l'outil est cassé — et au-delà d'une journée sans la moindre vue, c'est
 * effectivement qu'un réglage cloche.
 *
 * Partagé entre la liste et le détail pour que les deux écrans ne finissent pas
 * par donner des conseils divergents sur la même situation.
 */
export function launchHint(group: AdCampaignGroup): string | null {
  if (group.status === 'rejected') {
    return "Publicité refusée par la plateforme. La cause est détaillée dans le compte publicitaire : le plus souvent une image ou un texte non conformes.";
  }
  // Une campagne programmée est bien active côté plateforme mais ne diffusera
  // pas avant sa date : sans ce cas, l'absence de résultats déclencherait à
  // tort l'alerte « aucune diffusion » plus bas.
  if (isScheduled(group)) {
    return `Programmée : la diffusion commencera le ${new Date(group.startDate).toLocaleDateString('fr-FR')}.`;
  }
  if (group.status !== 'active' || group.totals.impressions > 0) return null;

  const hours = (Date.now() - new Date(group.createdAt).getTime()) / 3_600_000;
  return hours < 24
    ? "Examen en cours par la plateforme. La diffusion démarre généralement en quelques heures, les premiers chiffres apparaîtront ensuite."
    : "Aucune diffusion depuis plus de 24 h. Les causes habituelles : budget quotidien trop faible, audience trop étroite, ou moyen de paiement refusé.";
}
