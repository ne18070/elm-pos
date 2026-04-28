import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

async function waitForDocumentResources(doc: Document): Promise<void> {
  const fonts = doc.fonts?.ready ?? Promise.resolve();
  const images = Array.from(doc.images).map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  });

  await Promise.all([fonts, ...images]);
}

/**
 * Converts an HTML string to a PDF Blob.
 * 
 * @param html The HTML content to render.
 * @param options Rendering options.
 * @returns A Promise resolving to a Blob of the PDF.
 */
export async function htmlToPdfBlob(
  html: string,
  options: { width?: number; filename?: string; marginMm?: number } = {}
): Promise<Blob> {
  const pdfWidth = 80;
  const marginMm = options.marginMm ?? 4;
  const imageWidth = pdfWidth - marginMm * 2;
  const renderWidthPx = options.width ?? 320;

  // Render in a real document so <html>, <head>, <body> and @page styles are parsed correctly.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${renderWidthPx}px`;
  iframe.style.height = '1px';
  iframe.style.border = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Impossible de preparer le PDF');

    doc.open();
    doc.write(html);
    doc.close();

    await waitForDocumentResources(doc);

    const target = doc.body;
    const rect = target.getBoundingClientRect();
    const captureWidth = Math.ceil(Math.max(target.scrollWidth, target.offsetWidth, rect.width));
    const captureHeight = Math.ceil(Math.max(target.scrollHeight, target.offsetHeight, rect.height));

    iframe.style.height = `${captureHeight}px`;

    const canvas = await html2canvas(target, {
      scale: 2, // Higher scale for better quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: captureWidth,
      height: captureHeight,
      windowWidth: Math.max(renderWidthPx, captureWidth),
      windowHeight: captureHeight,
    });

    const imgData = canvas.toDataURL('image/png');
    
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    const pdfHeight = imageHeight + marginMm * 2;
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight],
    });

    pdf.addImage(imgData, 'PNG', marginMm, marginMm, imageWidth, imageHeight);
    
    return pdf.output('blob');
  } finally {
    document.body.removeChild(iframe);
  }
}
