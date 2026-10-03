import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-fallback"
          style={{
            padding: 14,
            margin: 10,
            background: '#fef2f2',
            border: '1px solid #f87171',
            borderRadius: 8,
            color: '#991b1b',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
            <span>⚠️</span>
            <span>{this.props.fallbackTitle || 'Component Error'}</span>
          </div>
          <div style={{ color: '#7f1d1d', fontSize: 11, lineHeight: 1.4 }}>
            An unexpected error occurred while rendering this view. The rest of the application remains running.
            {this.state.error?.message && (
              <pre
                style={{
                  marginTop: 6,
                  padding: 8,
                  background: '#fee2e2',
                  borderRadius: 4,
                  fontSize: 10,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              alignSelf: 'flex-start',
              padding: '4px 12px',
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry / Reset
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
