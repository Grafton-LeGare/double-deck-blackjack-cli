# Double-Deck Trainer — Build Plan

A blackjack card-counting trainer for double-deck games. Working single-file prototype exists
(`reference/prototype.html`) — this plan ports it to React + Python and sets it up to become a
desktop game on Steam and, later, a mobile app.

**v1 scope: straight port.** No new features. The point of v1 is to get the architecture and the
test harness right, because both are expensive to retrofit.

**Longer term this is a platform** — video poker, sports betting, other advantage play — and a
story mode wraps it (`STORY-MODE.md`). Section 6a covers what that means for v1: three cheap
decisions, and an instruction not to build the abstraction yet.

**Build order: engine and tooling first, UI last, hosted service last of all.** There is no React
in this plan until phase 3. The play-test interface is a CLI (section 7a) — it costs nothing to
throw away and doubles as the test harness.

---

## 1. The one rule that makes everything else work

> The game engine is a pure TypeScript package. No DOM, no React, no network, no filesystem,
> no `Date.now()`, no bare `Math.random()`. Deterministic given a seed.

Everything else — React UI, Tauri shell, mobile shell, the Python sim harness — is a consumer of
that package. Get this right and the shell choice stays reversible, which matters because you're
targeting three platforms and shouldn't have to commit to all of them now.

If a pull request adds an import from `react` or `window` into `packages/engine`, reject it.

---

## 2. Architecture

```
                    ┌─────────────────────────────┐
                    │   packages/engine  (TS)     │
                    │  shoe · dealing · strategy  │
                    │  indices · counting · EV    │
                    │   pure, seeded, no I/O      │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
      ┌───────▼───────┐    ┌───────▼───────┐    ┌───────▼───────┐
      │  apps/web     │    │ apps/desktop  │    │ apps/mobile   │
      │  React + Vite │    │ Tauri (Steam) │    │ Tauri v2 iOS  │
      │   (v1 target) │    │    (later)    │    │  /Android     │
      └───────────────┘    └───────────────┘    └───────────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │  optional, never required
                    ┌──────────────▼──────────────┐
                    │   services/api  (FastAPI)   │
                    │  content · sync · leaderbd  │
                    └─────────────────────────────┘

        ┌──────────────────────────────────────────────┐
        │  tools/sim  (Python)  — build time, not ship │
        │  generates strategy JSON · runs EV sims ·    │
        │  independent oracle that cross-checks the TS │
        └──────────────────────────────────────────────┘
```

### Where the server does and does not belong

**Never server-side.** Dealing, grading a decision, running count, true count, count checks,
drills, bet grading. All instant, all offline, all on-device.

**Legitimately server-side, later.**

| Feature | Why it wants a server | Offline fallback |
|---|---|---|
| Casino survey data | Rules change monthly; shipping them static means an app release per update | Bundled `casinos.json`, used until a newer version is fetched |
| Cross-device progress | The actual reason you'd want mobile + desktop | Local SQLite is the source of truth; sync is additive |
| Leaderboards | Comparing runs needs a shared store | Local personal bests |
| Custom index computation | A 3M-hand sim for an arbitrary rule set is too heavy for a phone | Ship precomputed sets for the common rule combinations |

**The rule:** every server feature degrades to a local fallback. If the API is down, or the player
is on a plane, or Steam is in offline mode, the trainer still works completely. Nothing behind a
login in v1 — not even optional.

### Leaderboards without server-authoritative gameplay

