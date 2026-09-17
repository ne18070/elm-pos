'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, LogIn, LogOut, Loader2, ScanLine, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import { BarcodeListener } from '@/components/pos/BarcodeListener';
import { recordBadgeClock, type BadgeClockResult } from '@services/supabase/staff';

type Feedback =
  | { kind: 'idle' }
  | { kind: 'success'; result: BadgeClockResult }
  | { kind: 'error'; message: string };

const FEEDBACK_DISPLAY_MS = 4000;

export default function StaffPointagePage() {
  const router = useRouter();
  const { business } = useAuthStore();
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  const [processing, setProcessing] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScan = useCallback(async (code: string) => {
    if (!business || processing) return;
    setProcessing(true);
    try {
      const result = await recordBadgeClock(business.id, code);
      setFeedback({ kind: 'success', result });
    } catch (e) {
      setFeedback({ kind: 'error', message: toUserError(e) });
    } finally {
      setProcessing(false);
      setManualCode('');
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => setFeedback({ kind: 'idle' }), FEEDBACK_DISPLAY_MS);
    }
  }, [business, processing]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim();
    if (code.length >= 3) handleScan(code);
  }

  if (!business) return null;

  return (
    <div className="h-full flex flex-col bg-surface">
      <BarcodeListener onScan={handleScan} />

      <div className="px-6 py-4 border-b border-surface-border bg-surface-card flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl hover:bg-surface-hover text-content-secondary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-black text-content-primary uppercase tracking-tight">Pointage par badge</h1>
          <p className="text-xs text-content-secondary">Scannez votre badge pour enregistrer votre arrivée ou votre départ</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        {feedback.kind === 'idle' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-24 h-24 rounded-3xl bg-brand-500/10 flex items-center justify-center">
              <ScanLine size={48} className="text-content-brand" />
            </div>
            <p className="text-content-secondary text-sm max-w-xs">En attente d&apos;un scan de badge…</p>
          </div>
        )}

        {feedback.kind === 'success' && (
          <div className="flex flex-col items-center gap-4 text-center animate-in zoom-in-95 duration-200">
            <div className={cn(
              "w-24 h-24 rounded-3xl flex items-center justify-center",
              feedback.result.action === 'clock_in' ? "bg-badge-success" : "bg-badge-info"
            )}>
              {feedback.result.action === 'clock_in'
                ? <LogIn size={48} className="text-status-success" />
                : <LogOut size={48} className="text-status-info" />}
            </div>
            <div>
              <p className="text-2xl font-black text-content-primary">{feedback.result.staffName}</p>
              <p className="text-sm text-content-secondary mt-1 flex items-center justify-center gap-1.5">
                <CheckCircle2 size={14} className="text-status-success" />
                {feedback.result.action === 'clock_in' ? 'Arrivée enregistrée' : 'Départ enregistré'} à {feedback.result.time}
              </p>
            </div>
          </div>
        )}

        {feedback.kind === 'error' && (
          <div className="flex flex-col items-center gap-4 text-center animate-in zoom-in-95 duration-200">
            <div className="w-24 h-24 rounded-3xl bg-badge-error flex items-center justify-center">
              <XCircle size={48} className="text-status-error" />
            </div>
            <p className="text-content-primary font-bold max-w-sm">{feedback.message}</p>
          </div>
        )}

        {processing && <Loader2 className="w-6 h-6 animate-spin text-content-muted" />}

        <form onSubmit={handleManualSubmit} className="flex gap-2 w-full max-w-xs pt-4">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Code badge (saisie manuelle)"
            disabled={processing}
            className="input flex-1 text-sm font-mono"
          />
          <button type="submit" disabled={processing} className="btn-primary px-4 text-sm font-bold disabled:opacity-60">
            Valider
          </button>
        </form>
        <p className="text-[10px] text-content-muted uppercase tracking-widest">
          Scanner USB branché ou saisie manuelle — aucune connexion requise
        </p>
      </div>
    </div>
  );
}
