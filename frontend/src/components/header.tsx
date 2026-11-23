"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, LayoutGrid } from "lucide-react";
import { GitHubIcon } from "@/components/dashboard/GitHubIcon";
import { button, focusRing } from "@/components/gb";

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const initial = session?.user?.name?.charAt(0).toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-(--gb-line) bg-[color-mix(in_srgb,var(--gb-bg)_85%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        <Link href="/" className={`flex items-center gap-2 rounded-md ${focusRing}`}>
          <Image src="/logo.png" alt="" width={24} height={24} className="size-6" />
          <span className="text-base font-medium text-(--gb-text)">GreenBranch</span>
        </Link>

        <nav className="flex items-center gap-4">
          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger className={`rounded-full ${focusRing}`} aria-label="Account">
                <Avatar className="size-8">
                  <AvatarImage src={session.user?.image || ""} alt="" />
                  <AvatarFallback className="bg-(--gb-raised) text-xs text-(--gb-text-2)">
                    {initial}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-60 rounded-xl border-(--gb-line) bg-(--gb-card) p-1 text-(--gb-text)"
              >
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium">{session.user?.name}</p>
                  <p className="truncate text-[13px] text-(--gb-text-3)">{session.user?.email}</p>
                </div>
                <DropdownMenuSeparator className="bg-(--gb-line)" />
                <DropdownMenuItem asChild className="h-8 gap-2 rounded-lg px-3 text-sm">
                  <Link href="/dashboard">
                    <LayoutGrid className="size-4 text-(--gb-text-3)" strokeWidth={1.5} />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="h-8 gap-2 rounded-lg px-3 text-sm"
                >
                  <LogOut className="size-4 text-(--gb-text-3)" strokeWidth={1.5} />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : pathname === "/signin" ? null : (
            <Link href="/signin" className={button("ghost", "md")}>
              <GitHubIcon className="size-4" />
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
