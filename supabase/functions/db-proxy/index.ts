import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DbConfig {
  type:     'postgresql' | 'mysql';
  host:     string;
  port:     number;
  database: string;
  user:     string;
  password: string;
}

interface Payload {
  action:  'test' | 'list_tables' | 'get_schema' | 'fetch_rows';
  config:  DbConfig;
  table?:  string;
  limit?:  number;
  offset?: number;
}

// ─── PostgreSQL ───────────────────────────────────────────────────────────────

async function pgRun(cfg: DbConfig, sql: string, params: unknown[] = []): Promise<unknown[]> {
  // @ts-ignore — npm specifier
  const postgres = (await import('npm:postgres')).default;
  const db = postgres({
    host:     cfg.host,
    port:     cfg.port,
    database: cfg.database,
    username: cfg.user,
    password: cfg.password,
    connect_timeout: 8,
    ssl:      false,
    max:      1,
  });
  try {
    const rows = await db.unsafe(sql, params as any[]);
    return rows as unknown[];
  } finally {
    await db.end({ timeout: 2 });
  }
}

// ─── MySQL ────────────────────────────────────────────────────────────────────

async function mysqlRun(cfg: DbConfig, sql: string, params: unknown[] = []): Promise<unknown[]> {
  // @ts-ignore — npm specifier
  const mysql = (await import('npm:mysql2/promise')).default;
  const conn = await mysql.createConnection({
    host:           cfg.host,
    port:           cfg.port,
    database:       cfg.database,
    user:           cfg.user,
    password:       cfg.password,
    connectTimeout: 8000,
  });
  try {
    const [rows] = await conn.execute(sql, params);
    return rows as unknown[];
  } finally {
    await conn.end();
  }
}

function run(cfg: DbConfig, sql: string, params?: unknown[]) {
  return cfg.type === 'mysql' ? mysqlRun(cfg, sql, params) : pgRun(cfg, sql, params);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function test(cfg: DbConfig) {
  await run(cfg, 'SELECT 1');
  return { success: true };
}

async function listTables(cfg: DbConfig) {
  let rows: { name: string; rows: number }[];
  if (cfg.type === 'postgresql') {
    rows = await pgRun(cfg, `
      SELECT t.table_name AS name, COALESCE(s.n_live_tup, 0)::integer AS rows
      FROM   information_schema.tables t
      LEFT   JOIN pg_stat_user_tables s ON s.relname = t.table_name
      WHERE  t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER  BY t.table_name
    `) as { name: string; rows: number }[];
  } else {
    rows = await mysqlRun(cfg, `
      SELECT TABLE_NAME AS name, COALESCE(TABLE_ROWS, 0) AS \`rows\`
      FROM   information_schema.TABLES
      WHERE  TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER  BY TABLE_NAME
    `, [cfg.database]) as { name: string; rows: number }[];
  }
  return { success: true, data: rows };
}

async function getSchema(cfg: DbConfig, table: string) {
  let rows: { column: string; type: string; nullable: boolean }[];
  if (cfg.type === 'postgresql') {
    rows = await pgRun(cfg, `
      SELECT column_name AS "column", data_type AS type, (is_nullable = 'YES') AS nullable
      FROM   information_schema.columns
      WHERE  table_schema = 'public' AND table_name = $1
      ORDER  BY ordinal_position
    `, [table]) as { column: string; type: string; nullable: boolean }[];
  } else {
    const raw = await mysqlRun(cfg, `
      SELECT COLUMN_NAME AS \`column\`, DATA_TYPE AS type, IS_NULLABLE AS nullable
      FROM   information_schema.COLUMNS
      WHERE  TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER  BY ORDINAL_POSITION
    `, [cfg.database, table]) as { column: string; type: string; nullable: string }[];
    rows = raw.map((r) => ({ ...r, nullable: r.nullable === 'YES' }));
  }
  return { success: true, data: rows };
}

async function fetchRows(cfg: DbConfig, table: string, limit = 100, offset = 0) {
  const safeLimit  = Math.floor(Math.max(1, limit));
  const safeOffset = Math.floor(Math.max(0, offset));
  let rows: Record<string, unknown>[];
  if (cfg.type === 'postgresql') {
    rows = await pgRun(cfg,
      `SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset]
    ) as Record<string, unknown>[];
  } else {
    const tbl = table.replace(/`/g, '``');
    rows = await mysqlRun(cfg,
      `SELECT * FROM \`${tbl}\` LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      []
    ) as Record<string, unknown>[];
  }
  return { success: true, data: rows };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  // Vérifier l'auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Non autorisé' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Non autorisé' }, 401);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const { action, config, table, limit, offset } = payload;
  if (!config?.host || !config?.database || !config?.user) {
    return json({ error: 'Paramètres de connexion incomplets' }, 400);
  }

  try {
    switch (action) {
      case 'test':        return json(await test(config));
      case 'list_tables': return json(await listTables(config));
      case 'get_schema':  return json(await getSchema(config, table!));
      case 'fetch_rows':  return json(await fetchRows(config, table!, limit, offset));
      default:            return json({ error: 'Action inconnue' }, 400);
    }
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
});
