# Mental Maths

Offline arithmetic practice in a single HTML file. No build step, no dependencies, no
network calls. Open `index.html` in a browser, or use the hosted copy.

Everything is stored in the browser's `localStorage` under the key `mentalmaths.v1`.
Nothing is sent anywhere.

## What is in it

### Timed drills
60-second sprint, 2-minute run and endless practice, across easy / medium / hard, with
operation chips for `+`, `−`, `×`, `÷`, `×11` and `²`. Combo multiplier grows every five
correct answers (up to ×5), and timed modes add a bonus for remaining seconds.

Wrong answers are banked with counts, so the results screen lists what is worth practising
and a **Drill** mode replays only those. Answering a banked item correctly works it off
the list.

### Strategy Lab
Eight shortcuts, taught in three ways (`Worked example`, `Type every step`, `Reveal after`):

| Lesson | Method |
| --- | --- |
| Ends in 5 | `n…5² = n(n+1)` then write `25` |
| Numbers near 100 / 1000 | `(B−a)(B−b) = (B−a−b) ‖ ab` |
| Crosswise two-digit pairs | units, crosswise sum, tens |
| Subtract from a round number | `B − n = (B−1−n) + 1` |
| Multiply by 11 | add each digit to its right-hand neighbour |
| Square near a round number | `a² = (a−b)(a+b) + b²` |
| Multiply by 5, 25, 50 | `×5 = ×10 ÷ 2`, `×25 = ×100 ÷ 4`, `×50 = ×100 ÷ 2` |
| The 9 family | `×9 = ×10 − n`, `×99 = ×100 − n`, `+9 = +10 − 1` |

Each lesson tracks seen / correct / median time. The home screen names your slowest lesson
and flags whether you are under three seconds. A `Mixed` entry weights toward whatever is
weakest.

### First Facts
For younger children. Three tracks (addition, subtraction, multiplication), each a ladder of
rungs. The load-bearing property:

> **Every fact in a rung is built only from facts in the rungs below it.**

So `8 × 9` is not practised until `8 × 10` is solid, and it is presented as *80, take one 8
back*. `6 × 7` waits for `6 × 6 = 36` and is presented as *36 + 6*. A rung unlocks only when
every fact in it is "known", meaning right three times in about three seconds.

Sessions are ten questions, no clock (time is only reported at the end), roughly half
review and half new, and **never two similar facts in the same session** — `6 × 7` is never
beside `6 × 8`. A `Show me how` button reveals the working at any time; peeking is recorded
but not penalised.

## Why abacus is not the starting point

Mental-abacus research is genuinely split. A 3-year RCT of 204 children found real
arithmetic gains (Cohen's d ≈ 0.60), but a 1-year US classroom RCT of 180 found no
significant advantage for either year group, with first-graders struggling to translate
between abacus and numeral form at all. The moderator looks like spatial working memory, so
it is not universal. The protocols that work are 2 hours a week for 3–5 years with a trained
teacher.

What carries over is the soroban's representation: beads grouped in **fives** across
place-value columns. That is exactly the chunking structure that makes `6 × 7` and `8 × 9`
tractable, so the app draws a 5-bead visual for the groups on every First Facts question. It
delivers the mental model in five minutes a day instead of three years.

## The other research the design follows

- **Operand effect** (Campbell & Graham): facts containing 1, 2, 5 or 9 are intrinsically
  easiest, so those rungs come first.
- **Tie effect**: `6 × 6` is easier than `6 × 7`, so squares precede the off-diagonal.
- **Derived facts** (Woodward 2006): `6 × 7 = 6 × 6 + 6`, `8 × 9 = 8 × 10 − 8`.
- **Within-set interference** (Dotan & Zviran-Ginat 2022): similar facts presented in the
  same session interfere with each other. Hence the dissimilarity rule.
- **Retrieval practice beats restudy** (Ophuis-Cox et al. 2023): commit to an answer first,
  then see the working.

## Tests

```
npm test
```

309 assertions run against the real `index.html` with a stubbed DOM, covering:

- every generated question is arithmetically exact
- every fact in every rung is derivable from rungs below it, and every scaffold step lands
  on the true answer
- every strategy's generator honours its own precondition, and its rendered steps
  reconstruct the true answer
- sessions contain no duplicate and no interfering pair
- fact mastery, unlocking and save-file corruption recovery

The suites run against the shipped file rather than a copy, so they cannot drift from what
is served.

## Keyboard

| Key | Action |
| --- | --- |
| `Enter` | start, submit an answer, or advance |
| `Esc` | pause a timed game, or leave the Lab / First Facts |

## Licence

MIT
