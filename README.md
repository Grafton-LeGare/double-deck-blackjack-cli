# DoubleDeck Blackjack Trainer

A counting and strategy training game for double deck Blackjack.

## Project Status

- [x] **M0 — Scaffold:** Monorepo, TS strict mode, vitest, ruff + pytest, CI running both suites.

- [ ] **M1 — Engine core:** Cards, shoe, seeded PRNG, hand totals, dealing, splitting, dealer play, settlement, Hi-Lo counting, true count.
      
- [ ] **M2 — Strategy data + oracle:** Python generators emit strategy JSON; the engine consumes it; independent Python oracle
      
- [ ] **M3 — CLI play harness:** Simple play-test UI in the command line.
      
- [ ] **M4 — Sim harness:** Python EV runner with confidence intervals.
      
- [ ] **M5 — Persistence:** SQLite session store, versioned schema, platform-adapter file paths.
      
- [ ] **M6 — Analytics, scoring and regrade:** Accuracy by hand type/true count, EV-forfeited scoring, ``trainer regrade``.
      
- [ ] **M7 — Minimal React:** Functional web UI: deal, act, settle, feedback, keyboard.
      
- [ ] **M8 — Parity port:** Line-up features with prototype — Count checks, peek penalty, drills, bet grading, stats, penetration jitter.

<br>

_Copyright © 2026. All rights reserved. Not licensed for redistribution._
