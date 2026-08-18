# Story Mode — Design

**Status: post-v1.** Nothing here gets built during the engine work. Section 9 lists the four small
things v1 must not preclude; everything else waits.

---

## 1. The thesis

Counting cards is a solitary, paranoid, unglamorous job. You sit alone doing arithmetic, you get
asked to leave, you drive to the next town.

**The game is about the people you meet doing it.** You win money, you lose casinos, you keep the
friends. That's the arc.

Tone: warm, dry, a little elegiac. The pleasures are small — a dealer who cuts deep, a diner at
4am, someone who understands what you do. Nobody gets rich. Closer to a road movie than a heist
film.

---

## 2. The design problem, stated plainly

A trainer needs honest deals and skill-based scoring. A story game wants dramatic pacing and
progression that feels earned. These pull against each other, and the usual resolution — quietly
rigging hands at narrative moments — would poison the thing that makes this app worth building.

**The rule: never rig a hand. Not once, not for drama, not for a tutorial.**

The story bends around the math instead. Everything below is built so that it can.

---

## 3. Comps are the currency, and they're variance-free

Real casino comps are calculated on **theoretical loss**: average bet × hands per hour × hours ×
house edge. Not on results. The house rates what you *should* lose.

Which means a counter gets comped like a whale while quietly winning. That's both the joke and,
conveniently, a progression currency with **zero variance** — computable exactly from data already
in the `hands` table.

```
comps earned = Σ(bet × house_edge × pace_factor) over hands played
```

So progression never depends on whether the cards ran well. You advance by putting in volume at a
rating — which is exactly what the real game rewards.

Comps buy: rooms, meals, show tickets, flights, and — more usefully — **information and favours**.
A host who likes you tells you which shift deals deepest. That's a comp with mechanical teeth.

---

## 4. Heat is the antagonist, not the house edge

You beat the house edge. That's arithmetic, and by the end of the trainer you're good at it. The
thing that actually ends careers is attention.

**Heat rises with:** spread ratio, session length, size of your win, how tightly your bets track
the count, repeat visits, whether the pit has seen your face, playing multiple hands at the top of
a shoe.

**Heat falls with:** flat betting, tipping, losing, time away, leaving before you're asked, a
different shift, a different look — and cover plays.

### Cover plays: spending EV to buy time

This is the mechanic the whole design hangs on.

A cover play is a **deliberately incorrect play** made to look like a tourist — standing on a
double, taking insurance, flat-betting a hot shoe. It costs you expected value. It buys you heat
reduction, which buys you more hands at that table.

So in story mode, **EV forfeited stops being purely a failure metric and becomes a resource you
spend.** The number the trainer taught you to drive to zero is now a currency with a genuine
trade-off, and the player has to learn when to spend it.

That's a real strategic decision, it's true to how the game is actually played, and it reuses the
scoring system from the trainer rather than bolting a new one alongside it.

**The trainer still grades you honestly.** A cover play is logged as `intent: 'cover'` — it counts
against session EV, as it should, but it doesn't count against your mastery map. You knew it was
wrong. That was the point.

---

## 5. Casinos are finite, burnable resources

Every casino has a lifespan. Play it well and it lasts months; play it greedily and it lasts a
weekend. Once you're backed off, that game is gone — long cooldown at best, permanent at worst.

This is what forces travel, and it makes game selection matter. The survey data becomes a map of
consumable resources with real trade-offs:

- **Boulder Station** — 75% penetration, $10 minimum, and a pit that backs off fast. Excellent
  game, short lifespan. Take what you can and go.
- **California** — 50% penetration, sleepy floor. Thin edge, but it'll be there next month.
- **South Point** — 26 tables, no double after split. Looks like a locals paradise, isn't.
- **Treasure Island** — the best rule set at a reachable minimum, on the Strip, under the most
  cameras in the world.

Learning to read that trade-off *is* the meta-skill the trainer can't teach. Here it's the map.

---

## 6. Time is the scarce resource

Hands played earn money, comps and heat. Hours spent with people earn none of those.

That's the whole tension of "make friends." Relationships cost the thing you need most, which is
what makes choosing them a decision rather than a reward. A friendship you never spend time on
decays, quietly, without a notification.

---

## 7. People

Each gives a mechanical benefit, but the benefit is not the point — it's the excuse to keep them
around long enough to matter.

