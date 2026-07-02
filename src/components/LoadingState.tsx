export function LoadingState({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200/80 bg-white px-6 py-16 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
      <span className="font-medium">{label}</span>
    </div>
  );
}
