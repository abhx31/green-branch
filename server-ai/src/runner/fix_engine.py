"""fix_engine — fix logic shared by the streaming runner and the LangGraph pipeline.

One fix attempt: pick an error → read the failing file (and, for test files, the
implementation it imports) → ask the LLM for the corrected file → write it via the
EC2 agent without running tests. Whether the attempt worked is only known after the
next test run: ``is_resolved`` checks that, and ``revert_fix`` restores the original
file when it didn't, so failed attempts never leak into later commits.
"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from src.core.exceptions import FixGenerationError
from src.llm.llm_client import ask_llm, clean_code_fences
from src.services.ec2_client import EC2Client

logger = logging.getLogger("greenbranch")

# How many times the same error may be attempted before moving on to the next one
MAX_ATTEMPTS_PER_ERROR = 2

LineLogFn = Callable[[str], Awaitable[None]]


async def _no_log(_line: str) -> None:
    pass


@dataclass
class FixAttempt:
    """A fix that has been written to disk but not yet verified by a test run."""

    error: dict[str, Any]
    target_file: str          # file actually rewritten (may differ from error["file"])
    original_content: str     # content before the fix, used to revert
    fixed_code: str
    prompt: str
    llm_ms: float


# ── Error selection ─────────────────────────────────────────────────────────

def error_key(error: dict[str, Any]) -> str:
    """Identity of an error across test runs."""
    return f"{error.get('file', '')}::{error.get('message', '')}"


def pick_error(errors: list[dict[str, Any]], attempts: dict[str, int]) -> dict[str, Any] | None:
    """Return the first error that hasn't used up its attempts, or None."""
    for error in errors:
        if attempts.get(error_key(error), 0) < MAX_ATTEMPTS_PER_ERROR:
            return error
    return None


def is_resolved(
    attempt: FixAttempt,
    errors: list[dict[str, Any]],
    passed: bool,
    *,
    passed_before: int = 0,
    passed_after: int = 0,
) -> bool:
    """True if the test run after *attempt* no longer reports the targeted error.

    A fix after which fewer tests pass is never resolved: a file that no longer
    loads makes its suite fail to run, which also hides the targeted error.
    """
    if passed:
        return True
    if passed_after < passed_before:
        return False
    return error_key(attempt.error) not in {error_key(e) for e in errors}


# Jest "Tests: 1 failed, 4 passed, 5 total" / Vitest "Tests  1 failed | 4 passed (5)"
_JS_SUMMARY_RE = re.compile(r"^\s*Tests:?\s+(.*)$", re.MULTILINE)
# pytest "===== 1 failed, 4 passed in 0.12s ====="
_PYTEST_SUMMARY_RE = re.compile(r"^=+ (.*) in [\d.]+s\b.*=+\s*$", re.MULTILINE)
_PASSED_RE = re.compile(r"(\d+) passed")


def passed_test_count(raw_output: str) -> int:
    """Number of passing tests in the run's final summary line (0 if there is none)."""
    summaries = list(_JS_SUMMARY_RE.finditer(raw_output)) + list(_PYTEST_SUMMARY_RE.finditer(raw_output))
    if not summaries:
        return 0
    last = max(summaries, key=lambda m: m.start())
    match = _PASSED_RE.search(last.group(1))
    return int(match.group(1)) if match else 0


# ── File helpers ────────────────────────────────────────────────────────────

def is_test_file(path: str) -> bool:
    return any(x in path.lower() for x in ("test", "spec", "__test__"))


def _repo_relative(path: str, session_id: str) -> str:
    """Strip container prefixes like /repos/<session_id>/ from traceback paths."""
    marker = f"/{session_id}/"
    if marker in path:
        return path.split(marker, 1)[1]
    return path.removeprefix("./")


def _candidate_impl_paths(test_path: str, test_content: str) -> list[str]:
    """Guess which implementation files a test file exercises."""
    candidates: list[str] = []
    if "../index" in test_content:
        candidates += ["src/index.ts", "src/index.js"]

    # Imports like: import { app } from "../index"
    for line in test_content.split("\n"):
        if 'from "' in line and "../" in line:
            try:
                import_path = line.split('from "')[1].split('"')[0]
            except IndexError:
                continue
            if import_path.startswith("../"):
                rel_path = import_path.replace("../", "src/")
                candidates += [rel_path + ".ts", rel_path + ".js"]

    # Also try removing test/spec from the path
    guess = test_path.replace("/tests/", "/").replace(".test.", ".").replace(".spec.", ".")
    if guess != test_path:
        candidates.append(guess)

    return list(dict.fromkeys(candidates))  # dedupe, keep order


