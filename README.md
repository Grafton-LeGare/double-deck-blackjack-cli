# DoubleDeck Animated CLI Blackjack

[![CI](https://github.com/Grafton-LeGare/double-deck-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/Grafton-LeGare/double-deck-trainer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)

**An animated CLI blackjack game built in TypeScript/Node:** play for fun or polish your skills against a ruleset of your choosing. 

## Download the Game

- [Windows (x64)](https://github.com/Grafton-LeGare/double-deck-trainer/releases/latest/download/cli-blackjack-windows-x64.exe)
- [macOS (Apple Silicon)](https://github.com/Grafton-LeGare/double-deck-trainer/releases/latest/download/cli-blackjack-macos-arm64.tar.gz)
- [Linux (x64)](https://github.com/Grafton-LeGare/double-deck-trainer/releases/latest/download/cli-blackjack-linux-x64)

_Note to all users:_ 

Because this is an unsigned app with no public key/certificate, your operating system's security measures will attempt to block the game on its initial run. Bypass this on Windows by selecting ```More info > Run anyway```, or by going to the bottom of ```Privacy & Security``` in settings on Mac.

## Features

**From scratch game engine built with pure TypeScript —** features a pure TypeScript game-state reducer with a custom-built rendering & animation library. The engine models a real shoe game — insurance and even money, splits and re-splits, doubling after a split, surrender, cut-card penetration with dealer-to-dealer variance — and comes with a 66-case test suite. 

Uses the Fisher-Yates shuffle algorithm: the sole non-deterministic input to the engine.

**Interactive game-board UI and custom animations —** get dealt-in in real time, watch your hand separate in two on a split, and wait in suspense as the dealer takes their turn on-screen. Play a few games and see if you can get the special blackjack animation!

```
CLI Casino • H17 • DAS • RSA Allowed • BJ Pays 3:2
Playing hand 1/1

Dealer   [K♠] [??]      showing 10
You      [8♥] [7♦]      15             bet $25

  [H]it  [S]tand  [D]ouble
```

**Adjustable settings with a keyboard-driven menu —**  choose from a full list of blackjack rule settings, mirroring what you would find in real casinos. Animation speed can also be adjusted/toggled. Interaction uses stdin raw mode and color-highlighting for selections.

## Running Locally

After cloning the project, startup is very simple. From the project root directory run:

```
pnpm install
pnpm start
```

For instructions on installing pnpm, see the [pnpm Installation Guide](https://pnpm.io/installation#using-a-standalone-script)

_Requires Node 24+_

## Testing and CI

66 Vitest cases cover the reducer end to end — splits and re-split aces, payout arithmetic across
multiple hands, insurance and even money, dealer play under H17/S17, cut-card placement, and shoe
refreshes that must not redeal a card still on the table. GitHub Actions runs `pnpm -r test` and
`pnpm -r typecheck` on every push and pull request.

You can run the test suite locally by executing:

```
pnpm test
```

## Built With

* pnpm Workspaces
* Node.js
* TypeScript
* Vitest
* GitHub Actions

## Things I Learned

#### Developing with Type-safety 
Learning to develop under strict type-safety constraints was quite a hurdle at first. Strict mode, combined with ```noUncheckedIndexedAccess``` required me to become well-versed in the safety measures enforced by TypeScript. I learned to reduce scope via extracted constants and thrown errors, destructure or map over array items in place of indexed access, and when and when not to use optional fields and parameters.

#### Logic First, then Presentation 
When I was first working on the app, I followed a pattern of writing logic -> presenting it -> writing more logic -> presenting it. About halfway through, I came to the conclusion that it would be much faster to establish the underlying logic first, then get everything presented to the user. Not only would this keep my focus narrowed, but it would also lend itself better to my third learning below.

#### Testing Incrementally 
A major oversight I discovered when building the test suite, was that the building of the test suite itself was something I could have done from the beginning alongside development of the cli app. Whenever I wanted to ensure that a new feature did what it was supposed to, or check to make sure I hadn’t broken something with my new changes, I would play the game myself, and without turning off any of the animations at that. I was building a deterministic game perfect for testing, and failed to take advantage of it until the end. When building any long project in the future, I’ll strive to build up testing and validation along-side the app incrementally, instead of slapping it all on at the end. 

<br>

_Released under the [MIT License](LICENSE)._
