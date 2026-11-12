import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Réservation en ligne',
};

export default function ReservationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="min-h-screen bg-slate-50 text-slate-900">
      {children}
    </div>
  );
}
