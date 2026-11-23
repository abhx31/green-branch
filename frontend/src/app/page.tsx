"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/header";
import { GitHubIcon } from "@/components/dashboard/GitHubIcon";
import { StatusMark } from "@/components/status-mark";
import { button, card, field } from "@/components/gb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GitBranch,
  Timer,
  RefreshCw,
  ScrollText,
} from "lucide-react";

const primaryButton = button("primary", "lg");
const secondaryButton = button("secondary", "lg");

const steps = [
  {
    number: "01",
    title: "Connect a repository",
    description: "Link a GitHub repository in one click",
  },
  {
    number: "02",
    title: "Run the tests",
    description: "GreenBranch runs your test suite in an isolated container",
  },
  {
    number: "03",
    title: "Find the cause",
    description: "The agent reads each failure and finds its root cause",
  },
  {
    number: "04",
    title: "Apply a fix",
    description: "Each fix is committed to a new branch",
  },
  {
    number: "05",
    title: "Verify",
    description: "Tests rerun until the pipeline passes",
  },
];

const features = [
  {
    icon: Timer,
    title: "Less debugging by hand",
    description:
      "The agent reads the failure output and writes the fix, so you review a change instead of chasing a stack trace",
  },
  {
    icon: RefreshCw,
    title: "Runs on its own",
    description:
      "It fixes, reruns the tests and repeats until the suite passes, with no one watching",
  },
  {
    icon: GitBranch,
    title: "Main stays untouched",
    description:
      "Every fix is committed to a new branch with a clear message, and your main branch is never edited",
  },
  {
    icon: ScrollText,
    title: "Every step logged",
    description:
      "Each test run, fix and commit is logged and shown on the dashboard",
  },
];

// Sample run shown in the hero
const TEST_COUNT = 42;
const FAILED_AT = [9, 23, 35];
const failingTests = [
  { id: "test_invoice.py::test_rounds_to_cents", error: "AssertionError" },
  { id: "test_tax.py::test_exempt_customer", error: "KeyError" },
  { id: "test_dates.py::test_due_date_weekend", error: "AssertionError" },
];
const laterFixes = [
  { file: "src/tax.py", message: "Read exemption from customer.tax_exempt" },
  { file: "src/dates.py", message: "Move weekend due dates to Monday" },
];

function TestDots({ failed }: { failed: number[] }) {
  return (
    <p
      aria-hidden
      className="font-mono text-[12px] leading-5 break-all text-(--gb-pass)"
    >
      {Array.from({ length: TEST_COUNT }, (_, i) =>
        failed.includes(i) ? (
          <span key={i} className="text-(--gb-fail)">
            F
          </span>
        ) : (
          "."
        )
      )}
    </p>
  );
}

