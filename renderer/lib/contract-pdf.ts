/**
 * Génère un PDF de contrat côté client (jsPDF + html2canvas).
 * Remplace {{signature_block}} par la signature du locataire
 * et {{lessor_signature_block}} par la signature du loueur (si fournie).
 */
export async function generateContractPdf(
  body: string,
  clientSigSrc: string,    // data URL ou URL https
  lessorSigSrc?: string,   // data URL ou URL https (optionnel)
): Promise<Blob> {
  const [jsPDFModule, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const jsPDF       = jsPDFModule.default;
  const html2canvas = html2canvasModule.default;

  const today = new Date().toLocaleDateString('fr-FR');

  const clientBlock =
    `<img src="${clientSigSrc}" alt="signature locataire"
          style="height:70px;border:1px solid #ddd;border-radius:6px;padding:6px;background:white;display:block;margin:8px auto 0;" />
     <p style="font-size:10px;color:#666;margin-top:4px;">Signé électroniquement le ${today}</p>`;

  const lessorBlock = lessorSigSrc
    ? `<img src="${lessorSigSrc}" alt="signature loueur"
           style="height:70px;border:1px solid #ddd;border-radius:6px;padding:6px;background:white;display:block;margin:8px auto 0;" />
       <p style="font-size:10px;color:#666;margin-top:4px;">Signé le ${today}</p>`
    : `<p style="font-size:11px;color:#aaa;margin-top:50px;border-top:1px solid #ccc;padding-top:8px;width:80%;display:inline-block;">Signature</p>`;

  // Remplacements
  let html = body;
  html = html.includes('{{signature_block}}')
    ? html.replace('{{signature_block}}', clientBlock)
    : html + clientBlock;

  html = html.replace('{{lessor_signature_block}}', lessorBlock);

  // Rendu HTML → canvas → PDF
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;padding:20px;box-sizing:border-box;';
  container.innerHTML = html;
  document.body.appendChild(container);

  // Attendre que toutes les images soient décodées avant html2canvas
  await Promise.all(
    Array.from(container.querySelectorAll('img')).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload  = () => resolve();
        img.onerror = () => resolve(); // ne pas bloquer en cas d'erreur
      });
    })
  );

  try {
    const canvas = await html2canvas(container, {
      scale: 1.5,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      imageTimeout: 10000,
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.85);

    const pdf  = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
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

/** Convertit une URL image (https) en data URL via fetch */
export async function imageUrlToDataUrl(url: string): Promise<string> {
  const res  = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Convertit un data URL en Blob */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bin  = atob(b64);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
