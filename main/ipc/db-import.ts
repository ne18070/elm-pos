import type { IpcMain } from 'electron';

export interface DbConnectionConfig {
  type: 'postgresql' | 'mysql';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TableInfo    { name: string; rows: number }
export interface ColumnInfo   { column: string; type: string; nullable: boolean }

// ─── PostgreSQL ───────────────────────────────────────────────────────────────

async function pgQuery(cfg: DbConnectionConfig, sql: string, params: unknown[] = []): Promise<unknown[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client } = require('pg') as typeof import('pg');
  const client = new Client({
    host:     cfg.host,
    port:     cfg.port,
    database: cfg.database,
    user:     cfg.user,
    password: cfg.password,
    connectionTimeoutMillis: 8000,
    ssl: false,
  });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

// ─── MySQL ────────────────────────────────────────────────────────────────────

async function mysqlQuery(cfg: DbConnectionConfig, sql: string, params: unknown[] = []): Promise<unknown[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mysql = require('mysql2/promise') as typeof import('mysql2/promise');
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

function runQuery(cfg: DbConnectionConfig, sql: string, params?: unknown[]): Promise<unknown[]> {
  return cfg.type === 'mysql' ? mysqlQuery(cfg, sql, params) : pgQuery(cfg, sql, params);
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerDbImportHandlers(ipcMain: IpcMain): void {

  // Test connexion
  ipcMain.handle('db-import:test', async (_e, cfg: DbConnectionConfig): Promise<IpcResult> => {
    try {
      await runQuery(cfg, 'SELECT 1');
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Lister les tables
  ipcMain.handle('db-import:tables', async (_e, cfg: DbConnectionConfig): Promise<IpcResult<TableInfo[]>> => {
    try {
      let rows: TableInfo[];
      if (cfg.type === 'postgresql') {
        rows = await pgQuery(cfg, `
          SELECT t.table_name AS name,
                 COALESCE(s.n_live_tup, 0)::integer AS rows
          FROM   information_schema.tables t
          LEFT   JOIN pg_stat_user_tables s ON s.relname = t.table_name
          WHERE  t.table_schema = 'public'
            AND  t.table_type  = 'BASE TABLE'
          ORDER  BY t.table_name
        `) as TableInfo[];
      } else {
        rows = await mysqlQuery(cfg, `
          SELECT TABLE_NAME  AS name,
                 COALESCE(TABLE_ROWS, 0) AS \`rows\`
          FROM   information_schema.TABLES
          WHERE  TABLE_SCHEMA = ?
            AND  TABLE_TYPE   = 'BASE TABLE'
          ORDER  BY TABLE_NAME
        `, [cfg.database]) as TableInfo[];
      }
      return { success: true, data: rows };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Schéma d'une table (colonnes + types)
  ipcMain.handle('db-import:schema', async (_e, cfg: DbConnectionConfig, table: string): Promise<IpcResult<ColumnInfo[]>> => {
    try {
      let rows: ColumnInfo[];
      if (cfg.type === 'postgresql') {
        rows = await pgQuery(cfg, `
          SELECT column_name       AS "column",
                 data_type         AS type,
                 (is_nullable = 'YES') AS nullable
          FROM   information_schema.columns
          WHERE  table_schema = 'public'
            AND  table_name   = $1
          ORDER  BY ordinal_position
        `, [table]) as ColumnInfo[];
      } else {
        const raw = await mysqlQuery(cfg, `
          SELECT COLUMN_NAME AS \`column\`,
                 DATA_TYPE   AS type,
                 IS_NULLABLE AS nullable
          FROM   information_schema.COLUMNS
          WHERE  TABLE_SCHEMA = ?
            AND  TABLE_NAME   = ?
          ORDER  BY ORDINAL_POSITION
        `, [cfg.database, table]) as { column: string; type: string; nullable: string }[];
        rows = raw.map((r) => ({ ...r, nullable: r.nullable === 'YES' }));
      }
      return { success: true, data: rows };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Récupérer des lignes (paginées)
  ipcMain.handle('db-import:rows', async (
    _e, cfg: DbConnectionConfig, table: string, limit: number, offset: number
  ): Promise<IpcResult<Record<string, unknown>[]>> => {
    try {
      let rows: Record<string, unknown>[];
      if (cfg.type === 'postgresql') {
        rows = await pgQuery(cfg,
          `SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT $1 OFFSET $2`,
          [limit, offset]
        ) as Record<string, unknown>[];
      } else {
        const safeLimit  = Math.floor(Math.max(1, limit));
        const safeOffset = Math.floor(Math.max(0, offset));
        const tbl = table.replace(/`/g, '``');
        rows = await mysqlQuery(cfg,
          `SELECT * FROM \`${tbl}\` LIMIT ${safeLimit} OFFSET ${safeOffset}`,
          []
        ) as Record<string, unknown>[];
      }
      return { success: true, data: rows };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
