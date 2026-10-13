'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Store, ChevronRight, X, Loader2, Link2 } from 'lucide-react';
import { getBoutiqueInfo } from '@services/supabase/boutique';
import {
  boutiquePath, parseBoutiqueRef, getRecentBoutiques, forgetBoutique,
  type RecentBoutique,
} from '@/lib/boutique-routes';

export default function BoutiqueHome() {
  const router = useRouter();
  const [recents, setRecents] = useState<RecentBoutique[]>([]);
  const [input,   setInput]   = useState('');
  const [opening, setOpening] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => { setRecents(getRecentBoutiques()); }, []);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ref = parseBoutiqueRef(input);
    if (!ref) {
      setError('Collez le lien complet reçu de la boutique, ou son code.');
      return;
    }
    setOpening(true);
    try {
      const info = await getBoutiqueInfo(ref);
      if (!info) {
        setError('Aucune boutique ne correspond à ce lien. Vérifiez-le auprès de la boutique.');
        return;
      }
      router.push(boutiquePath(info.id));
    } catch {
      setError('Connexion impossible. Vérifiez votre accès à internet et réessayez.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface text-content-primary">
      <header className="bg-surface-card border-b border-surface-border pt-[env(safe-area-inset-top)]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white p-1 border border-surface-border">
            <img src="/logo.png" alt="ELM" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-bold text-base">Mes boutiques</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-8 pb-[max(2rem,env(safe-area-inset-bottom))]">

        {/* Ouvrir une boutique */}
        <form onSubmit={handleOpen} className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
          <label htmlFor="boutique-ref" className="block text-sm font-semibold">
            Ouvrir une boutique
          </label>
          <div className="relative">
            <Link2 className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="boutique-ref"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(null); }}
              placeholder="elm-app.click/boutique/…"
              className="w-full h-12 pl-9 pr-3 bg-surface-input border border-surface-border rounded-xl text-sm placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <p className="text-xs text-content-muted">
            Collez le lien que la boutique vous a envoyé (WhatsApp, SMS, réseaux sociaux).
          </p>
          {error && <p className="text-xs text-status-error">{error}</p>}
          <button
            type="submit"
            disabled={opening || !input.trim()}
            className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Voir la boutique'}
          </button>
        </form>

        {/* Boutiques déjà visitées */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-content-muted">Récemment visitées</h2>
          {recents.length === 0 ? (
            <div className="text-center py-10 px-6 border border-dashed border-surface-border rounded-2xl">
              <Store className="w-10 h-10 text-content-muted mx-auto mb-3" />
              <p className="text-sm text-content-secondary">
                Les boutiques que vous ouvrez s&apos;affichent ici : vous les retrouverez en un geste pour commander à nouveau.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {recents.map((b) => (
                <li key={b.id} className="flex items-center bg-surface-card border border-surface-border rounded-2xl">
                  <button
                    onClick={() => router.push(boutiquePath(b.id))}
                    className="flex-1 min-w-0 flex items-center gap-3 p-3 text-left"
                  >
                    <div className="w-11 h-11 rounded-xl border border-surface-border overflow-hidden shrink-0 bg-white">
                      {b.logo_url ? (
                        <img src={b.logo_url} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full bg-brand-600 flex items-center justify-center">
                          <Store className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                    <span className="flex-1 min-w-0 font-semibold text-sm truncate">{b.name}</span>
                    <ChevronRight className="w-4 h-4 text-content-muted shrink-0" />
                  </button>
                  <button
                    onClick={() => setRecents(forgetBoutique(b.id))}
                    aria-label={`Retirer ${b.name} de la liste`}
                    className="w-11 h-11 mr-1 flex items-center justify-center rounded-xl text-content-muted hover:text-content-primary shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-center text-xs text-content-muted">
          <a href="/privacy/" className="underline">Politique de confidentialité</a>
        </p>
      </main>
    </div>
  );
}
