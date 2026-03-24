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
