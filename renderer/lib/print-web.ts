/**
 * Impression navigateur (version web)
 * Génère le HTML de la facture et ouvre une fenêtre d'impression.
 */

import { renderTemplate, DEFAULT_A4_DUPLICATE } from './template-config';
import type { TemplateConfig } from './template-config';
import type { ReceiptData } from '../../types';

const WEB_PRINT_CONFIG: TemplateConfig = {
  ...DEFAULT_A4_DUPLICATE,
  id:     'web-print',
  name:   'Impression Web',
  format: 'a4-portrait',
  copies: 1,
};

export function printTestPageBrowser(
  businessName: string,
  address?: string,
  phone?: string,
): { success: boolean; error?: string } {
  const win = window.open('', '_blank', 'width=400,height=500,scrollbars=no');
  if (!win) return { success: false, error: 'Popup bloqué — autorisez les popups pour imprimer' };

  const now = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const line = (text: string) => `<p style="margin:0;padding:2px 0;border-top:1px dashed #999">&nbsp;</p><p style="margin:0">${text}</p>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test impression</title>
<style>
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 20px auto; }
  h1 { font-size: 14px; text-align: center; text-transform: uppercase; letter-spacing: 2px; margin: 8px 0; }
  .div { border-top: 1px dashed #555; margin: 6px 0; }
  p { margin: 2px 0; }
  .ok { text-align: center; font-weight: bold; margin-top: 8px; }
</style>
</head><body>
  <h1>Test Impression</h1>
  <div class="div"></div>
  <p><strong>${businessName}</strong></p>
  ${address ? `<p>${address}</p>` : ''}
  ${phone   ? `<p>${phone}</p>`   : ''}
  <div class="div"></div>
  <p>${now}</p>
  <div class="div"></div>
  <p class="ok">Imprimante OK</p>
  <p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p>
</body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.addEventListener('load', () => { win.focus(); win.print(); });
  return { success: true };
}

export async function printReceiptBrowser(
  data: ReceiptData
): Promise<{ success: boolean; error?: string }> {
  try {
    const html = renderTemplate(
      data.order,
      data.business,
      WEB_PRINT_CONFIG,
      {
        resellerName:        data.reseller_name,
        resellerClientName:  data.reseller_client_name,
        resellerClientPhone: data.reseller_client_phone,
      }
    );

    const win = window.open('', '_blank', 'width=820,height=1060,scrollbars=yes');
    if (!win) {
      return {
        success: false,
        error: 'Popup bloqué — autorisez les popups pour imprimer',
      };
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    // Wait for resources (fonts, images) to load before printing
    win.addEventListener('load', () => {
      win.focus();
      win.print();
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
