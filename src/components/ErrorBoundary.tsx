import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("ErrorBoundary caught:", _error, info.componentStack);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-lg font-bold text-slate-900">Lỗi ứng dụng</h1>
          <p className="mt-2 text-sm text-slate-500">
            Đã xảy ra lỗi không mong đợi. Vui lòng tải lại trang.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-50 p-3 text-left text-xs text-red-600">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <RotateCw className="h-4 w-4" />
            Tải lại trang
          </button>
        </div>
      </div>
    );
  }
}
