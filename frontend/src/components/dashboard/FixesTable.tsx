"use client";

import { Fix } from "../../app/dashboard/types";
import { StatusMark } from "../status-mark";
import { card } from "../gb";

interface FixesTableProps {
  fixes: Fix[];
}

const th = "h-10 px-4 text-left text-[12px] font-normal text-(--gb-text-3)";

export function FixesTable({ fixes }: FixesTableProps) {
  if (fixes.length === 0) return null;

  return (
    <div className={`${card} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-(--gb-line)">
              <th className={th}>File</th>
              <th className={th}>Type</th>
              <th className={th}>Cause</th>
              <th className={`${th} text-right`}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--gb-line)">
            {fixes.map((fix, idx) => {
              const fixed = fix.status === "fixed";
              return (
                <tr key={idx} className="align-top transition-colors duration-150 hover:bg-(--gb-raised)">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusMark status={fixed ? "passed" : "failed"} size="sm" />
                      <code className="font-mono text-[13px] text-(--gb-text)">{fix.file}</code>
                      {fix.line_number > 0 && (
                        <span className="font-mono text-[12px] text-(--gb-text-3) tabular-nums">
                          L{fix.line_number}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap text-(--gb-text-2)">
                    {fix.bug_type}
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <p className="line-clamp-2 text-[13px] leading-5 text-(--gb-text-2)">
                      {fix.explanation?.root_cause ||
                        fix.description ||
                        fix.error_message ||
                        fix.commit_message}
                    </p>
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-[13px] whitespace-nowrap ${
                      fixed ? "text-(--gb-pass)" : "text-(--gb-fail)"
                    }`}
                  >
                    {fixed ? "Fixed" : "Not fixed"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
