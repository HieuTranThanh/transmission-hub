import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Hover/focus tooltip rendered in a body portal with fixed positioning, so it
 * is never clipped by a table's `overflow` container. Hover-based; the full
 * reference also lives on the /glossary page for non-hover contexts. */
export function Tooltip({ children, content }: { children: ReactNode; content: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function show() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 12;
    const x = Math.max(pad, Math.min(r.left + r.width / 2, window.innerWidth - pad));
    setPos({ x, y: r.top });
  }
  function hide() {
    setPos(null);
  }

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="inline-flex cursor-help"
    >
      {children}
      {pos &&
        createPortal(
          <div
            style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)" }}
            className="pointer-events-none z-[100] w-max max-w-[calc(100vw-1.5rem)] rounded-lg bg-slate-800 px-3.5 py-2.5 text-left text-sm leading-relaxed text-slate-100 shadow-xl sm:max-w-sm"
          >
            {content}
          </div>,
          document.body
        )}
    </span>
  );
}

/** Standard tooltip body: bold title, optional sub-label, description, and an
 * optional recommended action. Shared by every badge tooltip. */
export function TooltipBody({
  title,
  subtitle,
  description,
  action,
}: {
  title: string;
  subtitle?: string;
  description: string;
  action?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="font-semibold text-white">
        {title}
        {subtitle && <span className="font-normal text-slate-300"> — {subtitle}</span>}
      </div>
      <div className="text-slate-200">{description}</div>
      {action && (
        <div className="text-slate-400">
          <span className="font-medium text-slate-300">Khuyến nghị:</span> {action}
        </div>
      )}
    </div>
  );
}
