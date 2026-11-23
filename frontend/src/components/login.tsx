"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { GitHubIcon } from "@/components/dashboard/GitHubIcon";
import { button, card } from "@/components/gb";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();

  // Redirect authenticated users away from sign-in page
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  // Show nothing while checking session or redirecting
  if (status === "loading" || status === "authenticated") return null;

  return (
    <div className="flex min-h-screen flex-col bg-(--gb-bg) text-(--gb-text)">
      <Header />

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="gb-rise w-full max-w-100">
          <div className={`${card} p-8 shadow-(--gb-shadow)`}>
            <h1 className="text-2xl leading-tight font-medium tracking-[-0.02em]">
              Sign in to GreenBranch
            </h1>
            <p className="mt-2 text-sm leading-6 text-(--gb-text-2)">
              Use your GitHub account to pick a repository and review the
              fixes GreenBranch makes
            </p>

            <button
              type="button"
              onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
              className={`${button("primary", "lg")} mt-8 w-full`}
            >
              <GitHubIcon className="size-4" />
              Continue with GitHub
            </button>

            <p className="mt-6 border-t border-(--gb-line) pt-6 text-[13px] leading-5 text-(--gb-text-3)">
              GitHub will ask for access to your repositories. GreenBranch uses
              it to clone them, push fixes to new branches and open pull
              requests. It never pushes to your main branch.
            </p>
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className={button("ghost", "sm")}>
              <ArrowLeft strokeWidth={1.5} />
              Back to home
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-(--gb-line)">
        <p className="mx-auto max-w-7xl px-6 py-6 text-center text-sm text-(--gb-text-3) lg:px-8">
          Detects, fixes and verifies failing tests to keep CI green
        </p>
      </footer>
    </div>
  );
}
