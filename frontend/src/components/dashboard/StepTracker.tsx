import React from "react";
import { StepState, StepStatus, PipelineStep } from "../../app/dashboard/types";
import { MarkStatus, StatusMark } from "../status-mark";

const ALL_STEPS: { key: PipelineStep; label: string }[] = [
  { key: "cloning", label: "Clone repository" },
  { key: "running_tests", label: "Run tests" },
  { key: "analyzing", label: "Analyze failures" },
  { key: "fixing", label: "Apply fixes" },
  { key: "verifying", label: "Verify changes" },
  { key: "committing", label: "Commit to branch" },
];

const MARKS: Record<StepStatus, MarkStatus> = {
  done: "passed",
  error: "failed",
  running: "running",
  pending: "pending",
};

const TEXT: Record<StepStatus, string> = {
  done: "text-(--gb-text-2)",
  error: "text-(--gb-fail)",
  running: "bg-(--gb-raised) text-(--gb-text)",
  pending: "text-(--gb-text-3)",
};

export function StepTracker({ steps }: { steps: StepState[] }) {
  return (
    <ol className="space-y-1">
      {ALL_STEPS.map((def) => {
        const st: StepStatus = steps.find((s) => s.step === def.key)?.status ?? "pending";
        return (
          <li
            key={def.key}
            className={`flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] ${TEXT[st]}`}
          >
            <StatusMark status={MARKS[st]} size="sm" />
            {def.label}
          </li>
        );
      })}
    </ol>
  );
}
