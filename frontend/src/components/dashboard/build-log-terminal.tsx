import React, { useRef, useState, useEffect, useCallback } from "react";
import { ChevronDown, Copy, Check, ArrowDown } from "lucide-react";
import { LogLine } from "../../app/dashboard/types";
import { focusRing } from "../gb";

// The log stays dark in both themes. Colors carry meaning only:
// white = command, green = passed, red = failed, amber = agent action, grey = output
const terminalButton = `inline-flex size-7 items-center justify-center rounded-md text-[#85858b] transition-colors duration-150 hover:bg-[#232325] hover:text-[#ededed] ${focusRing}`;

function getLineClass(line: string): string {
  if (line.startsWith("  ✓ Fix applied") || line.startsWith("  ✓ committed")) return "text-[#4cc38a] font-medium";
  if (line.startsWith("  ✗ Fix failed") || line.startsWith("  ✗ commit")) return "text-[#e5484d] font-medium";
  if (line.startsWith("  ERROR") || line.includes("✗") || line.includes("FAIL")) return "text-[#e5484d]";
  if (line.includes("✓") || line.includes("All tests passing") || line.includes("PASS")) return "text-[#4cc38a]";
  if (line.startsWith("▶")) return "text-[#ededed] font-medium";
  if (line.startsWith("  $") || line.startsWith("$")) return "text-[#ededed]";
  if (
    line.startsWith("  Calling AI") ||
    line.startsWith("  AI response") ||
    line.startsWith("  Redirected fix") ||
    line.startsWith("  Applying fix")
  )
    return "text-[#d6a85b]";
  if (line.startsWith("  [install]")) return "text-[#85858b]";
  return "text-[#a1a1a6]";
}

export function BuildLogTerminal({ logs, isStreaming }: { logs: LogLine[]; isStreaming: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const handleCopy = useCallback(() => {
    const text = logs.map((l) => l.line).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [logs]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-(--gb-line) bg-[#0f0f10]">
      {/* ── Header ── */}
      <div className="flex h-11 items-center justify-between border-b border-white/[0.08] bg-[#141415] pr-2 pl-4">
        <span className="text-[13px] font-medium text-[#ededed]">Build log</span>

        <div className="flex items-center gap-1">
          <span className="mr-2 font-mono text-[12px] text-[#85858b] tabular-nums">
            {logs.length} lines
          </span>
          {logs.length > 0 && (
            <button type="button" onClick={handleCopy} className={terminalButton} aria-label="Copy log">
              {copied ? <Check className="size-4 text-[#4cc38a]" /> : <Copy className="size-4" strokeWidth={1.5} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={terminalButton}
            aria-label={expanded ? "Collapse log" : "Expand log"}
            aria-expanded={expanded}
          >
            <ChevronDown
              className={`size-4 transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`}
              strokeWidth={1.5}
            />
          </button>
        </div>
      </div>

      {/* ── Log content ── */}
      {expanded && (
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="gb-dark-scroll max-h-112 min-h-48 overflow-y-auto py-2 font-mono text-[12px] leading-5"
          >
            {logs.length === 0 ? (
              <p className="px-4 py-2 text-[#85858b]">Waiting for build output</p>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} className="hover:bg-white/[0.03]">
                      <td className="w-12 pr-3 pl-2 text-right align-top text-[#85858b]/60 tabular-nums select-none">
                        {i + 1}
                      </td>
                      <td className={`pr-4 break-all whitespace-pre-wrap ${getLineClass(log.line)}`}>
                        {log.line || " "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!autoScroll && isStreaming && (
            <button
              type="button"
              onClick={scrollToBottom}
              className={`absolute right-3 bottom-3 inline-flex size-8 items-center justify-center rounded-full border border-white/[0.08] bg-[#232325] text-[#a1a1a6] transition-colors duration-150 hover:text-[#ededed] ${focusRing}`}
              aria-label="Scroll to latest line"
            >
              <ArrowDown className="size-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
