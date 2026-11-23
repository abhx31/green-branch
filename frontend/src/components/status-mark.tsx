import { Check, Loader2, X } from "lucide-react";

export type MarkStatus = "passed" | "failed" | "running" | "pending";

const sizes = {
  sm: { box: "size-4", icon: "size-2.5" },
  md: { box: "size-5", icon: "size-3" },
};

/** The ✓ / ✕ check mark used everywhere a test, step or fix passes or fails. */
export function StatusMark({
  status,
  size = "md",
  label,
}: {
  status: MarkStatus;
  size?: keyof typeof sizes;
  label?: string;
}) {
  const s = sizes[size];
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };

  if (status === "passed") {
    return (
      <span {...a11y} className={`${s.box} flex shrink-0 items-center justify-center rounded-full bg-(--gb-pass-soft)`}>
        <Check className={`${s.icon} text-(--gb-pass)`} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span {...a11y} className={`${s.box} flex shrink-0 items-center justify-center rounded-full bg-(--gb-fail-soft)`}>
        <X className={`${s.icon} text-(--gb-fail)`} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span {...a11y} className={`${s.box} flex shrink-0 items-center justify-center`}>
        <Loader2 className={`${s.box} animate-spin text-(--gb-text-2)`} strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <span {...a11y} className={`${s.box} inline-block shrink-0 rounded-full border border-(--gb-line-strong)`} />
  );
}
