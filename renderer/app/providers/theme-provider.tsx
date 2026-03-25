'use client';

import { useEffect } from 'react';
import { useThemeStore, resolveTheme } from '@/store/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  function apply() {
    const resolved = resolveTheme(theme);
    if (resolved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  useEffect(() => {
    apply();

    if (theme !== 'auto') return;

    // En mode auto, re-vérifier toutes les minutes
    const id = setInterval(apply, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return <>{children}</>;
}
