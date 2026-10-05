# Fathom rebuild: manual test checklist

This checklist is for ticking off by hand in a browser. It was written from the plan, the spec, the design system document and the code in `app/`, `components/` and `lib/`. It was not written from a running app: the hosted database is unreachable from the environment that wrote it, so nothing here has been observed against data. Where a source gives no expected behaviour, the item is not written as fact; see "Open questions for the user" at the end.

Tree under test: the current `main`, which contains Tasks 1 to 28 (plus the accessibility fixes described in ledger 10.7).

## 1. Prerequisites

Tick these before starting. They are not counted in the tally.

### 1.1 Build and run

- [ ] Run `npm ci`. Confirm `.env.local` exists and defines `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (names only; never paste or print the values).
- [ ] Start the app with `npm run build` then `npm start` (the production build, which is what `npm run e2e` uses), or `npm run dev`. Open `http://localhost:3000`.
- [ ] Keep DevTools open on the Network and Console tabs. Open the Accessibility pane when an item asks for it.
- [ ] Have a plain text editor ready to paste into for the Copy items.
- [ ] Remember that every date and time in the app is shown in UTC.

### 1.2 Seed data, loaded with the documented commands

- [ ] `npm run seed:gen` (Task 11). It is resumable. `npm run seed:gen -- eng-standup` generates one meeting as a probe. It needs a working `claude` CLI login and spends model time.
- [ ] `npm run seed:check` finishes with no errors (Task 12).
- [ ] `npm run seed:load`, run twice. Both runs print the same counts (Task 13 Steps 2 and 3): `team_members: 8`, `meetings: 8`, `summaries: 32`, `calendar_events: 5`, and `chapters`, `action_items` and `highlights` above 0. The plan says `ask_answers: 3`; ledger 9.2 says 3 prompts per scope, so expect 6 (see open question 2).
- [ ] `npm run seed:clips` prints `clip /clip/demo-q4-clip` and `clip /clip/demo-q4-clip-2` (Task 24 Step 6).
- [ ] `ls seed/generated` shows eight meeting folders plus `ask.json`. When this checklist was written only `eng-standup` existed (check with `npm run seed:check`), so every item tagged `D` that needs a missing meeting is Blocked until the rest are generated and loaded. Nothing is loaded in the hosted database until `seed:load` has run.

### 1.3 Sign-in and key

- [ ] Google OAuth is configured as in plan Task 15 Step 8: a Google Cloud OAuth client (Web application) with redirect URI `https://<project-ref>.supabase.co/auth/v1/callback` (the ref is in ledger section 1); Google enabled under Supabase Authentication, Sign In / Providers; Site URL `http://localhost:3000` and redirect URL `http://localhost:3000/**` under URL Configuration. Items tagged `G` are Blocked until this is done (it was not configured when this was written; see the handoff gates).
- [ ] Optional: a server-side `ANTHROPIC_API_KEY` in `.env.local` only. Never paste it into chat or commit it, and restart the server after changing it. Run the `NK` items first with no key, then add the key and run the `K` items.

### 1.4 Browser set-up

- [ ] Viewports: 1280 px and 390 px wide. In Chrome, open DevTools, switch on the device toolbar (Ctrl+Shift+M or Cmd+Shift+M), choose "Responsive" and type the width. Use 800 px height for 1280 and 844 px for 390. Keep browser zoom at 100%.
- [ ] Reduced motion: in Chrome DevTools open the command menu (Ctrl+Shift+P), run "Show Rendering", then set "Emulate CSS media feature prefers-reduced-motion" to "reduce". Alternatively turn on "Reduce motion" (macOS) or turn off "Animation effects" (Windows) in the operating system.
- [ ] Private window: open one (Ctrl+Shift+N in Chrome) for signed-out checks. It starts with no cookies, so it is signed out. Sign out first in a normal window.
- [ ] Optional automated cross-check: `npm run e2e` runs the 9 signed-out smoke tests against the local build.

### 1.5 Tags, run order and recording results

Tags after an item ID:

| Tag | Meaning |
| --- | --- |
| (none) | Needs only the running app with its database reachable. |
| `D` | Needs the seeded data loaded (section 1.2). |
| `G` | Needs Google sign-in working and you signed in. |
| `K` | Needs a server-side `ANTHROPIC_API_KEY`. |
| `NK` | Only valid with no `ANTHROPIC_API_KEY` set. |

Suggested run order: do everything without a `G` tag first (use a private window where an item says signed out), then sign in once (section 15) and do the `G` items.

Recording a result:

- Tick the box (`[x]`) for Pass.
- Leave the box empty and add `FAIL: <what you saw>` at the end of the line for Fail.
- Leave the box empty and add `BLOCKED: <reason>` at the end of the line for Blocked.

Source key, used in each item's Source:

| Code | Meaning |
| --- | --- |
| `T18 S3` | Plan Task 18, Step 3 (`docs/superpowers/plans/2026-10-05-fathom-rebuild.md`). `RF2` is item 2 of the plan's Review Focus. |
| `Spec 7` | Section 7 of `docs/superpowers/specs/2026-10-05-fathom-rebuild-design.md`. |
| `DS` | `docs/design/design-system.md`. |
| `L9.5` | Section 9.5 of `docs/superpowers/ledger/decisions-and-open-items.md` (`L10.1` is section 10.1). |
| `Code: file` | The named file under `app/`, `components/` or `lib/`. |
| `Seed: file` | The named file under `seed/` or `supabase/`. |

Optional tally helper, run from the repository root once you have ticked and annotated items:

```bash
f=docs/manual-test-checklist.md
for p in SO MC TC PP TR SA HL SH GS AF RG CA AU VR AX KR; do
  printf '%s pass=%s fail=%s blocked=%s total=%s\n' "$p" \
    "$(grep -c "^- \[x\] \*\*$p-" $f)" \
    "$(grep -c "^- \[ \] \*\*$p-.*FAIL:" $f)" \
    "$(grep -c "^- \[ \] \*\*$p-.*BLOCKED:" $f)" \
    "$(grep -c "^- \[.\] \*\*$p-" $f)"
done
```

## 2. Tally

Total is the number of items in the section. Fill in Pass, Fail and Blocked as you finish each section.

| Section | Total | Pass | Fail | Blocked |
| --- | --- | --- | --- | --- |
| 3. Signed-out basics (SO) | 12 | | | |
| 4. My Calls, Task 18 (MC) | 14 | | | |
| 5. Team Calls, Task 19 (TC) | 19 | | | |
| 6. Player and playback, Task 20 (PP) | 19 | | | |
| 7. Transcript and meeting page, Task 21 (TR) | 26 | | | |
| 8. Summary templates and action items, Task 22 (SA) | 18 | | | |
| 9. Highlights, Task 23 (HL) | 24 | | | |
| 10. Share and clip page, Task 24 (SH) | 24 | | | |
| 11. Global search, Task 25 (GS) | 14 | | | |
| 12. Ask Fathom, Task 26 (AF) | 28 | | | |
| 13. Live summary regeneration, Task 27 (RG) | 14 | | | |
| 14. Calendar stub, Task 28 (CA) | 9 | | | |
| 15. Google sign-in, Task 15 (AU) | 13 | | | |
| 16. Visual and responsive review, Task 14 (VR) | 19 | | | |
| 17. Accessibility (AX) | 38 | | | |
| 18. Known risks to watch (KR) | 13 | | | |
| Total | 304 | | | |

## 3. Signed-out basics (SO)

Use a private window. These need only the running app, except where tagged.

- [ ] **SO-01** **Do:** Open `http://localhost:3000/`. **Expect:** the address bar ends at `/meetings`. **Source:** Code: `app/page.tsx`; Spec 7.
- [ ] **SO-02** **Do:** Look at the header on `/meetings` at 1280 px. **Expect:** a "Fathom Rebuild" link, a search box with placeholder "Search call recordings", links "My Calls", "Team Calls" and "Calendar", and a "Sign in with Google" button. **Source:** T17 S2; Spec 7 (shared header); Code: `components/Header.tsx`.
- [ ] **SO-03** **Do:** Click My Calls, Team Calls, then Calendar. **Expect:** they open `/meetings`, `/team` and `/calendar`, and the current one has the lighter background and brighter text while the others are muted. **Source:** Code: `components/NavTabs.tsx`.
- [ ] **SO-04** **Do:** Click the "Fathom Rebuild" link from `/team`. **Expect:** you land on `/meetings`. **Source:** Code: `components/Header.tsx`.
- [ ] **SO-05** `D` **Do:** Open `/team` and scroll down the page. **Expect:** the header stays fixed at the top of the window. **Source:** Code: `components/Header.tsx` (sticky).
- [ ] **SO-06** **Do:** Open `/nope`. **Expect:** the heading "We couldn't find that", the line "The call or clip may have been removed, or the link is mistyped." and a "Back to My Calls" link to `/meetings`, under the normal header. **Source:** T17 S2; Code: `app/not-found.tsx`.
- [ ] **SO-07** **Do:** Open `/meetings/does-not-exist`. **Expect:** the same friendly 404 as SO-06, with no error page. **Source:** T21 S5.
- [ ] **SO-08** **Do:** Open `/clip/does-not-exist`. **Expect:** the same friendly 404. **Source:** T24 S7; `e2e/smoke.spec.ts` (404 test).
- [ ] **SO-09** **Do:** Open `/meetings`, `/team`, `/search`, `/calendar` and `/design` in turn. **Expect:** each loads without a sign-in screen and without a redirect to a login page. **Source:** L9.1 (public pages); Spec 2 (access model).
- [ ] **SO-10** `D` **Do:** Open `/meetings/q4-planning` and `/clip/demo-q4-clip`. **Expect:** both load without a sign-in screen. **Source:** L9.1; Spec 8.
- [ ] **SO-11** **Do:** Read the browser tab title on `/meetings`. **Expect:** "Fathom Rebuild". **Source:** Code: `app/layout.tsx`.
- [ ] **SO-12** **Do:** Open `/meetings`, `/team`, `/search`, `/calendar` and any meeting page while signed out. **Expect:** the header shows "Sign in with Google" on each, and no page offers an email or password form. **Source:** Spec 2 (Google only); Code: `components/AuthButton.tsx`.

## 4. My Calls (MC), Task 18

Open `/meetings` signed out. The persona is Priya Raman, who hosts four of the eight seeded meetings.

