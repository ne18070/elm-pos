import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Converts an HTML string to a PDF Blob.
 * 
 * @param html The HTML content to render.
 * @param options Rendering options.
 * @returns A Promise resolving to a Blob of the PDF.
 */
export async function htmlToPdfBlob(
  html: string,
  options: { width?: number; filename?: string } = {}
): Promise<Blob> {
  // 1. Create a hidden container to render the HTML
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = options.width ? `${options.width}px` : '400px';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // 2. Render to canvas
    const canvas = await html2canvas(container, {
      scale: 2, // Higher scale for better quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // 3. Convert canvas to PDF
    const imgData = canvas.toDataURL('image/png');
    
    // Calculate dimensions
    // 80mm is about 226pt
    const pdfWidth  = 80; 
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight],
    });

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    
    return pdf.output('blob');
  } finally {
    // 4. Cleanup
    document.body.removeChild(container);
  }
}
