'use client';

import React from 'react';
import { trackError } from '@/lib/analytics';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Label displayed in the fallback and included in the error log for easy triage. */
  section?: string;
}

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ errorInfo: info });

    trackError('js', error.message || 'React render error', {
      name:            error.name,
      stack:           error.stack?.slice(0, 1500),
      componentStack:  info.componentStack?.slice(0, 1500),
      section:         this.props.section ?? 'unknown',
    });
  }

  private reset = () => this.setState({ error: null, errorInfo: null });

  render() {
    const { error, errorInfo } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6 text-center">
        <div className="p-4 rounded-2xl bg-status-error/10 text-status-error">
          <AlertTriangle size={32} />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-black text-content-primary uppercase tracking-wide">
            Erreur inattendue
            {this.props.section ? ` — ${this.props.section}` : ''}
          </p>
          <p className="text-xs text-status-error font-mono max-w-md break-words">
            {error.message}
          </p>
        </div>

        {errorInfo?.componentStack && (
          <details className="max-w-lg w-full text-left">
            <summary className="text-[10px] font-black text-content-muted uppercase tracking-widest cursor-pointer select-none">
              Détail technique
            </summary>
            <pre className="mt-2 text-[9px] font-mono text-content-muted bg-surface-input rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-surface-border">
              {errorInfo.componentStack}
            </pre>
          </details>
        )}

        <button
          onClick={this.reset}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-input border border-surface-border text-xs font-black text-content-primary hover:border-brand-500/30 transition-colors"
        >
          <RefreshCw size={14} />
          Réessayer
        </button>
      </div>
    );
  }
}
