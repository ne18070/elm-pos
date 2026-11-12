import { createContext, useContext } from 'react';
import { fr } from 'date-fns/locale';
import { addDays, differenceInCalendarDays, format, startOfMonth, subMonths } from 'date-fns';
import { prevPeriodBounds, type StatsPeriod } from '@services/supabase/analytics';

export type PeriodKey = 'today' | '7d' | 'month' | 'lastMonth' | '30d' | '90d';

export const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'today', label: "Aujourd'hui" },
  { key: '7d',    label: '7 jours' },
  { key: 'month', label: 'Ce mois' },
  { key: 'lastMonth', label: 'Mois dernier' },
  { key: '30d',   label: '30 jours' },
  { key: '90d',   label: '90 jours' },
];

export interface ResolvedPeriod {
  key: PeriodKey;
  /** Ce que reçoivent les fonctions de stats (jours à remonter, ou bornes closes). */
  query: StatsPeriod;
  /**
   * Jours entre le début de la période et aujourd'hui : les périodes glissantes
   * vont de `today - back` 00:00 à maintenant (0 = aujourd'hui seul).
   */
  back: number;
  /** Premier jour couvert (YYYY-MM-DD). */
  start: string;
  /** Nombre de jours calendaires couverts. */
  span: number;
  /** Période terminée (mois dernier) : pas de « jusqu'à maintenant ». */
  closed: boolean;
  /** Pour les phrases « Aucune vente sur … ». */
  noun: string;
  /** Nom de la période de comparaison (« hier », « mois dernier »…). */
  compareLabel: string;
  /** Bornes de la comparaison — `end` exclusif, dates YYYY-MM-DD. */
  prev: { start: string; end: string };
}

export function resolvePeriod(key: PeriodKey, now = new Date()): ResolvedPeriod {
  const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
  const rolling = (back: number) => ({ query: back, back, start: ymd(addDays(now, -back)), span: back + 1, closed: false });

  if (key === 'today') {
    return { key, ...rolling(0), noun: "aujourd'hui", compareLabel: 'hier', prev: prevPeriodBounds(0, now) };
  }
  if (key === 'month') {
    const span = now.getDate();
    // Mois à date vs les mêmes jours du mois précédent (1er → même quantième),
    // plafonné à la fin de ce mois-là (ex. 31 mars vs février).
    const prevStart = startOfMonth(subMonths(now, 1));
    const thisStart = startOfMonth(now);
    const prevEnd   = addDays(prevStart, span) > thisStart ? thisStart : addDays(prevStart, span);
    return {
      key, ...rolling(span - 1), noun: 'ce mois-ci', compareLabel: 'mois dernier',
      prev: { start: ymd(prevStart), end: ymd(prevEnd) },
    };
  }
  if (key === 'lastMonth') {
    const start = startOfMonth(subMonths(now, 1));
    const end   = startOfMonth(now); // exclusif
    const before = startOfMonth(subMonths(now, 2));
    return {
      key,
      query: { start: ymd(start), end: ymd(end) },
      back: differenceInCalendarDays(now, start),
      start: ymd(start),
      span: differenceInCalendarDays(end, start),
      closed: true,
      noun: format(start, 'MMMM yyyy', { locale: fr }),
      compareLabel: format(before, 'MMMM', { locale: fr }),
      prev: { start: ymd(before), end: ymd(start) },
    };
  }
  const span = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  return {
    key, ...rolling(span - 1), noun: `les ${span} derniers jours`,
    compareLabel: `${span} j. précédents`, prev: prevPeriodBounds(span - 1, now),
  };
}

/** Jours couverts par la période, dans l'ordre (YYYY-MM-DD). */
export function periodDates(p: ResolvedPeriod): string[] {
  const start = new Date(`${p.start}T00:00:00`);
  return Array.from({ length: p.span }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
}

/** Période active, pour les libellés des onglets sans passer une prop de plus partout. */
export const PeriodContext = createContext<ResolvedPeriod>(resolvePeriod('30d'));
export const usePeriod = () => useContext(PeriodContext);
