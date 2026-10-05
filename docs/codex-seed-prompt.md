# Codex prompts: seed meetings without `claude -p`

Run **Prompt A once per slug, in parallel** (7 separate Codex tasks, each touching only its own folder), then **Prompt B once** after all seven are finished. Replace `{SLUG}` in Prompt A.

Slugs and target lengths (shortened to fit 20 to 40 minutes of wall clock; the showcase must stay 60 to 64 minutes):

| slug | min | speakers |
| --- | --- | --- |
| `q4-planning` (showcase) | 62 | 8 |
| `acme-discovery` | 20 | 4 |
| `priya-mei-1on1` | 15 | 2 |
| `harbor-interview` | 20 | 2 |
| `optimizer-outage-postmortem` | 25 | 5 |
| `mobile-design-review` | 25 | 4 |
| `weekly-product-sync` | 15 | 4 |

`eng-standup` is already done. Wall-clock estimate with seven parallel tasks: the showcase is the long pole at roughly 9,300 words (about 10 to 15 minutes), the rest 5 to 8 minutes, Prompt B about 5 minutes. These are estimates, not measured.

---

## Prompt A (one task per slug)

```
You are working in the git repository at the current directory (a Next.js project, "Fathom rebuild"). Your job: write the synthetic meeting bundle for ONE meeting, slug "{SLUG}", by hand, as files. Do NOT run `npm run seed:gen`, `claude`, `seed:load`, `seed:clips`, `rls:test` or anything that touches a database or network. Do not edit any file outside `seed/generated/{SLUG}/`. Do not run `git add -A`; do not commit.

READ FIRST (do not skip):
- `seed/meetings.ts`: find the entry with slug "{SLUG}". Its `title`, `kind`, `host`, `internal`, `externals`, `targetMin`, `topic` are binding. The cast is the internal members (names and roles in `seed/team.ts`) plus the externals, spelled exactly.
- `seed/generated/eng-standup/`: a finished example of all five files. Match its shape and its natural, specific, spoken tone.
- `lib/prompts.ts`: `briefPrompt`, `chapterPrompt`, `summaryPrompt`, `TEMPLATE_GUIDE`, `actionItemsPrompt`, `highlightsPrompt`. These are the original instructions; follow their rules.
- `lib/schema.ts`: the exact shapes. `seed/due.ts`: the only due phrases that resolve.

WRITE THESE FOUR FILES in `seed/generated/{SLUG}/` (valid JSON, 2-space indent):

1. `brief.json`: {"agenda": string[], "chapters": [{"title", "beats": string[], "minutes": number}]}. At least 3 chapters (5 to 8 for the 62-minute showcase, 3 to 4 for meetings of 25 minutes or less). The chapter `minutes` MUST add up to targetMin (within 5%). Beats are concrete: names, numbers, disagreements, decisions.

2. `lines.json`: {"chapters": [{"title": string, "lines": [{"speaker": string, "text": string}]}]}. Chapter titles MUST equal brief.json chapter titles, same order. This is the transcript dialogue, nothing else: NO timestamps, NO idx (a script computes them).
   - Length: about 150 words per target minute in total, spread across chapters in proportion to `minutes`. The stamped duration must land within 15% of targetMin (within 5% for the showcase). Too few words = too short a meeting; check by counting.
   - Average at least 8 words per line (the checker rejects under 7). Lines are speaking turns, 1 to 4 sentences.
   - `speaker` is exactly one of the cast names. No narration, no stage directions, no "[laughs]".
   - Natural spoken English: interruptions, agreement and pushback, specific numbers, a real disagreement that resolves, people referring to each other by first name, a clear start and a clean close.
   - Facts must be consistent with `topic` and with the other Kestrel meetings (company Kestrel, product Kestrel Dispatch). Invent no real-world people, companies or brands.
   - Showcase only (`q4-planning`): all 8 people must each speak a meaningful share (at least 3% of talk time each, so give the quietest people several multi-sentence turns) and each should speak in at least two chapters.

3. `summaries.json`: {"general": {...}, "sales": {...}, "standup": {...}, "project_review": {...}}, each `{"sections": [{"heading": string, "bullets": string[]}]}`. Headings must come from `TEMPLATE_GUIDE` in lib/prompts.ts, exact text, in that order, each at most once. Omit a section the transcript does not support; never pad. Keep at least one section per template. 1 to 6 bullets per section, each a full sentence grounded in the dialogue you wrote, naming people and numbers. The standup template names the person in every bullet.

4. `picks.json`: {"action_items": [{"owner": string, "task": string, "due_phrase": string|null, "segment_idx": number}], "highlights": [{"segment_idx": number, "type": string, "title": string}]}.
   - `segment_idx` is the 0-based index of a line counted across ALL chapters in order (chapter 1 line 1 is 0). Count carefully; point to the line where the commitment or moment is spoken.
   - `owner` is a cast name. `due_phrase` is the spoken wording and MUST be one `seed/due.ts` resolves (e.g. "today", "tomorrow", "by Friday", "end of week", "next week"), or null. Read due.ts. 3 to 8 action items.
   - highlights: 3 to 6, each in a DIFFERENT speaker run (not two picks inside one uninterrupted stretch by the same speaker, and not adjacent lines by the same speaker). `type` is one of: action_item, insight, positive, feedback, objection, tech_question. `title` at most 80 characters. Use at least 3 different types.

THEN run, from the repo root:
    npm run seed:assemble -- {SLUG}
It computes timestamps, chapters, due dates and highlight windows, writes transcript.json, actions.json and highlights.json, validates the whole bundle, deletes lines.json and picks.json on success, and prints `{SLUG}: assembled and checked`. If it prints `ERROR ...` lines, fix the named input file and re-run until it passes. A length error means add or cut dialogue lines; do not edit the generated files by hand.

Finish by running `npm run seed:check 2>&1 | grep -E "^(ERROR )?{SLUG}"` and show the output. Other meetings and ask.json will show as missing; that is expected. Final answer: the slug, line count, minutes, and whether assemble passed. Do not paste the transcript.
```

