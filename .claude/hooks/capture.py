#!/usr/bin/env python3
"""Claude Code hook: log each prompt and its final response to .agent-logs/.

Usage (stdin = hook JSON): capture.py prompt   # UserPromptSubmit
                           capture.py stop     # Stop (end of turn)
One file per session: .agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md
Entries are append-only; only the front-matter counters are rewritten.
"""
import glob, json, os, re, sys, time, traceback
from datetime import datetime, timezone

AUTHOR = "Schwifty101"
SEP = "\n---\n\n[LOG_ENTRY"  # header/body boundary: first match is always ours


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def last_assistant(transcript):
    """(model, text) of the newest real assistant message in the transcript."""
    try:
        lines = open(transcript, encoding="utf-8").read().splitlines()
    except (OSError, TypeError):
        return None, None
    for line in reversed(lines):
        try:
            m = json.loads(line).get("message") or {}
        except ValueError:
            continue
        if m.get("role") == "assistant" and m.get("model") not in (None, "<synthetic>"):
            c = m.get("content")
            text = "".join(b.get("text", "") for b in c if b.get("type") == "text") if isinstance(c, list) else c
            return m["model"], text
    return None, None


def settings_model():
    try:
        alias = json.load(open(os.path.expanduser("~/.claude/settings.json"))).get("model")
    except (OSError, ValueError):
        alias = None
    return f"{alias} (alias, no response yet)" if alias else "unknown"


def entry(kind, num, sid, ts, model, text):
    return f"[LOG_ENTRY type={kind} num={num} session={sid[:8]}]\ntimestamp: {ts}\nmodel: {model}\n\n{text}\n\n\n"


def render(sid, project, n, first, last, model, body):
    return f"""---
session_id: {sid}
date: {first[:10]}
author: {AUTHOR}
model: {model}
tool: claude-code
project: {project}
total_exchanges: {n}
first_prompt_time: {first}
last_prompt_time: {last}
---

# Session Log - {first[:10]}

Session: `{sid[:8]}` | Project: `{project}` | Author: `{AUTHOR}`

---

{body}"""


def main():
    kind = sys.argv[1]
    p = json.load(sys.stdin)
    sid = p["session_id"]
    root = os.environ.get("CLAUDE_PROJECT_DIR") or p["cwd"]
    project = os.path.basename(os.path.abspath(root))
    logdir = os.path.join(root, ".agent-logs")
    os.makedirs(logdir, exist_ok=True)
    found = glob.glob(os.path.join(logdir, f"*_{sid}.md"))
    ts = now()
    n, first, last, body = 0, ts, ts, ""
    if found:
        s = open(found[0], encoding="utf-8").read()
        i = s.index(SEP) + len("\n---\n\n")
        head, body = s[:i], s[i:]
        n = int(re.search(r"^total_exchanges: (\d+)", head, re.M).group(1))
        first = re.search(r"^first_prompt_time: (\S+)", head, re.M).group(1)
        last = re.search(r"^last_prompt_time: (\S+)", head, re.M).group(1)
    model, text = last_assistant(p.get("transcript_path"))
    want = (p.get("last_assistant_message") or "").strip()
    for _ in range(15):  # Stop fires before the transcript is flushed: wait for this turn's line
        if kind == "prompt" or (model and (not want or (text or "").strip() == want)):
            break
        time.sleep(0.2)
        model, text = last_assistant(p.get("transcript_path"))

    if kind == "prompt":
        n += 1
        last = ts
        model = model or settings_model()
        body += entry("PROMPT", n, sid, ts, model, p["prompt"])
    else:
        if not found:  # turn started before the hook existed: no prompt to pair with
            return
        text = p.get("last_assistant_message") or text or "(no text in final message)"
        model = model or "unknown"
        body += entry("RESPONSE", n, sid, ts, model, text)

    path = found[0] if found else os.path.join(logdir, f"{first[:10]}_{first[11:19].replace(':', '-')}_{sid}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(render(sid, project, n, first, last, model, body))


if __name__ == "__main__":
    try:
        main()
    except Exception:  # never break the session; leave a trail instead
        root = os.environ.get("CLAUDE_PROJECT_DIR") or "."
        os.makedirs(os.path.join(root, ".agent-logs"), exist_ok=True)
        with open(os.path.join(root, ".agent-logs", "capture-errors.log"), "a") as f:
            f.write(f"{now()} {sys.argv[1:]}\n{traceback.format_exc()}\n")
    sys.exit(0)
