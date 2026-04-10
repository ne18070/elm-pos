'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, CheckCircle, AlertTriangle, PenLine, RotateCcw, Send, Download,
} from 'lucide-react';
import {
  getContractByToken, signContract, savePdfUrl, uploadContractPdf,
  type Contract,
} from '@services/supabase/contracts';

// ─── Page publique de signature de contrat ────────────────────────────────────

type Stage = 'loading' | 'error' | 'already_signed' | 'expired' | 'reading' | 'signing' | 'done';

export default function ContractSignPage() {
  const { token } = useParams<{ token: string }>();

  const [stage, setStage]       = useState<Stage>('loading');
  const [contract, setContract] = useState<Contract | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Canvas signature
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const drawing    = useRef(false);
  const hasStrokes = useRef(false);

  // ─── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    getContractByToken(token)
      .then((c) => {
        if (!c) { setStage('expired'); return; }
        if (c.status === 'signed') { setContract(c); setStage('already_signed'); return; }
        if (c.status !== 'sent')   { setStage('expired'); return; }
        if (new Date(c.token_expires_at) < new Date()) { setStage('expired'); return; }
        setContract(c);
        setStage('reading');
      })
      .catch((e: unknown) => {
        setErrorMsg(e instanceof Error ? e.message : 'Erreur de chargement');
        setStage('error');
      });
  }, [token]);

  // ─── Canvas drawing ────────────────────────────────────────────────────────

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    drawing.current = true;
    hasStrokes.current = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => { drawing.current = false; };

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const canvas = canvasRef.current;
    if (!canvas || !contract) return;
    if (!hasStrokes.current) { setSubmitError('Veuillez apposer votre signature avant de valider.'); return; }

    setSubmitting(true);
    setSubmitError('');
    try {
      const sigDataUrl = canvas.toDataURL('image/png');
      await signContract(token, sigDataUrl);

      // Generate and upload PDF
      try {
        const pdfBlob = await generatePdf(contract, sigDataUrl);
        const pdfUrl  = await uploadContractPdf(token, pdfBlob);
        await savePdfUrl(token, pdfUrl);
        setContract((prev) => prev ? { ...prev, pdf_url: pdfUrl } : prev);
      } catch {
        // PDF generation failure is non-blocking
      }

      setStage('done');
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur lors de la signature');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Stages ───────────────────────────────────────────────────────────────

  if (stage === 'loading') {
    return (
      <MobileShell>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Loader2 className="w-10 h-10 animate-spin text-brand-500" />
          <p className="text-slate-500">Chargement du contrat…</p>
        </div>
      </MobileShell>
    );
  }

  if (stage === 'error') {
    return (
      <MobileShell>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-6">
          <AlertTriangle className="w-12 h-12 text-red-400" />
          <p className="text-lg font-semibold text-white">Erreur</p>
          <p className="text-slate-400 text-sm">{errorMsg}</p>
        </div>
      </MobileShell>
    );
  }

  if (stage === 'expired') {
    return (
      <MobileShell>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-6">
          <AlertTriangle className="w-12 h-12 text-amber-400" />
          <p className="text-lg font-semibold text-white">Lien expiré</p>
          <p className="text-slate-400 text-sm">
            Ce lien de signature n'est plus valide. Contactez le loueur pour obtenir un nouveau lien.
          </p>
        </div>
      </MobileShell>
    );
  }

  if (stage === 'already_signed' && contract) {
    return (
      <MobileShell>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-6">
          <CheckCircle className="w-12 h-12 text-green-400" />
          <p className="text-lg font-semibold text-white">Contrat déjà signé</p>
          <p className="text-slate-400 text-sm">
            Ce contrat a déjà été signé le {contract.signed_at
              ? new Date(contract.signed_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
              : '—'}.
          </p>
          {contract.pdf_url && (
            <a href={contract.pdf_url} target="_blank" rel="noreferrer"
               className="mt-4 flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 py-3 rounded-xl transition-colors">
              <Download className="w-4 h-4" /> Télécharger le PDF
            </a>
          )}
        </div>
      </MobileShell>
    );
  }

  if (stage === 'done') {
    return (
      <MobileShell>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-6">
          <div className="w-20 h-20 rounded-full bg-green-900/30 border-2 border-green-500 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <p className="text-xl font-bold text-white">Contrat signé !</p>
          <p className="text-slate-400 text-sm">
            Votre signature électronique a bien été enregistrée. Vous recevrez une confirmation.
          </p>
          {contract?.pdf_url && (
            <a href={contract.pdf_url} target="_blank" rel="noreferrer"
               className="mt-4 flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 py-3 rounded-xl transition-colors">
              <Download className="w-4 h-4" /> Télécharger mon exemplaire (PDF)
            </a>
          )}
        </div>
      </MobileShell>
    );
  }

  // ─── Reading + Signing ─────────────────────────────────────────────────────

  return (
    <MobileShell>
      {/* Header */}
      <div className="px-4 pt-8 pb-4 text-center border-b border-gray-100">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Contrat de location</p>
        <h1 className="text-xl font-bold text-gray-900">{contract?.client_name}</h1>
        {contract?.start_date && contract?.end_date && (
          <p className="text-sm text-gray-500 mt-1">
            {new Date(contract.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            {' → '}
            {new Date(contract.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Contract body */}
      <div className="px-4 py-6">
        <div
          className="text-sm text-gray-800 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: contract?.body ?? '' }}
        />
      </div>

      {/* Signature zone */}
      <div className="px-4 pb-8">
        {stage === 'reading' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">Avant de signer</p>
              <p>Veuillez lire attentivement le contrat ci-dessus. En signant, vous acceptez les conditions.</p>
            </div>
            <button
              onClick={() => setStage('signing')}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold py-4 rounded-2xl transition-colors text-base"
            >
              <PenLine className="w-5 h-5" /> Signer ce contrat
            </button>
          </div>
        )}

        {stage === 'signing' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <PenLine className="w-4 h-4" /> Apposez votre signature ci-dessous
              </p>
              <div className="relative border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden bg-gray-50">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="w-full touch-none cursor-crosshair"
                  style={{ display: 'block' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
                <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                  <div className="w-48 h-px bg-gray-300" />
                </div>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-400">Dessinez votre signature avec le doigt ou la souris</p>
                <button onClick={clearCanvas} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                  <RotateCcw className="w-3.5 h-3.5" /> Effacer
                </button>
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-red-600 text-center">{submitError}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-semibold py-4 rounded-2xl transition-colors text-base"
            >
              {submitting
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Signature en cours…</>
                : <><Send className="w-5 h-5" /> Valider ma signature</>}
            </button>

            <p className="text-xs text-gray-400 text-center">
              En validant, vous signez électroniquement ce contrat. Cette action est irréversible.
            </p>
          </div>
        )}
      </div>
    </MobileShell>
  );
}

// ─── Mobile shell (light, public page) ───────────────────────────────────────

function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white" style={{ maxWidth: '640px', margin: '0 auto' }}>
      {/* Brand header */}
      <div className="bg-brand-600 text-white px-4 py-3 flex items-center gap-2">
        <span className="font-bold text-lg tracking-tight">ELM</span>
        <span className="text-brand-200 text-xs">|</span>
        <span className="text-brand-100 text-sm">Signature de contrat</span>
      </div>
      {children}
      <div className="px-4 py-6 text-center text-xs text-gray-400 border-t border-gray-100">
        Propulsé par <span className="font-semibold text-brand-500">Elm App</span>
      </div>
    </div>
  );
}

// ─── PDF generation (client-side, jsPDF + html2canvas) ───────────────────────

async function generatePdf(contract: Contract, signatureDataUrl: string): Promise<Blob> {
  const [jsPDFModule, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const jsPDF     = jsPDFModule.default;
  const html2canvas = html2canvasModule.default;

  // Build signed HTML
  const signedHtml = contract.body.replace(
    '{{signature_block}}',
    `<div style="text-align:center; margin-top: 20px;">
      <img src="${signatureDataUrl}" alt="signature" style="height:80px; border: 1px solid #ddd; border-radius: 8px; padding: 8px; background: white;" />
      <p style="font-size:11px; color:#666; margin-top:4px;">Signé électroniquement le ${new Date().toLocaleDateString('fr-FR')}</p>
    </div>`
  ) || (contract.body + `<div style="text-align:center; margin-top: 40px;">
    <img src="${signatureDataUrl}" alt="signature" style="height:80px; border: 1px solid #ddd; border-radius: 8px; padding: 8px; background: white;" />
    <p style="font-size:11px; color:#666; margin-top:4px;">Signé électroniquement le ${new Date().toLocaleDateString('fr-FR')}</p>
  </div>`);

  // Render HTML to canvas
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed; left:-9999px; top:0; width:794px; background:white;';
  container.innerHTML = signedHtml;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/jpeg', 0.85);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pdfW) / canvas.width;

    let posY = 0;
    let remaining = imgH;
    let pageCount = 0;
    while (remaining > 0) {
      if (pageCount > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -posY, pdfW, imgH);
      posY += pdfH;
      remaining -= pdfH;
      pageCount++;
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}
