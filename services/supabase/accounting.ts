// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db  = (s: unknown) => (s as any).from.bind(s);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _rpc = (s: unknown) => (s as any).rpc.bind(s);

import { supabase } from './client';

const db  = _db(supabase);
const rpc = _rpc(supabase);

// ─── Types ────────────────────────────────────────────────────────────────────

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
  source: 'manual' | 'order' | 'stock' | 'refund' | 'adjustment' | 'hotel' | 'rental' | 'honoraires';
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
  description: string;
  lines: { account_code: string; account_name: string; debit: number; credit: number }[];
}

// ─── Comptes ──────────────────────────────────────────────────────────────────

export async function getAccounts(businessId: string): Promise<Account[]> {
  const { data, error } = await db('accounts')
    .select('*')
    .or(`business_id.eq.${businessId},business_id.is.null`)
    .eq('is_active', true)
    .order('code');
  if (error) throw new Error(error.message);
  return (data ?? []) as Account[];
}

// ─── Journal ──────────────────────────────────────────────────────────────────

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

// ─── Synchronisation depuis les ventes/achats ────────────────────────────────

export async function syncAccounting(businessId: string): Promise<number> {
  const { data, error } = await rpc('sync_accounting', { p_business_id: businessId });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// ─── Balance des comptes ──────────────────────────────────────────────────────

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

// ─── États financiers (calculés côté client depuis la balance) ───────────────

export interface IncomeStatement {
  ventesGross:       number; // 701
  rrrAccordes:       number; // 7091
  caNet:             number;
  achatsMarchandises:number; // 601
  margeBrute:        number;
  autresCharges:     number; // class 6 sauf 601
  resultatExpl:      number;
  produitsFinanciers:number; // 761, 771
  chargesFinancieres:number; // 661
  resultatFinancier: number;
  resultatAvantImpot:number;
  impots:            number; // 691, 441
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

// ─── Synchronisation hôtel ───────────────────────────────────────────────────
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

  // ─── 1. Sync hotel_payments (acomptes + paiements au check-out) ──────────
  // source = 'hotel', source_id = payment UUID — distinct des réservations car UUIDs différents
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
    const desc    = `Paiement hôtel${info.room ? ` — Ch.${info.room}` : ''} — ${info.guest}`;

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

  // ─── 2. Sync réservations clôturées SANS hotel_payments ──────────────────
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
    const description = `Séjour hôtel${roomLabel ? ` — ${roomLabel}` : ''} — ${guestLabel}`;
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
  const get = (code: string) => {
    const row = balance.find((r) => r.account_code === code);
    if (!row) return 0;
    return row.balance_type === 'credit' ? -row.balance : row.balance;
  };

  // Solde positif = dans le sens normal du compte
  const sumClass = (cls: number, nature: string) =>
    balance
      .filter((r) => r.class_num === cls && r.nature === nature)
      .reduce((s, r) => {
        const normal = r.balance_type === 'debit' ? r.balance : -r.balance;
        return s + normal;
      }, 0);

  // CA = somme de tous les comptes 70x (ventes + prestations), hors 7091 (RRR)
  const ventesGross = balance
    .filter((r) => r.account_code.startsWith('70') && r.account_code !== '7091')
    .reduce((s, r) => s + (r.total_credit - r.total_debit), 0);
  const rrrAccordes        = get('7091');
  const caNet              = ventesGross - rrrAccordes;
  const achatsMarchandises = get('601');
  const margeBrute         = caNet - achatsMarchandises;

  // Autres charges classe 6 (hors 601, 691)
  const autresCharges = balance
    .filter((r) => r.class_num === 6 && !['601','691'].includes(r.account_code))
    .reduce((s, r) => s + (r.total_debit - r.total_credit), 0);

  const resultatExpl       = margeBrute - autresCharges;
  const produitsFinanciers = ['761','771'].reduce((s, c) => s + get(c), 0);
  const chargesFinancieres = get('661');
  const resultatFinancier  = produitsFinanciers - chargesFinancieres;
  const impots             = get('691') + get('441');
  const resultatAvantImpot = resultatExpl + resultatFinancier;
  const resultatNet        = resultatAvantImpot - impots;

  void sumClass;
  return {
    ventesGross, rrrAccordes, caNet, achatsMarchandises, margeBrute,
    autresCharges, resultatExpl, produitsFinanciers, chargesFinancieres,
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
