import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from './providers/auth-provider';
import { ThemeProvider } from './providers/theme-provider';
import { NotificationContainer } from '@/components/ui/NotificationContainer';

export const metadata: Metadata = {
  title: 'ELM APP',
  description: 'Multi-business Point of Sale System',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <NotificationContainer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
