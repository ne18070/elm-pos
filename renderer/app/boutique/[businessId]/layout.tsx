import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Boutique en ligne',
};

// Boutique pages are client-only, no server-side auth or dashboard chrome
export default function BoutiqueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {children}
    </div>
  );
}

