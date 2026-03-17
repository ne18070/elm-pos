import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from './providers/auth-provider';
import { NotificationContainer } from '@/components/ui/NotificationContainer';

export const metadata: Metadata = {
  title: 'Elm POS',
  description: 'Multi-business Point of Sale System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>
          {children}
          <NotificationContainer />
        </AuthProvider>
      </body>
    </html>
  );
}
