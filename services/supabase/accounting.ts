import { supabase } from './client';
import type { Json } from './database.types';

const db  = supabase.from.bind(supabase);
const rpc = supabase.rpc.bind(supabase);

// --- Helpers ----------------------------------------------------------------

/** Arrondi comptable à 2 décimales, sans artefact flottant. */
const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Libellé canonique par code de compte. `get_trial_balance` regroupe par
 * (code, nom) : deux libellés différents pour le même code (« Caisse » vs
 * « Caisse / Mobile », « Banques – comptes courants » vs « Banque / Carte »)
 * scindent le compte en deux lignes et faussent le bilan (getBalance() ne lit
 * que la 1re). Toute écriture générée doit passer par ACCT_NAME.
 */
const ACCT_NAME: Record<string, string> = {
  '101':  'Capital social',
  '161':  'Emprunts',
  '31':   'Marchandises',
  '401':  'Fournisseurs',
  '411':  'Clients',
  '419':  'Clients – avances et acomptes reçus',
  '4441': 'TVA facturée (collectée)',
  '4451': 'TVA récupérable sur achats',
  '521':  'Banques – comptes courants',
  '531':  'Chèques postaux',
  '571':  'Caisse',
  '576':  'Mobile Money',
  '601':  'Achats de marchandises',
  '603':  'Variations des stocks de marchandises',
  '701':  'Ventes de marchandises',
  '706':  'Prestations de services',
  '7061': 'Honoraires',
  '7065': 'Prestations de services',
  '7091': 'RRR accordés sur ventes',
};
const acctName = (code: string, fallback = ''): string => ACCT_NAME[code] ?? fallback;

/** id de l'utilisateur courant (pour journal_entries.created_by). */
async function _currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

type _AnyLine = { account_code: string; account_name: string; debit: number; credit: number };

/**
 * Absorbe un écart d'ARRONDI (≤ 0,05) dans la plus grosse ligne pour garantir
 * Σ débit = Σ crédit au centime. Au-delà, l'écart est une vraie anomalie : on
 * ne touche à rien et l'appelant rejette l'écriture. Renvoie l'écart résiduel.
 */
function _absorbRoundingGap(lines: _AnyLine[]): number {
  const d = round2(lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0));
  const c = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const gap = round2(d - c);
  if (gap === 0 || Math.abs(gap) > 0.05) return gap;
  // gap > 0 : trop de débit → on augmente un crédit (ou on réduit un débit).
  const side: 'debit' | 'credit' = gap > 0 ? 'credit' : 'debit';
  let target = lines.filter((l) => l[side] > 0).sort((a, b) => b[side] - a[side])[0];
  if (!target) { target = lines.filter((l) => (gap > 0 ? l.debit : l.credit) > 0).sort((a, b) => b[gap > 0 ? 'debit' : 'credit'] - a[gap > 0 ? 'debit' : 'credit'])[0]; }
  if (!target) return gap;
  if (side === 'credit') target.credit = round2(target.credit + Math.abs(gap));
  else                   target.debit  = round2(target.debit  + Math.abs(gap));
  return 0;
}

/** Code d'erreur PostgreSQL « unique_violation ». */
const _PG_UNIQUE_VIOLATION = '23505';
const _errCode = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;

/**
 * Insère une écriture + ses lignes, en nettoyant l'écriture si l'insertion des
 * lignes échoue (sinon : écriture orpheline sans ligne, définitivement bloquée
 * par le dédoublonnage source_id). Rejette toute écriture déséquilibrée ou à
 * moins de 2 lignes. Une violation d'unicité (je_biz_source_uidx) = écriture
 * déjà comptabilisée par une synchro concurrente → on l'ignore sans erreur.
 * Renvoie true si une écriture a bien été créée.
 */
async function _insertBalancedEntry(
  entry: Record<string, unknown>,
  lines: _AnyLine[],
): Promise<boolean> {
  _absorbRoundingGap(lines);
  const d = round2(lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0));
  const c = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  if (lines.length < 2 || Math.abs(d - c) > 0.01) {
    console.warn(`[compta] écriture « ${String(entry.description)} » ignorée — déséquilibre D ${d} ≠ C ${c}`);
    return false;
  }
  const { data: created, error: eErr } = await db('journal_entries')
    .insert(entry as never)
    .select('id')
    .maybeSingle();
  if (eErr) {
    if (_errCode(eErr) === _PG_UNIQUE_VIOLATION) return false; // déjà comptabilisée
    throw new Error(eErr.message);
  }
  if (!created) return false;
  const { error: lErr } = await db('journal_lines').insert(lines.map((l) => ({ ...l, entry_id: created.id })));
  if (lErr) {
    await db('journal_entries').delete().eq('id', created.id);
    throw new Error(lErr.message);
  }
  return true;
}

/**
 * Insère un lot d'écritures `journal_entries` en tolérant les doublons (course
 * entre deux « Synchroniser » simultanés). Un INSERT multi-lignes étant
 * atomique, sur violation d'unicité on réinsère le lot ligne à ligne en sautant
 * les seuls doublons. Renvoie le mapping source_id → id des écritures RÉELLEMENT
 * insérées PAR CET APPEL (jamais celles créées par une session concurrente :
 * c'est cette session-là qui leur rattache leurs lignes).
 */
async function _insertEntriesTolerant(
  _businessId: string,
  rows: Record<string, unknown>[],
): Promise<Map<string, string>> {
  const mine = new Map<string, string>();
  const keep = (r: { id: string; source_id: string | null } | null | undefined) => {
    if (r?.source_id) mine.set(r.source_id, r.id);
  };
  for (let i = 0; i < rows.length; i += 300) {
    const batch = rows.slice(i, i + 300);
    const { data, error } = await db('journal_entries').insert(batch as never).select('id, source_id');
    if (!error) {
      for (const e of (data ?? []) as { id: string; source_id: string | null }[]) keep(e);
      continue;
    }
    if (_errCode(error) !== _PG_UNIQUE_VIOLATION) throw new Error(error.message);
    for (const one of batch) {
      const { data: d1, error: e1 } = await db('journal_entries')
        .insert(one as never).select('id, source_id').maybeSingle();
      if (e1) {
        if (_errCode(e1) !== _PG_UNIQUE_VIOLATION) throw new Error(e1.message);
        continue; // déjà comptabilisée par une autre session
      }
      keep(d1 as { id: string; source_id: string | null } | null);
    }
  }
  return mine;
}

// --- Types --------------------------------------------------------------------

export interface Account {
  id: string;
  business_id: string | null;
  code: string;
  name: string;
  class: number;
  nature: 'actif' | 'passif' | 'charge' | 'produit' | 'resultat';
  balance_type: 'debit' | 'credit';
  is_default: boolean;
  is_active: boolean;
}

export interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  reference: string | null;
  description: string;
  source: 'manual' | 'order' | 'stock' | 'refund' | 'adjustment' | 'hotel' | 'rental' | 'honoraires' | 'voiture' | 'service_order';
  source_id: string | null;
  created_at: string;
  lines: JournalLine[];
}

export interface TrialBalanceLine {
  account_code: string;
  account_name: string;
  class_num: number;
  nature: string;
  balance_type: 'debit' | 'credit';
  total_debit: number;
  total_credit: number;
  balance: number;
}

export interface CreateEntryInput {
  businessId: string;
  entry_date: string;
  reference?: string;
  source_id?: string | null;
  description: string;
  lines: { account_code: string; account_name: string; debit: number; credit: number }[];
}

