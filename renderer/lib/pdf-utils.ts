/**
 * htmlToPdfBlob : rend un document HTML complet en PDF (Blob).
 * Suit le même pattern que contract-pdf.ts : imports dynamiques + div dans le
 * document principal (html2canvas ne peut pas capturer le contenu d'un iframe).
 */
export async function htmlToPdfBlob(
  html: string,
  options: { width?: number; marginMm?: number } = {}
): Promise<Blob> {
  const [jsPDFModule, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const jsPDF       = jsPDFModule.default;
  const html2canvas = html2canvasModule.default;

  const pdfWidth     = 80;
  const marginMm     = options.marginMm ?? 4;
  const imageWidth   = pdfWidth - marginMm * 2;
  const renderWidthPx = options.width ?? 320;

  // Extraire le <style> et le contenu du <body> du document HTML complet
  const styleMatch   = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const bodyMatch    = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const styleContent = styleMatch ? styleMatch[1] : '';
  const bodyContent  = bodyMatch  ? bodyMatch[1]  : html;

  // Supprimer les règles @page (inapplicables à un div)
  const cleanedStyle = styleContent.replace(/@page\s*\{[^}]*\}/g, '');

  const container = document.createElement('div');
  container.style.cssText = `position:absolute;left:-10000px;top:0;width:${renderWidthPx}px;background:white;`;
  container.innerHTML = `<style>${cleanedStyle}</style>${bodyContent}`;
  document.body.appendChild(container);

  // Attendre le chargement des images
  await Promise.all(
    Array.from(container.querySelectorAll('img')).map((img) => {
      if ((img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        (img as HTMLImageElement).onload  = () => resolve();
        (img as HTMLImageElement).onerror = () => resolve();
      });
    })
  );

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData    = canvas.toDataURL('image/png');
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    const pdfHeight  = imageHeight + marginMm * 2;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight],
    });

    pdf.addImage(imgData, 'PNG', marginMm, marginMm, imageWidth, imageHeight);
    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}
