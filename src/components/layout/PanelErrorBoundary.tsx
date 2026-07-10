import { AlertTriangle, RotateCcw } from "lucide-react";
import React, { type ErrorInfo, type ReactNode } from "react";

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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            width: "100%",
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            padding: "var(--space-6)",
            gap: "var(--space-3)",
            textAlign: "center",
            boxSizing: "border-box",
            border: "1px dashed var(--color-danger)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div
            style={{
              color: "var(--color-danger)",
              background:
                "color-mix(in srgb, var(--color-danger) 10%, transparent)",
              padding: "var(--space-2)",
              borderRadius: "var(--radius-full)",
            }}
          >
            <AlertTriangle size={24} />
          </div>
          <h4 style={{ margin: 0, fontWeight: "var(--weight-semibold)" }}>
            Failed to render panel
          </h4>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-xs)",
              color: "var(--text-secondary)",
              maxWidth: "280px",
              lineHeight: "var(--leading-normal)",
            }}
          >
            {this.state.error?.message ||
              "An unexpected error occurred in this view."}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              padding: "var(--space-2) var(--space-4)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-medium)",
              cursor: "pointer",
            }}
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
