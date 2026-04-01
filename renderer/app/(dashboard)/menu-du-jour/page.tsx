'use client';

import { toUserError } from '@/lib/user-error';
import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarDays, Save, Trash2, Loader2, ChevronLeft, ChevronRight, Check, Send, AlertTriangle, ImageIcon, X } from 'lucide-react';
import { displayCurrency } from '@/lib/utils';
import { uploadMenuImage } from '@services/supabase/storage';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { getProducts } from '@services/supabase/products';
import { getDailyMenu, saveDailyMenu, clearDailyMenu } from '@services/supabase/daily-menu';
import { getWhatsAppConfig, broadcastDailyMenu, getBroadcastLog, type BroadcastResult, type BroadcastLog } from '@services/supabase/whatsapp';
import type { Product } from '@pos-types';

export default function MenuDuJourPage() {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [date, setDate]             = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [products, setProducts]     = useState<Product[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [note, setNote]             = useState('');
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [imageUrl, setImageUrl]               = useState<string | null>(null);
  const [imagePreview, setImagePreview]       = useState<string | null>(null);
  const [uploadingImg, setUploadingImg]       = useState(false);
  const fileInputRef                          = useRef<HTMLInputElement>(null);
  const [broadcasting, setBroadcasting]       = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [broadcastLog, setBroadcastLog]       = useState<BroadcastLog[]>([]);
  const [hasWaConfig, setHasWaConfig]         = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const [prods, menu, waCfg, log] = await Promise.all([
        getProducts(business.id),
        getDailyMenu(business.id, date),
        getWhatsAppConfig(business.id),
        getBroadcastLog(business.id, date),
      ]);
      setProducts(prods.filter((p) => p.is_active));
      setHasWaConfig(!!(waCfg?.is_active));
      setBroadcastLog(log);
      if (menu) {
        setSelected(new Set(menu.items.map((i) => i.product_id)));
        setNote(menu.note ?? '');
        setImageUrl(menu.image_url);
        setImagePreview(menu.image_url);
      } else {
        setSelected(new Set());
        setNote('');
        setImageUrl(null);
        setImagePreview(null);
      }
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, date, notifError]);

  useEffect(() => { load(); }, [load]);
  // Reset quand on change de date
  useEffect(() => {
    setBroadcastResult(null);
    setBroadcastLog([]);
    setImageUrl(null);
    setImagePreview(null);
  }, [date]);

  function shiftDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(format(d, 'yyyy-MM-dd'));
  }

  function toggleProduct(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !business?.id) return;
    e.target.value = '';
    setUploadingImg(true);
    try {
      const url = await uploadMenuImage(business.id, file);
      setImageUrl(url);
      setImagePreview(url);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setUploadingImg(false);
    }
  }

  function removeImage() {
    setImageUrl(null);
    setImagePreview(null);
  }

  async function handleSave() {
    if (!business?.id) return;
    setSaving(true);
    try {
      const items = Array.from(selected).map((product_id, i) => ({
        product_id,
        custom_price: null,
        sort_order: i,
      }));
      await saveDailyMenu(business.id, date, note.trim() || null, items, imageUrl);
      success('Menu du jour enregistré');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!business?.id) return;
    setSaving(true);
    try {
      await clearDailyMenu(business.id, date);
      setSelected(new Set());
      setNote('');
      setImageUrl(null);
      setImagePreview(null);
      setBroadcastResult(null);
      success('Menu du jour supprimé');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleBroadcast() {
    if (!business?.id || !user?.id) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const waCfg = await getWhatsAppConfig(business.id);
      if (!waCfg) throw new Error('Configuration WhatsApp introuvable');

      // Construire le message broadcast
      const selectedProducts = products.filter((p) => selected.has(p.id));
      const currency = displayCurrency(business.currency ?? 'XOF');
      const lines = selectedProducts.map(
        (p) => `• *${p.name}* — ${p.price.toLocaleString()} ${currency}`
      ).join('\n');

      const dateLabel = format(new Date(date + 'T12:00:00'), 'EEEE d MMMM', { locale: fr });
      const header = note.trim()
        ? `🍽️ *Menu du jour — ${dateLabel}*\n${note.trim()}`
        : `🍽️ *Menu du jour — ${dateLabel}*`;
      const footer = `\nTapez *${waCfg.menu_keyword || 'menu'}* pour commander 🛍️`;
      const text = `${header}\n\n${lines}${footer}`;

      const result = await broadcastDailyMenu(waCfg, text, user.id, date, imageUrl);
      setBroadcastResult(result);
      // Recharger le log après envoi
      const newLog = await getBroadcastLog(business.id, date);
      setBroadcastLog(newLog);

      if (result.sent > 0) {
        success(`Broadcast envoyé à ${result.sent} contact${result.sent > 1 ? 's' : ''}${result.skipped > 0 ? ` (${result.skipped} déjà contacté${result.skipped > 1 ? 's' : ''})` : ''}`);
      } else if (result.skipped > 0) {
        success(`Tous les contacts ont déjà été contactés aujourd'hui`);
      } else {
        notifError('Aucun message envoyé — vérifiez vos contacts');
      }
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setBroadcasting(false);
    }
  }

  const isToday = date === format(new Date(), 'yyyy-MM-dd');
  const canBroadcast = hasWaConfig && selected.size > 0 && isToday;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-900/30 border border-orange-700/40 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Menu du jour</h1>
            <p className="text-xs text-slate-400">Sélectionnez les produits à mettre en avant</p>
          </div>
        </div>

        {/* Navigation date */}
        <div className="flex items-center gap-2">
          <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-400">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-white capitalize">
              {format(new Date(date + 'T12:00:00'), 'EEEE d MMMM', { locale: fr })}
            </p>
            {isToday && <p className="text-xs text-orange-400">Aujourd&apos;hui</p>}
          </div>
          <button onClick={() => shiftDate(1)} className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-400">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Image du menu */}
          <div>
            <label className="label">Image du menu <span className="text-slate-500 font-normal">(optionnel)</span></label>
            {imagePreview ? (
              <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-surface-border">
                <img src={imagePreview} alt="menu" className="w-full max-h-48 object-cover" />
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImg}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-surface-border hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-colors text-sm disabled:opacity-50"
              >
                {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                {uploadingImg ? 'Téléchargement…' : 'Ajouter une image'}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            <p className="text-xs text-slate-500 mt-1">Envoyée en tête du broadcast WhatsApp.</p>
          </div>

          {/* Note */}
          <div>
            <label className="label">Message d&apos;introduction <span className="text-slate-500 font-normal">(optionnel)</span></label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex : Spécial week-end 🎉, Plats du jour fraîchement préparés…"
              className="input text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">Affiché en intro du menu du jour sur WhatsApp.</p>
          </div>

          {/* Sélection produits */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="label mb-0">
                Produits du jour{' '}
                <span className="text-slate-500 font-normal">
                  ({selected.size} sélectionné{selected.size > 1 ? 's' : ''})
                </span>
              </label>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:text-slate-300">
                  Tout désélectionner
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {products.map((p) => {
                const isSelected = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleProduct(p.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                      isSelected
                        ? 'border-orange-500/60 bg-orange-900/20'
                        : 'border-surface-border hover:border-slate-600 hover:bg-surface-hover'
                    }`}
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-700 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.price.toLocaleString()} {displayCurrency(business?.currency ?? 'XOF')}</p>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {products.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Aucun produit actif.</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || selected.size === 0}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>

            {/* Bouton broadcast — uniquement aujourd'hui avec WhatsApp actif */}
            {hasWaConfig && (
              <button
                onClick={handleBroadcast}
                disabled={broadcasting || saving || !canBroadcast}
                title={!isToday ? 'Disponible uniquement pour aujourd\'hui' : undefined}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {broadcasting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {broadcasting ? 'Envoi en cours…' : 'Diffuser sur WhatsApp'}
              </button>
            )}

            <button
              onClick={handleClear}
              disabled={saving || broadcasting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-border text-slate-400 hover:text-red-400 hover:border-red-500/40 transition-colors text-sm disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Effacer
            </button>
          </div>

          {/* Historique broadcast du jour */}
          {broadcastLog.length > 0 && (
            <div className="rounded-xl border border-surface-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">
                  Historique du jour
                </p>
                <span className="text-xs text-slate-400">
                  {broadcastLog.length} contact{broadcastLog.length > 1 ? 's' : ''} contacté{broadcastLog.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {broadcastLog.map((log) => (
                  <div key={log.phone} className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono">{log.phone}</span>
                    <span>{format(new Date(log.sent_at), 'HH:mm', { locale: fr })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Résultat broadcast */}
          {broadcastResult && (
            <div className={`rounded-xl border p-4 space-y-2 ${
              broadcastResult.failed > 0
                ? 'border-yellow-600/40 bg-yellow-900/20'
                : 'border-green-600/40 bg-green-900/20'
            }`}>
              <p className="text-sm font-medium text-white">
                Résultat du broadcast
              </p>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="text-green-400">✓ {broadcastResult.sent} envoyé{broadcastResult.sent > 1 ? 's' : ''}</span>
                {broadcastResult.skipped > 0 && (
                  <span className="text-slate-400">⟳ {broadcastResult.skipped} déjà contacté{broadcastResult.skipped > 1 ? 's' : ''}</span>
                )}
                {broadcastResult.failed > 0 && (
                  <span className="text-red-400">✗ {broadcastResult.failed} échec{broadcastResult.failed > 1 ? 's' : ''}</span>
                )}
              </div>
              {broadcastResult.errors.length > 0 && (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer flex items-center gap-1 text-yellow-400 hover:text-yellow-300">
                    <AlertTriangle className="w-3 h-3" /> Voir les erreurs
                  </summary>
                  <ul className="mt-2 space-y-1 pl-4">
                    {broadcastResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          {!hasWaConfig && (
            <p className="text-xs text-slate-500">
              💡 Activez WhatsApp Business dans les Paramètres pour pouvoir diffuser le menu à vos contacts.
            </p>
          )}
        </>
      )}
    </div>
  );
}
