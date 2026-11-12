# Proposed issues

Drafts ready to be opened on GitHub. Each one follows
[`.github/ISSUE_TEMPLATE/feature_request.yml`](../.github/ISSUE_TEMPLATE/feature_request.yml) — copy the
title, pick the **Affected area** from the dropdown, and paste the body into the matching fields. The
**Notes** block at the end of an issue has no field of its own; append it to *Proposed solution*.

Line references are against `b0c81d5`. Bugs already drafted live in [`issues.md`](../issues.md) and are
not repeated here. Several of these depend on work in the API — those are marked **API&nbsp;#n** and
refer to the numbered proposals in the backend repo's
[`docs/PROPOSED_ISSUES.md`](https://github.com/elvis-segovia/floxflix/blob/main/docs/PROPOSED_ISSUES.md).

| # | Title | Affected area | Depends on |
| --- | --- | --- | --- |
| 1 | [Feature]: Carry the selected viewer through the session, and actually ask for the PIN | Login / authentication | API #1 |
| 2 | [Feature]: Continue Watching row and resume where the viewer left off | Web client / player | #1, API #2 |
| 3 | [Feature]: Watched markers and a "play next unwatched" entry point | Web client / player | #2, API #3 |
| 4 | [Feature]: Page through the whole catalog instead of the first 20 items | Web client / player | — |
| 5 | [Feature]: Make the navbar search real — catalog search, genre filters and a title page | Web client / player | #4 |
| 6 | [Feature]: Subtitle and audio track selection in the player | Web client / player | API #4 |
| 7 | [Feature]: Uploads that survive navigation and don't restart from zero | Admin dashboard | — |
| 8 | [Feature]: Dashboard home — library overview and a live conversion queue | Admin dashboard | — |
| 9 | [Feature]: Handle expired sessions and API failures in one place | Login / authentication | — |
| 10 | [Feature]: Automated tests for the parts that keep breaking | Other | — |

---

## 1. [Feature]: Carry the selected viewer through the session, and actually ask for the PIN

**Affected area:** Login / authentication

### What problem does this solve?

Picking a profile writes a **display name** to `localStorage` and navigates away:

```ts
localStorage.setItem("username", selectedViewer.name)   // src/pages/web/users/index.tsx:55
navigate("/web/catalog")
```

The viewer's id is fetched, used to find the row in local state, and then dropped
(`src/pages/web/users/index.tsx:27-32,48-56`). From that point on nothing in the app knows who is
watching except the navbar dropdown, which reads the same string back to render a label
(`src/components/navbar/navbar.tsx:43`).

Three things follow from that:

- **The PIN is decorative.** `CreateProfileModal` collects `use_pin` and a 4–6 digit `pin`
  (`src/pages/web/users/components/CreateProfileModal.tsx:120-148`), but the profile picker never asks
  for it — clicking a locked profile goes straight to the catalog. The lock exists in the create form
  and nowhere else.
- **Nothing per-viewer can be built in the UI.** Continue Watching (#2), watched markers (#3) and a
  remembered subtitle preference (#6) all need a viewer the API will accept, not a string.
- **The selection is a dead end.** There is no "switch profile" anywhere in the UI — the only way back
  to the picker is to type `/` into the address bar — and `ViewersController` only has `listViewers`
  and `createViewer` (`src/controllers/viewersController.ts:11-17`), so a profile can't be renamed or
  deleted from here either.

### Proposed solution

Two slices; the first is worth landing on its own.

**Slice 1 — a viewer context the rest of the app can read.** A `ViewerProvider` next to `AuthProvider`
(`src/components/authentication/authProvider.tsx` is the shape to copy) holding the selected viewer's
**uuid**, name and color, persisted under a single key and rehydrated on boot. The profile picker sets
it; `src/components/navbar/navbar.tsx:43` reads it from the context rather than `localStorage`; a
"Switch profile" item in the same dropdown clears it and routes back to `/`. A small guard on the
`/web/*` routes sends a viewer-less session to the picker instead of rendering a catalog nobody is
attributed to.

**Slice 2 — the PIN is asked for and verified.** When a viewer with `use_pin` is clicked, open a PIN
modal and call the API's verify endpoint (API #1, slice 2) before setting the context:

```
POST /v1/api/viewers/{uuid}/verify-pin   { "pin": "1234" }
```

The modal needs the states a real one has: pending, wrong PIN, and locked-out after N attempts, since
the server-side limiter from API #1 will start returning 429. Mark locked profiles in the picker with a
lock badge so the prompt isn't a surprise.

Worth doing in the same pass, since the picker is open anyway: a manage mode on the profile grid
(rename, recolor, delete), which needs `updateViewer`/`deleteViewer` added to `ViewersController` —
the API already has `PUT`/`DELETE /v1/api/viewers/{uuid}`.

### Alternatives considered

- **Keep sending the name.** Trivially editable from dev tools, not unique, and it orphans everything
  attached to it when a profile is renamed.
- **Pin the viewer into the access token.** Server-side work, and switching profiles then means
  reissuing a token; a client-held uuid plus the server's own ownership check is cheaper and keeps
  profile switching instant.
- **Ask for the PIN only on "sensitive" actions.** There are no sensitive actions in this UI yet, so
  this amounts to never asking.

### Notes

Coordinate the storage decision with API #1: if the API chooses a viewer-scoped `HttpOnly` cookie, this
issue's job shrinks to reading the active viewer back from the API instead of holding a uuid in the
client. Settle that before building slice 1 — it changes which half of the code is throwaway.

---

## 2. [Feature]: Continue Watching row and resume where the viewer left off

**Affected area:** Web client / player

### What problem does this solve?

Playback position is not stored anywhere, client or server. Closing a tab halfway through an episode
loses it: the next play starts at zero, on the same device and on any other. The player never reads a
position and never reports one — `VideoPlayer` builds its playlist and attaches `timeupdate` purely to
drive the skip-intro and next-episode buttons (`src/components/video/videoPlayer.tsx:119-161`).

The catalog has nowhere to put the answer either. `Movies` renders three rows — Recently Added,
Trending Now, All — and the "Trending" row is a random shuffle (`src/pages/web/movies/index.tsx:44-49`).
The row a streaming app opens with is the one it doesn't have.

### What this covers

The client half of API #2. This issue is blocked on that endpoint existing, and on #1 for the viewer
the progress is attributed to.

### Proposed solution

**Report.** A `useWatchProgress` hook wrapping the player that throttles writes to one every ~15s of
playback, plus a write on `pause`, on `seeked` and on playlist item change, and a final
`navigator.sendBeacon` on `pagehide` — not `beforeunload`, which doesn't fire reliably on mobile. Do
**not** write on every `timeupdate`: video.js fires it roughly 4×/s.

```ts
PUT /v1/api/viewers/{viewer_uuid}/progress
{ "content_uuid": "…", "season": 1, "episode": 2, "position_seconds": 1284.5 }
```

**Resume.** The details and season payloads carry the position back (API #2), so the player seeks on
`loadedmetadata` rather than before the source is ready, and only when the position is past a floor
(~10s) and short of the end. A "Resume from 21:24 / Start over" choice on the title page beats a silent
seek — a silent seek is indistinguishable from a bug when it's the wrong one.

**Surface.** A Continue Watching row at the top of the catalog from
`GET /v1/api/viewers/{viewer_uuid}/continue-watching`, rendered with the existing `ContentRow`
(`src/components/video/videoCard.tsx:74-103`), and a progress bar strip across the bottom of
`SingleCard` and of the episode cards in `src/pages/web/player/index.tsx:37-55`. The row is empty for a
fresh profile, so it has to be hidden rather than rendered empty.

### Alternatives considered

- **Store positions in `localStorage`.** Works offline and needs no API, but it's per-browser: no
  handoff between the TV and the phone, and it's gone when site data is cleared. It also can't feed a
  Continue Watching row that the viewer expects to follow them.
- **Write progress only on `pagehide`.** One request per session, but a crashed tab, a killed mobile
  browser or a lost connection loses the whole session's progress.
- **Derive "where I was" from a local history of played URLs.** Gives a recently-played list without
  any API work, but no position, so the resume problem stays.

### Notes

`sendBeacon` cannot set an `Authorization` header. If the API keeps viewer identity in a header, the
last and most valuable write can't carry it — see the same note in API #1. Worth settling before this
is built, not after.

---

## 3. [Feature]: Watched markers and a "play next unwatched" entry point

**Affected area:** Web client / player

### What problem does this solve?

Nothing in the UI distinguishes a title you finished from one you have never opened. The episode grid
(`src/pages/web/player/index.tsx:140-149`) renders every episode identically, so returning to a show
after a week means remembering by hand where you stopped, and the Play button on the hero and on every
card always starts the first item (`src/components/video/videoCard.tsx:62-67`).

Resume (#2) answers *where* inside a title; this answers *whether*, and the list views need that answer
on every card, not just on the one being played.

### Proposed solution

Reads the `completed` flag that API #3 exposes, so this is mostly presentation and controls:

- **Markers.** A check badge on finished cards and episode thumbnails; a dimmed poster for watched
  items in a row; an "N episodes left" badge on a series card, counting only episodes whose conversion
  `status` isn't `In-Progress` — the dashboard already treats that status as "not ready"
  (`src/pages/admin/catalog/list.tsx:86-90`).
- **Manual override.** A hover/long-press menu on a card with Mark as watched / Mark as unwatched, and
  the same for a whole season from the season tab. Un-marking has to clear the position too, or the
  title comes back in Continue Watching at 94%.
- **Play next unwatched.** The Play button on a series resolves to the first unwatched episode of the
  lowest season with one, falling back to S1E1. The player's `ended` handler currently advances with
  `playlist.next()` (`src/components/video/videoPlayer.tsx:183-187`), which is right for autoplay within
  a season but doesn't know about watched state — once this lands, "next" and "next unwatched" should
  agree.

Fetch the flags in bulk for a list view (one request per grid, not one per card) and fold them into the
details response where the API already returns them.

### Alternatives considered

- **Infer watched purely from a progress percentage.** No way to mark something you watched elsewhere,
  and no way to un-mark a title the player finished while you were asleep.
- **Keep watched state client-side.** Same objection as #2: it doesn't follow the viewer to another
  device, which is most of the point.

### Notes

Small but worth getting right: markers on a shared TV profile are read by several people. Make the
"mark whole season" action confirm, because the undo path is clicking twenty episodes.

---

## 4. [Feature]: Page through the whole catalog instead of the first 20 items

**Affected area:** Web client / player

### What problem does this solve?

`GET /v1/api/videos/{vtype}/list` is paginated — `page` and `per_page`, **default 20**, max 100 — and
returns a `pagination` object with `total` and `total_pages`. The UI sends neither parameter and reads
neither field:

```ts
async listVideosByType(type: string) {
    return await this.api.get(`/videos/${type}/list`)   // src/controllers/catalogController.ts:15-17
}
```

Both consumers then treat the first page as the whole library — the web catalog
(`src/pages/web/movies/index.tsx:16-22`) and the dashboard table
(`src/pages/admin/catalog/list.tsx:25-39`). With 21 movies, one of them is unreachable from the UI and
nothing says so. The dashboard table even paginates *client-side* over those 20 rows, which makes the
footer read "1-10 of 20" on a 500-title library.

The search box compounds it: `SearchTable` filters the array it was handed
(`src/components/searchTable/index.tsx:15-21`), so searching the dashboard searches the first 20 rows.

### Proposed solution

- `listVideosByType(type, { page, perPage })` passing both as query params, and return the
  `pagination` block to callers instead of only `data`.
- **Dashboard:** server-side pagination on the Ant table — `pagination={{ current, pageSize, total }}`
  plus an `onChange` that refetches. `SearchTable` needs a mode where filtering and paging are delegated
  to the caller rather than done over `dataSource`.
- **Web client:** infinite scroll on the "All Movies" / "All TV Shows" row using an `IntersectionObserver`
  on a sentinel at the end of `stream-row-scroll`, requesting the next page as the viewer scrolls right.
  The curated rows (Recently Added, Continue Watching) stay single-page.
- Keep `per_page` at 20 for the web rows and raise it for the dashboard (50) — the table is a working
  surface, the rows are a browsing one.

### Alternatives considered

- **Request `per_page=100` and keep everything client-side.** A one-line change that buys time, but it
  caps the library at 100 instead of 20 and ships 100 records to render ten cards. Reasonable as a
  stopgap in the same PR, not as the answer.
- **Add an "unpaginated" API mode.** Pushes the problem to the server and gets slower as the library
  grows, which is exactly when it matters.

### Notes

This is a prerequisite for #5: a search box over one page of results is worse than no search box,
because it looks authoritative.

---

## 5. [Feature]: Make the navbar search real — catalog search, genre filters and a title page

**Affected area:** Web client / player

### What problem does this solve?

The viewer-facing navbar renders a magnifier and a bell that do nothing — no handler, no route, just
icons with `cursor: pointer` (`src/components/navbar/navbar.tsx:107-108`). There is no way for a viewer
to find a title by name, by genre or by year; the only navigation is Movies / TV Shows / Browse All
(`src/pages/web/home/index.tsx:6-19`) and horizontal scrolling.

The same gap shows up one level down: "More Info" on the hero links to exactly the same place as
"Play" (`src/components/video/videoCard.tsx:62-67`), so a movie has no page where its description, cast,
genres, rating and year can be read — all of which the API returns and the admin form collects
(`src/pages/admin/catalog/forms/movies.tsx:102-187`).

### Proposed solution

**Search.** Clicking the magnifier expands an input in the header (the Netflix pattern) and routes to
`/web/search?q=…`, debounced ~300ms — `src/components/searchTable/index.tsx:45-55` already has a
`debounce` helper worth lifting into a hook. Results render as a grid of `SingleCard`s, grouped by
movies and series, with an explicit empty state that names the query.

The API has no search endpoint today, so pick one of these and say which in the issue:

- client-side filter over the pages already fetched — only honest once #4 lands, and still partial; or
- open a matching issue on the API for `GET /v1/api/videos/search?q=` with a Mongo text index, and have
  the UI call it. This is the right end state, and the UI work is the same either way if the query goes
  through the controller.

**Filters.** Genre chips sourced from `GenresController.listGenres()` (already used by the admin form,
`src/pages/admin/catalog/create.tsx:65-75`) plus year and minimum-rating selects, with the state in the
URL so a filtered view can be shared and survives a refresh.

**Title page.** A `/web/title/:uuid` route rendering the hero, description, genres, cast, rating, year
and — for a series — the season tabs and episode grid that today only exist inside the player page
(`src/pages/web/player/index.tsx:112-151`). "More Info" points here; "Play" keeps going to the player.
This also gives #2 and #3 somewhere to put "Resume from 21:24" and the watched badge.

**The bell.** Either wire it to something real (finished conversions for the admin, new titles for a
viewer) or remove it. An icon that never responds trains people to distrust the rest of the header.

### Alternatives considered

- **A search page instead of a header input.** Fewer moving parts, but it's one more click from
  anywhere and doesn't match the icon that's already in the header.
- **Reuse the dashboard's `SearchTable` for the viewer UI.** A table is the wrong shape for a browsing
  surface, and it would drag Ant's table styling into the dark Netflix-style theme.

### Notes

Worth deciding in this issue whether the title page replaces the series landing view in the player page
or coexists with it. Keeping both means two components rendering the same season grid, which is how the
current duplication at `src/pages/web/player/index.tsx:127-151` and `:160-185` happened.

---

## 6. [Feature]: Subtitle and audio track selection in the player

**Affected area:** Web client / player

### What problem does this solve?

The player has no subtitle UI at all. The playlist items are built from a fixed set of fields — src,
poster, intro times, next-episode time (`src/components/video/videoPlayer.tsx:80-92`) — with no text
tracks, and video.js is initialised with `controls`, `responsive` and `fluid` only
(`src/components/video/videoPlayer.tsx:39-43`), so not even the native track menu appears. Deaf and
hard-of-hearing viewers have nothing, and foreign-language content is unwatchable unless it's dubbed.

### What this covers

The client half of API #4, which does the extraction and serving. Nothing here is useful until tracks
exist in the manifest or in the details payload.

### Proposed solution

- Read the `subtitles` array the API returns per movie/episode and attach each as a
  `<track kind="subtitles" srclang label>` via `player.addRemoteTextTrack`, or let video.js pick up
  `#EXT-X-MEDIA:TYPE=SUBTITLES` from the manifest where the backend declares them — prefer the
  manifest, and use the payload as the fallback for players that don't parse it.
- Enable the control-bar track menu (`SubsCapsButton`) and a caption settings panel, so font size and
  background are adjustable; the default white-on-transparent is unreadable over bright scenes.
- Default selection: forced tracks on automatically when the audio language differs from the UI
  language, otherwise off.
- **Remember the choice per viewer** — language and on/off — which hangs off the viewer context from #1.
  A viewer who needs subtitles needs them on every title, and re-selecting per episode is the most
  common complaint about players that get this half-right.
- While the track list is being plumbed through, do the same for multiple audio tracks: the menu, the
  default-language rule and the remembered preference are the same code.

### Alternatives considered

- **Rely on the browser's native track UI.** It exists for `<video>` but video.js replaces the control
  bar, so it's unreachable; and it can't be styled or defaulted per viewer.
- **Burn subtitles into the video during conversion.** Rejected on the API side (API #4) and for good
  reason: no language choice, no way to turn them off, and a full re-encode of every file.

### Notes

Once tracks exist, double-tap-to-fullscreen on mobile
(`src/components/video/videoPlayer.tsx:45-68`) and the dynamically appended skip buttons
(`:111-117`) will compete for the same taps as the track menu. Test on a phone before closing.

---

## 7. [Feature]: Uploads that survive navigation and don't restart from zero

**Affected area:** Admin dashboard

### What problem does this solve?

Adding content is one multipart `POST` built in the page component and awaited there
(`src/pages/admin/catalog/create.tsx:103-192`). For a TV show, **every selected episode goes into the
same request** — one `file` part per episode in a single body
(`src/pages/admin/catalog/create.tsx:114-121`). The only feedback is a percentage bar fed by axios
(`:48-52`, rendered at `src/pages/admin/catalog/forms/movies.tsx:230-237`).

So, uploading a season of 1080p episodes:

- **Navigating away kills it.** The request lives in a component; the upload dies with the route change
  and nothing warns beforehand.
- **One failure loses everything.** A dropped connection at 95% of a 12 GB body means re-uploading all
  twelve episodes, with no retry and no partial success — the handler has one `catch` that shows
  "An unexpected error occurred during the upload" (`:186-189`).
- **The progress bar is one number for the whole batch**, so there's no way to tell which episode is in
  flight, and 100% means "bytes sent", not "ready to watch" — conversion starts after that.
- The error branches call `response.json()` on an axios response (`:168`, `:181`), which is not a
  function — a non-2xx status produces a `TypeError` instead of the intended message. Worth fixing in
  the same pass.

### Proposed solution

**Per-file requests with retry.** Send one request per episode instead of one for the batch, sequenced
with a small concurrency limit, each with its own progress, status (queued / uploading / converting /
failed) and a Retry button on the failed ones. This alone removes the all-or-nothing failure and is a
contained change to `handleUpload`.

**Move the upload out of the page.** An `UploadProvider` holding the queue, so navigating within the
dashboard doesn't cancel anything, plus a compact progress widget in the layout and a
`beforeunload` guard while transfers are in flight.

**Then make it resumable.** Chunked upload with a stable upload id, so a retry continues from the last
acknowledged chunk rather than byte zero. This needs an API change (initiate / put-chunk / complete, or
a `Content-Range` upload endpoint) — open the matching issue on the backend repo and keep the client
behind the same controller method so the switch is one implementation change.

**Close the loop with conversion.** After upload the item sits in the queue with `status: In-Progress`;
the uploader should keep showing it until the status flips, which is the same polling #8 needs.

### Alternatives considered

- **Raise the proxy/body limits and leave it as one request.** The production nginx already caps bodies
  at `client_max_body_size 2048M` (`config/default.conf:7`), which a single-request season upload blows
  through — but raising it doesn't help a connection that drops at 95%, and per-file requests fit under
  the existing limit without touching it.
- **A third-party resumable client (tus, Uppy).** Solid and well-tested, and worth considering — it
  pulls in a dependency and a server component, so it's a reasonable call either way. Decide in the
  issue rather than drifting into a hand-rolled protocol.
- **Ask admins to drop files on the server and import by path.** Fine for a homelab, useless for a
  remote install, and it's a different feature (watch folders) rather than a fix for this one.

---

## 8. [Feature]: Dashboard home — library overview and a live conversion queue

**Affected area:** Admin dashboard

### What problem does this solve?

The dashboard home is a placeholder:

```tsx
export const Home: React.FC = () => (
    <MainBlock><h1>Home</h1></MainBlock>   // src/pages/admin/home/index.tsx:4-10
)
```

It's the landing page after an admin logs in (`src/components/authentication/authProvider.tsx:87-88`),
and it answers nothing: how many titles exist, how much is still converting, whether anything failed.

Conversion state is the sharper gap. A freshly uploaded item shows `In-Progress`
(`src/pages/admin/catalog/list.tsx:86-90`) and the only way to learn it finished is to click the reload
button and re-read the table (`:143`). Meanwhile the API exposes `GET /v1/api/videos/queue/info`,
`POST /v1/api/videos/queue/start` and `POST /v1/api/videos/queue/cleanup` — **none of which this UI
calls**. There is no queue controller method at all
(`src/controllers/catalogController.ts`). A stalled worker is invisible from the dashboard.

### Proposed solution

**A `QueueController`** with `info()`, `start()` and `cleanup()`, and a `useQueueInfo` hook polling
`info` every ~5s while the tab is visible (`document.visibilityState`, so a backgrounded dashboard
stops hammering the API).

**Home becomes an overview:**

- Counts: movies, series, episodes, genres, cast, viewers — from the `pagination.total` that #4 starts
  reading, not by counting rows on the first page.
- A queue card: jobs pending / running / failed, the item currently converting, and buttons for Start
  worker and Clean up finished jobs (both confirmed — `cleanup` drops job history).
- Recently added, as a short table linking into the catalog.

**And the catalog table stops needing a human refresher:** while any row is `In-Progress`, poll and
update those rows in place; stop polling when none are left. The existing reload button stays for
manual use.

### Alternatives considered

- **Leave Home empty and put the queue in the Catalog page.** The queue genuinely belongs near the
  catalog, but Home is where admins land, and an empty landing page is its own problem.
- **Server-sent events or a websocket for queue state.** Nicer than polling and no busy-wait, but it's
  an API-side change; polling a snapshot endpoint that already exists is the cheap first version, and
  the hook is the only thing that changes later.
- **Show counts from `listCatalog()`.** It fetches full records to produce a number, which gets slower
  exactly as the number gets interesting.

### Notes

`queue/start` and `queue/cleanup` are authenticated writes with real effects on the worker. Gate them
behind the admin role check that `ProtectedRoutes` currently has commented out
(`src/components/authentication/protectedRoutes.tsx:18-21`) rather than assuming anyone reaching
`/dashboard` is an admin.

---

## 9. [Feature]: Handle expired sessions and API failures in one place

**Affected area:** Login / authentication

### What problem does this solve?

Authentication is only checked once, when `AuthProvider` mounts
(`src/components/authentication/authProvider.tsx:45-77`). After that, an expired token produces 401s
that nothing interprets: the shared axios client attaches a bearer token on every request and has **no
response interceptor** (`src/controllers/apiClient.ts:17-23`), so each page handles — or doesn't handle
— its own failure. The results differ per page:

- the web catalog shows "Nothing here yet", because the fetch has no `.catch`
  (`src/pages/web/movies/index.tsx:16-22`) — an expired session is indistinguishable from an empty
  library;
- the dashboard table logs to the console and renders an empty table
  (`src/pages/admin/catalog/list.tsx:36-38`);
- the player shows "Failed to load video" (`src/pages/web/player/index.tsx:84-88`), which at least says
  something.

None of them refreshes the token or sends the viewer back to `/login`, so the app looks broken until
someone reloads the page. `react-error-boundary` is in `package.json` and imported nowhere, so an
exception during render takes the whole app to a blank screen.

### Proposed solution

- **A 401 response interceptor** in `createApiClient`: on the first 401, call
  `/auth/token/refresh` once, replay the original request, and queue any concurrent requests behind
  that single refresh so ten parallel 401s don't fire ten refreshes. If the refresh fails, clear the
  session and redirect to `/login?from=<path>`.
- **Lift it into the auth layer** so the interceptor and `AuthProvider` share one notion of "the session
  ended" instead of each doing their own thing.
- **Distinguish empty from broken** in the three fetches above: an error state with a Retry button, not
  an empty state. One small `<LoadError onRetry/>` component covers all of them.
- **Wrap the routed areas in `ErrorBoundary`** from the dependency that's already installed, with a
  fallback that offers a reload and keeps the navbar — one for `/web`, one for `/dashboard`.

### Alternatives considered

- **Poll `/auth/check` on an interval.** Catches expiry eventually, wastes requests in between, and
  still doesn't recover the request that happened to fail first.
- **Refresh on a timer derived from the token's `exp`.** Reasonable and worth adding later, but it
  doesn't cover a token revoked server-side, so the 401 path is needed either way.
- **Let every page keep its own handling.** That's today, and it's why the same failure has three
  different appearances.

---

## 10. [Feature]: Automated tests for the parts that keep breaking

**Affected area:** Other

### What problem does this solve?

There is no test runner in `package.json` and not a single test file in `src/`. Every check is manual,
which is why the drafts in [`issues.md`](../issues.md) are mostly silent breakages that a test would
have caught at the keystroke: a prompt that only appears when a float lands exactly on an integer, an
env var that's documented and read by nothing, action buttons with no handler, a page that renders its
empty state because a piece of state was never set.

`CONTRIBUTING.md` asks for `npm run lint` and `npm run build`, which verify types and syntax. Neither
one can tell you the player never shows the episode.

### Proposed solution

**Vitest + Testing Library**, sharing the Vite config, with `npm test` and `npm run test:watch`. Then
cover the logic that has already gone wrong at least once, rather than chasing coverage:

| Target | What the test pins down |
| --- | --- |
| `timeToSeconds` (`src/components/video/videoPlayer.tsx:13-19`) | `""`, `"00:01:30"`, malformed input |
| Player button timing | The prompt appears for a `timeupdate` that skips the trigger second, and reappears on user activity |
| `Player` page (`src/pages/web/player/index.tsx`) | An episode URL renders the player, not the empty state — the bug in `issues.md` #1 |
| `AuthProvider` | One check per mount, exactly one refresh on failure, redirect when both fail |
| `apiClient` | The token is read per request, and a 401 triggers one refresh and one replay (#9) |
| `SearchTable` | Filtering and paging behave with server-side pagination (#4) |

**A Playwright smoke test** for the path no unit test covers: log in → pick a profile → open a title →
the player element exists and `currentTime` advances. Run it against the Docker Compose stack.

**Wire both into CI** — that's the workflow proposed in `issues.md` #8; this issue gives it something
to run beyond lint and build.

### Alternatives considered

- **Playwright only.** Closest to what a user does, but slow, flaky against a real media pipeline, and
  useless for pinning down a pure function like `timeToSeconds`.
- **Jest instead of Vitest.** Workable, but it means a second transform config next to Vite's for no
  gain in this project.
- **Keep testing by hand.** It's what produced the current list, and the list is twelve items long.

### Notes

Start with `timeToSeconds` and the `Player` page: they're the cheapest tests to write and they cover
two bugs already drafted. A suite that begins with mocked API clients and snapshot tests of Ant Design
markup gets deleted in six months.
