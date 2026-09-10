This is a CLI blackjack game project built with TypeScript, in a pnpm workspace:

- `packages/blackjack` — `@doubledeck/blackjack`, the pure engine. No I/O, no DOM.
  `reduce(state, action) -> Step` is the entry point; `src/index.ts` re-exports everything.
- `apps/cli` — `@doubledeck/cli`, all presentation: game loop, alt-screen rendering, animations.
- `reference/prototype.html` — the original browser prototype the game was ported from.
  Not part of the build; do not edit it.

Commands (these are what CI runs):

    pnpm -r typecheck
    pnpm -r test
    pnpm --filter @doubledeck/cli dev    # launches the game

`pnpm --filter @doubledeck/cli dev` starts an interactive alt-screen program that will not exit on
its own. Do not run it without a way to terminate it, and do not leave it running for more than a
minute. `tsc --noEmit` and the vitest suites are safe to run on their own. Notify if this causes an
actual issue.
