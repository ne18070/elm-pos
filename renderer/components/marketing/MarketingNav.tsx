'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserCircle, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export function MarketingNav() {
  const { user } = useAuthStore();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'theme-dark bg-surface-card border-b border-surface-border py-2.5 shadow-xl'
          : 'theme-dark bg-surface-card/95 border-b border-surface-border py-5 backdrop-blur-md'
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-14 h-14 rounded-xl bg-white overflow-hidden flex items-center justify-center p-1.5 transition-all duration-300 ${
              scrolled ? 'border border-surface-border shadow-md' : 'border border-surface-border shadow-2xl'
            }`}
          >
            <img src="/logo.png" alt="ELM" className="w-full h-full object-contain" />
          </div>
        </div>

        <nav
          className={`hidden md:flex items-center gap-8 text-sm font-medium transition-colors duration-300 ${
            scrolled ? 'text-content-muted' : 'text-content-secondary'
          }`}
        >
          <a href="/#features" className="hover:text-brand-300 transition-colors">Fonctionnalités</a>
          <a href="/#secteurs" className="hover:text-brand-300 transition-colors">Secteurs</a>
          <a href="/#tarifs" className="hover:text-brand-300 transition-colors">Tarifs</a>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/pos"
              className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-300 ${
                scrolled
                  ? 'text-content-primary bg-surface hover:bg-surface-hover'
                  : 'text-content-primary bg-surface-card/70 hover:bg-surface-card'
              }`}
            >
              <UserCircle className="w-3.5 h-3.5" />
              {user.full_name?.split(' ')[0] ?? 'Mon espace'}
              <ChevronRight className="w-3.5 h-3.5 text-content-secondary" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={`text-sm transition-colors duration-300 hidden sm:block ${
                  scrolled ? 'text-content-muted hover:text-content-primary' : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                Connexion
              </Link>
              <Link
                href="/subscribe"
                className="text-sm font-semibold text-content-primary bg-brand-600 hover:bg-brand-500 px-4 py-1.5 rounded-lg transition-colors"
              >
                Essai gratuit
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