If you add leaderboards, don't move the engine to the server. Submit `{seed, ruleSetHash,
decisionLog, claimedScore}` and have the server replay the seed through the same engine to verify.
Cheap, batch, and it keeps play instant. This is the main reason determinism is in section 4.

---

## 3. Python's job

Python does simulation **and** progress work, as you wanted — just not inside the game loop.

**`tools/sim` (build time, never shipped to the client)**

1. **Generates the strategy data.** Basic strategy tables and index sets are emitted as JSON,
   consumed by the TS engine. One source of truth, in Python, versioned in the repo.
2. **Runs the EV harness.** House edge, EV-by-true-count, penetration comparisons, betting ramp
   evaluation. This is where the numbers in the UI come from.
3. **Is the independent oracle.** Implement basic strategy a *second* time, in Python, written
   from the published charts rather than ported from the TS. Then assert the two agree on all
   540 cells. Two independent implementations agreeing is real evidence; one implementation
   agreeing with itself is not.

**`services/api` (FastAPI, deferred past v1)** — content endpoints, sync, leaderboard validation,
on-demand index computation. Stub the client-side interface in v1 so it's a swap, not a rewrite.

**Python is never bundled into the client.** No PyInstaller sidecar, no embedded interpreter. That
path costs you build size, IPC complexity, code-signing pain, and antivirus false positives on
Windows, and buys nothing that generated JSON doesn't.

---

## 4. Determinism and seeds

Cheap now, impossible to retrofit. Required for replay, daily challenges, leaderboard validation,
bug reproduction, and deterministic tests.

- Seeded PRNG in the engine (xoshiro128** or PCG32 — small, fast, well-distributed). Not `Math.random()`.
- A shoe is fully described by `{seed, ruleSetHash, shuffleIndex}`.
- Penetration jitter draws from the same PRNG, so a "varies by dealer" game replays identically.
- Every session records its root seed. A bug report is then one number.

---

## 5. Repo layout

```
packages/
  core/            discipline-agnostic: bankroll, Kelly, sessions, scoring, mastery,
                   spaced repetition, heat. Knows nothing about blackjack.
  blackjack/       pure TS: shoe, hands, dealer, strategy, indices, counting, EV
    src/
    test/          golden tests live here
  data/            generated JSON (strategy tables, index sets, casinos) + TS types
apps/
  web/             React + Vite. v1 target.
  desktop/         Tauri shell. Steam. (later)
  mobile/          Tauri v2. (later)
services/
  api/             FastAPI. (later)
tools/
  sim/             Python: generators, EV harness, independent oracle
reference/
  prototype.html   the working prototype — port target and behavioural reference
```

Monorepo, pnpm workspaces. `packages/data` is generated — check the output in, but make CI fail if
regenerating produces a diff.

`packages/blackjack` rather than `packages/engine` is deliberate — see section 6a. It costs nothing
today and saves an ugly refactor later.

---

## 6. Data contracts

Define these first; they're the seams between the four codebases.

```ts
type RuleSet = {
  decks: 2
  h17: boolean
  das: boolean
  rsa: boolean
  maxHands: number
  surrender: boolean
  blackjackPays: 1.5 | 1.2
  penetration: number        // fraction of the pack dealt
  penMode: 'notch' | 'cutcard' | 'dealer'
}

type Casino = {
  id: string
  name: string
  area: 'locals' | 'downtown' | 'strip'
  rules: RuleSet
  minBet: number
  maxBet: number
  tables: number
  deal: 'pitch' | 'shoe'
  edgeOffTop: number
  note: string
  source: { survey: string; asOf: string }   // provenance is not optional
}

type StrategyTable = {                        // generated by tools/sim
  ruleSetHash: string
  hard:  Record<string, ChartCode[]>          // total  -> 10 upcards
  soft:  Record<string, ChartCode[]>
  pairs: Record<string, ChartCode[]>
}
type ChartCode = 'H'|'S'|'Dh'|'Ds'|'P'|'Ph'|'Rh'|'Rs'|'Rp'

