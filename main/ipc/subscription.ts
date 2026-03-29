import type { IpcMain } from 'electron';
import {
  saveSubscriptionCache,
  checkSubscriptionOffline,
  clearSubscriptionCache,
} from '../store/local-db';

export function registerSubscriptionHandlers(ipcMain: IpcMain): void {

  /** Sauvegarde l'abonnement depuis le renderer après une vérification en ligne */
  ipcMain.handle('subscription:save', (_event, payload: {
    business_id:   string;
    status:        string;
    expires_at?:   string | null;
    trial_ends_at?: string | null;
  }) => {
    try {
      saveSubscriptionCache({
        business_id:   payload.business_id,
        status:        payload.status,
        expires_at:    payload.expires_at ?? null,
        trial_ends_at: payload.trial_ends_at ?? null,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  /** Vérifie l'abonnement depuis le cache SQLite (utilisé en mode offline) */
  ipcMain.handle('subscription:check', (_event, businessId: string) => {
    try {
      const result = checkSubscriptionOffline(businessId);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  /** Supprime le cache à la déconnexion */
  ipcMain.handle('subscription:clear', (_event, businessId: string) => {
    try {
      clearSubscriptionCache(businessId);
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
}
