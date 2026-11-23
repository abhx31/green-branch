"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GitPullRequest, ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Fix } from "@/app/dashboard/types";
import { StatusMark } from "../status-mark";
import { button, iconButton } from "../gb";
import { ChangesList, Facts, SectionLabel, dialogContent } from "./pr-dialog-parts";

interface PRSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prUrl: string;
  repoName?: string;
  branchName?: string;
  commitHash?: string;
  fixes: Fix[];
  timeTaken?: number;
}

export function PRSuccessAlertDialog({
  open,
  onOpenChange,
  prUrl,
  repoName,
  branchName,
  commitHash,
  fixes,
  timeTaken,
}: PRSuccessDialogProps) {
  const [copied, setCopied] = useState(false);

  const fixedFixes = fixes.filter((f) => f.status === "fixed");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const rows = [
    ...(repoName ? [{ label: "Repository", value: <span className="font-mono">{repoName}</span> }] : []),
    ...(branchName
      ? [
          {
            label: "Branch",
            value: (
              <span className="flex items-center justify-end gap-1">
                <code className="truncate font-mono">{branchName}</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(branchName)}
                  className={iconButton}
                  aria-label="Copy branch name"
                >
                  {copied ? <Check className="text-(--gb-pass)" /> : <Copy strokeWidth={1.5} />}
                </button>
              </span>
            ),
          },
        ]
      : []),
    ...(commitHash
      ? [{ label: "Commit", value: <code className="font-mono">{commitHash.slice(0, 8)}</code> }]
      : []),
    { label: "Fixes", value: <span className="tabular-nums">{fixedFixes.length}</span> },
    {
      label: "Time taken",
      value: <span className="font-mono tabular-nums">{timeTaken ? formatTime(timeTaken) : "—"}</span>,
    },
  ];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={dialogContent}>
        <AlertDialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2">
            <StatusMark status="passed" />
            <AlertDialogTitle className="text-xl font-medium">Pull request opened</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-(--gb-text-2)">
            The verified fixes are committed and waiting for your review
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-6 space-y-6">
          <Facts rows={rows} />

          {fixedFixes.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>
                Changes <span className="font-normal text-(--gb-text-3) tabular-nums">{fixedFixes.length}</span>
              </SectionLabel>
              <ChangesList fixes={fixedFixes} />
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-(--gb-line) pt-6 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onOpenChange(false)} className={button("secondary")}>
            Close
          </button>
          <a href={prUrl} target="_blank" rel="noopener noreferrer" className={button("primary")}>
            <GitPullRequest strokeWidth={1.5} />
            View pull request
            <ExternalLink strokeWidth={1.5} />
          </a>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
