# Walkthrough script

A timed outline for the demo recording: five minutes at most, camera on. The project owner records it. This file is the script and the pre-flight list. Control names below are the exact labels in the UI, so you can find each one on screen.

Links to have ready: live app `<LIVE_URL>`, repository `<REPO_URL>`.

## Before you press record

1. **Data is loaded.** Open `<LIVE_URL>/meetings`. You should see an Upcoming strip and call cards, and Q4 Product Planning should be among them. Open Team Calls: all eight seeded calls should be listed. If My Calls shows "No calls yet." or the "Calls" card on Team Calls reads 0, the seed data is not loaded. Stop and follow the seed steps in the README.
2. **Start signed out.** The header should show "Sign in with Google". You sign in on camera at 2:50. If you are signed in, click "Sign out" and reload.
3. **Open a private window now**, empty, for the share step at 3:30.
4. **Choose your search word.** Pick a word the Q4 Product Planning transcript contains, search for it, and check that Q4 Product Planning is among the result groups. The call's brief is about Q4 priorities, budget and hiring, so "budget" is the first word to try, but confirm it. Search is whole-word full text with English stemming, so a word and its plain variants match; a half-typed word does not.
5. **Live AI or not.** Open the Summary tab of any call. If "Regenerate with AI" is greyed out and a line below it says "Live regeneration is unavailable", the server has no Anthropic key. Then the free-text Ask answer at 4:00 is the extractive fallback, and the script below is written for that case. If a key is set, a free-text question from a signed-in visitor is answered live and the notice line will not appear.
6. **Read numbers off the screen, not off this page.** Call length, speaker count, talk shares and due dates all come from generated data. The showcase call is planned at 62 minutes and `seed:check` accepts a duration within 5% of that (about 59 to 65 minutes), so the card may say anywhere in that range. Do not quote a transcript line count; read it from the page if you want one.
7. **Window size.** Use a window at least 1280 px wide. From 1024 px up the meeting page puts the tabs beside the player; narrower, they stack below it.
8. **Rehearse once with a timer.** Aim to finish at 4:45 to 4:55. The outline is 4:30 of content plus the close.

Two behaviours to know before you start:

- **Highlight buttons do nothing before the first line.** In the seeded data the first line starts at 0:01. A highlight pressed at 0:00 captures nothing and shows no dialog, signed in or not. Let the call play for a few seconds, or click a transcript line, first.
- **After Google sign-in you land paused at the same moment.** The page reloads at `?t=<ms>` and the playhead starts there, paused. Click "Play" again.

## Outline

### 0:00 Intro (30 s)

Start on `/meetings`, signed out.

- **Say:** "This is a rebuild of an AI meeting notetaker: transcripts, summaries, highlights, search and shareable clips. Three things are stubbed. There is no recording bot or media: the player is a clock stepping through a transcript. Calendar connect is a demo screen. And all the data is synthetic, generated with Claude. Live AI is optional: without a server key, summaries are pre-generated and Ask falls back to extractive answers."
- **Click:** the "Calendar" link in the header while you say "demo screen". Point at the card text "This is a demo: no real Google Calendar connection is made". Click "My Calls" in the header to come back. (If the page shows "Connected (demo, sample events)" instead, a previous visit left the demo switched on in that browser: click "Disconnect" before recording.)

### 0:30 My Calls (45 s)

- **Show:** the month headings, then one call card: initials tiles, the duration badge in the bottom-right corner of the tiles (for example "62 mins"), and the "N mins of highlights" chip under the title.
- **Show:** the "Upcoming" strip above the cards. Each card ends "Notetaker will join".
- **Say:** "My Calls is the calls hosted by one fixed demo persona, Priya Raman. Everyone sees her calls; there are no real accounts behind it."
- **Click:** the "Search call recordings" box in the header. Type your word and press Enter (there is no search button).
- **Show:** the results page, "Results for ...", grouped by call. Each result shows speaker and time, and the matched word is highlighted.
- **Click:** a result under "Q4 Product Planning". It opens the meeting page at that moment (the address ends `?t=<ms>`).
- **If the transcript is not scrolled to the matched line,** click "Play" and the transcript scrolls to follow. Deep-link scrolling has not been checked in a browser.

### 1:15 The meeting page (60 s)

You are on Q4 Product Planning: eight people, about an hour.

- **Show:** the "Speakers" cards under the title. Each shows talk share, questions asked and longest monologue, from the transcript.
- **Show:** the scrubber under the player. One coloured lane per speaker, thin vertical ticks for chapters, coloured ticks along the top for highlights.
- **Click:** the "Chapters" tab, then a chapter row. The playhead jumps there.
- **Click:** "Play". Show the transcript row highlighting and scrolling as the clock runs.
- **Click:** the "1x" button once or twice to cycle 1.5x and 2x. Click "+10s". Click or drag along the scrubber (the "Playback position" slider) to scrub.
- **Click:** into "Search this transcript", type a word, and show matches highlighted in the lines. Clear it.
- **Click:** the "Filter by speaker" menu, choose one person. Set it back to "All speakers".
- **Optional:** scroll the transcript with the mouse wheel. A "Jump to live" button appears bottom-right. Click it.
- **Say:** "The player is simulated: a timer drives it and the current transcript line is found by binary search."

### 2:15 Summary and action items (35 s)