# ── Prompt ──────────────────────────────────────────────────────────────────

def _build_prompt(
    *,
    error: dict[str, Any],
    file_path: str,
    file_content: str,
    impl_path: str,
    impl_content: str,
    raw_output: str,
    language: str,
    retry: bool,
) -> str:
    ext = file_path.rsplit(".", 1)[-1] if "." in file_path else ""
    file_block = f"```{ext}\n{file_content}\n```"

    impl_block = ""
    if impl_path:
        impl_ext = impl_path.rsplit(".", 1)[-1] if "." in impl_path else ""
        impl_block = f"\n\n=== IMPLEMENTATION FILE ({impl_path}) ===\n```{impl_ext}\n{impl_content}\n```"

    output_block = (
        f"```\n{raw_output[:3000]}{'...<truncated>' if len(raw_output) > 3000 else ''}\n```"
        if raw_output
        else "(no test output available)"
    )

    test_file_hint = (
        "\nNOTE: The file reported in the error is a TEST file. "
        "The test assertions are CORRECT. The bug is in the IMPLEMENTATION file.\n"
        "You must fix the IMPLEMENTATION file and return its full corrected contents.\n"
        "Output EXACTLY one line first: TARGET_FILE: <path/to/impl/file>\n"
        "then output the complete corrected implementation file contents on the next lines.\n"
        "Return that ONE file only, even if the test output shows failures in other files.\n"
        "Do NOT modify the test file. Do NOT wrap code in markdown fences."
        if is_test_file(file_path) else ""
    )

    retry_hint = (
        "\nNOTE: A previous fix attempt for this error did not make it go away and was reverted. "
        "Take a different approach."
        if retry else ""
    )

    return f"""CI pipeline failed. Fix the issue with a MINIMAL change.

=== ERROR INFO ===
File: {file_path}
Language: {language}
Error Type: {error.get('error_type', 'LOGIC')}
Line: {error.get('line') or 'unknown'}
Message: {error.get('message', '')}
Full Trace: {error.get('full_trace') or 'None'}
{test_file_hint}{retry_hint}
=== FILE CONTENTS ({file_path}) ===
{file_block}{impl_block}

=== FULL TEST OUTPUT ===
{output_block}

Fix ONLY the error under ERROR INFO; other failures in the test output are fixed separately.
Return ONLY the complete corrected contents of ONE file with no explanation, no markdown fences, no commentary."""


# A "TARGET_FILE: path" line, tolerating markdown decoration such as **TARGET_FILE:** `path`
_TARGET_FILE_RE = re.compile(r"^[*`\s]*TARGET_FILE:[*`\s]*([\w./@-]+?)[*`\s]*$", re.MULTILINE)


def split_target_files(answer: str) -> list[tuple[str, str]]:
    """Split an LLM answer into (path, contents) per TARGET_FILE line; [] if it has none."""
    matches = list(_TARGET_FILE_RE.finditer(answer))
    return [
        (m.group(1), clean_code_fences(answer[m.end():matches[i + 1].start() if i + 1 < len(matches) else len(answer)]))
        for i, m in enumerate(matches)
    ]


# ── Generate / apply / revert ───────────────────────────────────────────────