type IndexSet = { ruleSetHash: string; system: 'hilo'; entries: Deviation[] }
```

Note `source` on `Casino`. The survey data has an as-of date and it goes stale; the UI must be able
to show the player how old the numbers are.

---

## 6a. Designing for more disciplines

The long-term plan is a platform: blackjack, then video poker, sports betting, and other advantage
play. That changes two decisions now and should change nothing else.

### How well they actually generalise

Honestly, not equally.

| | Shape of play | Shares with blackjack |
|---|---|---|
| **Video poker** | One decision per hand, perfect information, no time pressure | A lot. Memorise a table, execute fast, and the edge comes from game selection. Exactly solvable, so no simulation needed |
| **Poker** | Multi-street, opponent modelling | The meta-layer only |
| **Promotions / comp hustling** | Arithmetic on offers | The meta-layer, plus it's already half-built via comps |
| **Sports betting** | No hands at all. Line shopping, market timing, feedback in days | Almost nothing in the play layer |

Video poker is the natural second module. Sports betting is the hardest and should be last — it's
also the only one that genuinely *requires* the hosted service, since it needs live odds.

### The one abstraction that does hold

Every advantage play discipline has the same problem this document opened with: **results are too
noisy to measure skill**. And every one has a low-variance skill signal that stands in for them.

| Discipline | Skill signal |
|---|---|
| Blackjack | EV forfeited vs optimal play |
| Video poker | EV forfeited vs optimal hold — exactly computable |
| Poker | Chips lost to suboptimal actions vs a solver |
| Sports betting | Closing line value |

Closing line value is interesting: the sports betting world converged on it for precisely the
reason section 10 rejects bankroll — results take tens of thousands of bets to mean anything, so
they score whether you beat the closing number instead. Same problem, same solution, arrived at
independently.

So the platform contract is small:

```ts
interface Discipline {
  id: string
  legalActions(state): Action[]
  optimal(state): Action
  skillSignal(state, chosen): number   // deterministic, lower variance than results
  situationKey(state): string          // the mastery-map cell this belongs to
}
```

Implement `skillSignal` and `situationKey` and a module inherits EV scoring, the mastery map,
spaced repetition, history and progression for free. That's the whole platform.

### Do not build this yet

Write the interface down; don't implement it. An abstraction extracted from one example fits one
example. Build blackjack properly, build video poker second, then *extract* the contract from the
two of them — it will be different from the sketch above, and that's the point.

**What to do today instead**, all cheap:

1. **Name packages by discipline.** `packages/blackjack`, not `packages/engine`. Add
   `packages/core` for anything genuinely discipline-agnostic, and keep it empty until something
   earns its way in.
2. **Add `discipline` to `sessions`.** One column, `'blackjack'` for now. Retrofitting a
   discriminator across a populated history table is miserable.
3. **Keep blackjack vocabulary out of shared tables.** No `running_count` on `sessions`. Counting
   is a blackjack concept; video poker has no count and sports betting has no hands. Discipline
   specifics belong in a JSON column or a discipline-owned table.

### Why this fits the story

Each module is also a chapter. The old hand teaches shuffle tracking; someone in a Reno book pulls
you into sports; a machine player shows you what a full-pay Deuces machine is worth. New
disciplines arrive as narrative content and new mechanics at once, which makes the module roadmap
commercially coherent rather than a pile of unrelated mini-games.

---

## 7. Build order

Four phases. No UI work until phase 3, no hosted service until phase 4. Each milestone has an
acceptance criterion — don't move on until it passes.

### Phase 1 — Engine and tooling (no UI)

**M0 — Scaffold.** Monorepo, TS strict mode, vitest, ruff + pytest, CI running both suites.
*Accept:* `pnpm test` and `pytest` both green in CI on an empty suite.

**M1 — Engine core.** Cards, shoe, seeded PRNG, hand totals, dealing, splitting, dealer play,
settlement, Hi-Lo counting, true count.
*Accept:* determinism test passes (same seed → identical 10,000-hand transcript); property tests
from section 8 pass.

**M2 — Strategy data + oracle.** Python generators emit the strategy JSON; the engine consumes it;
the Python oracle is written independently from the published charts.
*Accept:* the 540-cell golden test passes against both implementations.

**M3 — Sim harness.** Python EV runner with confidence intervals.
*Accept:* flat-bet basic strategy converges on the published house edge within a stated CI.

**M4 — CLI play harness.** See 7a. This is the "simple play-test UI."
*Accept:* a full session can be played, replayed from seed, and dumped as a transcript.

### Phase 2 — Local services

**M5 — Persistence.** SQLite session store, versioned schema, platform-adapter file paths.
*Accept:* sessions survive restart; a v1→v2 migration round-trips on fixture data; a full session
replays from its seed and matches the stored cards exactly.

**M6 — Analytics, scoring and regrade.** Weak-spot queries over stored sessions — accuracy by hand
type, by true count bucket, by casino — plus EV-forfeited scoring (section 10) and
`trainer regrade`.
*Accept:* the queries answer "which plays am I worst at" from real session data; regrading a
session against a deliberately corrected strategy table updates its accuracy correctly and leaves
`action_taken` untouched.

M6 matters more than it looks. It's what proves the session schema is right, and the session schema
is exactly what the hosted service will eventually sync. Getting it wrong here is the expensive
mistake, not getting the API wrong later.

### Phase 3 — UI

**M7 — Minimal React.** Unstyled, functional: deal, act, settle, feedback, keyboard.
*Accept:* 50 hands playable, every decision graded correctly, no engine logic in any component.

**M8 — Parity port.** Count masking, count checks, peek penalty, drills, bet grading, stats,
casino presets with penetration jitter.
*Accept:* feature parity with `reference/prototype.html`; all 58 presets load and survive a
300-hand smoke run.

v1 ends at M8.

### Phase 4 — Deferred

Tauri shell, Steam, mobile, and the hosted service. Separate plan. Stub the client-side sync
interface during M5 so the service is a swap rather than a rewrite.

---

## 7a. The CLI play harness

The most valuable thing built in phase 1, and the reason no React is needed yet.

```
trainer play    --casino boulder-station --seed 42 --hands 500
trainer replay  --session 019a3f.. --from-hand 214
trainer verify  --seed 42 --hands 100000 --assert perfect-play
trainer sim     --rules h17,das --hands 3000000 --report ev-by-count
```

Why this before a UI:

- **It closes the loop for agentic development.** Claude Code can run `trainer verify` and see a
  failing assertion without a human clicking anything. An agent that can check its own work on a
  card engine is dramatically more useful than one that can't.
- **It's the regression harness.** `verify` plays perfectly against the engine's own strategy
  output and asserts 100% agreement. Any drift between the tables and the grader fails loudly.
- **Transcripts are the debugging primitive.** Given determinism, "hand 214 of seed 42 graded
  wrong" is a complete bug report. `replay --from-hand` reproduces it instantly.
- **Zero throwaway UI code.** The CLI survives into the repo as a permanent tool.

Transcript format: one line per decision — hand index, cards, upcard, running count, true count,
decks remaining, action taken, action expected, whether an index applied. Plain text, greppable,
diffable between runs.

## 8. Test plan

This section matters more than the rest of the document. The prototype had eight strategy errors
that looked completely plausible, and a bug where unsplittable aces stood on soft 12. Every one was
caught by tests, not by reading the code.

**Golden chart test (highest value).** All 540 cells — hard/soft/pairs × 10 upcards × H17/S17 —
asserted against the published tables, hand-transcribed into a fixture file. When a cell changes,
the diff tells you exactly which play moved. Do this before writing any UI.

**Cross-language agreement.** The Python oracle and the TS engine must return the same code for
every cell of every supported rule set. Written independently, from the charts, not ported from
each other.

**House-edge convergence, with a confidence interval.** Flat-bet basic strategy over N hands should
land on the published edge. *Report the CI and assert against it, not against a point estimate.*
In the prototype, 400k hands gave −0.459% and −0.698% on consecutive runs — the same code, just
noise. 3M hands gave −0.461% ±0.131%. A test that asserts a tight number at low N is a flaky test
that will teach the team to ignore failures.

**Determinism / replay.** Same seed produces a byte-identical transcript. Guard this hard; every
later feature depends on it.

**Property tests (fast-check / hypothesis).** Over random hands and rule sets:
- the engine never returns an action that `legalFor` says is illegal
- a settled hand's payout is in the set implied by its outcome
- running count over a full pack sums to zero
- decks remaining is always in `(0, 2]`
- no hand ever exceeds `maxHands`
- split aces receive exactly one card unless `rsa`

**Smoke run per casino.** Every preset loads, applies its rules correctly, and plays 300 hands
without an illegal action or a stall.

**UI.** Component tests for the play loop reducer. Skip visual regression in v1.

---

## 9. Hand history

Full hand history is a v1 requirement, stored locally in SQLite. Two design decisions matter more
than the schema itself.

### Do not rely on replay alone

The tempting design is to store only `{seed, ruleSetHash}` and regenerate every card on demand — 64
bytes per session instead of megabytes. Don't do it.

The moment the engine changes — a dealing fix, a different PRNG, a tweak to how penetration jitter
draws — every stored session replays into different cards. The history doesn't error; it silently
becomes fiction. And the engine *will* change: the prototype had eight incorrect strategy plays and
a bug where unsplittable aces stood on soft 12, all found well after it looked finished.

**Store facts. Keep the seed as a cross-check, not as the storage mechanism.** Record
`engine_version` alongside it, so a replay mismatch is a diagnosable event rather than a mystery.

### Store what you played *and* what was expected

Do not store `correct: true/false` as the only grading result.

When a strategy table gets corrected, decisions previously graded wrong become right. If all you
kept was a boolean, that history is unrecoverable and your lifetime accuracy number is permanently
wrong. If you kept `(cards, upcard, rc, tc, action_taken, action_expected, chart_code,
strategy_version)`, you can re-grade everything and the stats become retroactively true.

Ship `trainer regrade --strategy-version N` in M6. It's a small amount of code and it pays for
itself the first time a table is wrong — which, on the evidence so far, is likely.

### Schema

```sql
sessions(
  id TEXT PRIMARY KEY,          -- uuidv7: sortable, collision-free, sync-friendly
  started_at, ended_at,
  discipline,                   -- 'blackjack' for now; cheap today, painful later
  casino_id, rule_set_hash, rule_set_json,
  root_seed, engine_version, strategy_version,
  unit_cents, schema_version
)

