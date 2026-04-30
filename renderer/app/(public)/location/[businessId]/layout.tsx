import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Location de véhicule',
};

export default function LocationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {children}
    </div>
  );
}
