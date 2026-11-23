import React from "react";
import { CIRun } from "../../app/dashboard/types";
import { StatusMark } from "../status-mark";
import { card } from "../gb";

export function CITimeline({ runs, maxIterations }: { runs: CIRun[]; maxIterations: number }) {
  const unused = Math.max(0, maxIterations - runs.length);

  return (
    <div className={`${card} p-6`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-medium text-(--gb-text)">Test runs</h2>
        <p className="font-mono text-[12px] text-(--gb-text-3) tabular-nums">
          {runs.length} of {maxIterations} used
        </p>
      </div>

      {/* One segment per allowed run */}
      <div className="mt-4 flex gap-1" aria-hidden>
        {Array.from({ length: maxIterations }, (_, i) => {
          const run = runs[i];
          const tone = !run
            ? "bg-(--gb-raised)"
            : run.status === "passed"
              ? "bg-(--gb-pass)"
              : "bg-(--gb-fail)";
          return <span key={i} className={`h-1.5 flex-1 rounded-full ${tone}`} />;
        })}
      </div>

      <ol className="relative mt-6 space-y-4">
        <span aria-hidden className="absolute top-2 bottom-2 left-2.5 w-px bg-(--gb-line-strong)" />
        {runs.map((run, idx) => {
          const passed = run.status === "passed";
          return (
            <li key={idx} className="relative flex items-center gap-3">
              <span className="relative flex bg-(--gb-card)">
                <StatusMark status={passed ? "passed" : "failed"} />
              </span>
              <span className="text-sm font-medium text-(--gb-text)">Run {run.iteration}</span>
              <span className="text-[13px] text-(--gb-text-2)">
                {passed
                  ? "All tests passing"
                  : run.errors_count !== undefined
                    ? `${run.errors_count} ${run.errors_count === 1 ? "failure" : "failures"}`
                    : "Tests failing"}
              </span>
              <span className="ml-auto font-mono text-[12px] text-(--gb-text-3) tabular-nums">
                {run.timestamp}
              </span>
            </li>
          );
        })}
        {Array.from({ length: unused }, (_, i) => (
          <li key={`unused-${i}`} className="relative flex items-center gap-3">
            <span className="relative flex bg-(--gb-card)">
              <StatusMark status="pending" />
            </span>
            <span className="text-sm text-(--gb-text-3)">Run {runs.length + i + 1}</span>
            <span className="text-[13px] text-(--gb-text-3)">Not used</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
