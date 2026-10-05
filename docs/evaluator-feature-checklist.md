# Evaluator brief: feature list to test by hand

This maps the evaluators' brief to what the app does, with a short way to check each point. For the full 315-item acceptance list see `docs/manual-test-checklist.md`. Live app: https://fathom-rebuild-eight.vercel.app

Status words: **Real** (works as the brief means it), **Simulated** (a deliberate stand-in, stated in the README), **Unverified** (built, never run end to end), **Not built**.

Times are UTC. "Signed out" works for everything except highlights, shares, live AI and the real calendar.

## 1. What the brief asks for

| # | Brief says | Status | Where |
| --- | --- | --- | --- |
| R1 | Connect a calendar | Real when connected (unverified), demo otherwise | `/calendar` |
| R2 | Get the notetaker into a real meeting and let it record | **Simulated** (a real Meet link can be made; no bot joins it) | `/calendar`, README table |
| R3 | Watch the playback against the transcript | Real UI, simulated media | `/meetings/<call>` |
| R4 | Read the AI summary, switch templates | Real UI, pre-generated content | Summary tab |
| R5 | Pull the action items | Real | Action items tab |
| R6 | Highlight a moment mid-call and see where it lands | Real (needs Google sign-in) | Player, Highlights tab |
| R7 | Search across meetings | Real | header search, `/search` |
| R8 | Share a clip with someone who was not on the call | Real (creating needs sign-in, opening does not) | Share moment, `/clip/<slug>` |
| R9 | An eight-person call that runs an hour | Real (seeded) | Q4 Product Planning |
| R10 | Seed it with real data (no empty list) | Real, synthetic content | 8 calls loaded |
| R11 | Live link, public repo with `.agent-logs/`, 5-minute walkthrough | Link and repo done, walkthrough is yours | README, `docs/walkthrough.md` |

## 2. Manual tests by requirement

### R1 and R2: calendar and notetaker
1. Signed out, open **Calendar**. Expect a "Demo schedule" list and a "Connect Google Calendar" button.
2. Press it, pick a Google account that is a listed test user, accept the consent screen. Expect to land back on Calendar showing your real next events (up to 25), UTC times. Unverified until you run it.
3. In the form, schedule a call (title, a start time in the future, duration, optional invitee emails). Expect the new event with a **Join Meet** link that opens a real Google Meet. Invitees get an email from Google.
4. Confirm the line "The Fathom notetaker is simulated in this demo: it does not join the call." is shown. Nothing records your Meet call.
5. Press **Disconnect**. Expect the demo schedule again. (It deletes the cookie only; the grant stays in your Google account.)

### R3: playback against transcript
1. Open **Q4 Product Planning** from My Calls. Expect "Press play to start the recording.", a clock near 1:02:00, a Play button and a speed button.
2. Press Play. The clock counts up, the stage shows the current speaker's initials and line, and the transcript scrolls and highlights the same line.
3. Cycle speed 1x, 1.5x, 2x. Drag the scrubber: the stage and transcript jump together.
4. Click any transcript line: playback seeks there. Open `/meetings/q4-planning?t=600000`: it opens at 10:00.

### R4: summary and templates
1. Summary tab: pills General, Sales, Standup, Project review. Switching is instant (no network call) and shows a "Pre-generated" chip.
2. Press **Copy**: Markdown is on the clipboard.
3. Signed in with Google, **Regenerate with AI** needs a model key: paste your own in "Your AI key" (Ask panel or Summary tab). Unverified without a real key.

### R5: action items
1. Action items tab: owner, task, due date resolved from phrases such as "by Friday", and a "Jump to m:ss" button that seeks the player to the moment.
2. Copy puts Markdown on the clipboard.

### R6: highlights
1. Signed out, press the **h** key or a highlight type button: a "Sign in to continue" dialog appears, no error.
2. Sign in with Google, press play, press **Insight** (or a type button, optionally add a note). It captures the speaker's whole run at the playhead (max 5 minutes).
3. Open the **Highlights** tab: your highlight is listed with a range, an excerpt, **Jump**, **Share clip** and **Delete**. Seeded ones are labelled "Demo" and cannot be deleted.
4. Reload: it is still there. Sign out: it is not visible to others.

### R7: search
1. Type `budget` in the header search and press Enter, or open `/search` and press a suggestion chip.
2. Expect results grouped by call, each with "Speaker · m:ss" and the match highlighted. Click one: the call opens at that moment.
3. Try a nonsense word: a friendly "No matches" message. Search is whole-word full text, with no meaning-based matching.

### R8: share a clip
1. Signed in, press **Share moment** (or **Share clip** on a highlight, or drag over a few transcript lines and press **Share selection**). Expect a link copied and a toast.
2. Open `/clip/demo-q4-clip` in a private window (signed out). Expect the clip with its transcript lines and no sign-in wall. View source: Open Graph tags are present.
3. A clip link is a shortcut, not access control: every transcript is readable signed out by design.

### R9: eight people, one hour
1. **Q4 Product Planning**: 62 minutes, eight speakers. The Speakers strip shows eight cards with talk share, questions and longest monologue (shares sum to about 100%, none under 3%).
2. Use the speaker filter in the transcript and the chapters tab (8 chapters). Scroll a long transcript: it stays smooth.

### R10: seeded data
1. **My Calls** shows calls hosted by one fixed demo persona (Priya Raman). **Team Calls** shows all eight calls, member stats and host/role filters.
2. All content is synthetic (a fictional freight-software company); the README says so.

### Extras worth a look
- **Ask Fathom** panel: the three suggested questions answer instantly from stored answers with citations; other questions return the closest matches. Live answers need a model key and sign-in.
- Keyboard: Tab through the header, tabs (arrow keys move between them), the scrubber (arrows, PageUp/PageDown).
- Mobile: resize to 390 px wide; no horizontal page scroll.
- Loading: each page shows a skeleton immediately while the server renders.

## 3. Honest gaps against the brief
- **Real meeting capture: Simulated.** The brief allows stubbing the capture layer if you say so. There is no bot, audio or video. The player is a clock that steps through the transcript. The README and walkthrough say this.
- **Live (real-time) transcripts during a call: Not built, and not asked for.** The brief only asks to let the notetaker record and then live with the output, and to watch playback against the transcript. Nothing transcribes a real call in real time. The transcript you see following playback is pre-written synthetic dialogue, and the "active line" follows the player clock.
- **Meet transcripts or recordings pulled into the app: Not built.** Scheduled Meet calls are not recorded and nothing from them reaches the database. That would be a separate integration.
- **Calendar is unverified in the grader's hands.** While the Google app is in Testing status only listed test users can connect, and Google shows an "unverified app" warning.
- **Live AI is optional.** No server key is set, so live Ask and Regenerate need a visitor's own key (untested with real keys).
- **Walkthrough video** (5 minutes, camera on) is for you to record; `docs/walkthrough.md` is the script.

## 4. How it is judged (from the brief)
- **Speed:** how much working product, in the time.
- **Product judgement:** what was built first and what was left out. The README's "Left out, and why" section is the place for that.
- **UX and UI:** whether it is good to use. Check the screens at desktop and 390 px, with keyboard only, and on first load (skeletons).
