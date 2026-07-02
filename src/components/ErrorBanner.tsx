import { AlertTriangle, RotateCw } from "lucide-react";

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-severity-critical/20 bg-severity-critical/5 px-4 py-3.5 text-sm text-severity-critical">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span className="flex-1 font-medium">{message}</span>
      <button
        type="button"
        onClick={onRetry ?? (() => window.location.reload())}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-severity-critical/20 bg-white px-3 py-1.5 text-sm font-semibold text-severity-critical shadow-sm transition-colors hover:bg-severity-critical/5"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Tải lại
      </button>
    </div>
  );
}
