'use client';

import { useEffect, useState } from 'react';
import {
  ShoppingCart, QrCode, CheckCircle, Loader2,
  Upload, Send, X, FileImage,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getPlans, getPaymentSettings, uploadReceipt,
  type Plan, type PaymentSettings,
} from '@services/supabase/subscriptions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Step = 'info' | 'payment' | 'sent';

export default function SubscribePage() {
  const [loading, setLoading]     = useState(true);
  const [plans, setPlans]         = useState<Plan[]>([]);
  const [settings, setSettings]   = useState<PaymentSettings | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showQr, setShowQr]       = useState<'wave' | 'om' | null>(null);
  const [step, setStep]           = useState<Step>('info');

  // Formulaire client
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');

  // Reçu
  const [receiptFile, setReceiptFile]     = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    Promise.all([getPlans(), getPaymentSettings()])
      .then(([p, s]) => { setPlans(p); setSettings(s); if (p.length) setSelectedPlan(p[0]); })
      .finally(() => setLoading(false));
  }, []);

  function handleReceiptChange(file: File) {
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!selectedPlan || !receiptFile) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      // Upload du reçu (dossier public-receipts/ sous un ID temporaire)
      const ext  = receiptFile.name.split('.').pop() ?? 'jpg';
      const path = `receipts/public-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('product-images').upload(path, receiptFile);
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      const receiptUrl = urlData.publicUrl;

      // Insérer la demande anonyme
      const { error } = await db.from('public_subscription_requests').insert({
        business_name: businessName.trim(),
        email:         email.trim().toLowerCase(),
        phone:         phone.trim(),
        plan_id:       selectedPlan.id,
        receipt_url:   receiptUrl,
      });
      if (error) throw new Error(error.message);
      setStep('sent');
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto p-4 sm:p-8">
      {/* Grille de fond */}
      <div className="fixed inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mb-4 shadow-glow">
            <ShoppingCart className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Elm POS</h1>
          <p className="text-slate-400 text-sm mt-1">Abonnement</p>
        </div>

        {step === 'sent' ? (
          <div className="card p-10 flex flex-col items-center gap-5 text-center">
            <div className="w-20 h-20 rounded-full bg-green-900/20 border border-green-700 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">Demande envoyée !</p>
              <p className="text-sm text-slate-400 mt-2 max-w-sm">
                Nous avons bien reçu votre demande et votre reçu de paiement.
                Votre accès sera activé sous <strong className="text-white">24h</strong>.
              </p>
              <p className="text-xs text-slate-500 mt-3">
                Un email de confirmation sera envoyé à <span className="text-slate-300">{email}</span>
              </p>
            </div>
          </div>
        ) : step === 'info' ? (
          /* ── Étape 1 : Informations ── */
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-bold text-white text-lg">Vos informations</h2>

              <div>
                <label className="label">Nom de votre établissement *</label>
                <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                  className="input" placeholder="Ex : Restaurant Le Soleil" />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input" placeholder="vous@exemple.com" />
              </div>
              <div>
                <label className="label">Téléphone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="input" placeholder="+221 77 000 00 00" />
              </div>
            </div>

            {/* Choix plan */}
            <div>
              <h2 className="font-bold text-white text-lg mb-4">Choisissez votre plan</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {plans.map((plan) => (
                  <button key={plan.id} onClick={() => setSelectedPlan(plan)}
                    className={`text-left p-5 rounded-2xl border transition-all
                      ${selectedPlan?.id === plan.id ? 'border-brand-500 bg-brand-900/20' : 'border-surface-border hover:border-slate-500'}`}>
                    <p className="font-bold text-white text-lg">{plan.label}</p>
                    <p className="text-2xl font-bold text-brand-400 mt-1">
                      {plan.price.toLocaleString('fr-FR')}
                      <span className="text-sm font-normal text-slate-400"> {plan.currency}/mois</span>
                    </p>
                    <ul className="mt-3 space-y-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep('payment')}
              disabled={!businessName.trim() || !email.trim() || !selectedPlan}
              className="btn-primary w-full h-12 text-base"
            >
              Continuer vers le paiement →
            </button>
          </div>
        ) : (
          /* ── Étape 2 : Paiement + reçu ── */
          <div className="space-y-6">
            <button onClick={() => setStep('info')} className="text-sm text-slate-400 hover:text-white transition-colors">
              ← Retour
            </button>

            <div className="card p-6 space-y-5">
              <h2 className="font-bold text-white text-lg">Paiement</h2>

              {/* Récap */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-input border border-surface-border">
                <span className="text-sm text-slate-300">{selectedPlan?.label}</span>
                <span className="font-bold text-brand-400">
                  {selectedPlan?.price.toLocaleString('fr-FR')} {selectedPlan?.currency}
                </span>
              </div>

              <ol className="space-y-3">
                {[
                  { n: 1, text: 'Scannez le QR code Wave ou Orange Money ci-dessous' },
                  { n: 2, text: `Effectuez le paiement de ${selectedPlan?.price.toLocaleString('fr-FR') ?? '—'} ${selectedPlan?.currency ?? ''}` },
                  { n: 3, text: 'Prenez une photo de votre reçu de paiement' },
                  { n: 4, text: 'Joignez le reçu et envoyez votre demande' },
                ].map(({ n, text }) => (
                  <li key={n} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                    <span className="text-sm text-slate-300">{text}</span>
                  </li>
                ))}
              </ol>

              {/* QR Codes */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'wave' as const, label: 'Wave',         url: settings?.wave_qr_url, color: 'border-blue-700 bg-blue-900/10' },
                  { key: 'om'   as const, label: 'Orange Money', url: settings?.om_qr_url,   color: 'border-orange-700 bg-orange-900/10' },
                ].map(({ key, label, url, color }) => (
                  <button key={key} onClick={() => url && setShowQr(key)} disabled={!url}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                      ${url ? `${color} hover:opacity-90 cursor-pointer` : 'border-surface-border opacity-30'}`}>
                    <QrCode className="w-8 h-8 text-white" />
                    <span className="text-sm font-medium text-white">{label}</span>
                    {!url && <span className="text-xs text-slate-500">Bientôt disponible</span>}
                  </button>
                ))}
              </div>

              {/* Upload reçu */}
              <div className="space-y-3 pt-2 border-t border-surface-border">
                <p className="text-sm font-semibold text-white">Joindre votre reçu</p>

                {receiptPreview ? (
                  <div className="relative w-fit">
                    <img src={receiptPreview} alt="reçu" className="h-36 w-auto rounded-xl border border-surface-border object-cover" />
                    <button onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 w-full h-32
                                    border-2 border-dashed border-surface-border rounded-xl
                                    cursor-pointer hover:border-brand-500 transition-colors">
                    <FileImage className="w-8 h-8 text-slate-500" />
                    <span className="text-sm text-slate-400">Cliquez pour choisir une image</span>
                    <span className="text-xs text-slate-600">PNG, JPG, PDF</span>
                    <input type="file" accept="image/*,.pdf" className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleReceiptChange(e.target.files[0])} />
                  </label>
                )}

                {submitError && <p className="text-sm text-red-400">{submitError}</p>}

                <button onClick={handleSubmit} disabled={!receiptFile || submitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 h-11">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? 'Envoi en cours…' : 'Envoyer ma demande'}
                </button>
                <p className="text-xs text-slate-500 text-center">Traitement sous 24h après réception.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal QR agrandi */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowQr(null)}>
          <div className="bg-white rounded-2xl p-4 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <img src={showQr === 'wave' ? settings?.wave_qr_url! : settings?.om_qr_url!} alt="QR" className="w-full h-auto rounded-xl" />
            <p className="text-center text-sm text-slate-700 font-medium mt-3">
              {showQr === 'wave' ? 'Wave' : 'Orange Money'} — {selectedPlan?.price.toLocaleString('fr-FR')} {selectedPlan?.currency}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
