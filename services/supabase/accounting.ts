import { supabase } from './client';
import type { Json } from './database.types';

const db  = supabase.from.bind(supabase);
const rpc = supabase.rpc.bind(supabase);

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

export async function getAccounts(businessId: string): Promise<Account[]> {
  const { data, error } = await db('accounts')
    .select('*')
    .or(`business_id.eq.${businessId},business_id.is.null`)
    .eq('is_active', true)
    .order('code');
  if (error) throw new Error(error.message);
  return (data ?? []) as Account[];
}

export async function createAccount(
  businessId: string,
  input: { code: string; name: string; nature: Account['nature']; balance_type: Account['balance_type'] }
): Promise<Account> {
  const classNum = parseInt(input.code.charAt(0), 10);
  if (isNaN(classNum) || classNum < 1 || classNum > 8) {
    throw new Error('Le numéro de compte doit commencer par un chiffre de 1 à 8');
  }
  const { data: existing } = await db('accounts')
    .select('id')
    .eq('code', input.code)
    .or(`business_id.eq.${businessId},business_id.is.null`)
    .eq('is_active', true)
    .maybeSingle();
  if (existing) throw new Error(`Le compte ${input.code} existe déjà dans votre plan comptable`);

  const { data, error } = await db('accounts')
    .insert({
      business_id: businessId,
      code: input.code.trim(),
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
  // Vérifier l'équilibre Débit = Crédit
  const totalDebit  = input.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = input.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Écriture déséquilibrée : Débit ${totalDebit} ≠ Crédit ${totalCredit}`);
  }

  const { data: entry, error: entryErr } = await db('journal_entries')
    .insert({
      business_id: input.businessId,
      entry_date:  input.entry_date,
      reference:   input.reference ?? null,
      description: input.description,
      source:      'manual',
      source_id:   input.source_id ?? null,
    })
    .select()
    .single();
  if (entryErr) throw new Error(entryErr.message);

  const { error: linesErr } = await db('journal_lines')
    .insert(input.lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesErr) throw new Error(linesErr.message);

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
async function _fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
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

/** Insère `rows` par lots de `batchSize` — un seul aller-retour réseau par
 *  lot plutôt qu'un insert par ligne, indispensable dès que le volume
 *  dépasse quelques dizaines d'enregistrements. */
async function _insertInBatches<TReturn = unknown, TRow = unknown>(
  rows: TRow[],
  batchSize: number,
  build: (batch: TRow[]) => PromiseLike<{ data: TReturn[] | null; error: { message: string } | null }>,
): Promise<TReturn[]> {
  const all: TReturn[] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    if (rows.length === 0) break;
    const { data, error } = await build(rows.slice(i, i + batchSize));
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
  }
  return all;
}

export async function syncAccounting(businessId: string): Promise<number> {
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

  // ── Orders ──────────────────────────────────────────────────────────────────
  // Insertion par lots (entries d'abord, puis leurs lignes une fois les id
  // connus) plutôt qu'un aller-retour réseau par commande : sur un historique
  // de plusieurs milliers de commandes, la version ligne-par-ligne prenait
  // littéralement des dizaines de minutes (2 requêtes séquentielles × N
  // commandes). Ici, tout l'historique tient en une poignée de lots.
  const entryRows = unsynced.map((o) => {
    const isRefund = o.status === 'refunded';
    const ref      = '#' + o.id.slice(0, 8).toUpperCase();
    const isRS     = o.order_channel === 'room_service';
    return {
      business_id: businessId,
      entry_date:  (isRefund ? o.updated_at : o.created_at).slice(0, 10),
      reference:   ref,
      description: isRefund ? `Remboursement ${ref}` : `${isRS ? 'Room Service' : 'Vente'} ${ref}`,
      source:      isRefund ? 'refund' : 'order',
      source_id:   o.id,
    };
  });

  const insertedEntries = await _insertInBatches(
    entryRows, 500,
    (batch) => db('journal_entries').insert(batch).select('id, source_id'),
  );
  const entryIdBySourceId = new Map(insertedEntries.map((e) => [e.source_id, e.id]));

  const allLines: _LineInput[] = [];
  for (const o of unsynced) {
    const entryId = entryIdBySourceId.get(o.id);
    if (!entryId) continue; // insertion de cette écriture a échoué/sautée — pas de lignes orphelines

    const isRefund = o.status === 'refunded';
    const isRS     = o.order_channel === 'room_service';
    const total    = Number(o.total);
    const subtotal = Number(o.subtotal);
    const tax      = Number(o.tax_amount);
    const discount = Number(o.discount_amount);
    const pays     = (payMap[o.id] ?? []).filter((p) => p.method !== 'free' && Number(p.amount) > 0);

    if (!isRefund) {
      // Debit: one line per payment method
      if (pays.length > 0) {
        for (const p of pays) {
          const acc = _payMethodToAccount(p.method);
          allLines.push({ entry_id: entryId, account_code: acc.code, account_name: acc.name, debit: Number(p.amount), credit: 0 });
        }
      } else if (total > 0) {
        // Fallback if payments table has no record
        allLines.push({ entry_id: entryId, account_code: '571', account_name: 'Caisse', debit: total, credit: 0 });
      }
      if (discount > 0) {
        allLines.push({ entry_id: entryId, account_code: '7091', account_name: 'RRR accordés sur ventes', debit: discount, credit: 0 });
      }
      // Credit: revenue account (706 for room service, 701 for regular sales)
      const revCode = isRS ? '706' : '701';
      const revName = isRS ? 'Services rendus' : 'Ventes de marchandises';
      if (subtotal > 0) allLines.push({ entry_id: entryId, account_code: revCode, account_name: revName, debit: 0, credit: subtotal });
      if (tax > 0)      allLines.push({ entry_id: entryId, account_code: '4441', account_name: 'TVA facturée (collectée)', debit: 0, credit: tax });
    } else {
      // Refund: reverse of the original sale
      if (subtotal > 0) allLines.push({ entry_id: entryId, account_code: '701', account_name: 'Ventes de marchandises', debit: subtotal, credit: 0 });
      if (tax > 0)      allLines.push({ entry_id: entryId, account_code: '4441', account_name: 'TVA facturée (collectée)', debit: tax, credit: 0 });
      if (total > 0)    allLines.push({ entry_id: entryId, account_code: '571', account_name: 'Caisse', debit: 0, credit: total });
    }
  }
  await _insertInBatches(allLines, 1000, (batch) => db('journal_lines').insert(batch));

  let count = insertedEntries.length;

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
    const totalCost = Math.round(Number(s.quantity) * Number(s.cost_per_unit) * 100) / 100;
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

  const insertedStockEntries = await _insertInBatches(
    stockEntryRows, 500,
    (batch) => db('journal_entries').insert(batch).select('id, source_id'),
  );

  const stockLines: _LineInput[] = [];
  for (const e of insertedStockEntries) {
    const totalCost = e.source_id ? stockCostBySourceId.get(e.source_id) : undefined;
    if (!totalCost) continue;
    stockLines.push(
      { entry_id: e.id, account_code: '601', account_name: 'Achats de marchandises', debit: totalCost, credit: 0 },
      { entry_id: e.id, account_code: '401', account_name: 'Fournisseurs',           debit: 0,         credit: totalCost },
    );
  }
  await _insertInBatches(stockLines, 1000, (batch) => db('journal_lines').insert(batch));

  count += insertedStockEntries.length;

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
  tresorerie:      number;  // 521, 571, 576
  totalActif:      number;
  // PASSIF
  capitaux:        number;  // class 1
  dettesLT:        number;  // 161
  dettesFF:        number;  // 401
  dettesFiscales:  number;  // 441, 444, 4441
  dettesSociales:  number;  // 421, 431, 646
  autresDettesCT:  number;  // other class 4 credit
  totalPassif:     number;
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
  const { data: existingAll } = await db('journal_entries')
    .select('source_id')
    .eq('business_id', businessId)
    .eq('source', 'hotel');
  const syncedSet = new Set((existingAll ?? []).map((e: { source_id: string | null }) => e.source_id));

  let count = 0;

  // --- 1. Sync hotel_payments (acomptes + paiements au check-out) ----------
  // source = 'hotel', source_id = payment UUID - distinct des réservations car UUIDs différents
  // Chaque paiement reçu génère : Débit 571/521 · Crédit 706
  const syncedPayments = syncedSet; // même ensemble : source='hotel', source_id=uuid

  const { data: payments, error: payErr } = await supabase
    .from('hotel_payments')
    .select('id, amount, method, paid_at, reservation_id')
    .eq('business_id', businessId);
  if (payErr) throw new Error(payErr.message);

  // Récupérer les infos réservations en une seule requête pour les descriptions
  const reservationIds = [...new Set((payments ?? []).map((p: { reservation_id: string }) => p.reservation_id))];
  let resInfoMap: Record<string, { room: string; guest: string }> = {};
  if (reservationIds.length > 0) {
    const { data: resInfo } = await supabase
      .from('hotel_reservations')
      .select('id, room:hotel_rooms!room_id(number), guest:hotel_guests!guest_id(full_name)')
      .in('id', reservationIds);
    for (const r of (resInfo ?? []) as { id: string; room: { number: string } | null; guest: { full_name: string } | null }[]) {
      resInfoMap[r.id] = { room: r.room?.number ?? '', guest: r.guest?.full_name ?? 'Client' };
    }
  }

  for (const p of (payments ?? []) as {
    id: string; amount: number; method: string; paid_at: string; reservation_id: string;
  }[]) {
    if (syncedPayments.has(p.id)) continue;

    const entryDate = p.paid_at.slice(0, 10);
    const debit = p.method === 'card'
      ? { code: '521', name: 'Banque / Carte' }
      : { code: '571', name: p.method === 'mobile_money' ? 'Caisse / Mobile' : 'Caisse' };

    const info    = resInfoMap[p.reservation_id] ?? { room: '', guest: 'Client' };
    const desc    = `Paiement hôtel${info.room ? ` - Ch.${info.room}` : ''} - ${info.guest}`;

    const { data: entry, error: entryErr } = await db('journal_entries')
      .insert({ business_id: businessId, entry_date: entryDate, description: desc, source: 'hotel', source_id: p.id })
      .select().single();
    if (entryErr) throw new Error(`Erreur journal_entries: ${entryErr.message}`);
    if (!entry) continue;

    const { error: linesErr } = await db('journal_lines').insert([
      { entry_id: entry.id, account_code: debit.code, account_name: debit.name, debit: Number(p.amount), credit: 0 },
      { entry_id: entry.id, account_code: '706', account_name: 'Prestations hébergement', debit: 0, credit: Number(p.amount) },
    ]);
    if (linesErr) throw new Error(`Erreur journal_lines: ${linesErr.message}`);
    count++;
  }

  // --- 2. Sync réservations clôturées SANS hotel_payments ------------------
  // (rétrocompatibilité + séjours sans paiement enregistré)
  const { data: reservations, error: resErr } = await supabase
    .from('hotel_reservations')
    .select('id, actual_check_out, check_out, total, paid_amount, room:hotel_rooms(number), guest:hotel_guests(full_name)')
    .eq('business_id', businessId)
    .eq('status', 'checked_out');
  if (resErr) throw new Error(resErr.message);

  for (const res of (reservations ?? []) as {
    id: string; actual_check_out: string | null; check_out: string;
    total: number; paid_amount: number;
    room: { number: string } | null; guest: { full_name: string } | null;
  }[]) {
    if (syncedSet.has(res.id)) continue; // déjà sync (ancienne logique)

    // Vérifier s'il existe des hotel_payments pour cette réservation
    const { data: hasPay } = await supabase
      .from('hotel_payments')
      .select('id')
      .eq('reservation_id', res.id)
      .limit(1);
    if ((hasPay ?? []).length > 0) continue; // couvert par la section 1

    const entryDate   = (res.actual_check_out ?? res.check_out).slice(0, 10);
    const roomLabel   = res.room?.number ? `Ch.${res.room.number}` : '';
    const guestLabel  = res.guest?.full_name ?? 'Client';
    const description = `Séjour hôtel${roomLabel ? ` - ${roomLabel}` : ''} - ${guestLabel}`;
    const total       = Number(res.total);
    const paid        = Number(res.paid_amount);
    const outstanding = Math.max(0, total - paid);

    const lines: { account_code: string; account_name: string; debit: number; credit: number }[] = [];
    if (paid > 0)           lines.push({ account_code: '571', account_name: 'Caisse',                   debit: paid,        credit: 0 });
    if (outstanding > 0.01) lines.push({ account_code: '411', account_name: 'Clients',                  debit: outstanding, credit: 0 });
    lines.push(              { account_code: '706', account_name: 'Prestations hébergement', debit: 0,           credit: total });

    const { data: entry, error: entryErr2 } = await db('journal_entries')
      .insert({ business_id: businessId, entry_date: entryDate, description, source: 'hotel', source_id: res.id })
      .select().single();
    if (entryErr2) throw new Error(`Erreur journal_entries (séjour): ${entryErr2.message}`);
    if (!entry) continue;
    const { error: linesErr2 } = await db('journal_lines').insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
    if (linesErr2) throw new Error(`Erreur journal_lines (séjour): ${linesErr2.message}`);
    count++;
  }

  return count;
}

export function computeIncomeStatement(balance: TrialBalanceLine[]): IncomeStatement {
  const sumRange = (prefix: string) =>
    balance
      .filter((r) => r.account_code.startsWith(prefix))
      .reduce((s, r) => s + (r.total_debit - r.total_credit), 0);

  // CA = somme de tous les comptes 70x (ventes + prestations), hors 709x (RRR)
  const ventesGross = balance
    .filter((r) => r.account_code.startsWith('70') && !r.account_code.startsWith('709'))
    .reduce((s, r) => s + (r.total_credit - r.total_debit), 0);
  
  const rrrAccordes        = balance
    .filter((r) => r.account_code.startsWith('709'))
    .reduce((s, r) => s + (r.total_debit - r.total_credit), 0);

  const caNet              = ventesGross - rrrAccordes;
  const achatsMarchandises = sumRange('601');
  const margeBrute         = caNet - achatsMarchandises;

  // Détails des charges
  const transports         = sumRange('61');
  const servicesExterieurs = sumRange('62') + sumRange('63');
  const impotsTaxes        = sumRange('64'); 
  const chargesPersonnel   = sumRange('66'); 
  
  // Si le personnel a été mis en 64 (comme dans OP_TEMPLATES 641/646)
  const personnelIn64 = balance
    .filter((r) => r.account_code.startsWith('641') || r.account_code.startsWith('646'))
    .reduce((s, r) => s + (r.total_debit - r.total_credit), 0);
  
  const effectivePersonnel = chargesPersonnel + personnelIn64;
  const effectiveTaxes     = Math.max(0, impotsTaxes - personnelIn64);

  const totalKnownCharges = achatsMarchandises + transports + servicesExterieurs + effectiveTaxes + effectivePersonnel;
  const autresCharges = balance
    .filter((r) => r.class_num === 6 && !['601','61','62','63','64','66','68','69','67'].some(p => r.account_code.startsWith(p)))
    .reduce((s, r) => s + (r.total_debit - r.total_credit), 0);

  const ebe                = margeBrute - (transports + servicesExterieurs + effectiveTaxes + effectivePersonnel + autresCharges);
  const dotations          = sumRange('68');
  const resultatExpl       = ebe - dotations;

  const produitsFinanciers = balance
    .filter((r) => r.account_code.startsWith('77'))
    .reduce((s, r) => s + (r.total_credit - r.total_debit), 0);
  
  const chargesFinancieres = sumRange('67');
  const resultatFinancier  = produitsFinanciers - chargesFinancieres;
  
  const resultatAvantImpot = resultatExpl + resultatFinancier;
  const impots             = sumRange('69');
  const resultatNet        = resultatAvantImpot - impots;

  return {
    ventesGross, rrrAccordes, caNet, achatsMarchandises, margeBrute,
    transports, servicesExterieurs, impotsTaxes: effectiveTaxes, chargesPersonnel: effectivePersonnel,
    autresCharges, ebe, dotations, resultatExpl, produitsFinanciers, chargesFinancieres,
    resultatFinancier, resultatAvantImpot, impots, resultatNet,
  };
}

export function computeBalanceSheet(balance: TrialBalanceLine[]): BalanceSheet {
  const getBalance = (code: string) => {
    const row = balance.find((r) => r.account_code === code);
    if (!row) return 0;
    return row.total_debit - row.total_credit;
  };
  const sumCodes = (...codes: string[]) => codes.reduce((s, c) => s + getBalance(c), 0);
  const sumClass = (cls: number) =>
    balance.filter((r) => r.class_num === cls).reduce((s, r) => s + r.total_debit - r.total_credit, 0);

  const actifImmobilise = Math.max(0, sumClass(2));
  const stocks          = Math.max(0, sumClass(3));
  const tresorerie      = Math.max(0, sumCodes('521','571','576','531'));
  const creancesClients = Math.max(0, getBalance('411'));
  const tvaRecuperable  = Math.max(0, getBalance('4451'));
  const autresActifCT   = Math.max(0,
    balance
      .filter((r) => r.class_num === 4 && !['401','411','4441','421','431','441','444','4451','419'].includes(r.account_code))
      .reduce((s, r) => s + Math.max(0, r.total_debit - r.total_credit), 0)
  );
  const totalActif = actifImmobilise + stocks + creancesClients + tvaRecuperable + autresActifCT + tresorerie;

  // Passif
  const capitauxBrut = sumClass(1);
  const capitaux     = Math.max(0, -capitauxBrut); // class 1 is credit-normal → negative balance = positive capital
  const dettesLT     = Math.max(0, -getBalance('161'));
  const dettesFF     = Math.max(0, -getBalance('401'));
  const dettesFiscales = Math.max(0, -(getBalance('441') + getBalance('444') + getBalance('4441')));
  const dettesSociales = Math.max(0, -(getBalance('421') + getBalance('431')));
  const autresDettesCT = Math.max(0,
    balance
      .filter((r) => r.class_num === 4 && !['401','411','4441','421','431','441','444','4451','419'].includes(r.account_code))
      .reduce((s, r) => s + Math.max(0, -(r.total_debit - r.total_credit)), 0)
  );
  const totalPassif = capitaux + dettesLT + dettesFF + dettesFiscales + dettesSociales + autresDettesCT;

  return {
    actifImmobilise, stocks, creancesClients, tvaRecuperable,
    autresActifCT, tresorerie, totalActif,
    capitaux, dettesLT, dettesFF, dettesFiscales, dettesSociales,
    autresDettesCT, totalPassif,
  };
}

// --- Synchronisation honoraires ----------------------------------------------
//
// Synce les honoraires_cabinet payés (status = 'payé' | 'partiel').
// Écriture :
//   Débit  571 (Caisse)   : montant_paye
//   Crédit 7061 (Honoraires) : montant_paye

export async function syncHonorairesAccounting(businessId: string): Promise<number> {
  const { data: existing } = await db('journal_entries')
    .select('source_id')
    .eq('business_id', businessId)
    .eq('source', 'honoraires');
  const synced = new Set((existing ?? []).map((e: { source_id: string | null }) => e.source_id));

  const { data: rows, error } = await supabase
    .from('honoraires_cabinet')
    .select('id, client_name, type_prestation, date_facture, montant_paye, status')
    .eq('business_id', businessId)
    .in('status', ['payé', 'partiel'])
    .gt('montant_paye', 0);
  if (error) throw new Error(error.message);

  let count = 0;
  for (const h of (rows ?? []) as {
    id: string; client_name: string; type_prestation: string;
    date_facture: string; montant_paye: number; status: string;
  }[]) {
    if (synced.has(h.id)) continue;

    const { data: entry, error: eErr } = await db('journal_entries')
      .insert({
        business_id: businessId,
        entry_date:  h.date_facture,
        reference:   `HON-${h.id.slice(0, 8).toUpperCase()}`,
        description: `Honoraires — ${h.client_name} (${h.type_prestation})`,
        source:      'honoraires',
        source_id:   h.id,
      })
      .select('id').single();
    if (eErr) throw new Error(eErr.message);

    const { error: lErr } = await db('journal_lines').insert([
      { entry_id: entry.id, account_code: '571',  account_name: 'Caisse',       debit: Number(h.montant_paye), credit: 0 },
      { entry_id: entry.id, account_code: '7061', account_name: 'Honoraires',   debit: 0, credit: Number(h.montant_paye) },
    ]);
    if (lErr) throw new Error(lErr.message);
    count++;
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

  const { data: existing } = await db('journal_entries')
    .select('source_id')
    .eq('business_id', businessId)
    .eq('source', 'service_order');
  const synced = new Set((existing ?? []).map((e: { source_id: string | null }) => e.source_id));

  const { data: rows, error } = await supabase
    .from('service_orders')
    .select('id, order_number, paid_amount, payment_method, paid_at, subject_ref, client_name')
    .eq('business_id', businessId)
    .eq('status', 'paye')
    .gt('paid_amount', 0);
  if (error) throw new Error(error.message);

  let count = 0;
  for (const o of (rows ?? []) as {
    id: string; order_number: number; paid_amount: number;
    payment_method: string | null; paid_at: string | null;
    subject_ref: string | null; client_name: string | null;
  }[]) {
    if (synced.has(o.id)) continue;

    const entryDate = (o.paid_at ?? new Date().toISOString()).slice(0, 10);
    const debitAccount = o.payment_method === 'mobile' || o.payment_method === 'mobile_money'
      ? { code: '576', name: 'Mobile Money' }
      : o.payment_method === 'card' || o.payment_method === 'bank'
      ? { code: '521', name: 'Banques — comptes courants' }
      : { code: '571', name: 'Caisse' };

    const desc = `Prestation OT-${String(o.order_number).padStart(4, '0')}${o.subject_ref ? ` — ${o.subject_ref}` : ''}${o.client_name ? ` / ${o.client_name}` : ''}`;

    const { data: entry, error: eErr } = await db('journal_entries')
      .insert({
        business_id: businessId,
        entry_date:  entryDate,
        reference:   `OT-${String(o.order_number).padStart(4, '0')}`,
        description: desc,
        source:      'service_order',
        source_id:   o.id,
      })
      .select('id').single();
    if (eErr) throw new Error(eErr.message);

    const { error: lErr } = await db('journal_lines').insert([
      { entry_id: entry.id, account_code: debitAccount.code, account_name: debitAccount.name, debit: Number(o.paid_amount), credit: 0 },
      { entry_id: entry.id, account_code: '7065', account_name: 'Prestations de services', debit: 0, credit: Number(o.paid_amount) },
    ]);
    if (lErr) throw new Error(lErr.message);
    count++;
  }
  return count;
}
