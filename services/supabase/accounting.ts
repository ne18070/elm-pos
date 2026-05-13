// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db  = (s: unknown) => (s as any).from.bind(s);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _rpc = (s: unknown) => (s as any).rpc.bind(s);

import { supabase } from './client';

const db  = _db(supabase);
const rpc = _rpc(supabase);

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
  let q = db('journal_entries')
    .select(`*, lines:journal_lines(*)`)
    .eq('business_id', businessId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 500);

  if (opts?.dateFrom) q = q.gte('entry_date', opts.dateFrom);
  if (opts?.dateTo)   q = q.lte('entry_date', opts.dateTo);
  if (opts?.source)   q = q.eq('source', opts.source);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as JournalEntry[];
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

  return { ...entry, lines: input.lines } as JournalEntry;
}

export async function deleteManualEntry(entryId: string): Promise<void> {
  const { error } = await db('journal_entries')
    .delete()
    .eq('id', entryId)
    .eq('source', 'manual');
  if (error) throw new Error(error.message);
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

export async function syncAccounting(businessId: string): Promise<number> {
  // Collect already-synced IDs to avoid duplicates
  const { data: existing } = await db('journal_entries')
    .select('source_id')
    .eq('business_id', businessId)
    .in('source', ['order', 'refund']);
  const synced = new Set((existing ?? []).map((e: { source_id: string }) => e.source_id));

  // Fetch all relevant orders
  const { data: orders, error: oErr } = await (supabase as any)
    .from('orders')
    .select('id, created_at, updated_at, status, subtotal, tax_amount, discount_amount, total, order_channel')
    .eq('business_id', businessId)
    .in('status', ['paid', 'pending', 'refunded'])
    .order('created_at', { ascending: true });
  if (oErr) throw new Error(oErr.message);

  const orderList = (orders ?? []) as _OrderRow[];
  const unsynced  = orderList.filter((o) => !synced.has(o.id));
  if (unsynced.length === 0) return 0;

  // Batch-fetch payments for unsynced orders
  const ids = unsynced.map((o) => o.id);
  const { data: allPayments } = await (supabase as any)
    .from('payments')
    .select('order_id, method, amount')
    .in('order_id', ids);

  const payMap: Record<string, _PayRow[]> = {};
  for (const p of (allPayments ?? []) as _PayRow[]) {
    (payMap[p.order_id] ??= []).push(p);
  }

  let count = 0;

  // ── Orders ──────────────────────────────────────────────────────────────────
  for (const o of unsynced) {
    const isRefund  = o.status === 'refunded';
    const entryDate = (isRefund ? o.updated_at : o.created_at).slice(0, 10);
    const ref       = '#' + o.id.slice(0, 8).toUpperCase();
    const isRS      = o.order_channel === 'room_service';
    const desc      = isRefund
      ? `Remboursement ${ref}`
      : `${isRS ? 'Room Service' : 'Vente'} ${ref}`;
    const source    = isRefund ? 'refund' : 'order';

    const { data: entry, error: eErr } = await db('journal_entries')
      .insert({ business_id: businessId, entry_date: entryDate, reference: ref, description: desc, source, source_id: o.id })
      .select('id').single();
    if (eErr) throw new Error(eErr.message);
    if (!entry) continue;

    const lines: _LineInput[] = [];
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
          lines.push({ entry_id: entry.id, account_code: acc.code, account_name: acc.name, debit: Number(p.amount), credit: 0 });
        }
      } else if (total > 0) {
        // Fallback if payments table has no record
        lines.push({ entry_id: entry.id, account_code: '571', account_name: 'Caisse', debit: total, credit: 0 });
      }
      if (discount > 0) {
        lines.push({ entry_id: entry.id, account_code: '7091', account_name: 'RRR accordés sur ventes', debit: discount, credit: 0 });
      }
      // Credit: revenue account (706 for room service, 701 for regular sales)
      const revCode = isRS ? '706' : '701';
      const revName = isRS ? 'Services rendus' : 'Ventes de marchandises';
      if (subtotal > 0) lines.push({ entry_id: entry.id, account_code: revCode, account_name: revName, debit: 0, credit: subtotal });
      if (tax > 0)      lines.push({ entry_id: entry.id, account_code: '4441', account_name: 'TVA facturée (collectée)', debit: 0, credit: tax });
    } else {
      // Refund: reverse of the original sale
      if (subtotal > 0) lines.push({ entry_id: entry.id, account_code: '701', account_name: 'Ventes de marchandises', debit: subtotal, credit: 0 });
      if (tax > 0)      lines.push({ entry_id: entry.id, account_code: '4441', account_name: 'TVA facturée (collectée)', debit: tax, credit: 0 });
      if (total > 0)    lines.push({ entry_id: entry.id, account_code: '571', account_name: 'Caisse', debit: 0, credit: total });
    }

    if (lines.length > 0) {
      const { error: lErr } = await db('journal_lines').insert(lines);
      if (lErr) throw new Error(lErr.message);
    }
    count++;
  }

  // ── Stock purchases (achats) ─────────────────────────────────────────────
  const { data: syncedStock } = await db('journal_entries')
    .select('source_id')
    .eq('business_id', businessId)
    .eq('source', 'stock');
  const syncedStockSet = new Set((syncedStock ?? []).map((e: { source_id: string }) => e.source_id));

  const { data: stockRows, error: sErr } = await (supabase as any)
    .from('stock_entries')
    .select('id, created_at, quantity, cost_per_unit, supplier, product:products(name)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true });
  if (sErr) throw new Error(sErr.message);

  for (const s of (stockRows ?? []) as {
    id: string; created_at: string; quantity: number;
    cost_per_unit: number; supplier: string | null;
    product: { name: string } | null;
  }[]) {
    if (syncedStockSet.has(s.id)) continue;
    const totalCost = Math.round(Number(s.quantity) * Number(s.cost_per_unit) * 100) / 100;
    if (totalCost <= 0) continue;

    const supplier  = s.supplier ?? 'Fournisseur';
    const product   = s.product?.name ?? 'Produit';
    const entryDate = s.created_at.slice(0, 10);

    const { data: entry, error: eErr } = await db('journal_entries')
      .insert({ business_id: businessId, entry_date: entryDate, description: `Achat – ${product} / ${supplier}`, source: 'stock', source_id: s.id })
      .select('id').single();
    if (eErr) throw new Error(eErr.message);
    if (!entry) continue;

    const { error: lErr } = await db('journal_lines').insert([
      { entry_id: entry.id, account_code: '601', account_name: 'Achats de marchandises', debit: totalCost, credit: 0 },
      { entry_id: entry.id, account_code: '401', account_name: 'Fournisseurs',           debit: 0,         credit: totalCost },
    ]);
    if (lErr) throw new Error(lErr.message);
    count++;
  }

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
    p_date_from:   dateFrom ?? null,
    p_date_to:     dateTo   ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TrialBalanceLine[];
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
  const syncedSet = new Set((existingAll ?? []).map((e: { source_id: string }) => e.source_id));

  let count = 0;

  // --- 1. Sync hotel_payments (acomptes + paiements au check-out) ----------
  // source = 'hotel', source_id = payment UUID - distinct des réservations car UUIDs différents
  // Chaque paiement reçu génère : Débit 571/521 · Crédit 706
  const syncedPayments = syncedSet; // même ensemble : source='hotel', source_id=uuid

  const { data: payments, error: payErr } = await (supabase as any)
    .from('hotel_payments')
    .select('id, amount, method, paid_at, reservation_id')
    .eq('business_id', businessId);
  if (payErr) throw new Error(payErr.message);

  // Récupérer les infos réservations en une seule requête pour les descriptions
  const reservationIds = [...new Set((payments ?? []).map((p: { reservation_id: string }) => p.reservation_id))];
  let resInfoMap: Record<string, { room: string; guest: string }> = {};
  if (reservationIds.length > 0) {
    const { data: resInfo } = await (supabase as any)
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
  const { data: reservations, error: resErr } = await (supabase as any)
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
    const { data: hasPay } = await (supabase as any)
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
  const synced = new Set((existing ?? []).map((e: { source_id: string }) => e.source_id));

  const { data: rows, error } = await (supabase as any)
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
  const synced = new Set((existing ?? []).map((e: { source_id: string }) => e.source_id));

  const { data: rows, error } = await (supabase as any)
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
