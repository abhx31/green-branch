import React from "react";
import { Check, Lock } from "lucide-react";
import { Repo } from "../../app/dashboard/types";
import { getLangColor, timeAgo } from "../../app/dashboard/utils";
import { focusRing } from "../gb";

export function RepoCard({
  repo,
  onSelect,
  isSelected,
  disabled,
}: {
  repo: Repo;
  onSelect: () => void;
  isSelected: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={isSelected}
      className={`flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing} ${
        isSelected
          ? "border-(--gb-line-strong) bg-(--gb-raised)"
          : "border-(--gb-line) bg-(--gb-card) hover:bg-(--gb-raised)"
      }`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-(--gb-text)">{repo.name}</p>
          <p className="mt-1 truncate font-mono text-[12px] text-(--gb-text-3)">{repo.full_name}</p>
        </div>
        <span
          aria-hidden
          className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
            isSelected
              ? "border-(--gb-btn) bg-(--gb-btn) text-(--gb-btn-text)"
              : "border-(--gb-line-strong)"
          }`}
        >
          {isSelected && <Check className="size-2.5" strokeWidth={3} />}
        </span>
      </div>

      <p className="line-clamp-2 min-h-10 text-[13px] leading-5 text-(--gb-text-2)">
        {repo.description || <span className="text-(--gb-text-3)">No description</span>}
      </p>

      <div className="flex items-center gap-3 text-[12px] text-(--gb-text-3)">
        {repo.language && (
          <span className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: getLangColor(repo.language) }}
            />
            {repo.language}
          </span>
        )}
        {repo.private && (
          <span className="flex items-center gap-1">
            <Lock className="size-3" strokeWidth={1.5} />
            Private
          </span>
        )}
        <span className="ml-auto tabular-nums">Updated {timeAgo(repo.updated_at)}</span>
      </div>
    </button>
  );
}

export function RepoCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-(--gb-line) bg-(--gb-card) p-4">
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-(--gb-raised)" />
        <div className="h-3 w-40 rounded bg-(--gb-raised)" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-(--gb-raised)" />
        <div className="h-3 w-3/4 rounded bg-(--gb-raised)" />
      </div>
      <div className="h-3 w-20 rounded bg-(--gb-raised)" />
    </div>
  );
}