- [ ] **MC-01** `D` **Do:** Count the call cards. **Expect:** exactly four, all hosted by Priya Raman: Q4 Product Planning, Priya / Mei 1:1, Weekly Product Sync and Mobile App Design Review. **Source:** T18 S3 ("four cards"); Seed: `seed/meetings.ts` (host `priya` on four meetings).
- [ ] **MC-02** `D` **Do:** Read the month headings. **Expect:** "October 2026" with one card (Q4 Product Planning), then "September 2026" with three cards, newest first: Priya / Mei 1:1, Weekly Product Sync, Mobile App Design Review. **Source:** Code: `lib/group.ts`; Seed: `seed/meetings.ts` start dates. The plan says "October 2026" for all four (open question 1).
- [ ] **MC-03** `D` **Do:** Read the grey line under each title. **Expect:** "Zoom · Priya Raman · Oct 1", "Google Meet · Priya Raman · Sep 30", "Zoom · Priya Raman · Sep 29", "Google Meet · Priya Raman · Sep 21" for the four cards in order of appearance. **Source:** Code: `components/MeetingCard.tsx`; Seed: `seed/meetings.ts`.
- [ ] **MC-04** `D` **Do:** Read the duration badge at the bottom right of each card image. **Expect:** a figure like "62 mins", close to the target length (Q4 about 62, 1:1 about 30, Weekly Sync about 25, Design Review about 50). **Source:** Code: `lib/format.ts` (`formatMinutes`); Seed: `seed/check.ts` (5% tolerance for the showcase, 15% for the others).
- [ ] **MC-05** `D` **Do:** Look under each title for a chip. **Expect:** every card shows "N mins of highlights" with N at least 1. **Source:** Spec 8 (seeded highlights keep the figure from being empty); Code: `components/MeetingCard.tsx`.
- [ ] **MC-06** `D` **Do:** Count the initials tiles on the Q4 Product Planning card and on the Priya / Mei 1:1 card. **Expect:** four tiles on the Q4 card (it has eight participants, only four are shown) and two tiles on the 1:1 card reading "PR" and "MT" in either order. **Source:** Code: `components/MeetingCard.tsx` (`slice(0, 4)`), `lib/format.ts` (`initials`).
- [ ] **MC-07** `D` **Do:** Read the "Upcoming" strip above the cards. **Expect:** five event cards, in this order: "Weekly Product Sync // Kestrel", "Discovery Call // Brightline Couriers", "Engineering Standup", "Customer Interview // Northgate Transport", "Q4 Planning Checkpoint". Each shows a short weekday, a time and "UTC · Notetaker will join". **Source:** T18 S3; Code: `components/UpcomingEvents.tsx`; Seed: `seed/load.ts` (`EVENTS`).
- [ ] **MC-08** `D` **Do:** Compare the event weekdays and times with today's date in UTC. **Expect:** day offsets of tomorrow, tomorrow, +2, +3 and +5 days, at 10:00 AM, 3:30 PM, 9:30 AM, 5:00 PM and 2:00 PM. **Source:** Seed: `seed/load.ts` (`EVENTS`) and the `calendar_upcoming` view in `supabase/migrations/20261005000000_init.sql`.
- [ ] **MC-09** `D` **Do:** Click the Q4 Product Planning card. **Expect:** the browser opens `/meetings/q4-planning`. **Source:** Code: `components/MeetingCard.tsx`.
- [ ] **MC-10** `D` **Do:** Hover over a card with the mouse. **Expect:** the card border turns cyan. **Source:** Code: `components/MeetingCard.tsx` (`group-hover:border-accent`).
- [ ] **MC-11** `D` **Do:** At 1280 px, look at the layout. **Expect:** three columns of cards on the left and the Ask Fathom panel as a separate column on the right. **Source:** Code: `app/meetings/page.tsx` (`xl:grid-cols-3`, `lg:grid-cols-[minmax(0,1fr)_auto]`).
- [ ] **MC-12** `D` **Do:** At 390 px, look at the layout, then run `document.documentElement.scrollWidth <= window.innerWidth` in the Console. **Expect:** one column of cards, the Ask panel below them, and the Console prints `true` (no horizontal page scroll). **Source:** T18 S3.
- [ ] **MC-13** `D` **Do:** Open `/meetings` and list the headings (DevTools Accessibility tree, or run `[...document.querySelectorAll('h1')].map(h => h.textContent)`). **Expect:** exactly one `h1`, reading "My Calls". **Changed in the UI pass:** the page had no `h1`. **Source:** L10.5; Code: `app/meetings/page.tsx`.
- [ ] **MC-14** `D` **Do:** Find a meeting card whose participants number exactly three (check the Team Calls table or the meeting pages) and look at its tile grid. **Expect:** no empty fourth cell; the last tile spans the full row. If no seeded call has three participants, mark Blocked. **Changed in the UI pass:** a three-participant card left an empty fourth cell. **Source:** L10.5; Code: `components/MeetingCard.tsx`, `lib/card-tiles.ts`.

## 5. Team Calls (TC), Task 19

Open `/team` signed out.

