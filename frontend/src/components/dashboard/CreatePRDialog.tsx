"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GitPullRequest, Loader2, Pencil } from "lucide-react";
import { Fix } from "@/app/dashboard/types";
import { StatusMark } from "../status-mark";
import { button, field } from "../gb";
import { ChangesList, Facts, SectionLabel, dialogContent } from "./pr-dialog-parts";
import axios from "axios";

interface CreatePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoUrl: string;
  branchName: string;
  baseBranch?: string;
  commitHash?: string;
  fixes: Fix[];
  timeTaken?: number;
  isSignedIn: boolean;
  onPRCreated: (prUrl: string, repoName: string) => void;
}

/** Parse `owner/repo` from a full GitHub URL. */
function parseRepoFullName(url: string): string {
  const clean = url.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = clean.split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

/** Format seconds as M:SS */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Build a rich markdown PR body using all available context. */
function buildPRBody(
  fixes: Fix[],
  repoFullName: string,
  branchName: string,
  baseBranch: string,
  commitHash: string | undefined,
  timeTaken: number | undefined
): string {
  const fixedFixes = fixes.filter((f) => f.status === "fixed");
  const failedFixes = fixes.filter((f) => f.status === "failed");
  const now = new Date().toISOString();

  let body = `# GreenBranch fix report\n\n`;

  // ── Summary table ─────────────────────────────────────────────────────
  body += `## Summary\n\n`;
  body += `| Field | Value |\n`;
  body += `| --- | --- |\n`;
  body += `| Repository | \`${repoFullName}\` |\n`;
  body += `| Fix branch | \`${branchName}\` |\n`;
  body += `| Target branch | \`${baseBranch}\` |\n`;
  if (commitHash) body += `| Commit | \`${commitHash}\` |\n`;
  if (timeTaken) body += `| Time taken | ${formatTime(timeTaken)} |\n`;
  body += `| Fixes | ${fixedFixes.length} |\n`;
  body += `| Generated at | ${now} |\n`;
  body += `\n---\n\n`;

  // ── Detailed fixes ────────────────────────────────────────────────────
  if (fixedFixes.length > 0) {
    body += `## Fixes applied (${fixedFixes.length})\n\n`;
    fixedFixes.forEach((fix, idx) => {
      body += `### ${idx + 1}. \`${fix.file}\`\n\n`;

      if (fix.bug_type) {
        body += `**Bug type:** \`${fix.bug_type}\``;
        if (fix.line_number) body += ` &nbsp;·&nbsp; **Line:** ${fix.line_number}`;
        body += `\n\n`;
      }

      if (fix.commit_message) {
        body += `**Commit message:** ${fix.commit_message}\n\n`;
      }

      if (fix.explanation) {
        if (fix.explanation.root_cause) {
          body += `**Root cause:**\n> ${fix.explanation.root_cause}\n\n`;
        }
        if (fix.explanation.changes_made) {
          body += `**Changes made:**\n> ${fix.explanation.changes_made}\n\n`;
        }
        if (fix.explanation.impact) {
          body += `**Impact:**\n> ${fix.explanation.impact}\n\n`;
        }
      } else if (fix.description) {
        body += `**Description:** ${fix.description}\n\n`;
      }

      body += `---\n\n`;
    });
  }

  // ── Failed fixes ──────────────────────────────────────────────────────
  if (failedFixes.length > 0) {
    body += `## Could not fix (${failedFixes.length})\n\n`;
    failedFixes.forEach((fix) => {
      body += `- \`${fix.file}\``;
      if (fix.bug_type) body += ` (${fix.bug_type})`;
      if (fix.error_message) body += ` — ${fix.error_message}`;
      body += `\n`;
    });
    body += `\n---\n\n`;
  }

  // ── Footer ────────────────────────────────────────────────────────────
  body += `Opened by [GreenBranch](https://greenbranch.d6vs.tech). `;
  body += `Every fix above was verified by the test suite before this pull request was opened.\n`;

  return body;
}

/** Build a concise, descriptive PR title from the fix set. */
function buildPRTitle(fixes: Fix[], repoFullName: string): string {
  const fixedFixes = fixes.filter((f) => f.status === "fixed");

  if (fixedFixes.length === 0) {
    return `fix: Bug fixes for ${repoFullName.split("/")[1]}`;
  }

  if (fixedFixes.length === 1) {
    const fix = fixedFixes[0];
    if (fix.commit_message) {
      // Use commit message but strip any leading "fix:" prefix duplication
      const msg = fix.commit_message.replace(/^fix:\s*/i, "").trim();
      return `fix: ${msg.slice(0, 72)}`;
    }
    return `fix: Resolve ${fix.bug_type || "bug"} in ${fix.file}`;
  }

  // Multiple fixes — use the most common bug type if consistent
  const bugTypes = fixedFixes.map((f) => f.bug_type).filter(Boolean);
  const uniqueTypes = [...new Set(bugTypes)];
  if (uniqueTypes.length === 1 && uniqueTypes[0]) {
    return `fix: Resolve ${fixedFixes.length} ${uniqueTypes[0]} issues in ${repoFullName.split("/")[1]}`;
  }

  return `fix: Apply ${fixedFixes.length} bug fixes to ${repoFullName.split("/")[1]}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export function CreatePRDialog({
  open,
  onOpenChange,
  repoUrl,
  branchName,
  baseBranch = "main",
  commitHash,
  fixes,
  timeTaken,
  isSignedIn,
  onPRCreated,
}: CreatePRDialogProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");

  const repoFullName = parseRepoFullName(repoUrl);

  /** Recompute title + body whenever the dialog opens or key props change. */
  const recomputeContent = useCallback(() => {
    setPrTitle(buildPRTitle(fixes, repoFullName));
    setPrBody(
      buildPRBody(
        fixes,
        repoFullName,
        branchName,
        baseBranch,
        commitHash,
        timeTaken
      )
    );
    setError(null);
    setIsEditing(false);
  }, [
    fixes,
    repoFullName,
    branchName,
    baseBranch,
    commitHash,
    timeTaken,
  ]);

  // Refresh content every time the dialog opens
  useEffect(() => {
    if (open) recomputeContent();
  }, [open, recomputeContent]);

  const fixedFixes = fixes.filter((f) => f.status === "fixed");

  const handleCreatePR = async () => {
    if (!isSignedIn) {
      setError("Sign in with GitHub to open a pull request");
      return;
    }
    if (!branchName) {
      setError("No fix branch yet. The run may not have committed its changes.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Created server-side with the signed-in user's GitHub token
      const response = await axios.post("/api/pr", {
        repo_full_name: repoFullName,
        branch_name: branchName,
        base_branch: baseBranch,
        title: prTitle,
        body: prBody,
      });

      if (response.data.success) {
        onPRCreated(response.data.pr_url, repoFullName);
        onOpenChange(false);
      } else {
        setError(response.data.message || "Could not open the pull request. Try again.");
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string; message?: string } }; message?: string };
      const message =
        axiosErr.response?.data?.detail ||
        axiosErr.response?.data?.message ||
        axiosErr.message ||
        "Unknown error";
      setError(`Could not open the pull request: ${message}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={dialogContent}>
        <AlertDialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2">
            <StatusMark status="passed" />
            <AlertDialogTitle className="text-xl font-medium">All tests passing</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-(--gb-text-2)">
            Review the pull request before GreenBranch opens it on {repoFullName}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-6 space-y-6">
          <Facts
            rows={[
              { label: "From", value: <code className="font-mono">{branchName || "—"}</code> },
              { label: "Into", value: <code className="font-mono">{baseBranch}</code> },
              ...(commitHash
                ? [{ label: "Commit", value: <code className="font-mono">{commitHash.slice(0, 8)}</code> }]
                : []),
              { label: "Fixes", value: <span className="tabular-nums">{fixedFixes.length}</span> },
              {
                label: "Time taken",
                value: <span className="font-mono tabular-nums">{timeTaken ? formatTime(timeTaken) : "—"}</span>,
              },
            ]}
          />

          {/* PR title & body */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Pull request</SectionLabel>
              <button type="button" onClick={() => setIsEditing((v) => !v)} className={button("ghost", "sm")}>
                {!isEditing && <Pencil strokeWidth={1.5} />}
                {isEditing ? "Done" : "Edit"}
              </button>
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="pr-title" className="text-[13px] text-(--gb-text-2)">
                    Title
                  </label>
                  <input
                    id="pr-title"
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    className={field}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="pr-body" className="text-[13px] text-(--gb-text-2)">
                    Description, in Markdown
                  </label>
                  <textarea
                    id="pr-body"
                    value={prBody}
                    onChange={(e) => setPrBody(e.target.value)}
                    className={`${field} h-auto min-h-52 py-2 font-mono text-[12px] leading-5`}
                  />
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl bg-(--gb-raised)">
                <p className="border-b border-(--gb-line) px-4 py-3 text-sm font-medium">{prTitle}</p>
                <pre className="max-h-28 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-5 whitespace-pre-wrap text-(--gb-text-2)">
                  {prBody.slice(0, 500)}
                  {prBody.length > 500 ? "\n…" : ""}
                </pre>
              </div>
            )}
          </div>

          {fixedFixes.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>
                Changes <span className="font-normal text-(--gb-text-3) tabular-nums">{fixedFixes.length}</span>
              </SectionLabel>
              <ChangesList fixes={fixedFixes} />
            </div>
          )}

          {!isSignedIn && (
            <p className="text-[13px] text-(--gb-text-2)">Sign in with GitHub to open a pull request</p>
          )}
          {error && <p className="text-[13px] text-(--gb-fail)">{error}</p>}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-(--gb-line) pt-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
            className={button("secondary")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreatePR}
            disabled={isCreating || !isSignedIn || !branchName}
            className={button("primary")}
          >
            {isCreating ? <Loader2 className="animate-spin" /> : <GitPullRequest strokeWidth={1.5} />}
            {isCreating ? "Opening pull request" : "Open pull request"}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
