"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Search, GitBranch, ChevronRight, Timer, RefreshCw, ArrowUpRight, Play, GitPullRequest, ExternalLink, Loader2, Link as LinkIcon } from "lucide-react";
import { Header } from "@/components/header";
import { button, card, field, focusRing } from "@/components/gb";
import { MarkStatus, StatusMark } from "@/components/status-mark";
import { PRSuccessAlertDialog } from "../../components/dashboard/PRSuccessDialog";
import { CreatePRDialog } from "../../components/dashboard/CreatePRDialog";
import { BuildLogTerminal } from "../../components/dashboard/build-log-terminal";
import { StepTracker } from "../../components/dashboard/StepTracker";
import { FixesTable } from "../../components/dashboard/FixesTable";
import { CITimeline } from "../../components/dashboard/CITimeline";
import { RepoCard, RepoCardSkeleton } from "../../components/dashboard/RepoCard";
import { GitHubIcon } from "../../components/dashboard/GitHubIcon";
import { getDefaultCommands, formatTime, mapLanguage, getBranchPreview } from "./utils";
import { Repo, Fix, CIRun, LogLine, PipelineStep, StepStatus, StepState, Phase } from "./types";


// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Direct URL input
  const [repoUrl, setRepoUrl] = useState("");
  const [inputMode, setInputMode] = useState<"select" | "url">("select");
  const [isUrlFlow, setIsUrlFlow] = useState(false); // Track if coming from URL flow (no auth needed)
  const [selectedLanguage, setSelectedLanguage] = useState<"nodejs" | "python">("nodejs"); // Language for URL input mode

  const [installCommand, setInstallCommand] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [baseBranch, setBaseBranch] = useState("main"); // branch that was cloned; PRs target it

  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [ciRuns, setCIRuns] = useState<CIRun[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [maxIterations, setMaxIterations] = useState(5);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<string | null>(null);

  // PR creation state
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [showPrDialog, setShowPrDialog] = useState(false);
  const [showCreatePRDialog, setShowCreatePRDialog] = useState(false);
  const [prRepoName, setPrRepoName] = useState<string | undefined>(undefined);

  const [finalResult, setFinalResult] = useState<{
    passed: boolean;
    branch_name: string | null; // only set when fixes were actually pushed
    base_branch: string;
    commit_hash: string | null;
    total_commits: number;
    time_taken_seconds: number;
    total_fixed: number;
    total_failures: number;
    iterations: number;
    repo_url: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prCreatedRef = useRef<boolean>(false); // Track if PR was auto-created

  // Load pre-filled values from localStorage FIRST (from landing page modal)
  // This must run before auth check to detect URL flow
  useEffect(() => {
    const savedRepoUrl = localStorage.getItem("greenbranch_repo_url");

    if (savedRepoUrl) {
      setRepoUrl(savedRepoUrl);
      setInputMode("url");
      setIsUrlFlow(true); // Mark as URL flow - no auth needed
      localStorage.removeItem("greenbranch_repo_url");
    }
  }, []);

  // Only redirect to signin if NOT in URL flow mode
  useEffect(() => {
    if (status === "unauthenticated" && !isUrlFlow) {
      router.push("/signin");
    }
  }, [status, router, isUrlFlow]);

  useEffect(() => {
    if (!session) return;
    axios
      .get<Repo[]>("/api/github/repos")
      .then(({ data }) => {
        setRepos(Array.isArray(data) ? data : []);
        setReposError(null);
      })
      .catch((err) => {
        setRepos([]);
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          setReposError("Your GitHub sign-in has expired. Sign out and sign in again to load your repositories.");
        } else {
          const detail = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
          setReposError(`Could not load your repositories${detail ? `: ${detail}` : ""}. You can still paste a repository URL.`);
        }
      })
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    if (phase === "streaming") {
      timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const updateStep = useCallback(
    (step: PipelineStep, stepStatus: StepStatus) => {
      setSteps((prev) => {
        const existing = prev.findIndex((s) => s.step === step);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { step, status: stepStatus };
          return updated;
        }
        return [...prev, { step, status: stepStatus }];
      });
    },
    []
  );

  // ── Clone ─────────────────────────────────────────────────────────────
  const handleClone = async () => {
    // Support both URL input mode and repo selection mode
    const repoUrlToUse = inputMode === "url" ? repoUrl.trim() : selectedRepo?.html_url;
    if (!repoUrlToUse) return;

    // Create a temporary repo object for URL mode
    const effectiveRepo = inputMode === "url"
      ? {
        id: Date.now(),
        name: repoUrl.split("/").pop() || "repository",
        full_name: repoUrl.replace("https://github.com/", ""),
        private: false,
        html_url: repoUrl.trim(),
        description: null,
        updated_at: new Date().toISOString(),
        language: null,
        default_branch: undefined,
      }
      : selectedRepo;

    if (!effectiveRepo) return;

    // Set the effective repo as selected for the rest of the flow
    if (inputMode === "url") {
      setSelectedRepo(effectiveRepo);
    }

    // Use selectedLanguage for URL mode, otherwise detect from repo
    const language = inputMode === "url" ? selectedLanguage : mapLanguage(effectiveRepo.language);

    setPhase("streaming");
    setLogs([]);
    setSteps([]);
    setFixes([]);
    setCIRuns([]);
    setElapsedTime(0);
    setFinalResult(null);
    setErrorMessage(null);
    prCreatedRef.current = false; // Reset PR created flag

    updateStep("cloning", "running");
    setLogs([{ line: `$ git clone ${effectiveRepo.html_url}`, ts: new Date().toLocaleTimeString("en-GB", { hour12: false }) }]);

    try {
      // Cloned server-side so the GitHub token and backend API key never reach the browser.
      // URL mode doesn't know the default branch, so the backend detects it.
      const { data: sessionData } = await axios.post("/api/sessions", {
        repo_url: effectiveRepo.html_url,
        language,
        branch: effectiveRepo.default_branch,
      });

      const sid = sessionData.session_id as string;
      setSessionId(sid);
      setBaseBranch(sessionData.branch || "main");
      updateStep("cloning", "done");

      const ts = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
      setLogs((prev) => [
        ...prev,
        { line: `  Cloned into session ${sid.slice(0, 8)}...`, ts: ts() },
        { line: "  \u2713 Repository cloned successfully", ts: ts() },
      ]);

      const defaults = getDefaultCommands(language);
      setInstallCommand(defaults.install);
      setTestCommand(defaults.test);
      setPhase("configure");
    } catch (err) {
      updateStep("cloning", "error");
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? err.response?.data?.message ?? err.message)
        : "Unexpected error during cloning.";
      setErrorMessage(String(msg));
      setFailedStep("cloning");
      setPhase("failed");
    }
  };

  // ── Execute via WebSocket ─────────────────────────────────────────────
  const handleExecute = async () => {
    if (!selectedRepo) return;

    const serverWsUrl = process.env.NEXT_PUBLIC_SERVER_WS_URL;
    if (!serverWsUrl) {
      setErrorMessage("NEXT_PUBLIC_SERVER_WS_URL is not configured.");
      setPhase("failed");
      return;
    }

    setPhase("streaming");
    setElapsedTime(0);
    setFixes([]);
    setCIRuns([]);
    setFinalResult(null);
    setErrorMessage(null);
    prCreatedRef.current = false; // Reset PR created flag
    setPrUrl(null); // Reset PR URL

    // Register the run server-side (attaches the GitHub token), then stream it by run id
    let runId: string;
    try {
      const { data } = await axios.post("/api/runs", {
        session_id: sessionId || undefined,
        repo_url: selectedRepo.html_url,
        language: inputMode === "url" ? selectedLanguage : mapLanguage(selectedRepo.language),
        install_command: installCommand.trim(),
        test_command: testCommand.trim(),
      });
      runId = data.run_id;
    } catch (err) {
      const timedOut = axios.isAxiosError(err) && !err.response && (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT");
      const msg = timedOut
        ? "The GreenBranch server took too long to respond. It may be busy or restarting — please try again in a minute."
        : axios.isAxiosError(err) ? (err.response?.data?.detail ?? err.message) : "Could not start the run.";
      setErrorMessage(String(msg));
      setFailedStep("executing");
      setPhase("failed");
      return;
    }

    const ws = new WebSocket(`${serverWsUrl}/agent/ws?run_id=${encodeURIComponent(runId)}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "log":
            setLogs((prev) => [...prev, { line: data.line ?? "", ts: data.ts ?? "" }]);
            break;
          case "step":
            updateStep(data.step as PipelineStep, data.status as StepStatus);
            break;
          case "iteration":
            setCIRuns((prev) => [
              ...prev,
              {
                iteration: data.iteration,
                status: data.status,
                errors_count: data.errors_count,
                timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
              },
            ]);
            setMaxIterations(data.total || 5);
            break;
          case "fix":
            setFixes((prev) => [...prev, data.fix]);
            break;
          case "complete":
            setFinalResult(data.result);
            setPhase("done");
            // Use setTimeout to allow any in-flight `pr_created` event that
            // arrived in the same WebSocket flush to be processed first.
            // Only offer a PR when fixes were actually pushed (branch_name is null otherwise).
            if (data.result?.passed && data.result?.commit_hash && data.result?.branch_name) {
              setTimeout(() => {
                if (prCreatedRef.current) {
                  // Backend already auto-created a PR — show the success dialog
                  setShowPrDialog(true);
                } else {
                  // No auto PR (e.g. unauthenticated flow or it failed) —
                  // let the user create the PR manually
                  setShowCreatePRDialog(true);
                }
              }, 300);
            }
            break;
          case "error":
            setErrorMessage(data.message);
            setFailedStep(data.step === "cloning" ? "cloning" : "executing");
            setPhase("failed");
            break;
          case "pr_created":
            // PR was auto-created by backend - store URL
            setPrUrl(data.pr_url);
            setPrRepoName(data.repo_name);
            prCreatedRef.current = true; // Mark that PR was created
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setErrorMessage("WebSocket connection error. Is the server running?");
      setPhase("failed");
    };

    ws.onclose = () => {
      setPhase((current) => {
        if (current === "streaming") {
          setErrorMessage("Connection closed unexpectedly");
          return "failed";
        }
        return current;
      });
    };
  };

  const resetAnalysis = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setPhase("idle");
    setSelectedRepo(null);
    setLogs([]);
    setSteps([]);
    setFixes([]);
    setCIRuns([]);
    setElapsedTime(0);
    setSessionId(null);
    setBaseBranch("main");
    setInstallCommand("");
    setTestCommand("");
    setFinalResult(null);
    setErrorMessage(null);
    setFailedStep(null);
    setPrUrl(null);
    setPrLoading(false);
    setPrError(null);
    setRepoUrl("");
    setInputMode("select");
    setSelectedLanguage("nodejs");
    setShowCreatePRDialog(false);
    prCreatedRef.current = false;
  };

  // Handler for when PR is successfully created
  const handlePRCreated = (prUrlResult: string, repoName: string) => {
    setPrUrl(prUrlResult);
    setPrRepoName(repoName);
    setShowCreatePRDialog(false);
    setShowPrDialog(true);
  };

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Show loading only if not in URL flow and auth is loading
  if (status === "loading" && !isUrlFlow) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--gb-bg)">
        <Loader2 className="size-5 animate-spin text-(--gb-text-3)" strokeWidth={1.5} />
      </div>
    );
  }

  // Allow URL flow to proceed without session
  if (!session && !isUrlFlow) return null;

  const languageLabel = inputMode === "url" ? selectedLanguage : mapLanguage(selectedRepo?.language ?? null);

  return (
    <div className="min-h-screen bg-(--gb-bg) text-(--gb-text)">
      <Header />

      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        {/* ─────────── IDLE ─────────── */}
        {phase === "idle" && (
          <div className="space-y-6">
            <PageTitle
              title="Projects"
              subtitle="Pick a repository or paste its URL to run its tests and fix what fails"
            />

            <div className={`${card} p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[15px] font-medium">Repository</h2>
                  <p className="mt-1 text-[13px] text-(--gb-text-2)">
                    {inputMode === "select" ? "Choose one of your GitHub repositories" : "Paste the full GitHub URL"}
                  </p>
                </div>
                {/* GitHub repos toggle — only for authenticated users */}
                {session && (
                  <button
                    type="button"
                    onClick={() => setInputMode(inputMode === "select" ? "url" : "select")}
                    className={button("secondary", "sm")}
                  >
                    {inputMode === "select" ? <LinkIcon strokeWidth={1.5} /> : <GitHubIcon className="size-4" />}
                    {inputMode === "select" ? "Enter URL" : "My repositories"}
                  </button>
                )}
              </div>

              {inputMode === "select" ? (
                /* GitHub repos picker */
                <div className="mt-6 space-y-4">
                  <div className="relative">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--gb-text-3)" strokeWidth={1.5} />
                    <input
                      placeholder="Search"
                      aria-label="Search repositories"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`${field} pl-9`}
                    />
                  </div>
                  <div className="grid max-h-96 gap-3 overflow-y-auto sm:grid-cols-2">
                    {loading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="animate-pulse">
                          <RepoCardSkeleton />
                        </div>
                      ))
                    ) : reposError ? (
                      <p role="alert" className="py-12 text-center text-sm text-(--gb-fail) sm:col-span-2">
                        {reposError}
                      </p>
                    ) : filteredRepos.length === 0 ? (
                      <p className="py-12 text-center text-sm text-(--gb-text-2) sm:col-span-2">
                        {searchQuery ? "No repositories match your search" : "No repositories found"}
                      </p>
                    ) : (
                      filteredRepos.map((repo) => (
                        <RepoCard
                          key={repo.id}
                          repo={repo}
                          onSelect={() => setSelectedRepo(selectedRepo?.id === repo.id ? null : repo)}
                          isSelected={selectedRepo?.id === repo.id}
                          disabled={false}
                        />
                      ))
                    )}
                  </div>
                  {selectedRepo && (
                    <div className="flex flex-col gap-3 border-t border-(--gb-line) pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <BranchNote name={selectedRepo.name} />
                      <button type="button" onClick={handleClone} disabled={!selectedRepo} className={button("primary")}>
                        Run GreenBranch
                        <ChevronRight strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* URL input mode */
                <div className="mt-6 space-y-6">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <LinkIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--gb-text-3)" strokeWidth={1.5} />
                      <input
                        placeholder="https://github.com/username/repository"
                        aria-label="Repository URL"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        className={`${field} pl-9 font-mono`}
                        spellCheck={false}
                      />
                    </div>
                    <button type="button" onClick={handleClone} disabled={!repoUrl.trim()} className={button("primary")}>
                      <Play strokeWidth={1.5} />
                      Run GreenBranch
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p id="language-label" className="text-[13px] text-(--gb-text-2)">Language</p>
                    <div
                      role="radiogroup"
                      aria-labelledby="language-label"
                      className="inline-flex rounded-[10px] bg-(--gb-raised) p-1"
                    >
                      {LANGUAGES.map((lang) => {
                        const active = selectedLanguage === lang.value;
                        return (
                          <button
                            key={lang.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setSelectedLanguage(lang.value)}
                            className={`h-7 rounded-md px-3 text-[13px] transition-colors duration-150 ${focusRing} ${
                              active
                                ? "bg-(--gb-card) text-(--gb-text) shadow-[0_0_0_1px_var(--gb-line)]"
                                : "text-(--gb-text-2) hover:text-(--gb-text)"
                            }`}
                          >
                            {lang.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────── CONFIGURE ─────────── */}
        {phase === "configure" && selectedRepo && (
          <div className="space-y-6">
            <PageTitle
              mark="passed"
              title="Repository cloned"
              subtitle={<span className="font-mono">{selectedRepo.full_name}</span>}
              actions={
                <>
                  <button type="button" onClick={resetAnalysis} className={button("ghost")}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecute}
                    disabled={!installCommand.trim() || !testCommand.trim()}
                    className={button("primary")}
                  >
                    <Play strokeWidth={1.5} />
                    Run tests
                  </button>
                </>
              }
            />

            <div className={`${card} p-6`}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[15px] font-medium">Commands</h2>
                <span className="font-mono text-[12px] text-(--gb-text-3)">{languageLabel}</span>
              </div>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="install-command" className="block text-[13px] font-medium">Install</label>
                  <input
                    id="install-command"
                    value={installCommand}
                    onChange={(e) => setInstallCommand(e.target.value)}
                    placeholder="npm install"
                    className={`${field} font-mono`}
                    spellCheck={false}
                  />
                  <p className="text-[12px] text-(--gb-text-3)">Installs the project dependencies</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="test-command" className="block text-[13px] font-medium">Test</label>
                  <input
                    id="test-command"
                    value={testCommand}
                    onChange={(e) => setTestCommand(e.target.value)}
                    placeholder="npm test"
                    className={`${field} font-mono`}
                    spellCheck={false}
                  />
                  <p className="text-[12px] text-(--gb-text-3)">Runs your test suite</p>
                </div>
              </div>
            </div>

            <BranchNote name={selectedRepo.name} />

            {logs.length > 0 && <BuildLogTerminal logs={logs} isStreaming={false} />}
          </div>
        )}

        {/* ─────────── STREAMING ─────────── */}
        {phase === "streaming" && selectedRepo && (
          <div className="space-y-6">
            <PageTitle
              mark="running"
              title={selectedRepo.name}
              subtitle="Running tests and fixing failures"
              actions={
                <span className="flex items-center gap-2 font-mono text-sm text-(--gb-text-2) tabular-nums">
                  <Timer className="size-4 text-(--gb-text-3)" strokeWidth={1.5} />
                  {formatTime(elapsedTime)}
                </span>
              }
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0">
                <BuildLogTerminal logs={logs} isStreaming={true} />
              </div>
              <div className="space-y-4">
                <div className={`${card} p-4`}>
                  <h2 className="mb-2 px-2 text-[13px] font-medium">Steps</h2>
                  <StepTracker steps={steps} />
                </div>
                {fixes.length > 0 && (
                  <div className={`${card} p-4`}>
                    <h2 className="mb-2 flex items-baseline justify-between px-2 text-[13px] font-medium">
                      Fixes
                      <span className="font-mono text-[12px] font-normal text-(--gb-text-3) tabular-nums">{fixes.length}</span>
                    </h2>
                    <ul className="space-y-1">
                      {fixes.map((fix, i) => (
                        <li key={i} className="flex h-8 items-center gap-2 px-2">
                          <StatusMark status={fix.status === "fixed" ? "passed" : "failed"} size="sm" />
                          <span className="truncate font-mono text-[12px] text-(--gb-text-2)">{fix.file}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─────────── FAILED ─────────── */}
        {phase === "failed" && (
          <div className="space-y-6">
            <PageTitle
              title={failedStep === "cloning" ? "Could not clone repository" : "Run failed"}
              subtitle={<span className="font-mono">{selectedRepo?.full_name || repoUrl}</span>}
              actions={
                <button type="button" onClick={resetAnalysis} className={button("secondary")}>
                  <RefreshCw strokeWidth={1.5} />
                  Try again
                </button>
              }
            />
            <div className={`${card} flex items-start gap-3 p-6`}>
              <StatusMark status="failed" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[15px] font-medium">
                  {(() => {
                    const msg = errorMessage ?? "";
                    if (msg.includes("private") || msg.includes("🔒")) return "Private repository";
                    if (msg.includes("not found") || msg.includes("❌")) return "Repository not found";
                    if (msg.includes("empty") || msg.includes("📭")) return "Repository is empty";
                    if (msg.includes("Branch") || msg.includes("🌿")) return "Branch not found";
                    if (msg.includes("Network") || msg.includes("🌐")) return "Network error";
                    if (msg.includes("No test files") || msg.includes("test_*.py")) return "No test files found";
                    if (failedStep === "cloning") return "Repository could not be cloned";
                    return "The run could not finish";
                  })()}
                </p>
                <p className="text-sm leading-relaxed text-(--gb-text-2)">
                  {errorMessage?.replace(/^[🔒❌📭🌿🌐]\s*/, "") ?? "An unknown error occurred."}
                </p>
              </div>
            </div>
            {logs.length > 0 && <BuildLogTerminal logs={logs} isStreaming={false} />}
          </div>
        )}

        {/* ─────────── DONE ─────────── */}
        {phase === "done" && selectedRepo && (
          <div className="space-y-6">
            <PageTitle
              mark={finalResult?.passed ? "passed" : "failed"}
              title={finalResult?.passed ? "All tests passing" : "Tests still failing"}
              subtitle={
                <a
                  href={selectedRepo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded font-mono hover:text-(--gb-text) ${focusRing}`}
                >
                  {selectedRepo.full_name}
                </a>
              }
            />

            {/* Run summary */}
            <div className={`${card} grid grid-cols-2 sm:grid-cols-4`}>
              {[
                { label: "Failures found", value: finalResult?.total_failures ?? 0 },
                { label: "Fixes applied", value: finalResult?.total_fixed ?? 0 },
                {
                  label: "Test runs",
                  value: finalResult?.iterations ?? 0,
                  of: maxIterations,
                },
                {
                  label: "Time taken",
                  value: finalResult?.time_taken_seconds
                    ? formatTime(Math.round(finalResult.time_taken_seconds))
                    : "0:00",
                },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`p-6 ${i % 2 === 1 ? "border-l border-(--gb-line)" : ""} ${
                    i >= 2 ? "border-t border-(--gb-line) sm:border-t-0" : ""
                  } ${i === 2 ? "sm:border-l" : ""}`}
                >
                  <p className="text-[13px] text-(--gb-text-2)">{stat.label}</p>
                  <p className="mt-2 text-[28px] leading-none font-medium tabular-nums">
                    {stat.value}
                    {stat.of !== undefined && (
                      <span className="text-[15px] font-normal text-(--gb-text-3)"> of {stat.of}</span>
                    )}
                  </p>
                </div>
              ))}
            </div>

            {finalResult?.branch_name && (
              <div className={`${card} flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-4`}>
                <GitBranch className="size-4 shrink-0 text-(--gb-text-3)" strokeWidth={1.5} />
                <span className="text-[13px] text-(--gb-text-2)">Fixes committed to</span>
                <code className="min-w-0 truncate font-mono text-[13px]">{finalResult.branch_name}</code>
                {finalResult.commit_hash && (
                  <span className="ml-auto font-mono text-[12px] text-(--gb-text-3)">
                    {finalResult.commit_hash.slice(0, 8)}
                  </span>
                )}
              </div>
            )}

            <BuildLogTerminal logs={logs} isStreaming={false} />

            {fixes.length > 0 && (
              <div className="space-y-3">
                <div>
                  <h2 className="text-[15px] font-medium">Fixes</h2>
                  <p className="mt-1 text-[13px] text-(--gb-text-2)">What failed and how each issue was fixed</p>
                </div>
                <FixesTable fixes={fixes} />
              </div>
            )}

            {ciRuns.length > 0 && <CITimeline runs={ciRuns} maxIterations={maxIterations} />}

            {/* ── Create PR Confirmation Dialog ── */}
            <CreatePRDialog
              open={showCreatePRDialog}
              onOpenChange={setShowCreatePRDialog}
              repoUrl={selectedRepo?.html_url || ""}
              branchName={finalResult?.branch_name || ""}
              baseBranch={finalResult?.base_branch ?? baseBranch}
              commitHash={finalResult?.commit_hash || undefined}
              fixes={fixes}
              timeTaken={finalResult?.time_taken_seconds}
              isSignedIn={!!session}
              onPRCreated={handlePRCreated}
            />

            {/* ── PR Success Dialog ── */}
            <PRSuccessAlertDialog
              open={showPrDialog}
              onOpenChange={setShowPrDialog}
              prUrl={prUrl || ""}
              repoName={prRepoName}
              branchName={finalResult?.branch_name || undefined}
              commitHash={finalResult?.commit_hash || undefined}
              fixes={fixes}
              timeTaken={finalResult?.time_taken_seconds}
            />

            <div className="flex flex-col gap-3 border-t border-(--gb-line) pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={resetAnalysis} className={button("secondary")}>
                <RefreshCw strokeWidth={1.5} />
                Run another analysis
              </button>
              <div className="flex flex-col gap-2 sm:flex-row">
                {finalResult?.branch_name && (
                  <a
                    href={`${finalResult.repo_url}/tree/${finalResult.branch_name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={button(finalResult.passed && prUrl ? "secondary" : "primary")}
                  >
                    <GitHubIcon className="size-4" />
                    View branch on GitHub
                    <ArrowUpRight strokeWidth={1.5} />
                  </a>
                )}
                {/* Persistent link once a PR exists */}
                {finalResult?.passed && prUrl && (
                  <a href={prUrl} target="_blank" rel="noopener noreferrer" className={button("primary")}>
                    <GitPullRequest strokeWidth={1.5} />
                    View pull request
                    <ExternalLink strokeWidth={1.5} />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const LANGUAGES: { value: "nodejs" | "python"; label: string }[] = [
  { value: "nodejs", label: "JavaScript / TypeScript" },
  { value: "python", label: "Python" },
];

function PageTitle({
  title,
  subtitle,
  mark,
  actions,
}: {
  title: string;
  subtitle: React.ReactNode;
  mark?: MarkStatus;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {mark && <StatusMark status={mark} />}
          <h1 className="truncate text-[28px] leading-tight font-medium tracking-[-0.02em]">{title}</h1>
        </div>
        <p className="mt-1 text-sm text-(--gb-text-2)">{subtitle}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Where verified fixes will land. */
function BranchNote({ name }: { name: string }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-[13px] text-(--gb-text-2)">
      <GitBranch className="size-4 shrink-0 text-(--gb-text-3)" strokeWidth={1.5} />
      Verified fixes go to
      <code className="truncate font-mono text-(--gb-text)">{getBranchPreview(name)}</code>
    </p>
  );
}