function RunPreview() {
  return (
    <div className={`${card} overflow-hidden shadow-(--gb-shadow)`}>
      {/* Branch bar */}
      <div className="flex h-12 items-center justify-between gap-4 border-b border-(--gb-line) px-5">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="size-4 shrink-0 text-(--gb-text-3)" strokeWidth={1.5} />
          <span className="truncate font-mono text-[13px] text-(--gb-text)">
            greenbranch/fix-payments-api-1763971200
          </span>
        </div>
        <span className="shrink-0 font-mono text-[12px] text-(--gb-text-3) tabular-nums">
          run 2 of 5
        </span>
      </div>

      <div className="space-y-6 p-5">
        {/* Run 1 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 text-[13px]">
            <span className="flex items-center gap-2 font-medium text-(--gb-text)">
              <StatusMark status="failed" />
              Run 1
            </span>
            <span className="font-mono text-[12px] text-(--gb-text-3) tabular-nums">
              39 passed, <span className="text-(--gb-fail)">3 failed</span> in 4.3s
            </span>
          </div>
          <TestDots failed={FAILED_AT} />
          <ul className="space-y-1">
            {failingTests.map((test) => (
              <li
                key={test.id}
                className="flex h-7 items-center justify-between gap-4 font-mono text-[12px]"
              >
                <span className="truncate text-(--gb-text-2)">{test.id}</span>
                <span className="hidden shrink-0 text-(--gb-text-3) sm:inline">
                  {test.error}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Fixes */}
        <div className="space-y-3 border-t border-(--gb-line) pt-5">
          <div className="flex items-center justify-between gap-4 text-[13px]">
            <span className="font-medium text-(--gb-text)">3 fixes</span>
            <span className="font-mono text-[12px] text-(--gb-text-3)">
              src/invoice.py
            </span>
          </div>
          <div className="overflow-hidden rounded-[10px] bg-(--gb-raised) py-2 font-mono text-[12px] leading-6">
            <div className="flex px-3 text-(--gb-text-3)">
              <span className="w-8 shrink-0 tabular-nums">41</span>
              <span className="whitespace-pre">  def line_total(qty, price):</span>
            </div>
            <div className="flex bg-(--gb-fail-soft) px-3 text-(--gb-fail)">
              <span className="w-8 shrink-0 tabular-nums">42</span>
              <span className="whitespace-pre">-     return round(qty * price, 1)</span>
            </div>
            <div className="flex bg-(--gb-pass-soft) px-3 text-(--gb-pass)">
              <span className="w-8 shrink-0 tabular-nums">42</span>
              <span className="whitespace-pre">+     return round(qty * price, 2)</span>
            </div>
          </div>
          <ul className="space-y-1">
            {laterFixes.map((fix) => (
              <li
                key={fix.file}
                className="flex h-7 items-center justify-between gap-4 text-[13px]"
              >
                <span className="truncate text-(--gb-text-2)">{fix.message}</span>
                <span className="hidden shrink-0 font-mono text-[12px] text-(--gb-text-3) sm:inline">
                  {fix.file}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Run 2 */}
        <div className="space-y-3 border-t border-(--gb-line) pt-5">
          <div className="flex items-center justify-between gap-4 text-[13px]">
            <span className="flex items-center gap-2 font-medium text-(--gb-text)">
              <StatusMark status="passed" />
              Run 2
            </span>
            <span className="font-mono text-[12px] text-(--gb-text-3) tabular-nums">
              <span className="text-(--gb-pass)">42 passed</span> in 4.1s
            </span>
          </div>
          <TestDots failed={[]} />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { status } = useSession();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");

  // Redirect authenticated users away from the landing page
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  // Show nothing while checking session or redirecting
  if (status === "loading" || status === "authenticated") return null;

  const handleRunAgent = () => {
    // Store the URL in localStorage so the dashboard can read it
    localStorage.setItem("greenbranch_repo_url", repoUrl);

    // Navigate to dashboard
    router.push("/dashboard");
  };

  const isFormValid = repoUrl.trim().length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-(--gb-bg) text-(--gb-text)">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:min-h-[min(calc(100svh-64px),880px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:px-8 lg:py-24">
          <div className="gb-rise">
            <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-0.02em] sm:text-[56px] lg:text-[64px] lg:tracking-[-0.03em]">
              Failing tests, fixed and rerun until they pass
            </h1>
            <p className="mt-6 max-w-[36rem] text-lg leading-7 text-(--gb-text-2)">
              GreenBranch runs your test suite, has an agent fix each failure
              and verifies the fix. Every change lands on a new branch, so
              main stays as it was.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className={primaryButton}
              >
                Run agent
              </button>
              <Link href="/signin" className={secondaryButton}>
                <GitHubIcon className="size-4" />
                Sign in with GitHub
              </Link>
            </div>
          </div>

          <div className="gb-rise gb-rise-delay">
            <RunPreview />
          </div>
        </section>

        {/* How It Works Section */}
        <section className="border-t border-(--gb-line)">
          <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
            <div className="max-w-2xl">
              <h2 className="text-[32px] leading-tight font-medium tracking-[-0.02em] sm:text-[40px]">
                How it works
              </h2>
              <p className="mt-4 text-lg text-(--gb-text-2)">
                Five steps from a red build to a green branch
              </p>
            </div>

            <ol className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
              {steps.map((step, index) => {
                const isLast = index === steps.length - 1;
                return (
                  <li key={step.number} className="relative">
                    <div className="flex h-5 items-center">
                      <StatusMark status={isLast ? "passed" : "pending"} />
                    </div>
                    {!isLast && (
                      <span
                        aria-hidden
                        className="absolute top-2.5 left-7 -right-4 hidden h-px bg-(--gb-line-strong) lg:block"
                      />
                    )}
                    <p className="mt-6 font-mono text-[12px] text-(--gb-text-3)">
                      {step.number}
                    </p>
                    <h3 className="mt-2 text-base font-medium">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-(--gb-text-2)">
                      {step.description}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Features Section */}
        <section className="border-t border-(--gb-line)">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 lg:px-8 lg:py-32">
            <div>
              <h2 className="text-[32px] leading-tight font-medium tracking-[-0.02em] sm:text-[40px]">
                Less time on red builds
              </h2>
              <p className="mt-4 text-lg text-(--gb-text-2)">
                The debugging loop you would run by hand, run for you
              </p>
            </div>

            <div className="grid gap-x-12 sm:grid-cols-2">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="border-t border-(--gb-line) py-6"
                >
                  <feature.icon className="size-[18px] text-(--gb-text-3)" strokeWidth={1.5} />
                  <h3 className="mt-4 text-base font-medium">{feature.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-(--gb-text-2)">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-(--gb-line)">
          <div className="mx-auto max-w-2xl px-6 py-24 text-center lg:py-32">
            <h2 className="text-[32px] leading-tight font-medium tracking-[-0.02em] sm:text-[40px]">
              Ready to go green?
            </h2>
            <p className="mt-4 text-lg text-(--gb-text-2)">
              Sign in with GitHub and run the agent on one of your
              repositories
            </p>
            <div className="mt-10">
              <Link href="/signin" className={primaryButton}>
                <GitHubIcon className="size-4" />
                Get started
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-(--gb-line)">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="GreenBranch"
              width={20}
              height={20}
              className="size-5"
            />
            <span className="text-sm font-medium text-(--gb-text-2)">
              GreenBranch
            </span>
          </div>
          <p className="text-sm text-(--gb-text-3)">
            Detects, fixes and verifies failing tests to keep CI green
          </p>
        </div>
      </footer>

      {/* Run Agent Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          className="rounded-2xl border-(--gb-line) bg-(--gb-card) p-6 text-(--gb-text) sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-medium">Run the agent</DialogTitle>
            <DialogDescription className="text-(--gb-text-2)">
              Paste a GitHub repository URL to clone it and run its tests
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            <div className="space-y-2">
              <label htmlFor="repo-url" className="text-sm font-medium">
                Repository URL
              </label>
              <input
                id="repo-url"
                placeholder="https://github.com/username/repository"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className={`${field} h-10 font-mono`}
                spellCheck={false}
              />
            </div>

            <button
              type="button"
              onClick={handleRunAgent}
              disabled={!isFormValid}
              className={`${primaryButton} w-full`}
            >
              Analyze repository
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
