import React from "react";
import { Fix } from "@/app/dashboard/types";
import { StatusMark } from "../status-mark";

export const dialogContent =
  "max-h-[90vh] gap-0 overflow-y-auto rounded-2xl border-(--gb-line) bg-(--gb-card) p-6 text-(--gb-text) sm:max-w-2xl";

/** Label / value rows in one hairline-divided block. */
export function Facts({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-(--gb-line) rounded-xl border border-(--gb-line)">
      {rows.map((row) => (
        <div key={row.label} className="flex min-h-9 items-center justify-between gap-4 px-4 py-1.5">
          <dt className="text-[13px] text-(--gb-text-2)">{row.label}</dt>
          <dd className="min-w-0 truncate text-right text-[13px] text-(--gb-text)">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-medium text-(--gb-text)">{children}</h3>;
}

/** The fixes that go into the pull request. */
export function ChangesList({ fixes }: { fixes: Fix[] }) {
  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto">
      {fixes.map((fix, idx) => (
        <li key={idx} className="flex min-h-8 items-start gap-2 py-1">
          <span className="mt-0.5">
            <StatusMark status="passed" size="sm" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <code className="truncate font-mono text-[13px] text-(--gb-text)">{fix.file}</code>
              {fix.line_number > 0 && (
                <span className="font-mono text-[12px] text-(--gb-text-3) tabular-nums">L{fix.line_number}</span>
              )}
              <span className="ml-auto shrink-0 font-mono text-[12px] text-(--gb-text-3)">{fix.bug_type}</span>
            </div>
            {fix.explanation?.changes_made && (
              <p className="mt-1 line-clamp-1 text-[13px] text-(--gb-text-2)">{fix.explanation.changes_made}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
