import type { IpcMain } from 'electron';
import type { IpcResponse, Order } from '../../types';
import { getLocalDb } from '../store/local-db';

export function registerOrderHandlers(ipcMain: IpcMain): void {
  // ─── Create order in local SQLite (offline-first) ────────────────────────

  ipcMain.handle(
    'orders:create-local',
    async (_event, order: Partial<Order>): Promise<IpcResponse<{ id: string }>> => {
      try {
        const db = getLocalDb();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO local_orders (id, business_id, cashier_id, payload, synced, created_at)
          VALUES (?, ?, ?, ?, 0, ?)
        `).run(
          id,
          order.business_id,
          order.cashier_id,
          JSON.stringify(order),
          now
        );

        return { success: true, data: { id } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // ─── Get pending (unsynced) local orders ─────────────────────────────────

  ipcMain.handle('orders:get-pending', async (): Promise<IpcResponse<Order[]>> => {
    try {
      const db = getLocalDb();
      const rows = db
        .prepare(`SELECT payload FROM local_orders WHERE synced = 0 ORDER BY created_at ASC`)
        .all() as Array<{ payload: string }>;

      const orders = rows.map((r) => JSON.parse(r.payload) as Order);
      return { success: true, data: orders };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ─── Mark order as synced ─────────────────────────────────────────────────

  ipcMain.handle(
    'orders:mark-synced',
    async (_event, id: string): Promise<IpcResponse> => {
      try {
        const db = getLocalDb();
        db.prepare(`UPDATE local_orders SET synced = 1 WHERE id = ?`).run(id);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );
}
