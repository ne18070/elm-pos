'use client';

import { useEffect, useState } from 'react';
import {
  QrCode, CheckCircle, Loader2,
  Send, X, FileImage,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { displayCurrency } from '@/lib/utils';
import {
  getPlans, getPaymentSettings,
  type Plan, type PaymentSettings,
} from '@services/supabase/subscriptions';
import { sendEmail } from '@services/resend';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Step = 'info' | 'payment' | 'sent';

const isFree = (plan: Plan | null) => plan !== null && plan.price === 0;

export default function SubscribePage() {
  const [loading, setLoading]     = useState(true);
  const [allPlans, setAllPlans]   = useState<Plan[]>([]);
  const [period, setPeriod]       = useState<'monthly' | 'annual'>('monthly');
  const [settings, setSettings]   = useState<PaymentSettings | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showQr, setShowQr]       = useState<'wave' | 'om' | null>(null);
  const [step, setStep]           = useState<Step>('info');

  // Formulaire client
  const [businessName, setBusinessName] = useState('');
  const [denomination, setDenomination] = useState('');
  const [fullName, setFullName]         = useState('');
  const [email, setEmail]               = useState('');
  const [phone, setPhone]               = useState('');

  // Reçu
  const [receiptFile, setReceiptFile]     = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Validation
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [checking,    setChecking]    = useState<Record<string, boolean>>({});

  function setFieldError(field: string, msg: string) {
    setFieldErrors(prev => ({ ...prev, [field]: msg }));
  }
  function clearFieldError(field: string) {
    setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  async function validateEmail(val: string) {
    const trimmed = val.trim().toLowerCase();
    if (!trimmed) { setFieldError('email', 'L\'email est requis.'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setFieldError('email', 'Adresse email invalide.');
      return false;
    }
    // Vérifier si l'email existe déjà dans auth.users
    setChecking(prev => ({ ...prev, email: true }));
    try {
      const { data } = await supabase.rpc('check_email_exists', { p_email: trimmed });
      if (data) {
        setFieldError('email', 'Un compte existe déjà avec cet email. Connectez-vous.');
        return false;
      }
    } catch { /* ignore – ne pas bloquer si la requête échoue */ }
    finally { setChecking(prev => ({ ...prev, email: false })); }
    clearFieldError('email');
    return true;
  }

  async function checkUnique(field: 'businessName' | 'denomination', value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setChecking(prev => ({ ...prev, [field]: true }));
    try {
      const col = field === 'businessName' ? 'name' : 'denomination';
      const reqCol = field === 'businessName' ? 'business_name' : 'denomination';

      const [{ data: bizData }, { data: reqData }] = await Promise.all([
        supabase.from('businesses').select('id').ilike(col, trimmed).limit(1),
        supabase.from('public_subscription_requests' as any)
          .select('id').ilike(reqCol, trimmed)
          .not('status', 'eq', 'rejected').limit(1),
      ]);

      const label = field === 'businessName' ? 'Ce nom d\'établissement' : 'Cette raison sociale';
      if ((bizData && bizData.length > 0) || (reqData && reqData.length > 0)) {
        setFieldError(field, `${label} est déjà utilisé.`);
      } else {
        clearFieldError(field);
      }
    } catch {
      clearFieldError(field);
    } finally {
      setChecking(prev => ({ ...prev, [field]: false }));
    }
  }

  function canSubmit() {
    if (!businessName.trim() || !fullName.trim() || !email.trim() || !selectedPlan) return false;
    if (fieldErrors.email || fieldErrors.businessName || fieldErrors.denomination) return false;
    if (checking.businessName || checking.denomination || checking.email) return false;
    return true;
  }

  useEffect(() => {
    Promise.all([
      getPlans().catch(() => [] as Plan[]),
      getPaymentSettings().catch(() => null),
    ])
      .then(([p, s]) => { setAllPlans(p); setSettings(s); const first = p.find((pl: Plan) => pl.price > 0 && pl.duration_days < 300); if (first) setSelectedPlan(first); })
      .finally(() => setLoading(false));
  }, []);

  function handleReceiptChange(file: File) {
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!selectedPlan) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const { error } = await db.from('public_subscription_requests').insert({
        business_name: businessName.trim(),
        denomination:  denomination.trim() || null,
        full_name:     fullName.trim(),
        email:         email.trim().toLowerCase(),
        phone:         phone.trim(),
        plan_id:       selectedPlan.id,
        receipt_url:   null,
        // Password retiré ici
      });
      if (error) throw new Error(error.message);
      sendEmail({
        type:    'subscription_received',
        to:      email.trim().toLowerCase(),
        subject: '📩 Demande reçue — ELM APP',
        data:    { business_name: businessName.trim(), plan_label: selectedPlan.label ?? selectedPlan.name },
      }).catch(() => {});
      setStep('sent');
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  /* PAYMENT STEP BYPASSED — will be re-enabled once payment API is ready
  async function handleSubmitWithReceipt() { ... }
  */

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', overflowY: 'auto' }} className="bg-surface p-4 sm:p-8">
      {/* Grille de fond */}
      <div className="subscribe-grid-bg fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center mb-6 p-3 shadow-2xl overflow-hidden border-2 border-white/20">
            <img src="/logo.png" alt="ELM Logo" className="w-full h-full object-contain" />
          </div>
          <p className="text-content-secondary text-sm mt-1">Abonnement</p>
          <p className="text-xs text-content-muted mt-2">
            Déjà un compte ?{' '}
            <a href="/login" className="text-content-brand hover:text-content-brand transition-colors">
              Se connecter
            </a>
          </p>
        </div>

        {step === 'sent' ? (
          <div className="card p-10 flex flex-col items-center gap-5 text-center">
            <div className="w-20 h-20 rounded-full bg-badge-success border border-status-success flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-status-success" />
            </div>
            <div>
              <p className="text-xl font-bold text-content-primary">Demande envoyée !</p>
              {isFree(selectedPlan) ? (
                <p className="text-sm text-content-secondary mt-2 max-w-sm">
                  Votre inscription au plan gratuit a bien été reçue.
                  Votre accès sera activé sous <strong className="text-content-primary">24h</strong>.
                </p>
              ) : (
                <p className="text-sm text-content-secondary mt-2 max-w-sm">
                  Nous avons bien reçu votre demande et votre reçu de paiement.
                  Votre accès sera activé sous <strong className="text-content-primary">24h</strong>.
                </p>
              )}
              <p className="text-xs text-content-muted mt-3">
                Un email de confirmation sera envoyé à <span className="text-content-primary">{email}</span>
              </p>
            </div>
          </div>
        ) : step === 'info' ? (
          /* -- Étape 1 : Informations -- */
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-bold text-content-primary text-lg">Vos informations</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Nom de l'établissement *</label>
                  <div className="relative">
                    <input type="text" value={businessName}
                      onChange={(e) => { setBusinessName(e.target.value); clearFieldError('businessName'); }}
                      onBlur={(e) => checkUnique('businessName', e.target.value)}
                      className={`input pr-8 ${fieldErrors.businessName ? 'border-status-error focus:ring-status-error' : ''}`}
                      placeholder="Ex : Restaurant Le Soleil" />
                    {checking.businessName && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-content-secondary" />}
                  </div>
                  {fieldErrors.businessName && <p className="text-xs text-status-error mt-1">{fieldErrors.businessName}</p>}
                </div>
                <div>
                  <label className="label">Raison sociale légale <span className="text-content-secondary font-normal normal-case tracking-normal">(SARL, SA… si différente)</span></label>
                  <div className="relative">
                    <input type="text" value={denomination}
                      onChange={(e) => { setDenomination(e.target.value); clearFieldError('denomination'); }}
                      onBlur={(e) => { if (e.target.value.trim()) checkUnique('denomination', e.target.value); }}
                      className={`input pr-8 ${fieldErrors.denomination ? 'border-status-error focus:ring-status-error' : ''}`}
                      placeholder="Ex : SARL Le Soleil Afrique" />
                    {checking.denomination && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-content-secondary" />}
                  </div>
                  {fieldErrors.denomination && <p className="text-xs text-status-error mt-1">{fieldErrors.denomination}</p>}
                </div>
              </div>

              <div className="pt-4 border-t border-surface-border">
                <p className="text-[10px] font-black uppercase tracking-widest text-content-muted mb-4">Administrateur du compte</p>
                <div className="space-y-4">
                  <div>
                    <label className="label">Votre nom complet *</label>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                      className="input" placeholder="Prénom et Nom" />
                  </div>
                  <div>
                    <label className="label">Email *</label>
                    <div className="relative">
                      <input type="email" value={email}
                        onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                        onBlur={(e) => validateEmail(e.target.value)}
                        className={`input pr-8 ${fieldErrors.email ? 'border-status-error focus:ring-status-error' : ''}`}
                        placeholder="vous@exemple.com" />
                      {checking.email && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-content-secondary" />}
                    </div>
                    {fieldErrors.email && (
                      <p className="text-xs text-status-error mt-1 flex items-center gap-1">
                        {fieldErrors.email}
                        {fieldErrors.email.includes('Connectez-vous') && (
                          <a href="/login" className="underline font-semibold">→ Login</a>
                        )}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="label">Téléphone</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="input" placeholder="+221 77 000 00 00" />
                  </div>
                </div>
              </div>
            </div>

            {/* Choix plan */}
            {(() => {
              const paidMonthly = allPlans.filter((p) => p.price > 0 && p.duration_days < 300);
              const paidAnnual  = allPlans.filter((p) => p.price > 0 && p.duration_days >= 300);
              const trialPlans  = allPlans.filter((p) => p.price === 0);
              const hasAnnual   = paidAnnual.length > 0;
              const hasMonthly  = paidMonthly.length > 0;
              const shownPaid   = period === 'annual' && hasAnnual ? paidAnnual : paidMonthly;
              const shownPlans  = [...trialPlans, ...shownPaid];

              return (
                <div>
                  <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                    <h2 className="font-bold text-content-primary text-lg">Choisissez votre plan</h2>
                    {hasAnnual && hasMonthly && (
                      <div className="flex items-center bg-surface-input border border-surface-border rounded-lg p-1 shrink-0">
                        {(['monthly', 'annual'] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => { setPeriod(p); setSelectedPlan(null); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                              ${period === p ? 'bg-brand-600 text-content-primary' : 'text-content-secondary hover:text-content-primary'}`}>
                            {p === 'monthly' ? 'Mensuel' : (
                              <span className="flex items-center gap-1">Annuel <span className="text-status-success">−10%</span></span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`grid grid-cols-1 gap-4 ${shownPlans.length >= 4 ? 'sm:grid-cols-2' : shownPlans.length === 2 ? 'sm:grid-cols-2' : shownPlans.length >= 3 ? 'sm:grid-cols-3' : ''}`}>
                    {shownPlans.map((plan) => {
                      const isAnnual = plan.duration_days >= 300;
                      const monthlyEquiv = isAnnual ? Math.round(plan.price / 12) : null;
                      return (
                        <button key={plan.id} onClick={() => setSelectedPlan(plan)}
                          className={`text-left p-5 rounded-2xl border transition-all relative
                            ${selectedPlan?.id === plan.id ? 'border-brand-500 bg-badge-brand' : 'border-surface-border hover:border-slate-500'}`}>
                          {isAnnual && (
                            <span className="absolute top-3 right-3 text-[10px] font-bold text-status-success bg-badge-success border border-status-success/40 px-1.5 py-0.5 rounded-full">
                              1 mois offert
                            </span>
                          )}
                          <p className="font-bold text-content-primary text-base">{plan.label}</p>
                          <p className="text-2xl font-bold text-content-brand mt-1">
                            {plan.price === 0 ? 'Gratuit' : plan.price.toLocaleString('fr-FR')}
                            {plan.price > 0 && (
                              <span className="text-sm font-normal text-content-secondary">
                                {' '}{displayCurrency(plan.currency)}/{isAnnual ? 'an' : 'mois'}
                              </span>
                            )}
                          </p>
                          {monthlyEquiv && (
                            <p className="text-xs text-content-muted mt-0.5">
                              soit {monthlyEquiv.toLocaleString('fr-FR')} {displayCurrency(plan.currency)}/mois
                            </p>
                          )}
                          <ul className="mt-3 space-y-1">
                            {plan.features.map((f: string) => (
                              <li key={f} className="flex items-center gap-2 text-xs text-content-primary">
                                <CheckCircle className="w-3.5 h-3.5 text-status-success shrink-0" /> {f}
                              </li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Note paiement */}
            {selectedPlan && !isFree(selectedPlan) && (
              <div className="rounded-xl bg-badge-brand border border-brand-800/50 px-4 py-3 text-sm text-content-brand">
                Notre équipe vous contactera pour finaliser le paiement après réception de votre demande.
              </div>
            )}

            {submitError && <p className="text-sm text-status-error">{submitError}</p>}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit() || submitting}
              className="btn-primary w-full h-12 text-base flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Envoi en cours…' : isFree(selectedPlan) ? "S'inscrire gratuitement →" : 'Envoyer ma demande →'}
            </button>
          </div>
        ) : null /* PAYMENT STEP BYPASSED */}

        {false && step === 'payment' && (
          /* -- Étape 2 : Paiement + reçu — désactivé temporairement -- */
          <div className="space-y-6">
            <button onClick={() => setStep('info')} className="text-sm text-content-secondary hover:text-content-primary transition-colors">
              ← Retour
            </button>

            <div className="card p-6 space-y-5">
              <h2 className="font-bold text-content-primary text-lg">Paiement</h2>

              {/* Récap */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-input border border-surface-border">
                <span className="text-sm text-content-primary">{selectedPlan?.label}</span>
                <span className="font-bold text-content-brand">
                  {selectedPlan?.price.toLocaleString('fr-FR')} {displayCurrency(selectedPlan?.currency ?? '')}
                </span>
              </div>

              <ol className="space-y-3">
                {[
                  { n: 1, text: 'Scannez le QR code Wave ou Orange Money ci-dessous' },
                  { n: 2, text: `Effectuez le paiement de ${selectedPlan?.price.toLocaleString('fr-FR') ?? '—'} ${displayCurrency(selectedPlan?.currency ?? '')}` },
                  { n: 3, text: 'Prenez une photo de votre reçu de paiement' },
                  { n: 4, text: 'Joignez le reçu et envoyez votre demande' },
                ].map(({ n, text }) => (
                  <li key={n} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-brand-600 text-content-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                    <span className="text-sm text-content-primary">{text}</span>
                  </li>
                ))}
              </ol>

              {/* QR Codes */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'wave' as const, label: 'Wave',         url: settings?.wave_qr_url, color: 'border-blue-700 bg-badge-info' },
                  { key: 'om'   as const, label: 'Orange Money', url: settings?.om_qr_url,   color: 'border-orange-700 bg-badge-orange' },
                ].map(({ key, label, url, color }) => (
                  <button key={key} onClick={() => url && setShowQr(key)} disabled={!url}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                      ${url ? `${color} hover:opacity-90 cursor-pointer` : 'border-surface-border opacity-30'}`}>
                    <QrCode className="w-8 h-8 text-content-primary" />
                    <span className="text-sm font-medium text-content-primary">{label}</span>
                    {!url && <span className="text-xs text-content-muted">Bientôt disponible</span>}
                  </button>
                ))}
              </div>

              {/* Upload reçu */}
              <div className="space-y-3 pt-2 border-t border-surface-border">
                <p className="text-sm font-semibold text-content-primary">Joindre votre reçu</p>

                {receiptPreview ? (
                  <div className="relative w-fit">
                    <img src={receiptPreview ?? undefined} alt="reçu" className="h-36 w-auto rounded-xl border border-surface-border object-cover" />
                    <button onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                      <X className="w-3.5 h-3.5 text-content-primary" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 w-full h-32
                                    border-2 border-dashed border-surface-border rounded-xl
                                    cursor-pointer hover:border-brand-500 transition-colors">
                    <FileImage className="w-8 h-8 text-content-muted" />
                    <span className="text-sm text-content-secondary">Cliquez pour choisir une image</span>
                    <span className="text-xs text-content-muted">PNG, JPG, PDF</span>
                    <input type="file" accept="image/*,.pdf" className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleReceiptChange(e.target.files[0])} />
                  </label>
                )}

                {submitError && <p className="text-sm text-status-error">{submitError}</p>}

                <button onClick={handleSubmit} disabled={!receiptFile || submitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 h-11">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? 'Envoi en cours…' : 'Envoyer ma demande'}
                </button>
                <p className="text-xs text-content-muted text-center">Traitement sous 24h après réception.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pied de page */}
      <p className="relative text-center text-xs text-content-muted mt-8">
        En vous abonnant, vous acceptez notre{' '}
        <a href="/privacy" className="text-content-secondary hover:text-content-primary underline underline-offset-2 transition-colors">
          Politique de confidentialité
        </a>
      </p>

      {/* Modal QR agrandi */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowQr(null)}>
          <div className="bg-white rounded-2xl p-4 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <img src={showQr === 'wave' ? settings?.wave_qr_url! : settings?.om_qr_url!} alt="QR" className="w-full h-auto rounded-xl" />
            <p className="text-center text-sm text-slate-700 font-medium mt-3">
              {showQr === 'wave' ? 'Wave' : 'Orange Money'} — {selectedPlan?.price.toLocaleString('fr-FR')} {displayCurrency(selectedPlan?.currency ?? '')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
