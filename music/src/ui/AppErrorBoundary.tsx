import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-box">
            <h2 className="error-boundary-title">Something went wrong</h2>
            <pre className="error-boundary-msg">{error.message}</pre>
            <button
              className="tb-btn"
              onClick={() => this.setState({ error: null })}
            >
              Try to recover
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
