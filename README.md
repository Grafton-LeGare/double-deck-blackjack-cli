# DoubleDeck Animated CLI Blackjack

[![CI](https://github.com/Grafton-LeGare/double-deck-blackjack-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/Grafton-LeGare/double-deck-blackjack-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)

**An animated CLI blackjack game built in TypeScript/Node:** play for fun or polish your skills against a ruleset of your choosing. 

## Download the Game

- [Windows (x64)](https://github.com/Grafton-LeGare/double-deck-blackjack-cli/releases/latest/download/cli-blackjack-windows-x64.exe)
- [macOS (Apple Silicon)](https://github.com/Grafton-LeGare/double-deck-blackjack-cli/releases/latest/download/cli-blackjack-macos-arm64.tar.gz)
- [Linux (x64)](https://github.com/Grafton-LeGare/double-deck-blackjack-cli/releases/latest/download/cli-blackjack-linux-x64)

Because these builds are unsigned, each OS will object the first time. See instructions below:

### Windows 

Double-click to run. Windows SmartScreen will warn you on first launch. Choose **More info → Run anyway**. 

### macOS (Apple Silicon) 

Run the following:

 ```sh 
tar -xzf cli-blackjack-macos-arm64.tar.gz
./cli-blackjack-macos-arm64 
``` 

Gatekeeper will block the first run. Open **System Settings → Privacy & Security**, scroll to the bottom, and click **Open Anyway** next to the message about the blocked app (_note:_ this only appears after you've tried to run it once). Intel Macs are not currently supported.

### Linux 

Run the following:

```sh 
chmod +x cli-blackjack-linux-x64 
./cli-blackjack-linux-x64 
```

## Features

### From-scratch game engine built with pure TypeScript
Features a state reducer with no I/O and no external mutation — every transition is a function of the current state and the player's action — and a custom-built rendering & animation library. The engine models a real shoe game — insurance and even money, splits and re-splits, doubling after a split, surrender, cut-card penetration with dealer-to-dealer variance — and comes with a comprehensive test suite. 

Shuffling uses the Fisher–Yates algorithm, and the entropy it draws on is the engine's only non-deterministic step:

<img width="800" height="450" alt="DoubleDeckShuffleDemo" src="https://github.com/user-attachments/assets/99cf9f9c-347c-469c-a8d4-a69aa9391b3c" />

### Interactive game-board UI and custom animations
See the deal in real time, watch your hand separate in two on a split, and wait in suspense as the dealer takes their turn on-screen. Play a few games and see if you can get the special blackjack animation!

<br>

<img width="800" height="450" alt="DoubleDeckDealDemo" src="https://github.com/user-attachments/assets/85d4d972-d868-4962-b8c9-c27d0598cf30" />

<br> <br>

<img width="800" height="450" alt="DoubleDeckSplitDemo" src="https://github.com/user-attachments/assets/abacff57-fd2b-4a11-9d65-99c842dd7e56" />

<br>

### Adjustable settings with a keyboard-driven menu
Choose from a full list of blackjack rule settings, mirroring what you would find in real casinos. Animation speed can also be adjusted/toggled. Interaction uses stdin raw mode and color-highlighting for selections.

<img width="800" height="450" alt="DoubleDeckSettingsDemo" src="https://github.com/user-attachments/assets/e25affd2-3b7d-4547-9fdf-3dda9808d41e" />

## Running Locally

After cloning the project, startup is very simple. From the project root directory run:

```
pnpm install
pnpm start
```

For instructions on installing pnpm, see the [pnpm Installation Guide](https://pnpm.io/installation#using-a-standalone-script)

_Requires Node 24+_

## Project Layout

```
packages/blackjack/src/engine.ts    state reducer: dealing, splits, dealer play, settlement
packages/blackjack/test/            66 test cases against the engine, no user input needed
apps/cli/src/blackjack.ts           display, user input, animation, settings
```

## Testing and CI

An extensive suite of Vitest cases covers the reducer end to end — splits and re-split aces, payout arithmetic across
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
Learning to develop under strict type-safety constraints was quite a hurdle at first. Strict mode, combined with `noUncheckedIndexedAccess` required me to become well-versed in the safety measures enforced by TypeScript. I learned to reduce scope via extracted constants and thrown errors, destructure or map over array items in place of indexed access, and when and when not to use optional fields and parameters.

#### Logic First, then Presentation 
When I was first working on the app, I followed a pattern of writing logic → presenting it → writing more logic → presenting it. About halfway through, I came to the conclusion that it would be much faster to establish the underlying logic first, then get everything presented to the user. Not only would this keep my focus narrowed, but it would also lend itself better to my third learning below.

#### Testing Incrementally 
A major oversight I discovered when building the test suite was that the building of the test suite itself was something I could have done from the beginning alongside development of the cli app. Whenever I wanted to ensure that a new feature did what it was supposed to, or check to make sure I hadn’t broken something with my new changes, I would play the game myself, and without turning off any of the animations at that. I was building a deterministic game perfect for testing, and failed to take advantage of it until the end. When building any long project in the future, I’ll strive to build up testing and validation alongside the app incrementally, instead of slapping it all on at the end. 

<br>

_Released under the [MIT License](LICENSE)._