- [ ] **TC-01** `D` **Do:** Read the three stat cards. **Expect:** "Calls" 8, "Avg talk share" with a whole-number percentage, and "Team members" 8. **Source:** T19 S2 (eight calls); Code: `app/team/page.tsx` (the card says "Avg talk share", the plan's text said "Avg talk time").
- [ ] **TC-02** `D` **Do:** Average the "Talk share" column of the members table by hand. **Expect:** the mean, rounded to a whole number, equals "Avg talk share". **Source:** Code: `app/team/page.tsx`.
- [ ] **TC-03** `D` **Do:** Read the "Team members" table header. **Expect:** columns Member, Calls, Talk share, Questions, Longest monologue, and eight rows each with a name and a smaller role line. **Source:** Code: `components/TeamTable.tsx`.
- [ ] **TC-04** `D` **Do:** Read the Calls column. **Expect:** Priya Raman 5, Mei Tanaka 5, Amara Nwosu 5, Jonas Weber 4, Lucas Ferreira 4, Daniel Ortiz 3, Hannah Cole 2, Omar Haddad 2, with the highest counts at the top. **Source:** Seed: `seed/meetings.ts` (my count of internal participants) and the `team_stats` view; Code: `lib/queries.ts` (ordered by calls, descending).
- [ ] **TC-05** `D` **Do:** Read the role line under each name. **Expect:** Priya Product Lead, Daniel Sales, Mei Engineering Manager, Jonas Design Lead, Amara Customer Success, Lucas Data & Analytics, Hannah Marketing, Omar Finance. **Source:** Seed: `seed/team.ts`.
- [ ] **TC-06** `D` **Do:** Scan the Talk share, Questions and Longest monologue columns. **Expect:** every Talk share is above 0%, Questions are whole numbers, Longest monologue is `m:ss`, and nothing reads NaN or is blank. **Source:** T19 S2 (plausible percentages); Code: `components/TeamTable.tsx`.
- [ ] **TC-07** `D` **Do:** Read the "Team calls" heading and the month headings below it. **Expect:** eight cards: "October 2026" with Engineering Standup (Oct 2) and Q4 Product Planning (Oct 1), then "September 2026" with Priya / Mei 1:1 (Sep 30), Weekly Product Sync (Sep 29), Discovery Call // Acme Freight (Sep 28), Customer Interview // Harbor Logistics (Sep 25), Route Optimizer Outage Postmortem (Sep 24) and Mobile App Design Review (Sep 21). **Source:** T19 S2; Seed: `seed/meetings.ts`.
- [ ] **TC-08** `D` **Do:** Open the Host dropdown and the Role dropdown. **Expect:** Host lists "All hosts" plus the eight member names. Role lists "All roles" plus Customer Success, Data & Analytics, Design Lead, Engineering Manager, Finance, Marketing, Product Lead, Sales in that order. **Source:** Code: `app/team/page.tsx` (roles sorted).
- [ ] **TC-09** `D` **Do:** Choose Host "Priya Raman" and press Filter. **Expect:** the URL gains `host=` and a value, the list narrows to the same four calls as My Calls, and the "Calls" stat reads 4. **Source:** T19 S2 (choosing a host narrows the list); Code: `app/team/page.tsx`.
- [ ] **TC-10** `D` **Do:** After TC-09, read the Host dropdown. **Expect:** it still shows "Priya Raman". **Source:** Code: `app/team/page.tsx` (`defaultValue`).
- [ ] **TC-11** `D` **Do:** After TC-09, read the members table. **Expect:** still eight rows with the same numbers; the filter does not change the table. **Source:** Code: `app/team/page.tsx` (`TeamTable rows={stats}`).
- [ ] **TC-12** `D` **Do:** Choose Role "Engineering Manager" with Host "All hosts" and press Filter. **Expect:** two cards: Engineering Standup and Route Optimizer Outage Postmortem. **Source:** Seed: `seed/meetings.ts` (host `mei` on both).
- [ ] **TC-13** `D` **Do:** Choose Role "Sales" and press Filter. **Expect:** one card: Discovery Call // Acme Freight. **Source:** Seed: `seed/meetings.ts` (host `daniel`).
- [ ] **TC-14** `D` **Do:** Choose Host "Priya Raman" with Role "Sales" and press Filter. **Expect:** "No calls match these filters." and the Calls stat reads 0, with no error page. **Source:** Code: `app/team/page.tsx`.
- [ ] **TC-15** `D` **Do:** Choose Host "Lucas Ferreira" and press Filter. **Expect:** "No calls match these filters." (he hosts no call). **Source:** Seed: `seed/meetings.ts`; Code: `app/team/page.tsx`.
- [ ] **TC-16** `D` **Do:** Choose "All hosts" and "All roles" and press Filter. **Expect:** all eight cards return. **Source:** Code: `app/team/page.tsx`.
- [ ] **TC-17** `D` **Do:** At 1280 px, look at the layout. **Expect:** the stats, members table and calls on the left and the Ask Fathom panel on the right. **Source:** Code: `app/team/page.tsx`.
- [ ] **TC-18** `D` **Do:** At 390 px, look at the layout and run `document.documentElement.scrollWidth <= window.innerWidth` in the Console. **Expect:** the three stats stack, the members table scrolls sideways inside its own box, the filter controls wrap, and the Console prints `true`. **Source:** Code: `components/TeamTable.tsx` (`overflow-x-auto`), `app/team/page.tsx`; T18 S3 (no horizontal page scroll).
- [ ] **TC-19** `D` **Do:** Open `/team` and list the `h1` elements. **Expect:** exactly one, reading "Team Calls". **Changed in the UI pass:** the page had no `h1`. **Source:** L10.5; Code: `app/team/page.tsx`.

## 6. Player and playback (PP), Task 20

Open `/meetings/q4-planning` signed out. The player is simulated: a clock over the transcript, no media.

- [ ] **PP-01** `D` **Do:** Look at the player before pressing anything. **Expect:** the stage text "Press play to start the recording.", the clock "0:00 / " followed by a total of about an hour in `h:mm:ss` form, a "Play" button and a "1x" speed button. **Source:** Code: `components/meeting/Player.tsx`; T11 S4 (about 60 to 64 minutes); Seed: `seed/check.ts` (within 5% of 62 minutes, so 58:54 to 1:05:06).
- [ ] **PP-02** `D` **Do:** Click Play. **Expect:** the button reads "Pause", the clock counts up (0:01, 0:02, ...), and the stage shows a circle with the speaker's initials, "Name · Role" and the current line of text. **Source:** T21 S5; Code: `components/meeting/Player.tsx`.
- [ ] **PP-03** `D` **Do:** With a stopwatch, let playback run at 1x for 10 seconds. **Expect:** the clock advances by about 10 seconds. **Source:** Spec 7 (a `requestAnimationFrame` clock); Code: `lib/playback.ts`.
- [ ] **PP-04** `D` **Do:** Click the speed button three times. **Expect:** the label goes 1x, 1.5x, 2x, then back to 1x. **Source:** Code: `components/meeting/Player.tsx` (`SPEEDS`); Spec 7.
- [ ] **PP-05** `D` **Do:** Set 2x and run for 10 seconds by stopwatch. **Expect:** the clock advances by about 20 seconds and the stage and playhead move without stuttering. **Source:** T21 S5 ("at 2x it stays smooth").
- [ ] **PP-06** `D` **Do:** At about 0:30 press "+10s", then "-10s". **Expect:** the clock moves forward 10 seconds, then back 10 seconds. Repeat while playing. **Source:** Spec 7 (+-10s skip); Code: `lib/playback.ts`.
- [ ] **PP-07** `D` **Do:** Press "-10s" within the first 10 seconds, then seek near the end and press "+10s" more than once. **Expect:** the clock stops at 0:00 and at the total, never going negative or past the end. **Source:** Code: `lib/playback.ts` (`clamp`).
- [ ] **PP-08** `D` **Do:** Press Pause, wait 5 seconds, then press Play. **Expect:** the clock freezes while paused and resumes from the same value. **Source:** Code: `lib/playback.ts`.
- [ ] **PP-09** `D` **Do:** Click the middle of the scrubber track. **Expect:** the clock jumps to about half the total. **Source:** T21 S5 ("scrub"); Code: `components/meeting/Scrubber.tsx`.
- [ ] **PP-10** `D` **Do:** Press the mouse on the scrubber and drag left and right. **Expect:** the clock and playhead follow the pointer continuously, and stay where you release. **Source:** Code: `components/meeting/Scrubber.tsx` (pointer move while the button is held).
- [ ] **PP-11** `D` **Do:** Click the far left and the far right of the scrubber track. **Expect:** the clock reads 0:00 and the total respectively. **Source:** Code: `lib/playback.ts` (`msFromX` clamps to the track).
- [ ] **PP-12** `D` **Do:** Count the lane rows under the markers in the scrubber. **Expect:** eight rows, one per participant, each with coloured blocks where that person speaks and each a different colour. **Source:** Spec 7 (per-speaker lanes); Code: `components/meeting/Scrubber.tsx`.
- [ ] **PP-13** `D` **Do:** Count the thin vertical lines across the lanes, then hover one. **Expect:** between 6 and 8 chapter lines, equal to the number of entries in the Chapters tab, and a tooltip with the chapter title. **Source:** T11 S4 (6 to 8 chapters); Spec 7; Code: `components/meeting/Scrubber.tsx`.
- [ ] **PP-14** `D` **Do:** Count the small coloured bars above the lanes, then hover one. **Expect:** as many bars as the number in the "Highlights (N)" tab label (3 to 6), each in its highlight type's colour, with a tooltip of the highlight title. **Source:** Spec 7 and 8; Code: `components/meeting/Scrubber.tsx`.
- [ ] **PP-15** `D` **Do:** Click the scrubber at about 25%, then compare the white playhead line with the clock. **Expect:** the line sits at about a quarter of the track width and moves right as the clock advances. **Source:** Code: `components/meeting/Scrubber.tsx`.
- [ ] **PP-16** `D` **Do:** Open the Chapters tab, click the third chapter, and read the small text at the top left of the stage. **Expect:** it shows the third chapter's title, and changes when playback crosses the next chapter start. **Source:** Code: `components/meeting/Player.tsx`, `components/meeting/ChaptersTab.tsx`.
- [ ] **PP-17** `D` **Do:** Seek to within 5 seconds of the end and press Play, then let it finish. **Expect:** playback stops at the total, the button returns to "Play", and pressing Play again restarts from 0:00. **Source:** Code: `lib/playback.ts` (`tick`, `play`).
- [ ] **PP-18** `D` **Do:** While playing, click the Highlights, Chapters and Action items tabs in turn. **Expect:** the clock keeps running and is not reset by switching tabs. **Source:** Code: `components/meeting/MeetingView.tsx` (one store per page).
- [ ] **PP-19** `D` **Do:** Click the scrubber handle to focus it, then press Home, End, PageUp, PageDown and the Left and Right arrows. **Expect:** Home goes to 0:00, End to the end, PageUp moves forward 30 seconds, PageDown back 30 seconds, and the arrows move 5 seconds; Alt+Left still goes back in the browser instead of seeking. **Changed in the UI pass:** only the arrows worked. The 30 second page step is the agent's choice, not from the plan; mark Fail if you want another value. **Source:** L10.5; Code: `components/meeting/Scrubber.tsx`, `lib/slider.ts`.

## 7. Transcript and meeting page (TR), Task 21

Open `/meetings/q4-planning` signed out, the 8-person call of about an hour.

- [ ] **TR-01** `D` **Do:** Read the page header. **Expect:** a "← My Calls" link, the title "Q4 Product Planning", and the line "Oct 1, 2026, 3:00 PM UTC · Priya Raman · 8 participants". **Source:** Code: `components/meeting/MeetingView.tsx`; Seed: `seed/meetings.ts` (Oct 1, 15:00 UTC, host Priya, 8 internal participants).
- [ ] **TR-02** `D` **Do:** Look at the "Speakers" cards under the header. **Expect:** eight cards, largest talk share first, each with name, role, a bar and "N% talk · N questions · longest m:ss". **Source:** T21 S5 (speaker strip shows 8 people); Code: `components/meeting/SpeakerStrip.tsx`, `lib/queries.ts` (ordered by talk time).
- [ ] **TR-03** `D` **Do:** Add up the eight talk percentages. **Expect:** a total between 96 and 104 (rounding only). **Source:** Code: `components/meeting/SpeakerStrip.tsx` (shares are of the summed talk time).
- [ ] **TR-04** `D` **Do:** Read the lowest talk percentage. **Expect:** every one of the eight is at least 3%. **Source:** L9.2 (`seed:check` requires at least 3% per cast member); Seed: `seed/check.ts`.
- [ ] **TR-05** `D` **Do:** Look at a few transcript rows near the top. **Expect:** each row has an `m:ss` time, a coloured speaker name and the line text, and the first row is at about 0:01. **Source:** Code: `components/meeting/Transcript.tsx`; Seed: `seed/stamp.ts` (the cursor starts at 1000 ms).
- [ ] **TR-06** `D` **Do:** Scroll the whole transcript by dragging its scrollbar to the bottom. **Expect:** all rows render (about a thousand), the page stays responsive, and the last row's time is close to the total. **Source:** T21 S5.
- [ ] **TR-07** `D` **Do:** Pick one person and compare their colour in the speaker card bar, the transcript name, the scrubber lane and the stage ring while they speak. **Expect:** the same colour in all four places. **Source:** Code: `SpeakerStrip.tsx`, `Transcript.tsx`, `Scrubber.tsx`, `Player.tsx` (all use `laneColor(index)` on the same participants order).
- [ ] **TR-08** `D` **Do:** Press Play and watch the transcript for 20 seconds. **Expect:** the row being spoken is shaded, and the transcript scrolls to keep it in view (the code places it about a third of the way down the box). **Source:** T21 S5; Code: `components/meeting/Transcript.tsx`.
- [ ] **TR-09** `D` **Do:** While playing, scroll the transcript up with the mouse wheel. **Expect:** it stops following, and a "Jump to live" button appears at the bottom right of the transcript box. **Source:** T21 S5.
- [ ] **TR-10** `D` **Do:** Click "Jump to live". **Expect:** the transcript scrolls back to the active row, the button disappears, and following resumes. **Source:** T21 S5.
- [ ] **TR-11** `D` **Do:** While playing, drag the transcript's scrollbar thumb up, or click in the box and press Page Up. **Expect:** the same as TR-09: "Jump to live" appears. **Source:** Spec 7 ("jump to live" after manual scroll). The code only reacts to the wheel and touch, so this may fail (open question 5).
- [ ] **TR-12** `D` **Do:** Pause, then click a transcript row. **Expect:** the clock changes to that row's time, the row becomes the shaded one, and playback stays paused. **Source:** T21 S5; Code: `components/meeting/Transcript.tsx` (seek only).
- [ ] **TR-13** `D` **Do:** Type "budget" into "Search this transcript". **Expect:** only rows containing the word remain (any letter case), with each occurrence marked, and the number of rows drops sharply. **Source:** T21 S5.
- [ ] **TR-14** `D` **Do:** With the search still filled, press Play and scroll with the wheel. **Expect:** no auto-following and no "Jump to live" button while a search or speaker filter is active. **Source:** Code: `components/meeting/Transcript.tsx` (`filtering`).
- [ ] **TR-15** `D` **Do:** Clear the search box. **Expect:** all rows return and, while playing, following resumes. **Source:** Code: `components/meeting/Transcript.tsx`.
- [ ] **TR-16** `D` **Do:** Type `zzzzqq` into the transcript search. **Expect:** the text "No lines match." **Source:** Code: `components/meeting/Transcript.tsx`.
- [ ] **TR-17** `D` **Do:** Open "Filter by speaker". **Expect:** "All speakers" plus the eight names; choosing one name leaves only that person's rows. **Source:** T21 S5; Code: `components/meeting/Transcript.tsx`.
- [ ] **TR-18** `D` **Do:** Choose a speaker and also type a word in the search box. **Expect:** only that speaker's rows that contain the word remain. **Source:** Code: `components/meeting/Transcript.tsx`.
- [ ] **TR-19** `D` **Do:** Open `/meetings/q4-planning?t=600000`. **Expect:** the clock reads "10:00 / " and the total, and playback is paused. **Source:** T21 S5.
- [ ] **TR-20** `D` **Do:** Open `?t=abc`, `?t=-5`, `?t=0x10` and `?t=` on the same meeting. **Expect:** each starts at 0:00 with no error page. **Source:** T21 S5; RF1; L9.2 (`0x10` handled); Code: `lib/format.ts` (`parseTimeParam` accepts digits only).
- [ ] **TR-21** `D` **Do:** Open `?t=999999999`. **Expect:** the clock reads the total over the total, the button says "Play", and pressing Play starts again from 0:00. **Source:** T21 S5; RF1; Code: `lib/playback.ts`.
- [ ] **TR-22** `D` **Do:** Read the right-hand tab list. **Expect:** Summary, Action items, Chapters, "Highlights (N)", Ask, in that order, with Summary selected. **Source:** Code: `components/meeting/MeetingView.tsx`, `components/meeting/Tabs.tsx`; Spec 7.
- [ ] **TR-23** `D` **Do:** Open the Chapters tab. **Expect:** a numbered list of `m:ss` and title (6 to 8 entries), and the first entry's time equals the time of the first transcript row. **Source:** T11 S4; Spec 6 (chapter start is the first segment); Seed: `seed/check.ts` (first chapter starts at line 0).
- [ ] **TR-24** `D` **Do:** Pause, then click a chapter in the list. **Expect:** the clock changes to the chapter's time and playback stays paused. **Source:** Code: `components/meeting/ChaptersTab.tsx`.
- [ ] **TR-25** `D` **Do:** At 1280 px, scroll down the page. **Expect:** two columns: the player, highlight panel and transcript on the left, and a 380 px tab panel on the right that stays in view while you scroll. **Source:** Code: `components/meeting/MeetingView.tsx` (`lg:grid-cols`, `lg:sticky`).
- [ ] **TR-26** `D` **Do:** At 390 px, scroll from top to bottom and run `document.documentElement.scrollWidth <= window.innerWidth` in the Console. **Expect:** one column in the order header, speaker cards, player, highlight panel, transcript, tab panel, and the Console prints `true`. **Source:** T21 S5; Spec 7 (mobile: player on top, tabs below); Code: `components/meeting/MeetingView.tsx` (open question 4).

## 8. Summary templates and action items (SA), Task 22

On `/meetings/q4-planning`, Summary tab, signed out. Template headings come from `TEMPLATE_GUIDE` in `lib/prompts.ts`; a summary may omit a heading but never adds one.

- [ ] **SA-01** `D` **Do:** Read the template pills. **Expect:** "General", "Sales", "Standup", "Project review" in that order, with General selected (cyan border). **Source:** T22 S4; Code: `components/meeting/SummaryTab.tsx`.
- [ ] **SA-02** `D` **Do:** Look beside the Copy button. **Expect:** a chip reading "Pre-generated". **Source:** Code: `components/meeting/SummaryTab.tsx`.
- [ ] **SA-03** `D` **Do:** Read the General headings. **Expect:** only headings from Overview, Key points, Decisions, Open questions, and at least one of them. **Source:** Code: `lib/prompts.ts` (`TEMPLATE_GUIDE`), `lib/schema.ts` (`summaryFor`).
- [ ] **SA-04** `D` **Do:** Click "Sales" and read the headings. **Expect:** only Pain points, Current solution, Budget and timeline, Objections, Next steps (at least one). **Source:** same as SA-03.
- [ ] **SA-05** `D` **Do:** Click "Standup" and read the headings. **Expect:** only Yesterday, Today, Blockers (at least one). **Source:** same as SA-03.
- [ ] **SA-06** `D` **Do:** Click "Project review" and read the headings. **Expect:** only Goals, Progress, Risks, Decisions, Next steps (at least one). **Source:** same as SA-03.
- [ ] **SA-07** `D` **Do:** Clear the Network tab, then click through the four pills. **Expect:** the content changes each time and no new network request appears. **Source:** T22 S4; Spec 7 (the switcher makes no network call).
- [ ] **SA-08** `D` **Do:** On the General summary click "Copy". **Expect:** a toast "Summary copied" appears at the bottom centre and disappears after about 3.5 seconds. **Source:** T22 S4; Code: `components/Toaster.tsx`.
- [ ] **SA-09** `D` **Do:** Paste the clipboard into a text editor. **Expect:** it starts with `# Q4 Product Planning`, then `_General summary_`, a blank line, then `## <heading>` lines each followed by `- ` bullets matching the screen. **Source:** Code: `lib/markdown.ts`.
- [ ] **SA-10** `D` **Do:** Select "Project review", click Copy and paste. **Expect:** the second line reads `_Project review summary_`. **Source:** Code: `lib/markdown.ts`, `lib/schema.ts` (`TEMPLATE_LABELS`).
- [ ] **SA-11** `D` **Do:** Open the "Action items" tab. **Expect:** one or more items (the generation prompt asks for 3 to 8), each with the task sentence, the owner in bold, a "Due YYYY-MM-DD" chip when a date is set, and an underlined "Jump to m:ss" button. **Source:** T22 S4; Code: `components/meeting/ActionItemsTab.tsx`; `lib/prompts.ts`.
- [ ] **SA-12** `D` **Do:** Read every "Due" chip. **Expect:** each reads as a date such as "Oct 2, 2026" (UTC), never words such as "tomorrow" or "next week" and never a raw `YYYY-MM-DD` string; in DevTools the chip is a `<time>` element whose `datetime` attribute is the ISO date. **Changed in the UI pass:** the chip used to print the raw ISO string; the copied Markdown (SA copy items) still uses ISO. **Source:** T22 S4 ("real ISO dates"); L9.2 (`seed:check` fails on an unresolved due phrase); L10.5; Code: `lib/format.ts` (`formatDue`), `components/meeting/ActionItemsTab.tsx`.
- [ ] **SA-13** `D` **Do:** Compare each due date with the meeting date (2026-10-01). **Expect:** none is before the meeting date. **Source:** Spec 6 step 4 (relative due dates resolved against the meeting date).
- [ ] **SA-14** `D` **Do:** Read the "Jump to" times from top to bottom. **Expect:** they never decrease. **Source:** Code: `lib/queries.ts` (ordered by `start_ms`).
- [ ] **SA-15** `D` **Do:** Click "Jump to m:ss" on one item. **Expect:** the clock shows that time, and playback state does not change (it does not start by itself). **Source:** T22 S4; Code: `components/meeting/ActionItemsTab.tsx`.
- [ ] **SA-16** `D` **Do:** After jumping, read the transcript line at that time. **Expect:** it is where the task was committed to or discussed (a judgement call; the anchor is meant to be the commitment). **Source:** Spec 4 (`start_ms` is the transcript anchor); Code: `lib/prompts.ts` (`actionItemsPrompt`).
- [ ] **SA-17** `D` **Do:** Compare each owner with the names in the speaker cards. **Expect:** every owner is one of the meeting's participants. **Source:** Code: `lib/schema.ts` (`actionItemsSchema` owner check).
- [ ] **SA-18** `D` **Do:** In the Action items tab click "Copy", then paste. **Expect:** a toast "Action items copied", and one line per item in the form `- [ ] Owner: task (due YYYY-MM-DD)` (no due part when there is no date). **Source:** Spec 7 (Copy as markdown); Code: `lib/markdown.ts`.

## 9. Highlights (HL), Task 23

Signed out unless tagged `G`. Highlight types and colours: Action item (grey-white), Insight (cyan), Positive (green), Feedback (amber), Objection (red), Tech question (violet).

- [ ] **HL-01** `D` **Do:** Look at the "Highlight this moment" block above the transcript. **Expect:** six buttons in this order: Action item, Insight, Positive, Feedback, Objection, Tech question, each with a count chip and a coloured border, a note field "Add note (optional)", and the hint "Sign in to save highlights". **Source:** Spec 7; Code: `components/meeting/HighlightPanel.tsx`.
- [ ] **HL-02** `D` **Do:** Add up the six count chips and read the "Highlights (N)" tab label. **Expect:** the sum equals N, and N is between 3 and 6. **Source:** Spec 8 (3 to 6 seeded highlights).
- [ ] **HL-03** `D` **Do:** Open the Highlights tab. **Expect:** each seeded highlight shows a type chip with its colour dot, a `m:ss-m:ss` range, a title, an excerpt, a "Demo" label, and buttons "Jump" and "Share clip", with no "Delete". **Source:** T23 S6 ("labelled Demo"); Code: `components/meeting/HighlightsTab.tsx`.
- [ ] **HL-04** `D` **Do:** Read every highlight's range. **Expect:** no range is longer than 5:00. **Source:** Spec 6 and 8 (window at most 5 minutes); Seed: `seed/check.ts`.
- [ ] **HL-05** `D` **Do:** Click "Jump" on one highlight. **Expect:** the clock shows that highlight's start time. **Source:** Code: `components/meeting/HighlightsTab.tsx`.
- [ ] **HL-06** `D` **Do:** Look at the scrubber's top row. **Expect:** one small bar per highlight at its start position, in that type's colour. **Source:** T23 S6 ("colored markers on the scrubber").
- [ ] **HL-07** `D` **Do:** Scroll the transcript to a highlight's time. **Expect:** the rows inside the highlight window have a thick left border in the highlight's colour. **Source:** T23 S6; Code: `components/meeting/Transcript.tsx`.
- [ ] **HL-08** `D` **Do:** For one seeded highlight, find the transcript row at its start time and the row before it. **Expect:** the start row is the first row of that speaker's turn, so the row before it is another speaker (or the same speaker after a pause of 3 seconds or more). **Source:** Spec 8 (speaker run, gaps under 3 s merged); Spec 6 step 8 (seeded windows use the same function).
- [ ] **HL-09** `D` **Do:** Play to about 0:05 and click "Insight". **Expect:** a dialog titled "Sign in to continue" with "Sign in with Google to save highlights. You will come back to this moment.", and buttons "Not now" and "Sign in with Google". No count changes. **Source:** T23 S6; Code: `components/meeting/MeetingView.tsx`, `components/SignInDialog.tsx`.
- [ ] **HL-10** `D` **Do:** Close the dialog, then with focus on the page (not in a field) press the `H` key during playback. **Expect:** the same dialog opens. **Source:** T23 S6; Spec 8 (`H` for Insight).
- [ ] **HL-11** `D` **Do:** Press "Not now", then reopen the dialog and press Escape. **Expect:** both close the dialog and leave the page unchanged. **Source:** Code: `components/SignInDialog.tsx`.
- [ ] **HL-12** `D` **Do:** Reload at `/meetings/q4-planning` (clock at 0:00) and click each of the six type buttons. **Expect:** nothing happens: no dialog, no error, no network request. **Source:** T23 S6; RF5; Code: `lib/highlight.ts` (returns null before the first line starts at 0:01).
- [ ] **HL-13** `D` **Do:** Seek to about 1:00 (click the scrubber), click in "Search this transcript" and type the letter `h`, then click in "Add note (optional)" and type `h`. **Expect:** no dialog opens either time. **Source:** T23 S6; Code: `components/meeting/MeetingView.tsx` (keys in inputs ignored).
- [ ] **HL-14** `D` `G` **Do:** Signed in, press Play, wait a few seconds, then press `H`. **Expect:** a new marker appears on the scrubber at once, the Insight chip goes up by one, and the tab label's N goes up by one. **Source:** T23 S6.
- [ ] **HL-15** `D` `G` **Do:** Open the Highlights tab and read the new highlight. **Expect:** its start equals the time of the transcript row where the current speaker began, its end is the end of that speaker's turn (at most 5 minutes), the title is the first 8 words of that turn followed by an ellipsis when longer, and it has a "Delete" button and no "Demo" label. **Source:** T23 S6; Spec 8; Code: `lib/highlight.ts`, `components/meeting/HighlightsTab.tsx`.
- [ ] **HL-16** `D` `G` **Do:** Reload the page. **Expect:** the highlight is still there. **Source:** T23 S6.
- [ ] **HL-17** `D` `G` **Do:** Type "Check pricing slide" in the note field and click "Objection". **Expect:** a new highlight titled "Check pricing slide", the Objection chip goes up by one, and the note field empties. **Source:** T23 S6; Code: `components/meeting/HighlightPanel.tsx`.
- [ ] **HL-18** `D` `G` **Do:** Click each of Action item, Positive, Feedback and Tech question once. **Expect:** each count chip goes up by one and a marker in that type's colour appears. **Source:** Spec 7.
- [ ] **HL-19** `D` `G` **Do:** Open the Action items tab. **Expect:** a section "Your action-item highlights" listing your Action item highlight as its title and `(m:ss)`; clicking it moves the clock there. **Source:** Spec 7; Code: `components/meeting/ActionItemsTab.tsx`.
- [ ] **HL-20** `D` `G` **Do:** Type a note of 120 characters and click a type button. **Expect:** the saved title is the first 80 characters of the note. **Source:** Code: `lib/highlight.ts` (`slice(0, 80)`); L9.2 (title limit 80).
- [ ] **HL-21** `D` `G` **Do:** Click "Delete" on one of your highlights. **Expect:** its marker, chip count and tab count drop at once, and it stays gone after a reload. **Source:** T23 S6.
- [ ] **HL-22** `D` `G` **Do:** Open the same meeting in a private window (signed out). **Expect:** your highlights are not visible; only the seeded "Demo" ones. **Source:** T23 S6; Spec 5 (own highlights only).
- [ ] **HL-23** `D` `G` **Do:** Click "Sign out" in the header on the meeting page. **Expect:** your own highlights disappear from the page and the "Demo" ones remain. **Source:** L9.2 (the page remounts on sign-out); Spec 5.
- [ ] **HL-24** `D` `G` **Do:** At 0:00 click a type button while signed in, with the Network tab open. **Expect:** no highlight appears and no request is sent. **Source:** RF5.

## 10. Share and clip page (SH), Task 24

Signed out unless tagged `G`. The clips `demo-q4-clip` and `demo-q4-clip-2` come from `npm run seed:clips` (the first two seeded highlights of Q4 Product Planning).

- [ ] **SH-01** `D` **Do:** On `/meetings/q4-planning` find the controls row under the scrubber. **Expect:** a "Share moment" button at the right end of the row. **Source:** Code: `components/meeting/MeetingView.tsx`.
- [ ] **SH-02** `D` **Do:** Click "Share moment". **Expect:** the "Sign in to continue" dialog with "Sign in with Google to share clips.". **Source:** T24 S7; Code: `components/meeting/MeetingView.tsx`.
- [ ] **SH-03** `D` **Do:** Open the Highlights tab and click "Share clip" on a Demo highlight. **Expect:** the same dialog. **Source:** Code: `components/meeting/MeetingView.tsx` (`shareWindow`).
- [ ] **SH-04** `D` **Do:** Drag across the text of two or three transcript rows. **Expect:** a "Share selection" button appears beside the speaker filter and no seek happens on release. **Source:** T24 S7; Code: `components/meeting/Transcript.tsx`.
- [ ] **SH-05** `D` **Do:** Click "Share selection" while signed out. **Expect:** the same sign-in dialog. **Source:** Code: `components/meeting/MeetingView.tsx`.
- [ ] **SH-06** `D` **Do:** In a private window open `/clip/demo-q4-clip`. **Expect:** the page loads with no sign-in, the label "Shared clip", the clip title as the heading, a player, a transcript box, a "View the full meeting" link and a "Sign in with Google to make your own clips" button. **Source:** T24 S7; `e2e/smoke.spec.ts`; Code: `components/meeting/ClipView.tsx`.
- [ ] **SH-07** `D` **Do:** Read the clip clock and compare it with the first seeded highlight's range on the full meeting (Highlights tab, earliest one). **Expect:** the clip total equals that range's length (within 1 second of rounding), and the clock starts at 0:00. **Source:** Seed: `scripts/seed-clips.ts`; Code: `components/meeting/ClipView.tsx`.
- [ ] **SH-08** `D` **Do:** Read the clip's transcript rows. **Expect:** only a handful of lines, the first at 0:00, and every time below the clip total (times are relative to the clip start, not the meeting). **Source:** T24 S7 ("only the window's transcript"); Code: `components/meeting/ClipView.tsx`.
- [ ] **SH-09** `D` **Do:** Press Play on the clip, set 2x, and let it reach the end. **Expect:** it restarts from 0:00 and keeps playing. **Source:** T24 S7 ("it loops at the end"); Code: `components/meeting/ClipView.tsx`.
- [ ] **SH-10** `D` **Do:** View the clip page source (Ctrl+U) and search for `og:title`. **Expect:** one `og:title` meta tag whose content is the clip's meeting title; also an `og:description` with the first line of the clip, and an `og:image` tag. **Source:** T24 S7; `e2e/smoke.spec.ts`; Code: `app/clip/[slug]/page.tsx`.
- [ ] **SH-11** `D` **Do:** In the page source search for `robots`. **Expect:** a robots meta tag with `noindex`. **Source:** L9.2 (clip pages are `noindex`); Code: `app/clip/[slug]/page.tsx`.
- [ ] **SH-12** `D` **Do:** Read the browser tab title on the clip page. **Expect:** "<meeting title>: clip". **Source:** Code: `app/clip/[slug]/page.tsx`.
- [ ] **SH-13** `D` **Do:** Open `/clip/demo-q4-clip/opengraph-image`. **Expect:** a 1200 by 630 PNG on a dark background with "Fathom Rebuild · Shared clip", the first line of the clip in curly quotes, and the meeting title in cyan. **Source:** T24 S7; Code: `app/clip/[slug]/opengraph-image.tsx`.
- [ ] **SH-14** `D` **Do:** In the clip page source search for `created_by`. **Expect:** no match. **Source:** T24 S7; Spec 5 (`get_clip` never returns the sharer's identity).
- [ ] **SH-15** `D` **Do:** Pick a word from a meeting line well outside the clip window (for example from the first minute of Q4 Product Planning) and search the clip page source for it. **Expect:** no match, because the page holds only the clip window. **Source:** T24 S7; Spec 5. Clips are a convenience link, not a privacy boundary (L9.1).
- [ ] **SH-16** `D` **Do:** Click "View the full meeting". **Expect:** `/meetings/q4-planning?t=<clip start>` opens and the clock shows the clip's start time. **Source:** Code: `components/meeting/ClipView.tsx`.
- [ ] **SH-17** `D` `G` **Do:** Signed in, press Play, then click "Share moment" during a speaker's turn. **Expect:** a toast "Clip link copied", and under the Highlights tab a "Your shared clips" list with a `/clip/<10 characters>` link and a "Delete" button. **Source:** T24 S7; Code: `components/meeting/MeetingView.tsx`, `lib/slug.ts`.
- [ ] **SH-18** `D` `G` **Do:** Paste the copied link into the address bar. **Expect:** `http://localhost:3000/clip/` plus a 10-character slug of lower-case letters and digits, and the clip covers that speaker's whole turn. **Source:** Code: `lib/slug.ts`, `components/meeting/MeetingView.tsx` (`expandToRun`).
- [ ] **SH-19** `D` `G` **Do:** Open that link in a private window. **Expect:** the clip loads with no sign-in. **Source:** T24 S7.
- [ ] **SH-20** `D` `G` **Do:** On a highlight click "Share clip". **Expect:** a toast "Clip link copied", a new entry under "Your shared clips", and a clip as long as the highlight's range. **Source:** T24 S7.
- [ ] **SH-21** `D` `G` **Do:** Select a few transcript lines and click "Share selection". **Expect:** a toast "Clip link copied"; the clip runs from the first selected row's start to the last selected row's end. **Source:** T24 S7.
- [ ] **SH-22** `D` `G` **Do:** Click in a row near the start of the transcript, then Shift+click in a row more than 6 minutes later, and click "Share selection". Open the new link. **Expect:** the clip total is 5:00 or less. **Source:** RF4; Spec 8 (capped at 5 minutes); Code: `lib/share.ts`.
- [ ] **SH-23** `D` `G` **Do:** Click "Delete" next to one of your clip links, then open that link. **Expect:** the entry disappears and the link now shows the friendly 404. **Source:** T24 S7.
- [ ] **SH-24** `D` `G` **Do:** Optional and tedious: create clips until you have 20 in 24 hours, then try one more. **Expect:** a toast "Daily clip limit reached (20)". **Source:** Spec 8 (20 shares per user per day); Code: `app/meetings/[id]/actions.ts`, `components/meeting/MeetingView.tsx`.

## 11. Global search (GS), Task 25

Signed out. The search runs over every transcript, with English stemming and web-style operators (`"phrase"`, `or`, `-word`).

- [ ] **GS-01** **Do:** Open `/search`. **Expect:** the heading "Search call recordings", the text "Search every transcript. Try:" and five chips: budget, deadline, customer, rollback, onboarding. **Source:** T25 S4; Code: `app/search/page.tsx`.
- [ ] **GS-02** `D` **Do:** Click the "budget" chip. **Expect:** the URL becomes `/search?q=budget` and the heading reads "Results for “budget”". **Source:** Code: `app/search/page.tsx`.
- [ ] **GS-03** `D` **Do:** On `/meetings` type `budget` in the header box and press Enter. **Expect:** the same results page. **Source:** T25 S4; `e2e/smoke.spec.ts`.
- [ ] **GS-04** `D` **Do:** Read the results. **Expect:** results grouped under a meeting title heading, each result a card with "Speaker · m:ss" and a snippet in which the matched words are highlighted. **Source:** T25 S4; Code: `app/search/page.tsx`.
- [ ] **GS-05** `D` **Do:** Click a result. **Expect:** `/meetings/<slug>?t=<ms>` opens and the clock equals the `m:ss` on the card. **Source:** T25 S4.
- [ ] **GS-06** `D` **Do:** Search for `shadow`. **Expect:** matches in Engineering Standup, a call Priya does not host. **Source:** Spec 1 (cross-meeting search); Code: `app/search/page.tsx` (no scope); Seed: `seed/generated/eng-standup/transcript.json` (the word appears in several lines).
- [ ] **GS-07** `D` **Do:** Search for `deployments`. **Expect:** matches whose text says "deployment" (the match is stemmed). **Source:** Seed: `supabase/migrations/20261006000000_hardening.sql` (`websearch_to_tsquery('english', ...)`); the standup transcript uses "deployment".
- [ ] **GS-08** `D` **Do:** Search for `"shadow deployment"` with the quotes. **Expect:** only lines where the two words sit next to each other. **Source:** same function as GS-07 (quoted phrases).
- [ ] **GS-09** **Do:** Open `/search?q=!!!`. **Expect:** "No matches. Try fewer or different words, or one of: budget, deadline, customer, rollback, onboarding." and no error. **Source:** T25 S4; RF3.
- [ ] **GS-10** **Do:** Open `/search?q=%22` (a single double quote). **Expect:** the same "No matches" text and no error. **Source:** T25 S4; RF3.
- [ ] **GS-11** **Do:** Open `/search?q=` followed by 500 letter `x` characters. **Expect:** "No matches" and no error, with the heading showing a 200-character query. **Source:** T25 S4; RF3; Code: `lib/snippet.ts` (`normalizeQuery` caps at 200).
- [ ] **GS-12** **Do:** Paste 300 characters into the header search box. **Expect:** it stops accepting at 200. **Source:** Code: `components/SearchBar.tsx` (`maxLength`).
- [ ] **GS-13** **Do:** Open `/search?q=%20%20%20`. **Expect:** treated as empty: the suggestions page of GS-01. **Source:** Code: `lib/snippet.ts`, `app/search/page.tsx`.
- [ ] **GS-14** **Do:** Open `/search?q=%3Cb%3Ex%3C%2Fb%3E`. **Expect:** the heading shows the literal text `<b>x</b>` (not bold) and the page shows no error. **Source:** L9.1 (no HTML interpretation); RF3.

## 12. Ask Fathom (AF), Task 26

Items about the extractive fallback are tagged `NK` and need no key. Items tagged `K` need a server key.

- [ ] **AF-01** `D` **Do:** Open `/meetings`. **Expect:** an "Ask Fathom" panel with a "Hide" button, the hint "Ask anything about my calls.", three chips ("Next steps on projects?", "Summarize my recent meetings", "Surprise me with an insight"), an input "Ask anything…", a scope select showing "My Calls", and an "Ask" button that is disabled while the input is empty. **Source:** T26 S6; Code: `components/AskPanel.tsx`, `lib/prompts.ts` (`ASK_PROMPTS_BY_SCOPE`).
- [ ] **AF-02** `D` **Do:** Click "Summarize my recent meetings". **Expect:** your question appears, then an answer appears at once (no model wait) with one or more citation links written `m:ss · label`. **Source:** T26 S6 ("appears instantly").
- [ ] **AF-03** `D` **Do:** In the Network tab open the `/api/ask` response for AF-02. **Expect:** JSON with `"mode":"suggested"` and no `notice`. **Source:** Code: `lib/ask.ts`.
- [ ] **AF-04** `D` **Do:** Click a citation. **Expect:** `/meetings/<slug>?t=<ms>` opens with the clock at that time. **Source:** T26 S6.
- [ ] **AF-05** `D` **Do:** Hover the citation links of the My Calls answer. **Expect:** every link points to one of `q4-planning`, `priya-mei-1on1`, `weekly-product-sync` or `mobile-design-review`. **Source:** L9.2 (my_calls answers use the persona's meetings only).
- [ ] **AF-06** `D` **Do:** Click the other two chips. **Expect:** each returns an answer with at least one citation. **Source:** Code: `lib/schema.ts` (`askFileSchema`, at least one citation).
- [ ] **AF-07** `D` **Do:** Click "Hide". **Expect:** the panel collapses to a small "Ask Fathom" button; clicking that brings the panel back. **Source:** T26 S6.
- [ ] **AF-08** `D` **Do:** Ask something, click "Hide", then reopen. **Expect:** the earlier messages are still shown. **Source:** Spec 7 (conversation in component state); Code: `components/AskPanel.tsx`.
- [ ] **AF-09** `D` **Do:** After asking something, click Team Calls in the header then My Calls. **Expect:** the panel is empty again (the hint is back). **Source:** Spec 7 (component state only).
- [ ] **AF-10** `D` **Do:** Change the scope select to "Team Calls", then back. **Expect:** the chips disappear for Team Calls and return for My Calls. **Source:** Code: `components/AskPanel.tsx` (chips show only for the page's default scope).
- [ ] **AF-11** `D` `NK` **Do:** With no key, type `what did we decide about pricing?` and press Ask. **Expect:** the answer line `Closest moments for “what did we decide about pricing?”:` with up to five citation links and an italic notice "Live answers are unavailable. Showing the closest moments instead."; if nothing matches, "No matching moments found in these calls." with the same notice. **Source:** T26 S6; Code: `lib/ask.ts`.
- [ ] **AF-12** `D` `NK` **Do:** Read one extractive citation. **Expect:** `m:ss · <Meeting title>: <Speaker>, <snippet>`. **Source:** Code: `lib/ask.ts` (`extractive`).
- [ ] **AF-13** `D` `NK` **Do:** After an answer, click the input and ask a second question. **Expect:** the input is empty and usable, the second answer is added below the first, and "Ask" is disabled while "Thinking…" shows. **Source:** Spec 2 ("the input is never dead"); Code: `components/AskPanel.tsx`.
- [ ] **AF-14** `D` `NK` **Do:** Type `summarize my recent meetings` in lower case and press Ask. **Expect:** the seeded answer (no notice), because prompts match without regard to case. **Source:** Code: `lib/ask-db.ts` (`normalize`).
- [ ] **AF-15** `D` `NK` **Do:** With scope "My Calls" ask `shadow`. **Expect:** no citation link points to `eng-standup`. **Source:** L9.2 (scope restriction); Code: `lib/ask-db.ts` (`scopeFilter`).
- [ ] **AF-16** `D` `NK` **Do:** With scope "Team Calls" ask `shadow`. **Expect:** at least one citation link points to `/meetings/eng-standup?t=`. If other generated meetings also use the word and crowd it out, try another word that appears only in the standup. **Source:** Code: `lib/ask-db.ts`; Seed: `seed/generated/eng-standup/transcript.json`.
- [ ] **AF-17** `D` **Do:** Open `/team`. **Expect:** the panel's scope is "Team Calls" and its chips read "Next steps across the team?", "Summarize recent team meetings", "Surprise me with a team insight"; clicking one gives a seeded answer with citations. **Source:** Code: `app/team/page.tsx`, `lib/prompts.ts`.
- [ ] **AF-18** `D` **Do:** On `/meetings/eng-standup` open the Ask tab. **Expect:** the hint "Ask anything about this meeting.", a scope select with only "This meeting", no chips and no "Hide" button. **Source:** Code: `components/meeting/MeetingView.tsx`, `components/AskPanel.tsx`.
- [ ] **AF-19** `D` **Do:** In that Ask tab ask `shadow`. **Expect:** every citation points to `/meetings/eng-standup?t=`. On `/meetings/q4-planning` the same question gives only q4 links or "No matching moments found in these calls.". **Source:** T26 S6 (this-meeting scope returns only that meeting).
- [ ] **AF-20** `D` **Do:** Turn on "Offline" in the Network tab, click a chip, then go back online. **Expect:** the reply "Something went wrong. Try again." and the panel works again afterwards. **Source:** Code: `components/AskPanel.tsx`.
- [ ] **AF-21** **Do:** In the Console run `fetch('/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.status)`. **Expect:** `400`. **Source:** Code: `app/api/ask/route.ts`; L9.1.
- [ ] **AF-22** `D` **Do:** At 390 px open `/meetings`. **Expect:** the panel sits below the cards at full width and still collapses with "Hide". **Source:** Code: `components/AskPanel.tsx`, `app/meetings/page.tsx`.
- [ ] **AF-23** `D` `K` **Do:** With a key set and signed out, ask a free-text question. **Expect:** the closest-moments answer with the notice "Sign in with Google for live answers. Showing the closest moments instead.". **Source:** T26 S6; Code: `lib/ask.ts`.
- [ ] **AF-24** `D` `K` `G` **Do:** With a key and signed in, ask `What did we decide about pricing?`. **Expect:** a written answer (no "Closest moments for" line, no notice) with citations written `<Speaker> at m:ss` that open the meeting at that time. **Source:** T26 S6; Code: `lib/ask.ts`.
- [ ] **AF-25** `D` `K` `G` **Do:** Time a live answer. **Expect:** it arrives within about 20 seconds, or the notice "The live answer failed. Showing the closest moments instead." appears. **Source:** L9.2 and L9.4 (20 s timeout, one attempt); Code: `lib/ask.ts`.
- [ ] **AF-26** `D` `K` `G` **Do:** Ask 11 free-text questions within an hour. **Expect:** the eleventh gets the notice "Hourly live-answer limit reached. Showing the closest moments instead.". **Source:** Spec 7 (10 per hour); Code: `lib/ask.ts`.
- [ ] **AF-27** `D` `K` `G` **Do:** After AF-26 click a chip. **Expect:** the seeded answer still appears. **Source:** Spec 7 (suggested prompts use no model call); Code: `lib/ask.ts` (suggested lookup comes first).
- [ ] **AF-28** `D` **Do:** Click "Hide" on the Ask panel, then reopen it, using only the keyboard. **Expect:** after Hide, focus lands on the "Ask Fathom" control (it is not lost to the page); after reopening, focus lands in the question field; the conversation area has `role="log"` and `aria-live="polite"` in DevTools. A screen reader announcing the answer is not covered here. **Changed in the UI pass:** answers were not in a live region and collapsing dropped focus. **Source:** L10.5; Code: `components/AskPanel.tsx`, `lib/ask-focus.ts`.

## 13. Live summary regeneration (RG), Task 27

`NK` items are valid only with no `ANTHROPIC_API_KEY`. Items tagged `K` need a server key, and RG-07 to RG-13 also need Google sign-in.

- [ ] **RG-01** `D` `NK` **Do:** On `/meetings/q4-planning` Summary tab, look next to Copy. **Expect:** a greyed "Regenerate with AI" button (hovering it may show the tooltip "Live regeneration is unavailable", depending on the browser), and below the button row the note "Live regeneration is unavailable. You can still read the pre-generated summary.". **Source:** T27 S5; Code: `components/meeting/SummaryTab.tsx`; Spec 7.
- [ ] **RG-02** `D` `NK` **Do:** Click the disabled button, signed out. **Expect:** nothing happens: no dialog and no network request. **Source:** Code: `components/meeting/SummaryTab.tsx` (`disabled`).
- [ ] **RG-03** `NK` **Do:** In the Console run `fetch('/api/regenerate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({meetingSlug:'q4-planning',template:'sales'})}).then(async r=>[r.status,await r.text()])`. **Expect:** `[503, '{"error":"Live regeneration is not configured on this server"}']`. **Source:** T27 S5; L9.7.
- [ ] **RG-04** **Do:** In the Console post the body `{}` to `/api/regenerate`, then a body with `template` set to `nope`. **Expect:** both return status `400` with `{"error":"Invalid request"}`. **Source:** L9.7 (malformed body gives 400); Code: `app/api/regenerate/route.ts`.
- [ ] **RG-05** `D` `K` **Do:** With a key set, open the Summary tab. **Expect:** "Regenerate with AI" is enabled and the explanatory note is absent. **Source:** Code: `components/meeting/SummaryTab.tsx`; Spec 7.
- [ ] **RG-06** `D` `K` **Do:** Signed out, click "Regenerate with AI". **Expect:** the sign-in dialog with "Sign in with Google to regenerate summaries with AI.". **Source:** Code: `components/meeting/SummaryTab.tsx`, `MeetingView.tsx`.
- [ ] **RG-07** `D` `K` `G` **Do:** Signed in, with General selected, click "Regenerate with AI". **Expect:** the button reads "Regenerating…" and is disabled while it works, then the content is replaced, the chip reads "Generated live", and a toast says "Summary regenerated". **Source:** T27 S5; Code: `components/meeting/SummaryTab.tsx`.
- [ ] **RG-08** `D` `K` `G` **Do:** Read the new headings. **Expect:** only headings from General's allowed list (Overview, Key points, Decisions, Open questions). **Source:** L9.7 (output validated per template); Code: `lib/regenerate.ts` (`summaryFor`).
- [ ] **RG-09** `D` `K` `G` **Do:** Click "Sales". **Expect:** its chip still reads "Pre-generated". **Source:** Code: `components/meeting/SummaryTab.tsx` (live result stored per template).
- [ ] **RG-10** `D` `K` `G` **Do:** On the regenerated General summary click Copy and paste. **Expect:** the pasted bullets match the regenerated text on screen. **Source:** Code: `components/meeting/SummaryTab.tsx`.
- [ ] **RG-11** `D` `K` `G` **Do:** Reload the page. **Expect:** General still shows your version with the chip "Generated live". **Source:** T27 S5.
- [ ] **RG-12** `D` `K` `G` **Do:** Open the meeting in a private window. **Expect:** the seeded version with the chip "Pre-generated". **Source:** T27 S5; Spec 7.
- [ ] **RG-13** `D` `K` `G` **Do:** Regenerate six times within one hour. **Expect:** the sixth shows a toast "Hourly regeneration limit reached" and the summary stays as it was. **Source:** T27 S5; Code: `app/api/regenerate/route.ts`.
- [ ] **RG-14** `D` `K` **Do:** View the page source of a meeting page and search for `sk-ant`. **Expect:** no match anywhere. **Source:** Plan Global Constraints and Spec 7 (the key never reaches the browser; only a boolean does).

## 14. Calendar stub (CA), Task 28

Open `/calendar`. In a private window the demo starts disconnected.

- [ ] **CA-01** **Do:** Read the page. **Expect:** the heading "Calendar" and a card "Connect your calendar" saying "This is a demo: no real Google Calendar connection is made, and the events shown after connecting are sample data.", with a button "Connect Google Calendar (demo)". **Source:** T28 S2; Code: `components/CalendarConnect.tsx`.
- [ ] **CA-02** `D` **Do:** Click "Connect Google Calendar (demo)". **Expect:** the line "Connected (demo, sample events). Switch the notetaker on or off per meeting.", a "Disconnect" button, and five events in this order: Weekly Product Sync // Kestrel, Discovery Call // Brightline Couriers, Engineering Standup, Customer Interview // Northgate Transport, Q4 Planning Checkpoint. **Source:** T28 S2 (five events); Seed: `seed/load.ts` (`EVENTS`).
- [ ] **CA-03** `D` **Do:** Read each event's time. **Expect:** a full weekday and a time followed by "UTC", matching the offsets in MC-08. **Source:** Code: `components/CalendarConnect.tsx`; Seed: `seed/load.ts`.
- [ ] **CA-04** `D` **Do:** Look at each switch. **Expect:** all five are on (cyan, knob at the right). **Source:** Code: `components/CalendarConnect.tsx` (`aria-checked`).
- [ ] **CA-05** `D` **Do:** Click one switch, then click it again. **Expect:** it turns off (grey, knob at the left) while the others stay on, then turns back on. **Source:** T28 S2 ("working toggles").
- [ ] **CA-06** `D` **Do:** Turn one switch off and reload. **Expect:** you are still connected and every switch is on again. **Source:** T28 S2 (reload keeps the connected state); Code: `components/CalendarConnect.tsx` (toggles are local state only).
- [ ] **CA-07** `D` **Do:** Click "Disconnect", then reload. **Expect:** the connect card returns and stays after the reload. **Source:** T28 S2.
- [ ] **CA-08** `D` **Do:** Clear the Network tab, then connect and toggle a switch. **Expect:** no request is sent. **Source:** Spec 2 (stub UI, no calendar OAuth); Code: `components/CalendarConnect.tsx`.
- [ ] **CA-09** `D` **Do:** Connect in one window, then open `/calendar` in a private window. **Expect:** the private window shows the connect card (the state lives in that browser's `localStorage`). **Source:** Code: `components/CalendarConnect.tsx`; L9.7.

## 15. Google sign-in (AU), Task 15

Items tagged `G` need Google OAuth configured (section 1.3). Items without it test the error paths.

- [ ] **AU-01** `G` **Do:** From `/team?role=Sales` click "Sign in with Google". **Expect:** the browser goes to Google's account chooser. **Source:** T15 S8.
- [ ] **AU-02** `G` **Do:** Choose your account. **Expect:** you return to `http://localhost:3000/team?role=Sales`, with no extra parameters left in the address. **Source:** Code: `components/AuthButton.tsx`, `app/auth/callback/route.ts`.
- [ ] **AU-03** `G` **Do:** Look at the header. **Expect:** your avatar (or a circle with the first letter of your email in capitals) and a "Sign out" button; "Sign in with Google" is gone. **Source:** T15 S8; Code: `components/AuthButton.tsx`.
- [ ] **AU-04** `G` **Do:** Reload the page. **Expect:** you are still signed in. **Source:** Code: `middleware.ts` (refreshes the session).
- [ ] **AU-05** `D` `G` **Do:** Open `/meetings`. **Expect:** still Priya Raman's four calls, not calls tied to your Google account. **Source:** Spec 2.
- [ ] **AU-06** `G` **Do:** Click "Sign out". **Expect:** the header returns to "Sign in with Google" on the same page, and a reload confirms you are signed out. **Source:** T15 S8; Code: `components/AuthButton.tsx`.
- [ ] **AU-07** `D` `G` **Do:** Signed out on `/meetings/q4-planning`, play to about 1:05 and pause, press `H`, then click "Sign in with Google" in the dialog and finish signing in. **Expect:** you return to `/meetings/q4-planning?t=<ms>` with the clock at the time you paused at (playback keeps running behind the dialog if you do not pause). **Source:** Spec 8; Code: `components/SignInDialog.tsx`, `components/meeting/MeetingView.tsx`.
- [ ] **AU-08** `D` `G` **Do:** After AU-07 read the highlight counts. **Expect:** unchanged; the pending highlight was not saved. **Source:** Spec 8 ("the pending highlight is not replayed").
- [ ] **AU-09** `D` `G` **Do:** On `/clip/demo-q4-clip` signed out, click "Sign in with Google to make your own clips" and finish signing in. **Expect:** you land on `/meetings/q4-planning?t=<clip start>` with the clock at the clip's start. **Source:** Code: `components/meeting/ClipView.tsx`.
- [ ] **AU-10** **Do:** Open `/meetings?auth_error=1`. **Expect:** a toast "Couldn't sign you in. Please try again." for about 3.5 seconds, and the address bar changes to `/meetings` with the parameter removed. **Source:** L9.2; Code: `components/Toaster.tsx`.
- [ ] **AU-11** **Do:** Open `/auth/callback` with no `code` parameter. **Expect:** you end on `/meetings` and see the toast of AU-10. **Source:** Code: `app/auth/callback/route.ts`.
- [ ] **AU-12** **Do:** Open `/auth/callback?next=https://evil.com`. **Expect:** you stay on `localhost:3000` and end on `/meetings`; there is no off-site redirect. **Source:** RF2; Code: `app/auth/callback/route.ts`.
- [ ] **AU-13** `G` **Do:** Signed in, switch DevTools Network to Offline, then click "Sign out". **Expect:** a toast reading "Couldn't sign you out. Please try again."; no unhandled error in the Console. Unit-tested only so far. **Changed in the UI pass:** a failed sign-out was ignored. **Source:** L10.5; Code: `lib/sign-out.ts`, `components/AuthButton.tsx`.

## 16. Visual and responsive review (VR), Task 14

Colour values are what DevTools shows under Computed styles. `DS` is `docs/design/design-system.md`.

- [ ] **VR-01** **Do:** Open `/design` at 1280 px. **Expect:** the heading "Design system", the intro "A quiet workspace for finding the moments that move work forward.", and four sections: "Color tokens", "Buttons", "Highlight types", "Card and motion". **Source:** T14 S4; Code: `app/design/page.tsx`.
- [ ] **VR-02** **Do:** Read "Color tokens" at 1280 px, then at 390 px. **Expect:** eight swatches labelled bg, surface, surface-2, fg, muted, border, accent, danger, in four columns at 1280 px and two at 390 px. **Source:** Code: `app/design/page.tsx`.
- [ ] **VR-03** **Do:** Read "Buttons". **Expect:** Primary (cyan fill, dark text), Secondary (outlined), Ghost (muted text), Small and Disabled (dimmed and not clickable). **Source:** Code: `components/ui/Button.tsx`, `app/design/page.tsx`.
- [ ] **VR-04** **Do:** Read "Highlight types". **Expect:** six chips, each with a colour dot and its text label. **Source:** Code: `app/design/page.tsx`; DS (colour never the only cue).
- [ ] **VR-05** **Do:** Inspect `body`. **Expect:** background `rgb(14, 16, 19)` and text `rgb(238, 241, 245)`. **Source:** DS (canvas `#0e1013`, fg `#eef1f5`); Code: `app/globals.css`.
- [ ] **VR-06** **Do:** Inspect a call card on `/meetings` (the element with the border, not the link around it). **Expect:** background `rgb(22, 26, 32)`, a 1px border `rgb(42, 49, 59)`, and a border radius of 12px. **Source:** DS (surface `#161a20`, border `#2a313b`, cards 12px).
- [ ] **VR-07** **Do:** Inspect the "Sign in with Google" button. **Expect:** background `rgb(33, 186, 243)`, text `rgb(6, 18, 31)`, border radius 8px. **Source:** DS (accent `#21baf3`, accent-fg `#06121f`, buttons 8px).
- [ ] **VR-08** `D` **Do:** Inspect a chip such as "N mins of highlights". **Expect:** fully rounded ends (a pill). **Source:** DS (chips full pill); Code: `components/ui/Chip.tsx`.
- [ ] **VR-09** `D` **Do:** On a meeting page inspect the border colour of each highlight type button. **Expect:** Action item `rgb(229, 231, 235)`, Insight `rgb(33, 186, 243)`, Positive `rgb(52, 211, 153)`, Feedback `rgb(251, 191, 36)`, Objection `rgb(248, 113, 113)`, Tech question `rgb(167, 139, 250)`. **Source:** DS (highlight colours); Code: `lib/schema.ts` (`hlColor`).
- [ ] **VR-10** **Do:** Inspect `body` font family. **Expect:** it starts with `ui-sans-serif, system-ui`. **Source:** DS (system sans); Code: `app/globals.css`.
- [ ] **VR-11** `D` **Do:** Inspect a transcript line's text size. **Expect:** 16px. **Source:** DS ("Keep transcript text at 16px"). The code sets `text-sm` (14px), so this may fail (open question 6).
- [ ] **VR-12** `D` **Do:** Inspect the `h1` on `/meetings/q4-planning`. **Expect:** 30px with a line height of 36px and regular weight. **Source:** DS (page title 30/36 regular). The code uses `text-2xl font-semibold` (24px), so this may fail (open question 6).
- [ ] **VR-13** `D` **Do:** Reload `/meetings` and `/team` at normal motion and watch the cards. **Expect:** cards appear without any fade or slide; only toasts and the `/design` card animate. **Source:** DS (no scroll reveal on lists or every card); Code: `components/MeetingCard.tsx`.
- [ ] **VR-14** `D` **Do:** Open the speaker filter dropdown on a meeting page. **Expect:** the list renders in a dark scheme. **Source:** Code: `app/globals.css` (`color-scheme: dark`).
- [ ] **VR-15** `D` **Do:** At 390 px on `/meetings`, measure the distance from the screen edge to the left edge of the first card. **Expect:** 16px. **Source:** DS (16px page gutters on mobile); Code: `app/meetings/page.tsx` (`px-4`).
- [ ] **VR-16** **Do:** At 390 px look at the header on `/meetings`. **Expect:** the logo, the search box, the three nav links and the sign-in button are all visible, wrapped onto more than one row, with no horizontal scroll. **Source:** Code: `components/Header.tsx` (`flex-wrap`).
- [ ] **VR-17** `D` **Do:** At 390 px open `/search?q=budget`, `/calendar`, `/clip/demo-q4-clip` and `/design`, and run `document.documentElement.scrollWidth <= window.innerWidth` on each. **Expect:** `true` on all four. **Source:** DS (compact layouts on mobile); T18 S3.
- [ ] **VR-18** `D` **Do:** At 1280 px view `/meetings`, `/team`, a meeting page, a clip page, `/search?q=budget` and `/calendar`. **Expect:** no overlapping or clipped elements and no horizontal page scroll on any. **Source:** T14 S9 (review at 1280 and 390); DS.
- [ ] **VR-19** `D` **Do:** Open the local reference captures in `docs/design/refs/` (gitignored, on your machine only) at 1280 and 390 next to the app. **Expect:** the app reads as the same family: dark canvas, cyan action colour, light type, fine outlines (a judgement call). **Source:** DS (point of view); handoff "Gates" (Task 14 visual review).

## 17. Accessibility (AX)

Keyboard, focus, reduced motion and contrast. Contrast figures are calculated from the token values in `app/globals.css` with the formula in `tests/contrast.test.ts`; confirm them in DevTools (Inspect, then the colour swatch in Styles shows the ratio).

Keyboard

- [ ] **AX-01** **Do:** On `/meetings` press Tab repeatedly from the page top. **Expect:** the focus order is: "Skip to main content" (visible only while focused), "Fathom Rebuild" link, search box, My Calls, Team Calls, Calendar, "Sign in with Google". **Changed in the UI pass:** there used to be no skip link, so the logo was the first stop. **Source:** Code: `app/layout.tsx`, `components/Header.tsx`; L10.5.
- [ ] **AX-02** `D` **Do:** On a meeting page press Tab from the "← My Calls" link. **Expect:** the scrubber, "Back 10 seconds", Play, "Forward 10 seconds", the speed button, "Share moment", the six highlight buttons, the note field, the transcript search, the speaker select, and then the transcript rows. **Source:** Code: `components/meeting/MeetingView.tsx`, `Player.tsx`, `HighlightPanel.tsx`, `Transcript.tsx`.
- [ ] **AX-03** `D` **Do:** Focus the scrubber and press the Right Arrow, then the Left Arrow. **Expect:** the clock moves forward 5 seconds, then back 5 seconds, and the page does not scroll. **Source:** Code: `components/meeting/Scrubber.tsx`.
- [ ] **AX-04** `D` **Do:** Focus the Play button and press Space, then Enter. **Expect:** playback starts, then pauses (and the same for "-10s", "+10s" and the speed button). **Source:** Code: `components/meeting/Player.tsx` (native buttons).
- [ ] **AX-05** `D` **Do:** Tab into a transcript row and press Enter. **Expect:** the clock moves to that row's time. **Source:** Code: `components/meeting/Transcript.tsx` (rows are buttons).
- [ ] **AX-06** `D` **Do:** Tab to each right-hand tab and press Enter or Space. **Expect:** each tab is one stop and opens its panel. **Source:** Code: `components/meeting/Tabs.tsx`.
- [ ] **AX-07** `D` **Do:** Open the sign-in dialog (play, press `H` signed out). **Expect:** focus moves into the dialog. **Source:** Code: `components/SignInDialog.tsx` (`showModal`).
- [ ] **AX-08** `D` **Do:** With the dialog open press Tab many times. **Expect:** focus stays inside the dialog and never reaches the page behind. **Source:** Code: `components/SignInDialog.tsx`.
- [ ] **AX-09** `D` **Do:** With the dialog open press Escape. **Expect:** the dialog closes. **Source:** Code: `components/SignInDialog.tsx`.
- [ ] **AX-10** `D` **Do:** In the Ask panel type a question and press Enter. **Expect:** the question is sent, as with the "Ask" button. **Source:** Code: `components/AskPanel.tsx` (form submit).
- [ ] **AX-11** `D` **Do:** On `/calendar` connect, Tab to a switch and press Space. **Expect:** the switch toggles. **Source:** Code: `components/CalendarConnect.tsx` (`role="switch"` on a button).

Focus visibility

- [ ] **AX-12** **Do:** Tab through the header. **Expect:** each stop shows a visible focus indicator. **Source:** DS (cyan reserved for focused controls); Code: `components/SearchBar.tsx`, `components/ui/Button.tsx`.
- [ ] **AX-13** `D` **Do:** Tab to a meeting card on `/meetings`. **Expect:** a cyan outline offset around the whole card. **Source:** Code: `components/MeetingCard.tsx`.
- [ ] **AX-14** `D` **Do:** Tab to the scrubber, the player buttons and the six highlight buttons. **Expect:** a cyan 2px outline on each. **Source:** Code: `components/meeting/Scrubber.tsx`, `components/ui/Button.tsx`, `components/meeting/HighlightPanel.tsx`.
- [ ] **AX-15** `D` **Do:** Tab to a transcript row, a right-hand tab, a summary pill and a chapter row. **Expect:** a visible focus indicator on each (these controls set no focus style of their own, so it is the browser's default ring). **Source:** DS; Code: `Transcript.tsx`, `Tabs.tsx`, `SummaryTab.tsx`, `ChaptersTab.tsx`.
- [ ] **AX-16** `D` **Do:** Tab into the transcript search, the speaker select, the note field and the Ask input. **Expect:** a visible focus indicator on each. **Source:** DS.
- [ ] **AX-17** `D` **Do:** Tab to the calendar switch and to a dialog button. **Expect:** a visible focus indicator on each. **Source:** Code: `components/CalendarConnect.tsx`, `components/ui/Button.tsx`.

Semantics (Accessibility pane)

- [ ] **AX-18** **Do:** Check the page language and landmarks on `/meetings`. **Expect:** `<html lang="en">`, a banner, a navigation named "Primary", a search landmark, a main landmark, a region "Upcoming meetings" and a complementary "Ask Fathom". **Source:** Code: `app/layout.tsx`, `NavTabs.tsx`, `SearchBar.tsx`, `UpcomingEvents.tsx`, `AskPanel.tsx`.
- [ ] **AX-19** `D` **Do:** Check the landmarks on a meeting page. **Expect:** regions named "Speakers" and "Highlight this moment", and a tab list named "Meeting details". **Source:** Code: `SpeakerStrip.tsx`, `HighlightPanel.tsx`, `Tabs.tsx`.
- [ ] **AX-20** `D` **Do:** Inspect the scrubber. **Expect:** role slider, name "Playback position", value text such as "0:10 of 1:02:00". **Source:** Code: `components/meeting/Scrubber.tsx`.
- [ ] **AX-21** `D` **Do:** Inspect the tabs. **Expect:** role tab with `aria-selected` true on exactly one, and a tabpanel labelled by the selected tab. **Source:** Code: `components/meeting/Tabs.tsx`.
- [ ] **AX-22** `D` **Do:** Inspect the summary pills. **Expect:** a group named "Summary template" and `aria-pressed` true on exactly one pill. **Source:** Code: `components/meeting/SummaryTab.tsx`.
- [ ] **AX-23** `D` **Do:** While playing, inspect the shaded transcript row. **Expect:** `aria-current="true"` on that row only. **Source:** Code: `components/meeting/Transcript.tsx`.
- [ ] **AX-24** **Do:** Inspect the toast container (the empty element fixed at the page bottom). **Expect:** `role="status"` and `aria-live="polite"`. **Source:** Code: `components/Toaster.tsx`.
- [ ] **AX-25** `D` **Do:** Look at the highlight buttons and the Highlights tab chips. **Expect:** each type shows its name as text, not only a colour. **Source:** DS ("never as the only cue"); Code: `HighlightPanel.tsx`, `HighlightsTab.tsx`.

Reduced motion (emulate "reduce", section 1.4)

- [ ] **AX-26** **Do:** Reload `/design`. **Expect:** the "Card and motion" card appears instantly, with no slide or fade (with motion on it rises 8px over 240ms). **Source:** T14 S9; Code: `app/globals.css`.
- [ ] **AX-27** `D` **Do:** Trigger a toast (click Copy on a summary). **Expect:** it appears without the rise animation. **Source:** Code: `app/globals.css`, `components/Toaster.tsx`.
- [ ] **AX-28** `D` **Do:** While playing, scroll the transcript far away with the wheel, then click "Jump to live". **Expect:** it jumps straight to the active row without a gliding scroll (with motion on, it glides). **Source:** Code: `components/meeting/Transcript.tsx` (`behavior: 'auto'` under reduced motion).
- [ ] **AX-29** `D` **Do:** Press Play. **Expect:** the clock still advances normally; reduced motion only affects CSS animation and transitions. **Source:** Code: `lib/playback.ts`, `app/globals.css`.

Contrast (calculated with the formula in `tests/contrast.test.ts`)

- [ ] **AX-30** **Do:** Measure body text (`#eef1f5`) on the page background (`#0e1013`). **Expect:** at least 4.5:1 (about 16.8). **Source:** T14 S2; DS (CR-201).
- [ ] **AX-31** `D` **Do:** Measure grey text (`#98a2b3`) on the page background and on a card (`#161a20`). **Expect:** at least 4.5:1 (about 7.4 and 6.8). **Source:** T14 S2; DS.
- [ ] **AX-32** `D` **Do:** Measure grey text on the shaded transcript row (`#1e242c`), for example the timestamp. **Expect:** at least 4.5:1 (about 6.1). **Source:** DS (4.5:1 for text); this pair is not in `tests/contrast.test.ts`.
- [ ] **AX-33** `D` **Do:** Measure cyan link text (`#21baf3`) on a card, for example an Ask citation. **Expect:** at least 4.5:1 (about 7.8). **Source:** DS; this pair is not in `tests/contrast.test.ts`.
- [ ] **AX-34** **Do:** Measure the primary button text (`#06121f`) on its cyan fill (`#21baf3`). **Expect:** at least 4.5:1 (about 8.4). **Source:** T14 S2; DS.
- [ ] **AX-35** `D` **Do:** Measure each of the eight speaker-name colours on a card and on the shaded row. **Expect:** at least 4.5:1 each (lowest about 5.6 on the shaded row). **Source:** DS; lane colours are not covered by `tests/contrast.test.ts` (T18 S2 note).
- [ ] **AX-36** `D` **Do:** Measure the six highlight colours against the page background. **Expect:** at least 3:1 each (lowest about 6.9). **Source:** T14 S2 (3:1 for highlight colours); DS.
- [ ] **AX-37** `D` **Do:** On a meeting page inspect the tab list in DevTools. **Expect:** the selected tab has `aria-controls` equal to the `id` of the rendered panel, and the other tabs have no `aria-controls` (their panels are not rendered). **Changed in the UI pass:** every tab pointed at a panel id, so inactive ones pointed at nothing. **Source:** L10.5; Code: `components/meeting/Tabs.tsx`, `lib/tabs.ts`.
- [ ] **AX-38** **Do:** On any page press Tab once, then Enter on "Skip to main content", then Tab again. **Expect:** the link is visible only while focused and sits at the top of the screen; Enter moves focus to the main area, and the next Tab lands on the first control inside the page content, not on the header. There is exactly one `<main>` element. **Source:** L10.5; Code: `app/layout.tsx`.

## 18. Known risks to watch (KR)

These come from ledger 9.5 (and 9.2 for KR-13). They are open items, so some are expected to fail. A fail here confirms a known issue; it is not a new regression. For each, "Expect (desired)" is the behaviour a user would want, and "Known" is what the ledger says is open.

- [ ] **KR-01** `D` **Do:** Open `/meetings/q4-planning?t=600000` (10:00). **Expect (desired):** the active transcript row is visible inside the transcript box with no manual scrolling. **Known:** the deep-link scroll with `content-visibility: auto` is unchecked in a browser (L9.5). **Source:** L9.5; T25 S4.
- [ ] **KR-02** `D` **Do:** Open `?t=1800000` (30:00) on the same meeting. **Expect (desired):** as KR-01. **Known:** as KR-01. **Source:** L9.5.
- [ ] **KR-03** `D` **Do:** Open `?t=3300000` (55:00). **Expect (desired):** as KR-01. **Known:** as KR-01. **Source:** L9.5.
- [ ] **KR-04** `D` **Do:** From `/search?q=budget` click the result with the latest time you can find. **Expect (desired):** the transcript is scrolled so that row is visible. **Known:** as KR-01. **Source:** T25 S4 ("transcript scrolled to the line once played or sought"); L9.5.
- [ ] **KR-05** `D` **Do:** Play at 1x for about 10 seconds, switch to another browser tab for 30 seconds, then come back and read the clock. **Expect:** the clock has not jumped forward by the hidden time; it is within about a second of where it was when you left (or still paused). **Changed in the UI pass:** one clock frame is now capped at 250 ms, so a resumed tab cannot throw the playhead forward; the cap is unit-tested but real tab resume is not browser-verified. **Source:** L9.5, L10.5; Code: `lib/playback.ts` (`runClock`, `MAX_FRAME_MS`), `components/meeting/playback-hooks.ts`.
- [ ] **KR-06** **Do:** Open `/team?host=zzz`, then `/team?role=zzz`. **Expect:** no error page. The first shows "No team member matches that host." with a "Show all calls" link, the second shows "No team member has that role.". **Changed in the UI pass:** the plan's older text ("No calls match these filters.") now applies only to a real host or role with no calls (see TC-15). **Source:** T19 S2; L9.5, L10.5; Code: `lib/team-filter.ts`, `app/team/page.tsx`.
- [ ] **KR-07** **Do:** On the `?host=zzz` page read the Host dropdown. **Expect:** it shows "Unknown host" as the selected option, not "All hosts", so it does not contradict the empty list. **Changed in the UI pass:** unit-tested logic, not browser-verified (the `<option>` rendering in particular). **Source:** L9.5, L10.5; Code: `app/team/page.tsx`.
- [ ] **KR-08** `D` **Do:** Only on a database you can restore, in the Supabase SQL editor run `update team_members set is_demo_user = false where is_demo_user;`, reload `/meetings`, then restore with `update team_members set is_demo_user = true where name = 'Priya Raman';`. **Expect:** My Calls lists no calls and says "No demo user is set up, so there are no calls here." with a "Browse Team Calls" link, instead of silently listing every call. **Changed in the UI pass:** unit-tested, not browser-verified. **Source:** L9.5, L10.5; Code: `lib/queries.ts` (`listMyMeetings`), `app/meetings/page.tsx`. This edits data, so mark it Blocked if you would rather not.
- [ ] **KR-09** `D` **Do:** Note the initials tile colours on the Q4 Product Planning card, then find the same people in the speaker cards on its meeting page. **Expect:** each person has the same colour in both places. **Changed in the UI pass:** card and page now order participants the same way (talk time, then id); unit-tested, not browser-verified. Still different by design: clip lane colours follow first appearance (L10.5). **Source:** L9.5, L10.5; Code: `lib/participants.ts`, `components/MeetingCard.tsx`.
- [ ] **KR-10** `D` **Do:** Click the speaker filter, press Tab once, then press Tab again. **Expect:** the first Tab lands on exactly one transcript row (the one you last focused, else the live line, else the first) and the second leaves the transcript. With a row focused, Up and Down move between rows, Home and End jump to the first and last row, and Enter or click still seeks. **Changed in the UI pass:** the transcript used to be about a thousand tab stops; the key logic is unit-tested, but focus movement and scroll-into-view on `content-visibility: auto` rows are not browser-verified. **Source:** L9.5, L10.5; Code: `components/meeting/Transcript.tsx`, `lib/roving.ts`.
- [ ] **KR-11** `D` **Do:** Tab to the "Summary" tab and press the Right Arrow, then Left, Home and End. **Expect:** focus moves to "Action items" and the selection follows; Left goes back; Home goes to the first tab and End to the last; only the selected tab is a tab stop; Alt+Left (browser back) is not intercepted. **Changed in the UI pass:** unit-tested, not browser-verified. Known side effect: switching tabs unmounts the inactive panel, so Ask and Summary state is lost (L10.5). **Source:** L9.5, L10.5; Code: `components/meeting/Tabs.tsx`, `lib/roving.ts`.
- [ ] **KR-12** `D` `G` **Do:** Signed in, open a meeting without `?t=`, play to about 5:00, then click "Sign out". **Expect (desired):** the clock keeps its position. **Known:** the page remounts on sign-out, so own highlights vanish and the playhead returns to the `?t=` start (here 0:00). **Source:** L9.2; Code: `app/meetings/[id]/page.tsx` (`key`).
- [ ] **KR-13** `D` **Do:** Signed out, open a meeting, press Play and press an Insight button straight away, within the first second, before any transcript line has started. **Expect:** the "Sign in to continue" dialog opens, not silence. **Changed in the UI pass:** the sign-in gate now runs before the segment lookup (every seeded transcript starts at 1000 ms, so there is no active line in the first second); unit-tested, and `e2e/smoke.spec.ts` presses Insight right after Play. Signed in, the same press does nothing visible. **Source:** L10.5; Code: `lib/highlight.ts` (`planHighlight`), `components/meeting/MeetingView.tsx`.

## 19. Open questions for the user

I could not find a source that settles these, so no item above states them as fact.

1. Plan Task 18 Step 3 expects the four My Calls cards under one heading, "October 2026". After the Phase 0 date changes, `seed/meetings.ts` puts only Q4 Product Planning in October (Oct 1) and the other three in September (Sep 21, 29 and 30), so MC-02 expects two headings. Is the plan text out of date?
2. Plan Task 13 Step 2 says `ask_answers: 3`. Ledger 9.2 says answers are now generated per scope with 3 prompts each, which gives 6. Which count should the loader print?
3. The meeting page always shows "← My Calls" (linking to `/meetings`) and keeps the "My Calls" tab highlighted, even for a call opened from Team Calls that Priya does not host (for example `eng-standup`). Is that intended?
4. The spec (section 7) says "Mobile: player on top, tabs below", and plan Task 21 Step 5 says "player, then transcript, then tabs". The code puts the eight speaker cards first, so at 390 px the player sits below a tall stack. TR-26 records the observed order; should the speaker strip move?
5. Auto-follow stops only on a mouse wheel or touch move (`Transcript.tsx`). Dragging the scrollbar or paging with the keyboard does not show "Jump to live". The spec says the button appears "after manual scroll". Should those count?
6. `docs/design/design-system.md` says to keep transcript text at 16px and gives the page title as 30/36 regular. The code uses `text-sm` (14px) for transcript rows and `text-2xl font-semibold` (24px) for the meeting title. Only `/design` follows the guide. Which one is the authority?
7. The same document reserves cyan for primary actions, active navigation and focus. Cyan also marks search matches, Ask and clip links, card hover borders, the first speaker lane and Insight highlights (the document itself gives Insight cyan). Is that wider use acceptable?
8. The document says highlight colours must come with a text label. Scrubber markers carry only a hover title and transcript highlights are a coloured border; the labels appear in the panel and the Highlights tab. Is that enough?
9. Resolved in the UI pass: a skip link now exists (AX-01, AX-38). A keyboard user can jump past the header, and the transcript is now a single tab stop (KR-10).
10. If a user cancels at Google's consent screen, the callback has no `code` and sends them to `/meetings?auth_error=1`. I could not confirm what Supabase sends back on cancel, so no item covers it.
11. The Share moment button uses the whole current speaker turn as the clip window (`expandToRun`; SH-18). The spec lists "the current moment" as a share source without defining its window. Is the speaker turn what you want?

## 20. Not covered by this checklist

- The Task 29 ship checklist: deployment, the live link in a private window on another device, the public repository, `.agent-logs/`, the walkthrough and disabling the Supabase Email provider.
- Failure paths that need a broken server or database: the "Something went wrong" error page, a failed save rolling back an optimistic highlight, and the empty states ("No calls yet.", "No upcoming meetings", "No chapters for this call.", "No action items.").
- Server-side behaviour a browser cannot see: the `getUser` calls in the header, page and middleware, and the `ai_usage` metering counts.
- The open-redirect guard `safeNext` with a real OAuth code (unit-tested in `tests/safe-next.test.ts`; AU-12 only checks the no-code path).
- Real-model quality of live answers and regenerated summaries beyond the structural checks above.