shoes(
  id, session_id, shoe_index,
  seed, cut_card_position,      -- actual position after jitter, not the nominal setting
  cards_dealt, end_reason
)

hands(
  id, session_id, shoe_id, hand_index, dealt_at,
  mode,                         -- 'session' | 'drill'  — drill hands never touch scoring
  bet_units,
  rc_before, tc_before, decks_remaining_before,   -- denormalised: queried constantly
  bet_expected,                                    -- ramp target at that count
  dealer_upcard, dealer_cards, dealer_total,
  insurance_offered, insurance_taken, insurance_expected,
  outcome, delta_units
)

seats(                          -- one row per hand, more after a split
  id, hand_id, seat_index,
  cards, final_total, bet_units,
  doubled, surrendered, from_split, split_aces,
  result, delta_units
)

decisions(
  id, hand_id, seat_index, seq,
  cards, upcard,
  rc, tc, decks_remaining,
  action_taken,                 -- immutable fact
  action_expected,              -- grading output, recomputable
  chart_code, index_key, index_value, index_applied,
  ev_forfeited,                 -- cost of this decision in units; 0 when correct
  intent,                       -- 'play' | 'cover'  (see STORY-MODE.md §4)
  strategy_version
)

events(                         -- count checks, peeks, shuffles, backoffs
  id, session_id, ts, kind, payload_json
)
```

Everything is **append-only**. Never mutate a hand or a decision except via `regrade`, which only
touches the grading columns.

### Volume — measured, not estimated

Sampled over 200,000 hands at Boulder Station rules with a 1–8 spread: **1.31 decisions, 1.03
seats and 5.49 cards per hand**, 14.6 hands per shoe. At roughly 248 bytes per hand including
index overhead:

| Hands played | Full detail on disk |
|---|---|
| 10,000 | 2.4 MB |
| 100,000 | 24 MB |
| 1,000,000 | 237 MB |

A hundred thousand hands is a lot of serious practice and costs 24 MB. There is no storage argument
for throwing detail away. Revisit only past a million hands, and then with a retention policy that
rolls old detail into aggregates rather than deleting it.

### Why this makes sync easy later

Append-only rows with UUIDv7 primary keys means cross-device sync is a set union — no conflict
resolution, no coordinator, no last-write-wins. Two devices merge by inserting rows they don't
have. That property is free if the schema is append-only from the start and expensive to retrofit
if it isn't, which is most of why the schema is worth getting right in M5 rather than when the
service appears.

### Save format versioning

`schema_version` from the first write, with a migration function keyed on version. You will change
this schema, and by then there will be history worth keeping.

## 10. Progress and scoring

The product is a training app, so the scoring has to measure *skill*, not *outcome*. In blackjack
those two things are almost unrelated over any timescale a user will experience.

### Why the bankroll cannot be the score

Simulated: a **perfect** counter at Boulder Station rules, 1–8 spread, full indices, $10 unit,
4,000 sessions of 500 hands.

| | |
|---|---|
| Expected session result | +$150 |
| Standard deviation | $763 |
| Signal to noise | 0.20 |
| Sessions that lose money | 41.8% |
| Sessions down $300+ | 27.3% |
| 5th / 50th / 95th percentile | −$1,100 / +$160 / +$1,395 |
| Hands until results are 1 SD of evidence | 12,917 |
| Hands until 2 SD (~95% confident) | 51,670 (~517 hours) |

A player doing everything perfectly loses in 42% of sessions. Scoring on dollars would punish
correct play at random and reward mistakes at random. It is the single worst available metric.

### The primary metric: EV forfeited

Every decision has a computable EV. The difference between the EV of the action taken and the EV
of the optimal action is the **cost of that mistake, in units** — deterministic, zero variance,
denominated in money.

> **Score = EV forfeited per 100 hands, in dollars at the player's stake. Floor is zero.**

This is the number that goes on the home screen. It is what the player wanted from "dollars"
without the noise: it moves only when skill moves, it responds immediately, and it converts
directly to money at any stake.

It also fixes a flaw in raw accuracy. Not all errors cost the same — hitting 16 v 10 when you
should stand is worth a couple of hundredths of a unit; failing to split 8s against a ten is an
order of magnitude worse. A trainer that counts those equally teaches badly.

**Implementation.** v1 ships a static cost-of-error table at true count zero, generated by
`tools/sim` — good enough to rank mistakes correctly. Upgrade later to EV by (hand, upcard, true
count bucket), which the sim harness can precompute offline. Do not attempt exact per-composition
EV at runtime.

### Supporting skill metrics — all zero-variance

| Metric | What it captures |
|---|---|
| Playing accuracy, cost-weighted | Decision quality |
| Count integrity | % of checks exact, mean absolute error, drift per shoe |
| True count conversion | Deck estimation, graded separately from the running count |
| Bet ramp adherence | % of hands within one unit of the ramp target |
| Decision tempo | Median seconds per decision — hesitation is heat in a real pit |

Grade the running count and the true count conversion **separately**. They fail for different
reasons and need different drills; a player can hold a perfect running count and still misjudge
the discard tray.

### Where the bankroll does belong

Show it — but plotted against the expected-value line with a confidence band, never alone.

"You're down $340. Expected was +$85. You're inside one standard deviation, and your EV forfeited
was $2.10 per 100 hands — that's the number that says you played well."

Teaching that results and skill are decoupled over short samples is arguably the most valuable
thing this app can do, since that confusion is what actually empties bankrolls. Make it a feature
of the results screen rather than a disclaimer.

### The mastery map

The signature progress screen is the strategy chart itself, with every cell coloured by the
player's accuracy in that situation. The chart is already rendered; recolouring it by personal
performance turns the reference into the progress map. A second grid does the same for index plays
across true-count buckets.

Instantly legible, and it makes the next thing obvious.

### Spaced repetition — the actual Duolingo loop

Duolingo's engine is resurfacing what you get wrong. Here that means biasing the deal toward the
cells you're weak in. This is the payoff for storing full hand history.

**Two modes, and the separation is load-bearing:**

- **Drill mode** — the deal is rigged toward weak cells. Dense reps on the plays you fail. This is
  the lesson.
- **Session mode** — an honest random shoe, nothing rigged. This is the exam, and only these
  hands count toward EV forfeited and the mastery map.

If drill hands contaminate session statistics, every metric in this section becomes meaningless.
Tag them at write time in the `hands` table.

Add **mastery decay**: a cell untested for several weeks fades and resurfaces. Skills rust,
particularly index plays at counts you rarely see.

### Progression

Skills unlock in acquisition order, each with its own accuracy gate:

1. Basic strategy, no counting
2. Running count
3. True count conversion
4. Deviations
5. Bet ramp
6. Tempo (decision timer)
7. Realistic conditions — variable penetration, mid-shoe entry, backoff pressure

### Gamification to avoid

Award XP for correct decisions weighted by difficulty, or for EV preserved — **never for hands
played**, which rewards grinding over accuracy.

And no variable-reward mechanics: no loot boxes, no random bonuses, no spin-to-save-your-streak.
An app whose entire thesis is *ignore short-term results and follow the math* should not run on
the psychology it's teaching people to resist. Beyond the ethics, it reads as more credible for a
Steam listing in this genre.

## 11. Cheap now, expensive later

Worth doing in v1 even though v1 is "just a port," because retrofitting each of these is a
rewrite:

- **Seeded RNG** (section 4).
- **All user-facing strings in one module.** Not i18n yet — just don't scatter literals through JSX.
- **Keyboard-first input, no hover-only affordances.** Steam Deck and mobile both need this.
- **Layout readable at 1280×800 and at 390px wide.** The Deck's native resolution and a phone.
- **No telemetry.** Adding it later is a decision; removing it later is a news story.
- **Save/settings paths behind a platform adapter.** localStorage on web, app data dir on desktop,
  Steam Cloud later — one interface, three implementations.

---

## 12. Deliberately deferred

Not v1, but the architecture should not preclude them:

- Tauri shell, Steamworks, achievements, cloud saves
- Mobile build
- Counting systems beyond Hi-Lo (the engine should take the tag values as data, not hardcode them)
- Six-deck and single-deck games (`decks` is already in `RuleSet` — don't hardcode 2 anywhere)
- Game layer: bankroll campaign, casino unlocks, heat/backoff mechanics. The survey's
  "quick to back off" flags are sitting there as an obvious mechanic. Don't build it, but don't
  make the session model assume there's no such thing as being asked to leave.

---

## 13. Handing this to Claude Code

Suggested opening sequence. Do not let it start with the UI.

1. Drop `prototype.html` into `reference/` and this file into the repo root.
2. "Read `BUILD-PLAN.md` and `reference/prototype.html`. Scaffold M0 only. Stop and show me the
   layout before writing any engine code."
3. "Implement M1. `packages/engine` must have zero imports outside its own package. Write the
   determinism and property tests first, and show me them failing."
4. "Transcribe the two Wizard of Odds double-deck charts into a fixture file, then implement M2
   against it. The Python oracle is written from the charts, not ported from the TS engine."
5. "Build M4, the CLI harness, before anything else. From here on, every change you make must be
   verifiable by running `trainer verify`."
6. Then M3, M5, M6 — and stop. Do not start React until I say so.

Give it the acceptance criterion for each milestone as the definition of done, and make it show you
the failing test before the fix. If it starts scaffolding components during phase 1, stop it.

---

## 14. Open questions

1. **Web build — ship it or not?** It's the fastest path to v1 and the natural dev target, but a
   free browser version undercuts a paid Steam release. Options: web stays internal as the dev
   harness, or ships as a demo with the campaign layer desktop-only.
2. **Mobile shell.** Tauri v2 covers iOS/Android from the same React code and keeps one codebase.
   Capacitor is more mature for mobile specifically. Decide when mobile becomes real, not now —
   the engine package makes it reversible either way.
3. **Steam positioning.** A pure trainer is a narrow store listing. What turns it into a game is
   the progression layer, and that decision shapes the session model more than anything in v1.
4. **When does the hosted service earn its place?** The honest trigger is a second device. Until
   you're actually running sessions on both a laptop and a phone, sync is speculative work. Let
   the need appear rather than designing for it.
5. **Survey data licensing.** The casino figures come from a third-party survey. Fine for personal
   use; check terms before shipping them in a commercial product, or source your own.
