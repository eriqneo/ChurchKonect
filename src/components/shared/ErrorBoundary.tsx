import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import * as Typography from '../../lib/theme/typography';
import { motion } from 'motion/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    showDetails: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReportIssue = () => {
    // Elegant toast or log for issue report in preview environment
    alert(`Issue reported: ${this.state.error?.message || 'Unknown error'}`);
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev }));
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-theme-bg flex flex-col items-center justify-center p-6 text-center text-theme-text">
          <div className="max-w-md w-full flex flex-col items-center">
            {/* Alert-triangle icon */}
            <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-5 animate-pulse">
              <AlertTriangle className="w-8 h-8 stroke-[1.5]" />
            </div>

            {/* Title */}
            <h2 className={`${Typography.SUBTITLE} text-theme-text text-lg font-bold tracking-tight mb-2`}>
              Something went wrong
            </h2>

            {/* Sub-explanation */}
            <p className={`${Typography.BODY} text-text-muted text-xs mb-6 max-w-[320px]`}>
              An unexpected error has occurred in the Sanctuary sanctuary layer. Your local data remains safe.
            </p>

            {/* Collapsible Error Detail */}
            {this.state.error && (
              <div className="w-full bg-theme-card border border-theme-border rounded-lg p-3 mb-6 text-left overflow-hidden shadow-card-light dark:shadow-card-dark">
                <button
                  onClick={this.toggleDetails}
                  className="w-full flex items-center justify-between text-xs text-text-secondary font-semibold hover:text-theme-text transition-colors focus:outline-none"
                >
                  <span className="font-mono">Error Signature</span>
                  {this.state.showDetails ? (
                    <ChevronUp className="w-4 h-4 text-text-muted" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-muted" />
                  )}
                </button>

                {this.state.showDetails && (
                  <div className={`mt-2 ${Typography.CAPTION} font-mono text-red-400 bg-black/40 rounded p-2.5 overflow-x-auto text-[11px] leading-relaxed max-h-40 border border-red-500/10`}>
                    {this.state.error.toString()}
                    {this.state.error.stack && (
                      <pre className="mt-2 text-[10px] text-text-muted whitespace-pre-wrap font-mono">
                        {this.state.error.stack.split('\n').slice(1, 4).join('\n')}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reload App Button */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={this.handleReload}
              className="w-full py-3 px-6 rounded-pill bg-[#C8A45C] hover:bg-[#D4A84A] text-[#0d0f12] font-semibold text-xs transition-colors shadow-glow-gold cursor-pointer focus:outline-none"
            >
              Reload App
            </motion.button>

            {/* Report Issue text link */}
            <button
              onClick={this.handleReportIssue}
              className={`${Typography.CAPTION} mt-4 text-text-muted hover:text-gold-400 underline cursor-pointer bg-transparent border-0 focus:outline-none`}
            >
              Report Issue
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
