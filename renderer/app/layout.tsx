import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from './providers/auth-provider';
import { ThemeProvider } from './providers/theme-provider';
import { NotificationContainer } from '@/components/ui/NotificationContainer';

export const metadata: Metadata = {
  title: 'Elm POS',
  description: 'Multi-business Point of Sale System',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
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
