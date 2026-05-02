'use client';

export async function copyTextToClipboard(text: string): Promise<void> {
  if (!text) throw new Error('Aucun texte a copier');

  if (typeof document !== 'undefined' && document.body) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (copied) return;
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    navigator.clipboard?.writeText &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error('Copie refusee par le navigateur');
}