// --- Comptes ------------------------------------------------------------------

const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Garde-fou : ne jamais interpoler une valeur non-UUID dans un filtre .or(). */
function _assertUuid(id: string): string {
  if (!_UUID_RE.test(id)) throw new Error('Identifiant établissement invalide');
  return id;
}

export async function getAccounts(businessId: string): Promise<Account[]> {
  const { data, error } = await db('accounts')
    .select('*')
    .or(`business_id.eq.${_assertUuid(businessId)},business_id.is.null`)
    .eq('is_active', true)
    .order('code');
  if (error) throw new Error(error.message);
  return (data ?? []) as Account[];
}

export async function createAccount(
  businessId: string,
  input: { code: string; name: string; nature: Account['nature']; balance_type: Account['balance_type'] }
): Promise<Account> {
  _assertUuid(businessId);
  const code = input.code.trim();
  const classNum = parseInt(code.charAt(0), 10);
  if (isNaN(classNum) || classNum < 1 || classNum > 8) {
    throw new Error('Le numéro de compte doit commencer par un chiffre de 1 à 8');
  }
  // On regarde AUSSI les comptes désactivés : l'index unique (business_id, code)
  // porte sur toutes les lignes, actives ou non. Un code re-créé après
  // suppression doit être RÉACTIVÉ, pas ré-inséré (sinon violation d'unicité).
  const { data: existing } = await db('accounts')
    .select('id, business_id, is_active, is_default')
    .eq('code', code)
    .or(`business_id.eq.${businessId},business_id.is.null`)
    .order('business_id', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.is_active) {
      throw new Error(`Le compte ${code} existe déjà dans votre plan comptable`);
    }
    if (existing.business_id !== businessId) {
      // Compte standard (business_id NULL) désactivé — le réactiver tel quel.
      const { data, error } = await db('accounts')
        .update({ is_active: true })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Account;
    }
    const { data, error } = await db('accounts')
      .update({ is_active: true, name: input.name.trim(), nature: input.nature, balance_type: input.balance_type })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Account;
  }

  const { data, error } = await db('accounts')
    .insert({
      business_id: businessId,
      code,
      name: input.name.trim(),
      class: classNum,
      nature: input.nature,
      balance_type: input.balance_type,
      is_default: false,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Account;
}

export async function deleteAccount(accountId: string): Promise<void> {
  // Suppression franche si le compte n'a JAMAIS été mouvementé (permet de
  // recréer le même code proprement) ; sinon désactivation (on ne casse pas
  // l'historique du journal).
  const { data: acc } = await db('accounts')
    .select('id, code, business_id')
    .eq('id', accountId)
    .eq('is_default', false)
    .maybeSingle();
  if (!acc) return;

  const { count } = await db('journal_lines')
    .select('id', { count: 'exact', head: true })
    .eq('account_code', acc.code);

  if ((count ?? 0) === 0) {
    const { error } = await db('accounts').delete().eq('id', accountId).eq('is_default', false);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await db('accounts')
    .update({ is_active: false })
    .eq('id', accountId)
    .eq('is_default', false);
  if (error) throw new Error(error.message);
}

// --- Journal ------------------------------------------------------------------

export async function getJournalEntries(
  businessId: string,
  opts?: { dateFrom?: string; dateTo?: string; source?: string; limit?: number }
): Promise<JournalEntry[]> {
  // PostgREST plafonne toute requête sans .range() à 1000 lignes. Pour un
  // journal volumineux (import de reprise) on feuillette jusqu'à `limit`.
  // Tri (entry_date desc, id desc) = adossé à idx_journal_entries_biz_date_id
  // (migration 105) → indispensable pour ne pas dépasser le statement_timeout
  // sur une période large.
  const cap  = Math.min(opts?.limit ?? 1000, 20000);
  const PAGE = 1000;
  const all: JournalEntry[] = [];

  for (let from = 0; from < cap; from += PAGE) {
    let q = db('journal_entries')
      .select(`*, lines:journal_lines(*)`)
      .eq('business_id', businessId)
      .order('entry_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, Math.min(from + PAGE, cap) - 1);

    if (opts?.dateFrom) q = q.gte('entry_date', opts.dateFrom);
    if (opts?.dateTo)   q = q.lte('entry_date', opts.dateTo);
    if (opts?.source)   q = q.eq('source', opts.source);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as JournalEntry[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// --- Journal paginé côté serveur (gros volumes) -----------------------------

export interface JournalPage { total: number; rows: JournalEntry[]; }

/** Une page d'écritures + leurs lignes + le total, via RPC (migration 106).
 *  Évite d'embarquer toute la période et son embed journal_lines côté client. */
export async function getJournalPage(opts: {
  from?: string; to?: string; source?: string; limit: number; offset: number;
}): Promise<JournalPage> {
  const { data, error } = await rpc('journal_page', {
    p_from:   opts.from   ?? undefined,
    p_to:     opts.to     ?? undefined,
    p_source: opts.source ?? undefined,
    p_limit:  opts.limit,
    p_offset: opts.offset,
  });
  if (error) throw new Error(error.message);
  const d = (data ?? { total: 0, rows: [] }) as unknown as { total: number; rows: JournalEntry[] };
  return { total: Number(d.total ?? 0), rows: d.rows ?? [] };
}

/** Groupes de doublons (réf. + date + montant + libellé) sur la période :
 *  tableau de tableaux d'ids, 1er = à conserver, suivants = en trop. */
export async function getJournalDuplicateGroups(from?: string, to?: string): Promise<string[][]> {
  const { data, error } = await rpc('journal_dupes', {
    p_from: from ?? undefined,
    p_to:   to   ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as string[][];
}

export async function createManualEntry(input: CreateEntryInput): Promise<JournalEntry> {
  // Vérifier l'équilibre Débit = Crédit (garde-fou client ; le contrôle
  // faisant autorité est le trigger je_balanced_check côté base — migration 113)
  const totalDebit  = round2(input.lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0));
  const totalCredit = round2(input.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Écriture déséquilibrée : Débit ${totalDebit} ≠ Crédit ${totalCredit}`);
  }
  if (input.lines.filter((l) => (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0).length < 2) {
    throw new Error('Une écriture comptable requiert au moins 2 lignes mouvementées');
  }

  const { data: entry, error: entryErr } = await db('journal_entries')
    .insert({
      business_id: input.businessId,
      entry_date:  input.entry_date,
      reference:   input.reference ?? null,
      description: input.description,
      source:      'manual',
      source_id:   input.source_id ?? null,
      created_by:  await _currentUserId(),
    })
    .select()
    .single();
  if (entryErr) throw new Error(entryErr.message);

  const { error: linesErr } = await db('journal_lines')
    .insert(input.lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesErr) {
    // Lignes refusées (trigger d'équilibre, RLS…) : on retire l'en-tête, sinon
    // une écriture orpheline sans ligne reste affichée dans le journal.
    await db('journal_entries').delete().eq('id', entry.id);
    throw new Error(linesErr.message);
  }

  return { ...entry, lines: input.lines } as unknown as JournalEntry;
}

export async function deleteManualEntry(entryId: string): Promise<void> {
  const { error } = await db('journal_entries')
    .delete()
    .eq('id', entryId)
    .eq('source', 'manual');
  if (error) throw new Error(error.message);
}

/** Supprime des écritures par id, quelle que soit leur source (RPC SECURITY
 *  DEFINER owner/admin — migration 104). Renvoie le nombre supprimé. */
export async function deleteJournalEntries(businessId: string, ids: string[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await rpc('delete_journal_entries', {
      p_business_id: businessId,
      p_ids: ids.slice(i, i + 500),
    });
    if (error) throw new Error(error.message);
    total += Number(data ?? 0);
  }
  return total;
}

// --- Synchronisation depuis les ventes/achats --------------------------------

interface _OrderRow {
  id: string; created_at: string; updated_at: string;
  status: string; subtotal: number; tax_amount: number;
  discount_amount: number; total: number; order_channel: string;
}
interface _PayRow { order_id: string; method: string; amount: number; }
interface _LineInput { entry_id: string; account_code: string; account_name: string; debit: number; credit: number; }

function _payMethodToAccount(method: string): { code: string; name: string } {
  switch (method) {
    case 'card':         return { code: '521', name: 'Banques – comptes courants' };
    case 'mobile_money': return { code: '576', name: 'Mobile Money' };
    case 'room_charge':  return { code: '411', name: 'Clients' };
    // Rachat de points fidélité : rien n'est encaissé — la part réglée en
    // points est une remise consentie par le commerce (RRR sur ventes), pas
    // de la trésorerie. La débiter en 571 gonflait la caisse d'autant.
    case 'loyalty':      return { code: '7091', name: 'RRR accordés sur ventes' };
    default:             return { code: '571', name: 'Caisse' };
  }
}

const _PAGE_SIZE = 1000;

/**
 * PostgREST plafonne toute requête sans .range() explicite à 1000 lignes
 * (db-max-rows par défaut chez Supabase) — silencieusement, sans erreur. Pour
 * une entreprise avec un historique de plusieurs milliers de commandes,
 * syncAccounting ne verrait jamais que les 1000 premières et penserait avoir
 * tout synchronisé. Cette fonction feuillette la requête par pages de 1000
 * jusqu'à épuisement.
 */
type _Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function _fetchAllRows<T>(build: (from: number, to: number) => _Rows<T>): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + _PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < _PAGE_SIZE) break;
    from += _PAGE_SIZE;
  }
  return all;
}

/** Découpe un .in(column, ids) en lots — une liste de plusieurs milliers
 *  d'UUID dans une seule requête risque de dépasser la longueur d'URL max
 *  acceptée par PostgREST/le proxy en amont. */
async function _fetchInBatches<T>(
  ids: string[],
  batchSize: number,
  build: (batch: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const { data, error } = await build(ids.slice(i, i + batchSize));
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
  }
  return all;
}

/**
 * Insère des lignes de journal en lots ≤ `size` SANS jamais scinder les lignes
 * d'une même écriture entre deux lots. Le trigger d'équilibre (DEFERRABLE,
 * migration 113) vérifie Σ débit = Σ crédit par écriture au COMMIT de chaque
 * requête HTTP : une écriture à cheval sur deux lots échouerait sur le premier.
 * Pré-condition : les lignes d'une même écriture sont contiguës dans `lines`
 * (vrai pour toutes les synchros — construites écriture par écriture).
 */
async function _insertJournalLinesByEntry(lines: _LineInput[], size = 1000): Promise<void> {
  let batch: _LineInput[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const { error } = await db('journal_lines').insert(batch);
    if (error) throw new Error(error.message);
    batch = [];
  };
  let i = 0;
  while (i < lines.length) {
    const entryId = lines[i].entry_id;
    let j = i;
    while (j < lines.length && lines[j].entry_id === entryId) j++;
    const group = lines.slice(i, j);
    if (batch.length > 0 && batch.length + group.length > size) await flush();
    batch.push(...group);
    i = j;
  }
  await flush();
}

export async function syncAccounting(businessId: string): Promise<number> {
  // Purge des écritures orphelines (insérées puis échouées sur leurs lignes lors
  // d'une synchro précédente) — sinon elles restent « déjà synchronisées » à
  // jamais. RPC owner/admin ; ignore l'erreur si l'appelant n'a pas le rôle.
  try {
    await rpc('delete_orphan_journal_entries' as never, { p_business_id: businessId, p_source: null } as never);
  } catch { /* rôle insuffisant ou RPC absente — non bloquant */ }

  // Collect already-synced IDs to avoid duplicates — paginé (voir _fetchAllRows).
  // .order('id') OBLIGATOIRE : sans tri explicite, une requête .range() paginée
  // renvoie les lignes dans un ordre non garanti d'une page à l'autre → des
  // source_id sautés → commandes ré-insérées → doublon je_biz_source_uidx.
  const existing = await _fetchAllRows<{ source_id: string | null }>((from, to) =>
    db('journal_entries')
      .select('source_id')
      .eq('business_id', businessId)
      .in('source', ['order', 'refund'])
      .order('id', { ascending: true })
      .range(from, to),
  );
  const synced = new Set(existing.map((e) => e.source_id));

  // Fetch all relevant orders — paginé, sinon plafonné à 1000 lignes par
  // PostgREST au-delà desquelles syncAccounting croirait avoir tout traité.
  const orderList = await _fetchAllRows<_OrderRow>((from, to) =>
    supabase
      .from('orders')
      .select('id, created_at, updated_at, status, subtotal, tax_amount, discount_amount, total, order_channel')
      .eq('business_id', businessId)
      .in('status', ['paid', 'pending', 'refunded'])
      // tri sur (created_at, id) : created_at seul n'est pas unique → avec
      // .range() paginé, une commande à cheval sur une frontière de page peut
      // ressortir deux fois et provoquer un doublon je_biz_source_uidx.
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
  // Dédoublonnage défensif : une seule écriture par commande.
  const seenOrder = new Set<string>();
  const unsynced = orderList.filter((o) => !synced.has(o.id) && !seenOrder.has(o.id) && seenOrder.add(o.id));

  // Batch-fetch payments for unsynced orders — par lots de 500 id pour ne pas
  // dépasser la longueur d'URL max d'une clause .in() sur un historique de
  // plusieurs milliers de commandes.
  const ids = unsynced.map((o) => o.id);
  const allPayments = await _fetchInBatches<_PayRow>(ids, 500, (batch) =>
    supabase.from('payments').select('order_id, method, amount').in('order_id', batch),
  );

  const payMap: Record<string, _PayRow[]> = {};
  for (const p of allPayments) {
    (payMap[p.order_id] ??= []).push(p);
  }

  // Remboursements réels par commande — l'extourne se fait AU PRORATA du
  // montant effectivement remboursé (refunds.amount), jamais à 100 % d'office.
  const allRefunds = await _fetchInBatches<{ order_id: string; amount: number }>(ids, 500, (batch) =>
    supabase.from('refunds').select('order_id, amount').in('order_id', batch),
  );
  const refundMap: Record<string, number> = {};
  for (const r of allRefunds) refundMap[r.order_id] = round2((refundMap[r.order_id] ?? 0) + Number(r.amount || 0));

  // ── Orders ──────────────────────────────────────────────────────────────────
  // On construit chaque écriture + ses lignes AVANT toute insertion et on rejette
  // les écritures déséquilibrées ; l'insertion (_insertEntriesTolerant) avale les
  // violations d'unicité → deux « Synchroniser » concurrents ne produisent ni
  // erreur dure ni lignes en double.
  type _PendingLine = { account_code: string; account_name: string; debit: number; credit: number };
  const built: { sourceId: string; entry: Record<string, unknown>; lines: _PendingLine[] }[] = [];

  for (const o of unsynced) {
    const isRefund = o.status === 'refunded';
    const isRS     = o.order_channel === 'room_service';
    const ref      = '#' + o.id.slice(0, 8).toUpperCase();
    const sub      = round2(Number(o.subtotal)  || 0);   // brut HT, AVANT remise
    const tax      = round2(Number(o.tax_amount) || 0);
    const disc     = round2(Number(o.discount_amount) || 0);
    const tot      = round2(Number(o.total) || 0);
    // TVA « en dedans » ? total ≈ sub - remise (sinon total ≈ sub - remise + TVA)
    const taxInclusive = tax > 0 && Math.abs((sub - disc) - tot) < Math.abs((sub - disc + tax) - tot);
    const rev      = round2(taxInclusive ? sub - tax : sub);  // produit HT à comptabiliser
    const revCode  = isRS ? '706' : '701';
    const revName  = acctName(revCode, isRS ? 'Prestations de services' : 'Ventes de marchandises');

    const pays = (payMap[o.id] ?? []).filter((p) => p.method !== 'free' && Number(p.amount) > 0);
    const paid = round2(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0));

    const lines: _PendingLine[] = [];

    if (!isRefund) {
      for (const p of pays) {
        const acc = _payMethodToAccount(p.method);
        lines.push({ account_code: acc.code, account_name: acctName(acc.code, acc.name), debit: round2(Number(p.amount)), credit: 0 });
      }
      const due = round2(tot - paid);
      // Solde non encaissé (acompte / vente à crédit) → créance client, JAMAIS de la caisse
      if (due > 0.01)  lines.push({ account_code: '411', account_name: acctName('411'), debit: due, credit: 0 });
      // Trop-perçu → dette envers le client
      if (due < -0.01) lines.push({ account_code: '419', account_name: acctName('419'), debit: 0, credit: -due });
      if (disc > 0)    lines.push({ account_code: '7091', account_name: acctName('7091'), debit: disc, credit: 0 });
      if (rev > 0)     lines.push({ account_code: revCode, account_name: revName, debit: 0, credit: rev });
      if (tax > 0)     lines.push({ account_code: '4441', account_name: acctName('4441'), debit: 0, credit: tax });
    } else {
      const refunded = round2(refundMap[o.id] ?? tot);
      const ratio    = tot > 0 ? Math.min(1, refunded / tot) : 1;
      const rRev  = round2((taxInclusive ? sub - tax : sub) * ratio);
      const rTax  = round2(tax  * ratio);
      const rDisc = round2(disc * ratio);
      if (rRev > 0)  lines.push({ account_code: '701', account_name: acctName('701'), debit: rRev, credit: 0 });
      if (rTax > 0)  lines.push({ account_code: '4441', account_name: acctName('4441'), debit: rTax, credit: 0 });
      if (rDisc > 0) lines.push({ account_code: '7091', account_name: acctName('7091'), debit: 0, credit: rDisc });
      if (refunded > 0) lines.push({ account_code: '571', account_name: acctName('571'), debit: 0, credit: refunded });
    }

    _absorbRoundingGap(lines);
    const d = round2(lines.reduce((s, l) => s + l.debit, 0));
    const c = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (lines.length < 2 || Math.abs(d - c) > 0.01) {
      console.warn(`[compta] écriture ${ref} ignorée — déséquilibre D ${d} ≠ C ${c}`);
      continue;
    }

    built.push({
      sourceId: o.id,
      entry: {
        business_id: businessId,
        entry_date:  (isRefund ? o.updated_at : o.created_at).slice(0, 10),
        reference:   ref,
        description: isRefund ? `Remboursement ${ref}` : `${isRS ? 'Room Service' : 'Vente'} ${ref}`,
        source:      isRefund ? 'refund' : 'order',
        source_id:   o.id,
      },
      lines,
    });
  }

  const entryIdBySourceId = await _insertEntriesTolerant(businessId, built.map((b) => b.entry));

  const allLines: _LineInput[] = [];
  for (const b of built) {
    const entryId = entryIdBySourceId.get(b.sourceId);
    if (!entryId) continue; // écriture absente (course concurrente) → pas de lignes orphelines
    for (const l of b.lines) allLines.push({ ...l, entry_id: entryId });
  }
  await _insertJournalLinesByEntry(allLines, 1000);

  let count = built.filter((b) => entryIdBySourceId.has(b.sourceId)).length;

  // ── Stock purchases (achats) ─────────────────────────────────────────────
  const syncedStock = await _fetchAllRows<{ source_id: string | null }>((from, to) =>
    db('journal_entries')
      .select('source_id')
      .eq('business_id', businessId)
      .eq('source', 'stock')
      .order('id', { ascending: true })   // tri obligatoire pour .range() paginé
      .range(from, to),
  );
  const syncedStockSet = new Set(syncedStock.map((e) => e.source_id));

  const stockRows = await _fetchAllRows<{
    id: string; created_at: string; quantity: number;
    cost_per_unit: number | null; supplier: string | null;
    product: { name: string };
  }>((from, to) =>
    supabase
      .from('stock_entries')
      .select('id, created_at, quantity, cost_per_unit, supplier, product:products(name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );

  const stockCostBySourceId = new Map<string, number>();
  const seenStock = new Set<string>();
  const stockEntryRows = stockRows.filter((s) => {
    if (seenStock.has(s.id)) return false;
    seenStock.add(s.id);
    if (syncedStockSet.has(s.id)) return false;
    const totalCost = round2(Number(s.quantity) * Number(s.cost_per_unit));
    if (totalCost <= 0) return false;
    stockCostBySourceId.set(s.id, totalCost);
    return true;
  }).map((s) => ({
    business_id: businessId,
    entry_date:  s.created_at.slice(0, 10),
    description: `Achat – ${s.product?.name ?? 'Produit'} / ${s.supplier ?? 'Fournisseur'}`,
    source:      'stock',
    source_id:   s.id,
  }));

  const stockIdBySourceId = await _insertEntriesTolerant(businessId, stockEntryRows);

  const stockLines: _LineInput[] = [];
  for (const [sourceId, entryId] of stockIdBySourceId) {
    const totalCost = stockCostBySourceId.get(sourceId);
    if (!totalCost) continue;
    stockLines.push(
      { entry_id: entryId, account_code: '601', account_name: acctName('601'), debit: totalCost, credit: 0 },
      { entry_id: entryId, account_code: '401', account_name: acctName('401'), debit: 0,         credit: totalCost },
    );
  }
  await _insertJournalLinesByEntry(stockLines, 1000);

  count += stockIdBySourceId.size;

  return count;
}

// --- Balance des comptes ------------------------------------------------------

export async function getTrialBalance(
  businessId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<TrialBalanceLine[]> {
  const { data, error } = await rpc('get_trial_balance', {
    p_business_id: businessId,
    p_date_from:   dateFrom,
    p_date_to:     dateTo,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TrialBalanceLine[];
}

// --- Import mouvements (ancien système) ------------------------------------
//
// Reprise de l'historique entrées (achats) / sorties (ventes) :
//  · 1 écriture par ligne du fichier ;
//  · réf. = « ID Article » · libellé = « Désignation — Référence » (+ le type
//    du fichier entre parenthèses s'il n'est pas achat/vente : initial, promo…) ;
//  · sens & type → nature comptable (le CHECK sur journal_entries.source
//    n'autorise pas de valeur libre comme « initial » ou « promo ») :
//      entrée *          → Achat   : D 601 (+ TVA 4451) / C 571   [source stock]
//      sortie vente      → Vente   : D 571 / C 701 (+ TVA 4441)   [source order]
//      sortie promo      → Charge promo : D 6234 / C 571, sans TVA [source adjustment]
//      sortie manuelle   → Charge div. : D 6584 / C 571, sans TVA  [source adjustment]
//  · TVA 18 % extraite du « Montant TTC » pour les ventes et achats ;
//  · source_id DÉTERMINISTE (hash des champs stables + rang de la ligne parmi
//    ses identiques dans le fichier) → ré-importer les mêmes fichiers ne crée
//    aucun doublon (l'index unique je_biz_source_uidx + ON CONFLICT DO NOTHING).
//    Deux lignes réellement identiques dans le fichier restent deux écritures.

export interface EtombRow {
  direction: 'entree' | 'sortie';
  idArticle: string;       // colonne « ID Article »
  designation: string;     // colonne « Désignation »
  refName: string;         // colonne « Référence »
  date: string;            // YYYY-MM-DD
  amountTTC: number;       // signé
  type: string;            // achat / vente / initial / manuelle / promo (info)
}

export interface EtombImportResult {
  entriesCreated:     number;
  rowsSkippedInvalid: number;  // date/montant illisible
  rowsSkippedZero:    number;  // Montant TTC = 0
}

const _ETOMB_VAT_RATE = 0.18;

/** Hash déterministe (cyrb128) formaté en chaîne de forme UUID. */
function _detUuid(input: string): string {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1, h2, h3, h4].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

interface _ImportLine { account_code: string; account_name: string; debit: number; credit: number }
interface _ImportEntry {
  sid: string;
  entry_date: string;
  reference: string | null;
  description: string;
  source: string;
  lines: _ImportLine[];
}

/**
 * @param onProgress rappelé après chaque lot inséré : (écritures faites, total).
 *
 * L'insertion passe par la RPC import_journal_entries (migration 103) : une
 * seule requête ensembliste par lot, en SECURITY DEFINER avec statement_timeout
 * levé — la version client (insert PostgREST ligne à ligne, sous-requête RLS par
 * ligne sur journal_lines) dépassait le statement_timeout sur les gros volumes.
 */
export async function importEtombMovements(
  businessId: string,
  rows: EtombRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<EtombImportResult> {
  const res: EtombImportResult = { entriesCreated: 0, rowsSkippedInvalid: 0, rowsSkippedZero: 0 };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Nature comptable selon sens + type du fichier.
  const kindOf = (row: EtombRow): 'vente' | 'promo' | 'manuelle' | 'achat' => {
    if (row.direction === 'entree') return 'achat';
    const t = row.type.trim().toLowerCase();
    if (t === 'promo') return 'promo';
    if (t === 'manuelle') return 'manuelle';
    return 'vente';
  };
  const SOURCE_BY_KIND = { vente: 'order', achat: 'stock', promo: 'adjustment', manuelle: 'adjustment' } as const;

  const entries: _ImportEntry[] = [];
  const occ = new Map<string, number>();  // rang d'une ligne parmi ses identiques
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(row.amountTTC)) { res.rowsSkippedInvalid++; continue; }
    if (Math.round(row.amountTTC * 100) === 0) { res.rowsSkippedZero++; continue; }

    const ttc = round2(Math.abs(row.amountTTC));
    const ht  = round2(ttc / (1 + _ETOMB_VAT_RATE));
    const vat = round2(ttc - ht);
    const reverse = row.amountTTC < 0;
    const lines: _ImportLine[] = [];
    const push = (code: string, name: string, side: 'D' | 'C', amt: number) => {
      if (amt <= 0) return;
      const debit = (side === 'D') !== reverse;
      lines.push({ account_code: code, account_name: name, debit: debit ? amt : 0, credit: debit ? 0 : amt });
    };
    switch (kindOf(row)) {
      case 'vente':
        push('571',  'Caisse',                     'D', ttc);
        push('701',  'Ventes de marchandises',     'C', ht);
        push('4441', 'TVA facturée (collectée)',   'C', vat);
        break;
      case 'achat':
        push('601',  'Achats de marchandises',     'D', ht);
        push('4451', 'TVA récupérable sur achats', 'D', vat);
        push('571',  'Caisse',                     'C', ttc);
        break;
      case 'promo':
        push('6234', 'Primes et cadeaux à la clientèle', 'D', ttc);
        push('571',  'Caisse',                           'C', ttc);
        break;
      case 'manuelle':
        push('6584', 'Charges diverses',                 'D', ttc);
        push('571',  'Caisse',                           'C', ttc);
        break;
    }
    if (lines.length === 0) continue;

    const base    = row.refName ? `${row.designation} — ${row.refName}` : (row.designation || 'Mouvement');
    const t       = row.type.trim().toLowerCase();
    const isPlain = t === '' || t === 'achat' || t === 'vente';

    // Clé stable de la ligne + rang parmi ses identiques → source_id reproductible
    const rowKey = `${row.direction}|${row.date}|${row.idArticle}|${row.refName}|${ttc}|${t}`;
    const rank   = occ.get(rowKey) ?? 0;
    occ.set(rowKey, rank + 1);

    entries.push({
      sid:        _detUuid(`etomb:${businessId}:${rowKey}:${rank}`),
      entry_date: row.date,
      reference:  row.idArticle || null,
      description: isPlain ? base : `${base} (${row.type.trim()})`,
      source:     SOURCE_BY_KIND[kindOf(row)],
      lines,
    });
  }
  if (entries.length === 0) return res;

  const CHUNK = 3000;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const { data, error } = await rpc('import_journal_entries', {
      p_business_id: businessId,
      p_entries: chunk as unknown as Json,
    });
    if (error) throw new Error(error.message);
    res.entriesCreated += Number(data ?? chunk.length);
    onProgress?.(Math.min(i + CHUNK, entries.length), entries.length);
  }
  return res;
}

/** Vide entièrement le journal comptable du commerce (toutes sources). La RPC
 *  clear_journal (migration 101, SECURITY DEFINER owner/admin) supprime au plus
 *  p_limit écritures par appel ; on la rappelle jusqu'à ce qu'elle renvoie 0
 *  pour ne dépendre d'aucune limite de passerelle sur une requête unique. */
export async function clearJournal(businessId: string): Promise<number> {
  let total = 0;
  for (;;) {
    const { data, error } = await rpc('clear_journal', { p_business_id: businessId });
    if (error) throw new Error(error.message);
    const n = Number(data ?? 0);
    total += n;
    if (n === 0) break;
  }
  return total;
}

// --- États financiers (calculés côté client depuis la balance) ---------------

export interface IncomeStatement {
  ventesGross:       number; // 701, 706, etc.
  rrrAccordes:       number; // 709
  caNet:             number;
  achatsMarchandises:number; // 601
  margeBrute:        number;
  autresProduits:    number; // classe 7 hors 70x/77x (71, 72, 75, 78, 79…)
  transports:        number; // 61x
  servicesExterieurs:number; // 62x, 63x
  impotsTaxes:       number; // 64x
  chargesPersonnel:  number; // 66x (SYSCOHADA) or 64x
  autresCharges:     number; // rest of class 6
  ebe:               number; // Excédent Brut d'Exploitation
  dotations:         number; // 68x
  resultatExpl:      number;
  produitsFinanciers:number; // 77x
  chargesFinancieres:number; // 67x
  resultatFinancier: number;
  resultatHAO:       number; // classe 8 : produits − charges hors activités ordinaires
  resultatAvantImpot:number;
  impots:            number; // 691, 89
  resultatNet:       number;
}

export interface BalanceSheet {
  // ACTIF
  actifImmobilise: number;  // class 2
  stocks:          number;  // class 3
  creancesClients: number;  // 411
  tvaRecuperable:  number;  // 4451
  autresActifCT:   number;  // other class 4 debit
  tresorerie:      number;  // 521, 571, 576, 531 (débiteurs uniquement)
  totalActif:      number;
  // PASSIF
  capitaux:          number;  // class 1 hors résultat de l'exercice
  resultatExercice:  number;  // résultat net de la période (non encore journalisé)
  dettesLT:          number;  // 161
  dettesFF:          number;  // 401
  dettesFiscales:    number;  // 441, 444, 4441
  dettesSociales:    number;  // 421, 431
  decouvertsBancaires: number; // 521/531/576 créditeurs + 551/565
  autresDettesCT:    number;  // other class 4 credit + 419
  totalPassif:       number;
  /** totalActif − totalPassif : doit être nul. Non nul ⇒ écriture(s)
   *  déséquilibrée(s) ou compte hors périmètre du bilan simplifié. */
  ecartBilan:        number;
}

// --- Synchronisation hôtel ---------------------------------------------------
//
// Crée une écriture journal pour chaque réservation check-out non encore
// synchronisée.  Écriture :
//   Débit  571 (Caisse)   : paid_amount
//   Débit  411 (Clients)  : total - paid_amount  (si solde restant)
//   Crédit 706 (Hébergmt) : total

export async function syncHotelAccounting(businessId: string): Promise<number> {
  // Récupérer tous les source_id hôtel déjà synchronisés
  // Paginé (voir _fetchAllRows) : au-delà de 1000 écritures hôtel, le plafond
  // PostgREST laisserait croire que les suivantes ne sont pas synchronisées.
  const existingAll = await _fetchAllRows<{ source_id: string | null }>((from, to) =>
    db('journal_entries')
      .select('source_id')
      .eq('business_id', businessId)
      .eq('source', 'hotel')
      .order('id', { ascending: true })
      .range(from, to),
  );
  const syncedSet = new Set(existingAll.map((e) => e.source_id));

  let count = 0;

  // --- 1. Sync hotel_payments (acomptes + paiements au check-out) ----------
  // source = 'hotel', source_id = payment UUID. Chaque paiement reçu :
  //   Débit 571/521/576 (selon moyen) · Crédit 706
  // Paginé — sinon plafonné à 1000 lignes par PostgREST.
  const payments = await _fetchAllRows<{
    id: string; amount: number; method: string; paid_at: string; reservation_id: string;
  }>((from, to) =>
    supabase
      .from('hotel_payments')
      .select('id, amount, method, paid_at, reservation_id')
      .eq('business_id', businessId)
      .order('id', { ascending: true })
      .range(from, to),
  );

  // Infos réservations pour les libellés
  const reservationIds = [...new Set(payments.map((p) => p.reservation_id))];
  const resInfoMap: Record<string, { room: string; guest: string }> = {};
  for (let i = 0; i < reservationIds.length; i += 200) {
    const { data: resInfo } = await supabase
      .from('hotel_reservations')
      .select('id, room:hotel_rooms!room_id(number), guest:hotel_guests!guest_id(full_name)')
      .in('id', reservationIds.slice(i, i + 200));
    for (const r of (resInfo ?? []) as { id: string; room: { number: string } | null; guest: { full_name: string } | null }[]) {
      resInfoMap[r.id] = { room: r.room?.number ?? '', guest: r.guest?.full_name ?? 'Client' };
    }
  }

  for (const p of payments) {
    if (syncedSet.has(p.id)) continue;

    // Double comptabilisation : la section 2 a pu créer une écriture
    // provisoire de séjour (source_id = reservation_id) tant qu'aucun
    // paiement n'existait. Un paiement apparaît désormais → on retire la
    // provision avant de comptabiliser l'encaissement réel.
    if (syncedSet.has(p.reservation_id)) {
      await db('journal_entries').delete()
        .eq('business_id', businessId).eq('source', 'hotel').eq('source_id', p.reservation_id);
      syncedSet.delete(p.reservation_id);
    }

    const amount = round2(Number(p.amount) || 0);
    if (amount <= 0) continue;

    const debitCode = p.method === 'card' || p.method === 'bank' ? '521'
      : p.method === 'mobile_money' || p.method === 'mobile' ? '576'
      : '571';

    const info = resInfoMap[p.reservation_id] ?? { room: '', guest: 'Client' };
    const desc = `Paiement hôtel${info.room ? ` - Ch.${info.room}` : ''} - ${info.guest}`;

    const ok = await _insertBalancedEntry(
      { business_id: businessId, entry_date: p.paid_at.slice(0, 10), description: desc, source: 'hotel', source_id: p.id },
      [
        { account_code: debitCode, account_name: acctName(debitCode, 'Caisse'), debit: amount, credit: 0 },
        { account_code: '706',     account_name: acctName('706', 'Prestations hébergement'), debit: 0, credit: amount },
      ],
    );
    if (ok) { count++; syncedSet.add(p.id); }
  }

  // --- 2. Séjours clôturés SANS hotel_payments ---------------------------
  // (rétrocompatibilité + séjours sans paiement enregistré) — paginé.
  const reservations = await _fetchAllRows<{
    id: string; actual_check_out: string | null; check_out: string;
    total: number; paid_amount: number;
    room: { number: string } | null; guest: { full_name: string } | null;
  }>((from, to) =>
    supabase
      .from('hotel_reservations')
      .select('id, actual_check_out, check_out, total, paid_amount, room:hotel_rooms(number), guest:hotel_guests(full_name)')
      .eq('business_id', businessId)
      .eq('status', 'checked_out')
      .order('id', { ascending: true })
      .range(from, to),
  );

  for (const res of reservations) {
    if (syncedSet.has(res.id)) continue;

    const { data: hasPay } = await supabase
      .from('hotel_payments').select('id').eq('reservation_id', res.id).limit(1);
    if ((hasPay ?? []).length > 0) continue; // couvert par la section 1

    const entryDate   = (res.actual_check_out ?? res.check_out).slice(0, 10);
    const roomLabel   = res.room?.number ? `Ch.${res.room.number}` : '';
    const guestLabel  = res.guest?.full_name ?? 'Client';
    const description = `Séjour hôtel${roomLabel ? ` - ${roomLabel}` : ''} - ${guestLabel}`;
    const total       = round2(Number(res.total) || 0);
    const paid        = round2(Math.max(0, Number(res.paid_amount) || 0));
    const outstanding = round2(Math.max(0, total - paid));
    if (total <= 0) continue;

    const lines: { account_code: string; account_name: string; debit: number; credit: number }[] = [];
    if (paid > 0)           lines.push({ account_code: '571', account_name: acctName('571'), debit: Math.min(paid, total), credit: 0 });
    if (outstanding > 0.01) lines.push({ account_code: '411', account_name: acctName('411'), debit: outstanding, credit: 0 });
    lines.push({ account_code: '706', account_name: acctName('706', 'Prestations hébergement'), debit: 0, credit: total });

    const ok = await _insertBalancedEntry(
      { business_id: businessId, entry_date: entryDate, description, source: 'hotel', source_id: res.id },
      lines,
    );
    if (ok) { count++; syncedSet.add(res.id); }
  }

  return count;
}

export function computeIncomeStatement(balance: TrialBalanceLine[]): IncomeStatement {
  const has = (r: TrialBalanceLine, ...prefixes: string[]) =>
    prefixes.some((p) => r.account_code.startsWith(p));
  /** Solde d'un ensemble de comptes, sens charge (débit − crédit). */
  const sumCharge = (pred: (r: TrialBalanceLine) => boolean) =>
    balance.filter(pred).reduce((s, r) => s + (r.total_debit - r.total_credit), 0);
  const sumRange = (prefix: string) => sumCharge((r) => r.account_code.startsWith(prefix));

  // CA = comptes 70x (ventes + prestations), hors 709x (RRR accordés)
  const ventesGross = balance
    .filter((r) => r.account_code.startsWith('70') && !r.account_code.startsWith('709'))
    .reduce((s, r) => s + (r.total_credit - r.total_debit), 0);

  const rrrAccordes = balance
    .filter((r) => r.account_code.startsWith('709'))
    .reduce((s, r) => s + (r.total_debit - r.total_credit), 0);

  const caNet = ventesGross - rrrAccordes;

  // Coût d'achat des marchandises vendues : 601..608 + 603 (variation de stock),
  // net des RRR obtenus (6091). `startsWith('60')` couvre 601/602/603/604/608.
  const achatsMarchandises = sumRange('60');
  const margeBrute         = caNet - achatsMarchandises;

  const transports         = sumRange('61');
  const servicesExterieurs = sumRange('62') + sumRange('63');

  // Intérêts d'emprunt : le plan OHADA du projet les code en 661 (classe 6).
  // Ils relèvent du résultat FINANCIER, pas des charges de personnel (66x) ni
  // d'exploitation. On les isole explicitement. (671 est déjà couvert par
  // sumRange('67') plus bas — l'inclure ici le comptait deux fois.)
  const interetsEmprunts = sumCharge((r) => has(r, '661'));

  // Personnel = 66x hors 661/671.
  const chargesPersonnel = sumCharge((r) => has(r, '66') && !has(r, '661'));
  // Impôts & taxes d'exploitation = 64x (hors 641/646 qui, dans ce plan, sont
  // du personnel et doivent être neutralisés de ce poste).
  const impotsTaxes = sumCharge((r) => has(r, '64') && !has(r, '641', '646'));
  const personnelIn64 = sumCharge((r) => has(r, '641', '646'));
  const effectivePersonnel = chargesPersonnel + personnelIn64;
  const effectiveTaxes     = impotsTaxes;

  // Autres charges d'exploitation : reste de la classe 6 (hors 60/61/62/63/64,
  // hors personnel 66, hors financier 67/661/671, hors dotations 68, hors
  // impôt sur résultat 69).
  const autresCharges = sumCharge((r) =>
    r.class_num === 6 && !has(r, '60', '61', '62', '63', '64', '66', '67', '68', '69'),
  );

  // Autres produits d'exploitation : reste de la classe 7 (71 subventions,
  // 72 production immobilisée, 75 autres produits, 78 transferts de charges,
  // 79 reprises…), hors ventes 70x et produits financiers 77x. Sans ce poste,
  // une écriture sur 758 par exemple n'apparaissait nulle part au compte de
  // résultat, et le résultat net divergeait du résultat de l'exercice au bilan.
  const autresProduits = balance
    .filter((r) => r.class_num === 7 && !has(r, '70', '77'))
    .reduce((s, r) => s + (r.total_credit - r.total_debit), 0);

  const ebe          = margeBrute + autresProduits
    - (transports + servicesExterieurs + effectiveTaxes + effectivePersonnel + autresCharges);
  const dotations    = sumRange('68');
  const resultatExpl = ebe - dotations;

  const produitsFinanciers = balance
    .filter((r) => r.account_code.startsWith('77'))
    .reduce((s, r) => s + (r.total_credit - r.total_debit), 0);

  // Charges financières : 67x + intérêts d'emprunt codés en 661/671.
  const chargesFinancieres = sumRange('67') + interetsEmprunts;
  const resultatFinancier  = produitsFinanciers - chargesFinancieres;

  // Hors activités ordinaires (classe 8) : produits − charges HAO. Le bilan
  // (computeBalanceSheet) les intègre au résultat de l'exercice ; le compte de
  // résultat doit donc les porter aussi, sinon RÉSULTAT NET ≠ résultat au
  // passif dès qu'un compte 8x est mouvementé.
  const resultatHAO = balance
    .filter((r) => r.class_num === 8)
    .reduce((s, r) => s + (r.total_credit - r.total_debit), 0);

  const resultatAvantImpot = resultatExpl + resultatFinancier + resultatHAO;
  const impots             = sumRange('69');
  const resultatNet        = resultatAvantImpot - impots;

  return {
    ventesGross, rrrAccordes, caNet, achatsMarchandises, margeBrute, autresProduits,
    transports, servicesExterieurs, impotsTaxes: effectiveTaxes, chargesPersonnel: effectivePersonnel,
    autresCharges, ebe, dotations, resultatExpl, produitsFinanciers, chargesFinancieres,
    resultatFinancier, resultatHAO, resultatAvantImpot, impots, resultatNet,
  };
}

/**
 * Bilan simplifié. `balance` DOIT être la balance CUMULÉE (depuis l'origine
 * jusqu'à la date de clôture) — un bilan sur les seuls mouvements d'une période
 * n'a aucun sens. Le résultat de la période n'étant pas journalisé (pas
 * d'écriture 13x), il est réinjecté ici via `resultatExercice` pour que
 * ACTIF = PASSIF ; `ecartBilan` doit rester nul.
 */
export function computeBalanceSheet(balance: TrialBalanceLine[]): BalanceSheet {
  // Routage en UN passage : chaque compte de classe 1 à 5 est ventilé selon le
  // SENS de son solde (part débitrice → actif, part créditrice → passif). Ainsi
  //   Σ actif − Σ passif(comptes) = Σ(classes 1..5) = − Σ(classes 6..8)
  // et le résultat de la période (non journalisé) réinjecté au passif fait
  // TOUJOURS coller ACTIF = PASSIF. `ecartBilan` ne bouge que si une écriture
  // est elle-même déséquilibrée.
  let actifImmobilise = 0, stocks = 0, tresorerie = 0, creancesClients = 0,
      tvaRecuperable = 0, autresActifCT = 0;
  let capitaux = 0, dettesLT = 0, dettesFF = 0, dettesFiscales = 0,
      dettesSociales = 0, decouvertsBancaires = 0, autresDettesCT = 0;

  for (const r of balance) {
    const bal = round2((r.total_debit || 0) - (r.total_credit || 0));
    if (Math.abs(bal) < 0.005) continue;
    const code = r.account_code;
    const dr = Math.max(0, bal);    // part actif
    const cr = Math.max(0, -bal);   // part passif

    switch (r.class_num) {
      case 2: actifImmobilise += dr - cr; break;   // net des amortissements (28x créditeurs)
      case 3: stocks += dr - cr; break;
      case 5:
        if (code.startsWith('16')) { dettesLT += cr; autresActifCT += dr; }
        else { tresorerie += dr; decouvertsBancaires += cr; }
        break;
      case 1:
        if (code.startsWith('16')) { dettesLT += cr; autresActifCT += dr; }
        else { capitaux += cr - dr; }                                     // 10x/11x/12x/13x : report & résultat inclus
        break;
      case 4:
        if (code.startsWith('419'))       { autresDettesCT += cr; autresActifCT += dr; }
        else if (code.startsWith('41'))   { creancesClients += dr; autresDettesCT += cr; }
        else if (code === '4451')         { tvaRecuperable += dr; dettesFiscales += cr; }
        else if (code.startsWith('44'))   { dettesFiscales += cr; autresActifCT += dr; }
        else if (code.startsWith('40'))   { dettesFF += cr; autresActifCT += dr; }
        else if (code.startsWith('42') || code.startsWith('43')) { dettesSociales += cr; autresActifCT += dr; }
        else                              { autresActifCT += dr; autresDettesCT += cr; }
        break;
      default: break; // classes 6/7/8/9 → via resultatExercice
    }
  }

  const totalActif = round2(actifImmobilise + stocks + creancesClients + tvaRecuperable + autresActifCT + tresorerie);

  // Résultat de la période = produits (cl. 7) − charges (cl. 6) ± HAO (cl. 8).
  // Calculé directement sur la balance ⇒ capte TOUS les comptes de gestion,
  // pas seulement ceux ventilés par le compte de résultat détaillé.
  const resultatExercice = round2(balance.reduce((s, r) => {
    if (r.class_num === 7) return s + (r.total_credit - r.total_debit);
    if (r.class_num === 6) return s - (r.total_debit - r.total_credit);
    if (r.class_num === 8) return s + (r.total_credit - r.total_debit);
    return s;
  }, 0));

  const totalPassif = round2(
    capitaux + resultatExercice + dettesLT + dettesFF + dettesFiscales +
    dettesSociales + decouvertsBancaires + autresDettesCT,
  );
  const ecartBilan = round2(totalActif - totalPassif);

  return {
    actifImmobilise: round2(actifImmobilise), stocks: round2(stocks),
    creancesClients: round2(creancesClients), tvaRecuperable: round2(tvaRecuperable),
    autresActifCT: round2(autresActifCT), tresorerie: round2(tresorerie), totalActif,
    capitaux: round2(capitaux), resultatExercice,
    dettesLT: round2(dettesLT), dettesFF: round2(dettesFF), dettesFiscales: round2(dettesFiscales),
    dettesSociales: round2(dettesSociales), decouvertsBancaires: round2(decouvertsBancaires),
    autresDettesCT: round2(autresDettesCT), totalPassif, ecartBilan,
  };
}

// --- Synchronisation honoraires ----------------------------------------------
//
// Synce les honoraires_cabinet payés (status = 'payé' | 'partiel').
// Écriture :
//   Débit  571 (Caisse)   : montant_paye
//   Crédit 7061 (Honoraires) : montant_paye

export async function syncHonorairesAccounting(businessId: string): Promise<number> {
  const existing = await _fetchAllRows<{ source_id: string | null }>((from, to) =>
    db('journal_entries')
      .select('source_id')
      .eq('business_id', businessId)
      .eq('source', 'honoraires')
      .order('id', { ascending: true })
      .range(from, to),
  );
  const synced = new Set(existing.map((e) => e.source_id));

  type _HonRow = {
    id: string; client_name: string; type_prestation: string;
    date_facture: string; montant_paye: number; status: string;
  };
  // Paginé — sinon plafonné à 1000 lignes par PostgREST : au-delà, les
  // honoraires suivants ne seraient jamais synchronisés.
  const rows = await _fetchAllRows<_HonRow>((from, to) =>
    supabase
      .from('honoraires_cabinet')
      .select('id, client_name, type_prestation, date_facture, montant_paye, status')
      .eq('business_id', businessId)
      .in('status', ['payé', 'partiel'])
      .gt('montant_paye', 0)
      .order('id', { ascending: true })
      .range(from, to) as unknown as _Rows<_HonRow>,
  );

  let count = 0;
  for (const h of rows) {
    if (synced.has(h.id)) continue;
    const amount = round2(Number(h.montant_paye) || 0);
    if (amount <= 0) continue;

    const ok = await _insertBalancedEntry(
      {
        business_id: businessId,
        entry_date:  h.date_facture,
        reference:   `HON-${h.id.slice(0, 8).toUpperCase()}`,
        description: `Honoraires — ${h.client_name} (${h.type_prestation})`,
        source:      'honoraires',
        source_id:   h.id,
      },
      [
        { account_code: '571',  account_name: acctName('571'),  debit: amount, credit: 0 },
        { account_code: '7061', account_name: acctName('7061'), debit: 0,      credit: amount },
      ],
    );
    if (ok) count++;
  }
  return count;
}

// --- Synchronisation ordres de service (prestations) -------------------------
//
// Synce les service_orders avec status = 'paye'.
// Écriture :
//   Débit  571/576/521 (Caisse selon méthode) : paid_amount
//   Crédit 7065 (Prestations de services)     : paid_amount

export async function syncServiceOrdersAccounting(businessId: string): Promise<number> {
  const { data: rpcData, error: rpcError } = await rpc('sync_service_orders_accounting', {
    p_business_id: businessId,
  });

  if (!rpcError) return Number(rpcData ?? 0);

  const rpcMessage = `${rpcError.code ?? ''} ${rpcError.message ?? ''}`;
  if (!rpcMessage.includes('sync_service_orders_accounting')) {
    throw new Error(rpcError.message);
  }

  const existing = await _fetchAllRows<{ source_id: string | null }>((from, to) =>
    db('journal_entries')
      .select('source_id')
      .eq('business_id', businessId)
      .eq('source', 'service_order')
      .order('id', { ascending: true })
      .range(from, to),
  );
  const synced = new Set(existing.map((e) => e.source_id));

  type _SoRow = {
    id: string; order_number: number; paid_amount: number;
    payment_method: string | null; paid_at: string | null;
    subject_ref: string | null; client_name: string | null;
  };
  // Paginé — sinon plafonné à 1000 lignes par PostgREST.
  const rows = await _fetchAllRows<_SoRow>((from, to) =>
    supabase
      .from('service_orders')
      .select('id, order_number, paid_amount, payment_method, paid_at, subject_ref, client_name')
      .eq('business_id', businessId)
      .eq('status', 'paye')
      .gt('paid_amount', 0)
      .order('id', { ascending: true })
      .range(from, to) as unknown as _Rows<_SoRow>,
  );

  let count = 0;
  for (const o of rows) {
    if (synced.has(o.id)) continue;
    const amount = round2(Number(o.paid_amount) || 0);
    if (amount <= 0) continue;

    const entryDate = (o.paid_at ?? new Date().toISOString()).slice(0, 10);
    const debitCode = o.payment_method === 'mobile' || o.payment_method === 'mobile_money' ? '576'
      : o.payment_method === 'card' || o.payment_method === 'bank' ? '521'
      : '571';

    const desc = `Prestation OT-${String(o.order_number).padStart(4, '0')}${o.subject_ref ? ` — ${o.subject_ref}` : ''}${o.client_name ? ` / ${o.client_name}` : ''}`;

    const ok = await _insertBalancedEntry(
      {
        business_id: businessId,
        entry_date:  entryDate,
        reference:   `OT-${String(o.order_number).padStart(4, '0')}`,
        description: desc,
        source:      'service_order',
        source_id:   o.id,
      },
      [
        { account_code: debitCode, account_name: acctName(debitCode, 'Caisse'), debit: amount, credit: 0 },
        { account_code: '7065',    account_name: acctName('7065'),              debit: 0,      credit: amount },
      ],
    );
    if (ok) count++;
  }
  return count;
}
