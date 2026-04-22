'use client';

import { MarketingTab } from '../components/MarketingTab';

export default function MarketingPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-white tracking-tight uppercase">Marketing & Communication</h1>
        <p className="text-slate-500 text-sm mt-1">Gérez les notifications globales et les campagnes de fidélisation.</p>
      </div>
      <MarketingTab />
    </div>
  );
}
