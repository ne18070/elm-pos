'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Printer, Check, RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { getBusinessKind } from '@/lib/business-kind';
import { Button, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  buildAppPosterHtml, defaultPosterText, onAccent, POSTER_ACCENTS,
  type PosterAudience, type PosterFormat,
} from '@/lib/app-poster';

/** Taille de la page à l'écran (1 mm ≈ 3,78 px) + marge de l'aperçu */
const PAGE_PX: Record<PosterFormat, { w: number; h: number }> = {
  A4: { w: 794, h: 1123 },
  A5: { w: 559, h: 794 },
};
const PREVIEW_PAD = 48;

const FORMATS: { value: PosterFormat; label: string; hint: string }[] = [
  { value: 'A4', label: 'A4', hint: 'Mur, vitrine' },
  { value: 'A5', label: 'A5', hint: 'Comptoir, chevalet' },
];

const AUDIENCES: { value: PosterAudience; label: string; hint: string }[] = [
  { value: 'service', label: 'Suivi des réparations', hint: 'Ordres de travail notifiés dans l’app' },
  { value: 'boutique', label: 'Commandes en ligne', hint: 'Catalogue et commande dans l’app' },
];

/**
 * Affiche de comptoir pour faire installer l'app ELM Boutique à ses clients :
 * QR Android + iPhone, logo et coordonnées de l'établissement. Aperçu fidèle
 * (même document que l'impression), imprimé depuis l'iframe — pas de pop-up.
 */
