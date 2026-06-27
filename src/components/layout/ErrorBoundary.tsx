import { AlertTriangle, RefreshCw } from "lucide-react";
import React, { type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-card animate-scale-in">
            <div className="error-boundary-icon">
              <AlertTriangle size={32} />
            </div>
            <h1 className="error-boundary-title">Something went wrong</h1>
            <p className="error-boundary-desc">
              Basilico encountered an unexpected error and needs to reload. If
              this keeps happening, please report the bug.
            </p>

            {this.state.error && (
              <div className="error-boundary-details">
                <div className="error-boundary-message">
                  {this.state.error.toString()}
                </div>
                {this.state.errorInfo && (
                  <pre className="error-boundary-stack">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <button className="error-boundary-btn" onClick={this.handleReload}>
              <RefreshCw size={16} />
              <span>Reload Basilico</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