| | Who they are | What they change |
|---|---|---|
| **The backer** | Stakes you, takes half | Halves your risk of ruin and your upside. Gets nervous when you're down, and their nerves become story pressure |
| **The old hand** | Barred in four states, serene about it | Teaches shuffle tracking, ace sequencing, deck estimation. Knows when to quit, which is the lesson you'll ignore |
| **The dealer** | Deals deep because she likes you | Better penetration at her table. It's a risk to her, and the game should make you feel that |
| **The host** | Rates you generously | Comp multiplier, and gossip about which properties are sharing data |
| **The floor supervisor** | Knows exactly what you are | Hasn't rung it in. Wants something. Not money |
| **The spotter** | Wants to run a team | Unlocks team play (section 8) |
| **The civilian** | No idea what you do | Nothing. That's the point — the one relationship with no mechanical value, and the emotional anchor of the run |
| **The investigator** | Works for the database | Recurring threat. Every property he visits after you gets harder |

The civilian having no mechanical benefit is deliberate. If every relationship pays out, the game
is teaching that people are instruments. This one isn't, and the player should notice.

---

## 8. Team play, late game

Once you've met the spotter, you can run two roles:

- **Spotter** — sit at a table, flat bet the minimum, count. Almost no heat, almost no EV. Signal
  when the shoe goes positive.
- **Big player** — wander in, bet large off someone else's count, wander out. Enormous EV, and
  because you never sit through a negative shoe, your bet pattern looks like a drunk on a hunch.

Mechanically this splits counting from betting across two seats, which is genuinely different to
play and is the actual reason team play beat casinos for decades. It also lets a player who's
mastered counting practice a completely different skill: acting.

---

## 9. What v1 must not preclude

Small asks. Don't build any of this now — just don't make it impossible.

1. **Keep the `events` table generic.** It already exists for count checks and peeks. Heat events,
   backoffs and narrative triggers are the same shape. Don't over-specialise it.
2. **Store bet per hand** — already in the schema. Theoretical loss and therefore comps are derived
   from it, so it must be exact, not bucketed.
3. **Casinos need mutable state eventually.** Right now they're static reference data. Leave room
   for a `casino_state` table (heat, visits, barred_at, known_faces) rather than assuming the
   casino record is immutable.
4. **Sessions are discrete visits, not one continuous stream.** The schema already models this
   correctly. Don't collapse it.

Also: add `intent: 'play' | 'cover'` to the `decisions` table when you get to M5. One column, and
it's what keeps cover plays from corrupting the mastery map later.

---

## 10. Structure

Chapters by region. Each teaches a different lesson and changes the antagonist.

1. **Vegas locals** — tutorial. $10 double deck, deep penetration, forgiving pits. Learn the count,
   meet your first friend. Boulder Station, Suncoast, Sunset Station.
2. **Downtown** — thinner games, sharper floors, and Jerry's Nugget at $5 when you're broke.
3. **The Strip** — the most money and the worst penetration, under the most cameras. Learn that the
   best-looking game isn't the best game.
4. **Reno and Tahoe** — old school, deep deals, small towns. Everyone knows your face in a week.
   Learn to leave early.
5. **The road** — riverboats, tribal rooms, strange local rules, CSMs appearing like weather.
6. **Atlantic City** — where the antagonist changes. New Jersey can't bar you for counting
   (*Uston v. Resorts International*), so instead they cap your bet and shuffle up in your face.
   A whole level about a different kind of hostility, grounded in real law.
7. **Abroad** — Macau, London, cruise ships. Different rules, different etiquette, no safety net.

Between chapters: driving, motels, diners, waiting. The game should be comfortable being quiet.

---

## 11. Failure states

- **Bust out.** Overbet your bankroll and risk of ruin does what the math says it will. Honest,
  and it teaches Kelly better than any tutorial.
- **Burn out.** Barred everywhere in a region. You're not broke, you're just done here.
- **Lose the friends.** Play every available hour and they drift. No dramatic scene, no warning —
  you just notice they've stopped calling.

The third is the one the game is actually about.

---

## 12. Open questions

1. **Narrative-heavy or systemic?** Authored scenes and dialogue, or emergent relationships driven
   by a simulation? The second is far cheaper to build and fits the road-movie tone; the first hits
   harder. A hybrid — authored characters, systemic availability — is probably right.
2. **Run length.** A campaign of 20 hours, or roguelike runs of 90 minutes? Burnable casinos and a
   bust-out fail state suit runs. The friendship arc suits a campaign. This is the biggest
   unresolved decision and it shapes everything else.
3. **How dark does the legal slope get?** Counting is legal. Hole carding is grey. Marking cards is
   a felony. There's genuine drama in that gradient, and a decision about whether the game offers
   the player a way down it.
4. **Does the trainer live inside the story, or beside it?** Drill mode as a diegetic activity —
   practising in a motel room — is elegant, but forcing story progression through drills would
   make it homework.
5. **Art direction.** Everything so far has been designed around a felt-and-cut-card visual
   language. Story mode needs places, faces and weather, which is a much larger production
   question than anything in the build plan.
