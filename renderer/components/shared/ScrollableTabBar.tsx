'use client';

import { Children, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Barre d'onglets défilable horizontalement, avec flèches gauche/droite.
 * Les flèches n'apparaissent que si le contenu dépasse réellement la largeur
 * visible (pas de flèche inutile sur un écran large) et se masquent aux
 * extrémités du scroll.
 */
export function ScrollableTabBar({ children, className }: { children: React.ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener('scroll', updateArrows);
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      ro.disconnect();
      window.removeEventListener('resize', updateArrows);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateArrows, Children.count(children)]);

  function scrollBy(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });
  }

  return (
    <div className={cn('relative flex items-stretch', className)}>
      {canScrollLeft && (
        <button
          onClick={() => scrollBy(-1)}
          aria-label="Défiler vers la gauche"
          className="shrink-0 flex items-center justify-center w-7 text-content-muted hover:text-content-brand transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      <div ref={scrollRef} className="flex px-2 overflow-x-auto no-scrollbar flex-1 min-w-0 scroll-smooth">
        {children}
      </div>
      {canScrollRight && (
        <button
          onClick={() => scrollBy(1)}
          aria-label="Défiler vers la droite"
          className="shrink-0 flex items-center justify-center w-7 text-content-muted hover:text-content-brand transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