async def generate_fix(
    client: EC2Client,
    session_id: str,
    error: dict[str, Any],
    *,
    raw_output: str,
    language: str,
    retry: bool = False,
    log: LineLogFn = _no_log,
) -> FixAttempt:
    """Ask the LLM for a fix for *error*. Does not touch the repo.

    Raises FixGenerationError if no usable fix can be produced, LLMError if the
    LLM call itself fails.
    """
    file_path = _repo_relative(error.get("file") or "", session_id)
    if not file_path:
        raise FixGenerationError("The error does not point to a file")

    file_content = await client.read_file(session_id, file_path)
    if file_content is None:
        raise FixGenerationError(f"Cannot read {file_path} from the repository")
    await log(f"  Reading {file_path} ({len(file_content)} chars)")

    # For test files, try to find and read the implementation file
    impl_path, impl_content = "", ""
    test_file = is_test_file(file_path)
    if test_file:
        await log("  Test file detected — locating implementation…")
        for candidate in _candidate_impl_paths(file_path, file_content):
            content = await client.read_file(session_id, candidate)
            if content:
                impl_path, impl_content = candidate, content
                await log(f"  Found implementation: {candidate}")
                break

    prompt = _build_prompt(
        error=error,
        file_path=file_path,
        file_content=file_content,
        impl_path=impl_path,
        impl_content=impl_content,
        raw_output=raw_output,
        language=language,
        retry=retry,
    )

    await log("  Calling AI model…")
    t0 = time.monotonic()
    raw_fixed = await asyncio.to_thread(ask_llm, prompt)  # sync SDK call — keep the event loop free
    llm_ms = (time.monotonic() - t0) * 1000
    await log(f"  AI response received ({len(raw_fixed)} chars, {llm_ms:.0f}ms)")

    # TARGET_FILE lines redirect the fix (e.g. from a test file to its implementation).
    # The model sometimes returns extra files for other failures: keep only the file for
    # this error, so another file's code is never written into it.
    target_file, fixed_code = file_path, raw_fixed
    sections = [(_repo_relative(path, session_id), code) for path, code in split_target_files(raw_fixed)]
    if sections:
        preferred = [p for p in (impl_path, file_path) if p]
        target_file, fixed_code = next(
            (s for p in preferred for s in sections if s[0] == p), sections[0]
        )
        if target_file != file_path:
            await log(f"  Redirected fix → {target_file}")
        skipped = [path for path, _ in sections if path != target_file]
        if skipped:
            await log(f"  Ignored {len(skipped)} other file(s) in the AI's answer: {', '.join(skipped)}")

    if not fixed_code.strip():
        raise FixGenerationError("AI returned an empty fix")

    if target_file == file_path:
        original = file_content
    elif target_file == impl_path:
        original = impl_content
    else:
        original = await client.read_file(session_id, target_file)
    if original is None:
        raise FixGenerationError(f"AI targeted {target_file}, which does not exist in the repository")

    return FixAttempt(
        error=error,
        target_file=target_file,
        original_content=original,
        fixed_code=fixed_code,
        prompt=prompt,
        llm_ms=llm_ms,
    )


async def apply_fix(client: EC2Client, session_id: str, attempt: FixAttempt) -> None:
    """Write the fixed file. Tests are run separately by the caller."""
    await client.apply_fix(
        session_id=session_id,
        file_path=attempt.target_file,
        fix_content=attempt.fixed_code,
        run_tests=False,
    )


async def revert_fix(client: EC2Client, session_id: str, attempt: FixAttempt) -> None:
    """Restore the file to its content before *attempt*."""
    await client.apply_fix(
        session_id=session_id,
        file_path=attempt.target_file,
        fix_content=attempt.original_content,
        run_tests=False,
    )


# ── Descriptions ────────────────────────────────────────────────────────────

def _one_line(text: str, limit: int) -> str:
    return " ".join(text.split())[:limit]


async def explain_fix(attempt: FixAttempt) -> dict[str, str]:
    """Ask the LLM for a short structured explanation of a verified fix.

    Falls back to a generic description if the LLM output isn't valid JSON.
    """
    error = attempt.error
    error_message = error.get("message", "")
    prompt = (
        "You are an expert code reviewer. A CI test failure was fixed by AI. "
        "Provide a clear, concise explanation in EXACTLY this JSON format (no markdown, no extra text):\n\n"
        '{"root_cause": "<1-2 sentences: what was wrong in the original code>", '
        '"changes_made": "<1-2 sentences: what specific changes were made to fix it>", '
        '"impact": "<1 sentence: what tests now pass because of this fix>"}\n\n'
        f"Error type: {error.get('error_type', 'LOGIC')}\n"
        f"Error message: {error_message[:300]}\n"
        f"File fixed: {attempt.target_file}\n"
        f"Line: {error.get('line') or 'unknown'}\n\n"
        f"Original code (first 1500 chars):\n{attempt.original_content[:1500]}\n\n"
        f"Fixed code (first 1500 chars):\n{attempt.fixed_code[:1500]}"
    )
    try:
        raw = await asyncio.to_thread(ask_llm, prompt)
        parsed = json.loads(clean_code_fences(raw))
        return {
            "root_cause": str(parsed.get("root_cause", ""))[:300],
            "changes_made": str(parsed.get("changes_made", ""))[:300],
            "impact": str(parsed.get("impact", ""))[:200],
        }
    except Exception as e:
        logger.warning(f"[fix_engine] Explanation generation failed: {e}")
        return {
            "root_cause": error_message[:200] or "Unknown error",
            "changes_made": f"AI applied a code fix to {attempt.target_file}",
            "impact": "Test failures resolved",
        }


def commit_message_for(attempt: FixAttempt, root_cause: str = "") -> str:
    """Single-line commit message for a verified fix."""
    if root_cause:
        return f"fix({attempt.target_file}): {_one_line(root_cause, 80)}"
    message = f"[AI-AGENT] Fix {attempt.error.get('error_type', 'LOGIC')} in {attempt.target_file}"
    if attempt.error.get("line"):
        message += f" at line {attempt.error['line']}"
    return message
