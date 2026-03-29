import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

export function initLocalDb(): void {
  const dbPath = path.join(app.getPath('userData'), 'elm-pos.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
}

export function getLocalDb(): Database.Database {
  if (!db) throw new Error('Local DB not initialized');
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
  `);

  const { v: currentVersion } = db
    .prepare('SELECT MAX(version) as v FROM schema_version')
    .get() as { v: number | null };

  const migrations: Array<{ version: number; sql: string }> = [
    {
      version: 1,
      sql: `
        -- Commandes locales (non synchronisées)
        CREATE TABLE IF NOT EXISTS local_orders (
          id          TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          cashier_id  TEXT NOT NULL,
          payload     TEXT NOT NULL,
          synced      INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_local_orders_synced   ON local_orders(synced);
        CREATE INDEX IF NOT EXISTS idx_local_orders_business ON local_orders(business_id);

        -- File de sync avec états explicites
        CREATE TABLE IF NOT EXISTS sync_queue (
          id           TEXT PRIMARY KEY,
          operation    TEXT NOT NULL,
          payload      TEXT NOT NULL,
          status       TEXT NOT NULL DEFAULT 'pending',  -- pending | synced | failed
          attempts     INTEGER NOT NULL DEFAULT 0,
          next_retry   TEXT,          -- ISO timestamp de la prochaine tentative
          last_error   TEXT,
          created_at   TEXT NOT NULL,
          synced_at    TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_queue_status     ON sync_queue(status, next_retry);

        -- Cache produits (lecture hors ligne)
        CREATE TABLE IF NOT EXISTS cached_products (
          id          TEXT PRIMARY KEY,
          business_id TEXT NOT NULL,
          payload     TEXT NOT NULL,
          cached_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cached_products_biz ON cached_products(business_id);

        -- Paramètres applicatifs
        CREATE TABLE IF NOT EXISTS app_settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `,
    },
    {
      version: 2,
      sql: `
        -- Cache d'abonnement (sécurité offline)
        -- Stocké dans le processus principal, inaccessible depuis le renderer/DevTools
        CREATE TABLE IF NOT EXISTS subscription_cache (
          business_id   TEXT PRIMARY KEY,
          status        TEXT NOT NULL,
          expires_at    TEXT,
          trial_ends_at TEXT,
          verified_at   TEXT NOT NULL,
          grace_days    INTEGER NOT NULL DEFAULT 7
        );
      `,
    },
  ];

  for (const migration of migrations) {
    if (migration.version > (currentVersion ?? 0)) {
      db.transaction(() => {
        db.exec(migration.sql);
        db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)')
          .run(migration.version);
      })();
    }
  }
}

// ─── Sync Queue ───────────────────────────────────────────────────────────────

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface SyncRow {
  id: string;
  operation: string;
  payload: string;
  status: SyncStatus;
  attempts: number;
  next_retry: string | null;
  last_error: string | null;
  created_at: string;
  synced_at: string | null;
}

const MAX_ATTEMPTS = 5;

/** Calcul du délai de retry exponentiel (1s, 2s, 4s, 8s, 16s…) */
export function nextRetryAt(attempts: number): string {
  const delayMs = Math.min(1000 * Math.pow(2, attempts), 60_000);
  return new Date(Date.now() + delayMs).toISOString();
}

export function enqueueSync(operation: string, payload: unknown): string {
  const db = getLocalDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO sync_queue (id, operation, payload, status, attempts, created_at)
    VALUES (?, ?, ?, 'pending', 0, ?)
  `).run(id, operation, JSON.stringify(payload), new Date().toISOString());
  return id;
}

export function getPendingSyncItems(): SyncRow[] {
  const now = new Date().toISOString();
  return getLocalDb()
    .prepare(`
      SELECT * FROM sync_queue
      WHERE status = 'pending'
        AND (next_retry IS NULL OR next_retry <= ?)
      ORDER BY created_at ASC
    `)
    .all(now) as SyncRow[];
}

export function markSynced(id: string): void {
  getLocalDb()
    .prepare(`
      UPDATE sync_queue
      SET status = 'synced', synced_at = ?
      WHERE id = ?
    `)
    .run(new Date().toISOString(), id);
}

export function markFailed(id: string, error: string, attempts: number): void {
  const db = getLocalDb();
  if (attempts >= MAX_ATTEMPTS) {
    db.prepare(`
      UPDATE sync_queue
      SET status = 'failed', last_error = ?, attempts = ?
      WHERE id = ?
    `).run(error, attempts, id);
  } else {
    db.prepare(`
      UPDATE sync_queue
      SET attempts = ?, next_retry = ?, last_error = ?
      WHERE id = ?
    `).run(attempts, nextRetryAt(attempts), error, id);
  }
}

export function getSyncStats(): { pending: number; failed: number; synced: number } {
  const db = getLocalDb();
  const rows = db
    .prepare(`SELECT status, COUNT(*) as count FROM sync_queue GROUP BY status`)
    .all() as Array<{ status: string; count: number }>;
  const map = Object.fromEntries(rows.map((r) => [r.status, r.count]));
  return {
    pending: (map['pending'] ?? 0),
    failed:  (map['failed']  ?? 0),
    synced:  (map['synced']  ?? 0),
  };
}

// ─── Products cache ───────────────────────────────────────────────────────────

export function cacheProducts(businessId: string, products: unknown[]): void {
  const db = getLocalDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cached_products (id, business_id, payload, cached_at)
    VALUES (?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const p of products as Array<{ id: string }>) {
      stmt.run(p.id, businessId, JSON.stringify(p), now);
    }
  })();
}

export function getCachedProducts(businessId: string): unknown[] {
  return (
    getLocalDb()
      .prepare(`SELECT payload FROM cached_products WHERE business_id = ?`)
      .all(businessId) as Array<{ payload: string }>
  ).map((r) => JSON.parse(r.payload));
}

// ─── App settings ─────────────────────────────────────────────────────────────

export function setSetting(key: string, value: string): void {
  getLocalDb()
    .prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`)
    .run(key, value);
}

export function getSetting(key: string): string | null {
  const row = getLocalDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

// ─── Subscription cache (sécurité offline) ────────────────────────────────────

export interface SubscriptionCacheRow {
  business_id:   string;
  status:        string;
  expires_at:    string | null;
  trial_ends_at: string | null;
  verified_at:   string;
  grace_days:    number;
}

export interface OfflineSubscriptionResult {
  allowed:  boolean;
  status:   string;   // 'active' | 'trial' | 'expired' | 'none' | 'grace_expired'
  reason?:  string;
}

const GRACE_DAYS = 7;

/** Sauvegarde l'abonnement après une vérification en ligne réussie */
export function saveSubscriptionCache(row: Omit<SubscriptionCacheRow, 'verified_at' | 'grace_days'>): void {
  getLocalDb()
    .prepare(`
      INSERT OR REPLACE INTO subscription_cache
        (business_id, status, expires_at, trial_ends_at, verified_at, grace_days)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      row.business_id,
      row.status,
      row.expires_at ?? null,
      row.trial_ends_at ?? null,
      new Date().toISOString(),
      GRACE_DAYS,
    );
}

