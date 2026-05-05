'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface TourStep {
  id: string;
  title: string;
  content: string;
  selector?: string; // CSS selector to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface VisualTourProps {
  steps: TourStep[];
  onComplete?: () => void;
  onDismiss?: () => void;
  tourId: string;
  autoStart?: boolean;
}

export function VisualTour({ steps, onComplete, onDismiss, tourId, autoStart = false }: VisualTourProps) {
  const [active, setActive]       = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [coords, setCoords]       = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [mounted, setMounted]     = useState(false);
  
  const step = steps[currentStep];

  useEffect(() => {
    setMounted(true);
    const hasSeen = localStorage.getItem(`tour_seen_${tourId}`);
    if (autoStart && !hasSeen) {
      setActive(true);
    }
  }, [tourId, autoStart]);

  const updateCoords = useCallback(() => {
    if (!step?.selector) {
      setCoords({ top: 0, left: 0, width: 0, height: 0 });
      return;
    }

    const el = document.querySelector(step.selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [step]);

  useEffect(() => {
    if (active) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      return () => window.removeEventListener('resize', updateCoords);
    }
  }, [active, updateCoords]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      complete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const complete = () => {
    setActive(false);
    localStorage.setItem(`tour_seen_${tourId}`, '1');
    onComplete?.();
  };

  const dismiss = () => {
    setActive(false);
    onDismiss?.();
  };

  if (!mounted || !active) return null;

  const isLast = currentStep === steps.length - 1;
  const hasTarget = !!step.selector && coords.width > 0;

  // Calcul position tooltip
  let tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 9999,
    transition: 'all 0.3s ease-in-out',
  };

  if (hasTarget) {
    const gap = 12;
    if (step.position === 'bottom') {
      tooltipStyle.top = coords.top + coords.height + gap;
      tooltipStyle.left = coords.left + (coords.width / 2);
      tooltipStyle.transform = 'translateX(-50%)';
    } else if (step.position === 'top') {
      tooltipStyle.top = coords.top - gap;
      tooltipStyle.left = coords.left + (coords.width / 2);
      tooltipStyle.transform = 'translate(-50%, -100%)';
    } else if (step.position === 'left') {
      tooltipStyle.top = coords.top + (coords.height / 2);
      tooltipStyle.left = coords.left - gap;
      tooltipStyle.transform = 'translate(-100%, -50%)';
    } else if (step.position === 'right') {
      tooltipStyle.top = coords.top + (coords.height / 2);
      tooltipStyle.left = coords.left + coords.width + gap;
      tooltipStyle.transform = 'translateY(-50%)';
    } else {
      // center or fallback
      tooltipStyle.top = '50%';
      tooltipStyle.left = '50%';
      tooltipStyle.transform = 'translate(-50%, -50%)';
    }
  } else {
    tooltipStyle.top = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
    tooltipStyle.position = 'fixed';
  }

  return createPortal(
    <div className="fixed inset-0 z-[9998] overflow-hidden pointer-events-none">
      {/* Overlay avec "trou" (mask) */}
      <div 
        className="absolute inset-0 bg-black/60 pointer-events-auto transition-opacity duration-500"
        style={{
          clipPath: hasTarget 
            ? `polygon(0% 0%, 0% 100%, ${coords.left}px 100%, ${coords.left}px ${coords.top}px, ${coords.left + coords.width}px ${coords.top}px, ${coords.left + coords.width}px ${coords.top + coords.height}px, ${coords.left}px ${coords.top + coords.height}px, ${coords.left}px 100%, 100% 100%, 100% 0%)`
            : 'none'
        }}
        onClick={dismiss}
      />

      {/* Tooltip */}
      <div 
        style={tooltipStyle}
        className="w-[320px] bg-surface-card border border-brand-500/30 rounded-2xl shadow-2xl p-5 pointer-events-auto animate-in fade-in zoom-in duration-300"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-content-brand">
              Guide ELM · {currentStep + 1}/{steps.length}
            </span>
          </div>
          <button onClick={dismiss} className="text-content-muted hover:text-content-primary p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <h3 className="text-base font-bold text-content-primary mb-2">{step.title}</h3>
        <p className="text-sm text-content-secondary leading-relaxed mb-6">
          {step.content}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`h-1 rounded-full transition-all duration-300 ${i === currentStep ? 'w-4 bg-brand-500' : 'w-1 bg-surface-input'}`} 
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button 
                onClick={handlePrev}
                className="p-2 rounded-xl border border-surface-border text-content-muted hover:text-content-primary hover:bg-surface-hover transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={handleNext}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-content-primary text-sm font-bold rounded-xl transition-all shadow-lg shadow-brand-600/20"
            >
              {isLast ? 'Terminer' : 'Suivant'}
              {!isLast && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Hook pour déclencher le tour depuis n'importe où
export function useTourTrigger(tourId: string) {
  return {
    start: () => {
      localStorage.removeItem(`tour_seen_${tourId}`);
      window.dispatchEvent(new CustomEvent(`start_tour_${tourId}`));
    }
  };
}