export default function AfficheAppPage() {
  const { business } = useAuthStore();
  const router = useRouter();
  // Ouverte depuis /services ou les paramètres : on y retourne ; lien direct → paramètres
  const goBack = () => (window.history.length > 1 ? router.back() : router.push('/settings'));
  const businessName = business?.name ?? '';
  const businessAudience: PosterAudience = getBusinessKind(business) === 'service' ? 'service' : 'boutique';

  const [format, setFormat] = useState<PosterFormat>('A4');
  const [audience, setAudience] = useState<PosterAudience>(businessAudience);
  // Établissement chargé après le premier rendu (rechargement, lien direct) : le
  // message suit son type tant que l'utilisateur n'en a pas choisi un
  const [audienceChosen, setAudienceChosen] = useState(false);
  useEffect(() => {
    if (!audienceChosen && business) setAudience(businessAudience);
  }, [audienceChosen, business, businessAudience]);
  const [accent, setAccent] = useState(POSTER_ACCENTS[0]);
  const [showPhone, setShowPhone] = useState(true);
  const [showAddress, setShowAddress] = useState(true);
  const [headline, setHeadline] = useState('');
  const [subline, setSubline] = useState('');
  const [textEdited, setTextEdited] = useState(false);
  const [ready, setReady] = useState(false);

  // Texte par défaut selon le message choisi, tant que l'utilisateur ne l'a pas modifié
  useEffect(() => {
    if (textEdited || !businessName) return;
    const d = defaultPosterText(audience, businessName);
    setHeadline(d.headline);
    setSubline(d.subline);
  }, [audience, businessName, textEdited]);

  function resetText() {
    const d = defaultPosterText(audience, businessName);
    setHeadline(d.headline);
    setSubline(d.subline);
    setTextEdited(false);
  }

  // Le texte arrive dans l'aperçu après une pause de frappe : chaque nouveau
  // document recharge l'iframe (QR + logo) et bloque l'impression le temps du chargement
  const [previewText, setPreviewText] = useState({ headline, subline });
  useEffect(() => {
    const t = setTimeout(() => setPreviewText({ headline, subline }), 400);
    return () => clearTimeout(t);
  }, [headline, subline]);
  const textPending = previewText.headline !== headline || previewText.subline !== subline;

  const html = useMemo(() => buildAppPosterHtml({
    businessName,
    logoUrl: business?.logo_url,
    phone: showPhone ? business?.phone : null,
    address: showAddress ? business?.address : null,
    format, audience, accent, headline: previewText.headline, subline: previewText.subline,
  }), [businessName, business?.logo_url, business?.phone, business?.address, showPhone, showAddress, format, audience, accent, previewText]);

  // Aperçu mis à l'échelle de la colonne
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWrapWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const page = PAGE_PX[format];
  const frameW = page.w + PREVIEW_PAD;
  const frameH = page.h + PREVIEW_PAD;
  const scale = wrapWidth ? Math.min(1, wrapWidth / frameW) : 1;

  // Impression possible une fois les QR et le logo chargés
  const frameRef = useRef<HTMLIFrameElement>(null);
  function onFrameLoad() {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const images = Array.from(doc.images);
    const pending = images.filter(img => !img.complete);
    if (!pending.length) { setReady(true); return; }
    let left = pending.length;
    pending.forEach(img => {
      const done = () => { left -= 1; if (left === 0) setReady(true); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }
  useEffect(() => { setReady(false); }, [html]);

  const canPrint = ready && !textPending;

  function print() {
    if (!canPrint) return;
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-card border-b border-surface-border shrink-0">
        <Button variant="ghost" size="lg" aria-label="Retour" onClick={goBack}
          icon={<ArrowLeft className="w-5 h-5" />} className="-ml-3 px-3" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-content-primary">Affiche de l’app mobile</h1>
          <p className="text-xs text-content-secondary truncate">
            À imprimer et poser au comptoir : vos clients scannent et installent ELM Boutique.
          </p>
        </div>
        <Button onClick={print} disabled={!canPrint} loading={!ready} icon={<Printer className="w-4 h-4" />}
          className="hidden sm:inline-flex">
          Imprimer
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto lg:overflow-hidden lg:flex">
        {/* Réglages */}
        <aside className="lg:w-[340px] lg:shrink-0 lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-surface-border bg-surface-card p-4 space-y-6">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-2">Message</p>
            <div className="space-y-2">
              {AUDIENCES.map(a => (
                <button key={a.value} type="button" onClick={() => { setAudience(a.value); setAudienceChosen(true); }}
                  className={cn('w-full text-left rounded-xl border px-3 py-2.5 min-h-[44px] transition-colors',
                    audience === a.value
                      ? 'border-brand-500 bg-badge-brand'
                      : 'border-surface-border hover:bg-surface-hover')}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-content-primary">{a.label}</span>
                    {audience === a.value && <Check className="w-4 h-4 text-content-brand" />}
                  </span>
                  <span className="block text-xs text-content-secondary mt-0.5">{a.hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-2">Format</p>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map(f => (
                <button key={f.value} type="button" onClick={() => setFormat(f.value)}
                  className={cn('rounded-xl border px-3 py-2.5 min-h-[44px] text-left transition-colors',
                    format === f.value ? 'border-brand-500 bg-badge-brand' : 'border-surface-border hover:bg-surface-hover')}>
                  <span className="block text-sm font-semibold text-content-primary">{f.label}</span>
                  <span className="block text-xs text-content-secondary">{f.hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-2">Couleur</p>
            <div className="flex flex-wrap items-center gap-2">
              {POSTER_ACCENTS.map(c => (
                <button key={c} type="button" onClick={() => setAccent(c)} aria-label={`Couleur ${c}`}
                  className={cn('w-11 h-11 rounded-full border-2 flex items-center justify-center',
                    accent === c ? 'border-content-primary' : 'border-transparent')}
                  style={{ backgroundColor: c }}>
                  {accent === c && <Check className="w-4 h-4" style={{ color: onAccent(c) }} />}
                </button>
              ))}
              <label className="w-11 h-11 rounded-full border border-surface-border overflow-hidden cursor-pointer relative"
                title="Couleur personnalisée">
                <input type="color" value={accent} onChange={e => setAccent(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <span className="block w-full h-full"
                  style={{ background: 'conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)' }} />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary">Texte</p>
              {textEdited && (
                <button type="button" onClick={resetText}
                  className="inline-flex items-center gap-1 text-xs text-content-brand hover:underline">
                  <RotateCcw className="w-3 h-3" />Texte proposé
                </button>
              )}
            </div>
            <Input label="Titre" value={headline} maxLength={70}
              onChange={e => { setHeadline(e.target.value); setTextEdited(true); }} />
            <Textarea label="Sous-titre" value={subline} rows={3} maxLength={160}
              onChange={e => { setSubline(e.target.value); setTextEdited(true); }} />
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-2">Coordonnées affichées</p>
            <div className="space-y-1">
              <Toggle label="Téléphone" value={business?.phone} checked={showPhone} onChange={setShowPhone} />
              <Toggle label="Adresse" value={business?.address} checked={showAddress} onChange={setShowAddress} />
            </div>
            {!business?.logo_url && (
              <p className="text-xs text-content-muted mt-3">
                Pas de logo : vos initiales s’affichent. <Link href="/settings" className="text-content-brand underline">Ajouter un logo</Link>
              </p>
            )}
          </section>

          <Button onClick={print} disabled={!canPrint} loading={!ready} size="lg"
            icon={<Printer className="w-4 h-4" />} className="w-full sm:hidden">
            Imprimer l’affiche
          </Button>
        </aside>

        {/* Aperçu fidèle */}
        <div className="flex-1 lg:overflow-y-auto bg-surface p-4">
          <div ref={wrapRef} className="mx-auto w-full" style={{ maxWidth: frameW }}>
            <div style={{ height: frameH * scale }}>
              <iframe
                ref={frameRef}
                title="Aperçu de l’affiche"
                srcDoc={html}
                onLoad={onFrameLoad}
                className="border-0 rounded-xl origin-top-left"
                style={{ width: frameW, height: frameH, transform: `scale(${scale})` }}
              />
            </div>
          </div>
          <p className="text-center text-xs text-content-muted mt-3">
            Astuce : dans la fenêtre d’impression, choisissez « Taille réelle » (100 %) et activez les graphiques d’arrière-plan.
          </p>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, checked, onChange }: {
  label: string; value?: string | null; checked: boolean; onChange: (v: boolean) => void;
}) {
  const disabled = !value;
  return (
    <label className={cn('flex items-center gap-3 rounded-lg px-1 py-2 min-h-[44px]', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled}
        onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-brand-600" />
      <span className="min-w-0">
        <span className="block text-sm text-content-primary">{label}</span>
        <span className="block text-xs text-content-secondary truncate">{value || 'Non renseigné dans les paramètres'}</span>
      </span>
    </label>
  );
}