/** Vérifie l'abonnement en offline depuis le cache SQLite */
export function checkSubscriptionOffline(businessId: string): OfflineSubscriptionResult {
  const row = getLocalDb()
    .prepare(`SELECT * FROM subscription_cache WHERE business_id = ?`)
    .get(businessId) as SubscriptionCacheRow | undefined;

  if (!row) {
    return { allowed: false, status: 'none', reason: 'Aucune donnée d\'abonnement locale' };
  }

  const now = new Date();

  // 1. Vérifier la période de grâce offline (évite l'usage offline indéfini)
  const verifiedAt  = new Date(row.verified_at);
  const graceLimit  = new Date(verifiedAt.getTime() + row.grace_days * 24 * 60 * 60 * 1000);
  if (now > graceLimit) {
    return {
      allowed: false,
      status:  'grace_expired',
      reason:  `Connexion requise — dernière vérification il y a plus de ${row.grace_days} jours`,
    };
  }

  // 2. Vérifier la date d'expiration réelle de l'abonnement
  if (row.status === 'active') {
    if (row.expires_at && now > new Date(row.expires_at)) {
      return { allowed: false, status: 'expired', reason: 'Abonnement expiré' };
    }
    return { allowed: true, status: 'active' };
  }

  if (row.status === 'trial') {
    if (row.trial_ends_at && now > new Date(row.trial_ends_at)) {
      return { allowed: false, status: 'expired', reason: 'Période d\'essai expirée' };
    }
    return { allowed: true, status: 'trial' };
  }

  return { allowed: false, status: 'expired', reason: 'Abonnement expiré' };
}

/** Supprime le cache (à la déconnexion) */
export function clearSubscriptionCache(businessId: string): void {
  getLocalDb()
    .prepare(`DELETE FROM subscription_cache WHERE business_id = ?`)
    .run(businessId);
}