- **Click:** the "Summary" tab. Show the chip "Pre-generated".
- **Click:** the template buttons "General", "Sales", "Standup", "Project review" in turn. The page does not reload; all four are already loaded.
- **Click:** "Copy". A toast says "Summary copied" and the clipboard holds Markdown.
- **Say, only if "Regenerate with AI" is greyed out:** "Regenerate is disabled because there is no server key. With a key and a signed-in visitor it saves your own version, limited to five an hour." If a key is set, skip this and do not click the button on camera unless you have rehearsed it.
- **Click:** the "Action items" tab. Each item shows owner, a "Due" date and a "Jump to m:ss" button. Due dates were turned from phrases like "by Friday" into real dates by code, against the call's date.
- **Click:** one "Jump to m:ss". The playhead moves. Click "Copy" for the Markdown checklist (toast "Action items copied").

### 2:50 Highlights (40 s)

- **Click:** "Play", wait until a few seconds in, then click "Insight" in the "Highlight this moment" panel (or press H).
- **Show:** the dialog "Sign in to continue", with the message "Sign in with Google to save highlights. You will come back to this moment."
- **Click:** "Sign in with Google" in the dialog. Choose your account. You come back to the same moment, signed in, with your avatar and "Sign out" in the header.
- **Click:** "Play", wait a few seconds. Optionally type in "Add note (optional)". Click a type button, for example "Objection". The count on the button goes up.
- **Say:** "A highlight captures the whole run of the person speaking at the playhead: consecutive lines by the same person, gaps under three seconds merged, capped at five minutes."
- **Show three places:** a new coloured tick on the scrubber; a coloured left border on the transcript lines in the window; and the tab label "Highlights (N)" going up.
- **Click:** the "Highlights" tab. Show your entry (type chip, time range, title, no "Demo" tag) beside the seeded ones tagged "Demo".

### 3:30 Share (30 s)

- **Click:** "Share clip" on your highlight. A toast says "Clip link copied". (The "Share moment" button at the right-hand end of the playback controls does the same for the speaker run at the playhead.)
- **Show:** "Your shared clips" listing `/clip/<slug>` with a "Delete" button.
- **Switch** to the private window. Paste the link and press Enter. No sign-in is asked for.
- **Show:** the "Shared clip" label, the clip title, the player and a transcript of only that window, the "View the full meeting" link and "Sign in with Google to make your own clips".
- **Click:** "Play" to show it loops.
- **Show the social preview.** Paste the same link into a place that unfurls links (a chat message box), or open the page source and show the `og:title` and `og:image` tags. The card image comes from `app/clip/[slug]/opengraph-image.tsx`. Not rendered in a browser yet, so rehearse this one.
- **Say:** "Every transcript in this demo workspace is public by design, so a clip link is a shortcut, not access control."
- **If the toast shows a URL instead of "Clip link copied",** the browser refused clipboard access. Copy the link out of the toast.

### 4:00 Ask Fathom (30 s)

- **Click:** "My Calls" in the header. The "Ask Fathom" panel is on the right.
- **Click:** the suggested chip "Summarize my recent meetings". The answer appears with citation links of the form "m:ss · label".
- **Click:** one citation. It opens the call at that moment. Use the browser back button to return.
- **Click:** the "Ask a question" box, type a free-text question, click "Ask". With no server key you get "Closest moments for ...:" with cited moments and an italic notice: "Live answers are unavailable. Showing the closest moments instead." If a key is set but you are signed out, the notice reads "Sign in with Google for live answers. Showing the closest moments instead."
- **Say:** "The suggested questions were answered at seed time. A free-text question needs a server key and a signed-in visitor for a live answer, ten an hour. Otherwise it returns the closest full-text matches, so the box is never dead."
- The "Scope" menu switches between My Calls and Team Calls. The suggested chips show only while the menu is on the panel's own default scope.

### 4:30 Team Calls and close (30 s)

- **Click:** "Team Calls" in the header. Show the three cards ("Calls", "Avg talk share", "Team members"), the "Team members" table (calls, talk share, questions, longest monologue) and the "Host" and "Role" menus with the "Filter" button.
- **Say, as the close:** "Left out: the recording bot, real calendar sign-in, CRM and Slack, because they need other vendors' accounts; multi-tenant teams, Alerts, Deals and Playlists, which sit outside finding and sharing a moment; and semantic search, which full-text covers at this size. The code is at `<REPO_URL>`, with the agent logs in `.agent-logs/`."

## If something goes wrong on camera

| What you see | Cause | Do this |
| --- | --- | --- |
| Highlight button does nothing | Playhead is before the first line (0:00) | Click "Play", wait two seconds, press it again |
| Toast "Couldn't sign you in. Please try again." | The sign-in code exchange failed on return | Click "Sign in with Google" again; if it repeats, check that Supabase Site URL and redirect URLs include `<LIVE_URL>/**` |
| Toast "Couldn't start Google sign-in. Please try again." | The browser could not start the OAuth request | Retry; if it repeats, check that the Google provider is enabled in Supabase |
| Toast "Daily clip limit reached (20)" | Share cap reached | Reuse `<LIVE_URL>/clip/demo-q4-clip`, made by `npm run seed:clips` |
| Ask answers "Something went wrong. Try again." | The request to `/api/ask` failed | Click the chip or "Ask" again |
| A page says "Something went wrong" with "Try again" | A data query failed | Click "Try again"; if it persists, stop and check the database |

## If you are running over

Cut in this order: the speed button and "+10s", the speaker filter, the Calendar click in the intro, "Copy" on both tabs, the Team Calls filter menus. Keep the sign-in, the highlight, the private-window clip and the stub disclosures: those are what the recording has to prove.
