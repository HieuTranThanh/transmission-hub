export function PageHeader({ title, description, className }: { title: string; description?: string; className?: string }) {
  return (
    <div className={className ?? "mb-6"}>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {description && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</p>}
    </div>
  );
}
