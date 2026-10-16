import { AlertTriangle, RotateCcw } from "lucide-react";
import React, { type ErrorInfo, type ReactNode } from "react";
import "./PanelErrorBoundary.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PanelErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("PanelErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel-error">
          <div className="panel-error-icon">
            <AlertTriangle size={24} />
          </div>
          <h4 className="panel-error-title">Failed to render panel</h4>
          <p className="panel-error-message">
            {this.state.error?.message ||
              "An unexpected error occurred in this view."}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="btn btn-secondary panel-error-retry"
          >
            <RotateCcw size={12} />
            <span>Retry</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