---

## Prompt B (once, after all seven finished and eng-standup exists)

```
You are working in the git repository at the current directory. Write `seed/generated/ask.json`, the stored answers for the app's Ask feature. Do NOT run `npm run seed:gen`, `claude`, or anything touching a database or network. Edit only `seed/generated/ask.json`. Do not commit.

Precondition: `npm run seed:check` reports no ERROR for any meeting (only ask.json missing). If any meeting has an error, stop and say so.

READ: `lib/prompts.ts` (`askPrompt`, `ASK_PROMPTS_BY_SCOPE`), `lib/schema.ts` (`askFileSchema`), `seed/gen/ask.ts` (how the corpus is built and how scopes work), `seed/check.ts` (`checkAsk`), `seed/meetings.ts`, and for each meeting its `summaries.json` (general), `actions.json` and `highlights.json`.

OUTPUT: a JSON array of exactly 6 objects {"prompt","scope","text","citations":[{"meeting_slug","segment_idx","label"}]}, one for each pair:
  scope "my_calls", prompts: "Next steps on projects?", "Summarize my recent meetings", "Surprise me with an insight"
  scope "team_calls", prompts: "Next steps across the team?", "Summarize recent team meetings", "Surprise me with a team insight"
(The prompt strings must match `ASK_PROMPTS_BY_SCOPE` exactly.)

RULES:
- Answer only from the notes in those files. "my"/"me" means Priya Raman, the demo persona. `my_calls` answers may cite ONLY meetings hosted by priya (q4-planning, priya-mei-1on1, mobile-design-review, weekly-product-sync); `team_calls` may cite any of the eight.
- `text`: 3 to 6 plain-text sentences or short dash bullets. Specific names, numbers, dates; no invention.
- 2 to 5 citations per answer. Each citation's `segment_idx` MUST be an index that appears as the `segment_idx` of an action item or highlight of that same meeting (the app lists only those). `label` is a short phrase for the cited moment. Spread citations across several meetings where the answer does.
- No two answers share the same (scope, prompt).

THEN run `npm run seed:check`. It must print `seed:check passed`. Fix ask.json until it does, never the other files. Final answer: the pass line and the count of answers.
```

---

## After Codex finishes (back in Claude Code)

1. `git status` and read the diff of `seed/generated/` for real-world names or odd content; `npm run seed:check`; `npm test`.
2. Commit explicit paths only: `seed/generated`, `seed/assemble.ts`, `seed/gen/meeting.ts`, `seed/meetings.ts`, `package.json`, `tests/seed-assemble.test.ts`, `docs/codex-seed-prompt.md`.
3. Then plan chunk 3 (hosted load), which still needs your explicit go-ahead.
