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

### Times Tables
The back-of-the-book page, as a reference. Pick a table (1–12) and how far to go (20, 40 or
60), and it lists every multiple: `2 × 1 = 2`, `2 × 2 = 4`, `2 × 3 = 6`, out to `2 × 30 = 60`.

Each entry is colour-coded from the First Facts ladder — green means it already comes out in
about three seconds, yellow means it is still settling. So the table doubles as a progress
report: you can see exactly which multiples are automatic and which are not.

`Practise times n` starts a 60-second drill on that one multiplier, and the range of
questions follows the cap (2 times runs to `2 × 30`, 7 times stops at `7 × 8`).

### Abacus
A working soroban you can switch between **7, 9 and 13 columns**. The 5-bead sits above the
beam and is worth five; the four beads below are worth one each; a whole column is worth ten
times the one on its right. Fewer columns means bigger beads, so 7-column mode is sized for
small fingers. A dot marks every third column, the way a real soroban marks its unit rods.

**Count on your hands first.** A panel above the frame lights your fingers for whatever the
ones column is showing: left hand for 1-5, right hand for 6-10. This is the standard
recommendation for beginners — get the quantities 1-10 into the fingers before asking for them
on the beads, then check the frame agrees. The panel follows the steps, so during `243 + 35`
it shows the fingers for each ones digit as it happens.

Three things you can ask it to do, each narrated one move at a time under your control (no
auto-play, so a child decides the pace):

- **Show it** — `Show it` for 243 walks through clearing the frame, then puts 2 in the
  hundreds, 4 in the tens and 3 in the ones, one column per step. A digit of 5 gets its own
  step, showing only the big bead lit so the point is visible.
- **Add** — adds each column in turn, and isolates the big bead for any 5 so the shortcut is
  explicit.
- **Take away** — works across from the left, which is how an abacus is actually used, and
  borrows from the column on the left when a column runs out. Asking to take away more than you
  have is refused in plain language rather than producing a negative frame.

Free play is the default: tap any bead and the readout tells you what you are looking at.

### Records, and moving between devices
Progress lives in `localStorage`, which is per browser and per device — so it does **not**
follow her from the phone to the tablet on its own. **Records** solves that:

- **Due for review today** — how many facts the scheduler thinks are ready.
- **Save a backup** produces a single block of text, with **Copy** (clipboard, with an
  `execCommand` fallback for older Safari) and **Save file** (a `Blob` download, typed
  `application/octet-stream` because iOS Safari ignores `download` for text types).
- **Restore** accepts pasted text or a file, and **merges** rather than replaces: for every
  fact it keeps whichever copy is further along, so restoring an old backup can never undo
  newer progress. Totals take the larger value, personal bests take the maximum.

Backups are tagged with an app name and a version number. A file from another app, a
corrupt file, or one from a newer build is refused with a plain-English message instead of
corrupting the save.

### Spaced review
The single largest effect in the research (spaced vs massed retrieval, **g = 0.74**; Latimier,
Peyre & Ramus 2021) was completely missing from the first version. Every fact now carries a
schedule:

- The first clean answer leaves the fact due **the same day**, so it comes back once more
  before the day ends.
- Each further clean answer widens the gap: same day → 1 → 2 → 4 → 7 → 15 → 30 days.
- A wrong answer, or an answer she had to peek at, sends it back to the start.
- **Due for review** counts the facts whose gap has elapsed.

### Re-asking a wrong answer
Retrieval practice produces **no** learning when success is under 50% *and* no feedback is
given (Rowland 2014), so a wrong answer is no longer just marked wrong: the method is
revealed, and then **the same fact comes straight back** before moving on. It does not cost
a question number and does not count as a second attempt.

### Worksheets
Printable paper practice, generated from her own record, with a print stylesheet.

| Sheet | Why |
| --- | --- |
| **Review mix** | Mostly facts already marked known with a small new slice, random order, separate key. The best-evidenced practice design in the whole area (Rohrer et al. 2020 cluster RCT, d = 0.83). |
| **Fluency grid** | Every multiple of the chosen table once, shuffled, answer key on its own page. |
| **Cover & copy** | The most replicated fluency intervention there is: answers printed in a foldable column, about 9 known facts for every new one. |
| **Fact family** | The same four facts in a box, so the product and its inverse are stored together. Endorsed by the National Mathematics Advisory Panel. |
| **Area model** | 2-digit × 1-digit, split into tens and ones. All four boxes blank — printing the partial products gives the answer away. |
| **Counting up** | Subtraction with a number line, which levels subtraction with addition (Fuson's replicated finding). |

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

## Designing the abacus from the actual instrument

The frame follows the real thing rather than a simplified toy:

- **Rod count.** A soroban's rod count is always odd and never fewer than 7; 13 is the
  traditional standard and the Japanese federation's own beginner text uses 23. The picker
  offers 7, 9 and 13, defaulting to 13, so there is a wide frame to grow into without an
  unreadable one on a phone.
- **Unit rods.** Real sorobans mark every third rod with a dot. Those dots are shown, which
  quietly groups the frame in threes as well as fives.
- **The two hands.** Trained users touch only two fingers: the **right thumb** pushes the
  1-beads *up* to the bar, and the right index finger does everything else. The left hand is
  for carrying and borrowing. The captions state this, and subtraction narration assigns the
  borrowing to the left hand explicitly.
- **Direction.** On an abacus you work left to right, borrowing from the column on your left
  when you run out — not right to left as on paper. The first version of this app got that
  backwards and told the child to start on the right; it is fixed.
- **Hands before beads.** The strongest practical finding for beginners is to establish 1-10
  in the fingers *first* — left hand 1-5, right hand 6-10 — and only then move the same
  quantity onto the beads. That is what the hands panel does, and it tracks the ones column
  live during every step.
- **Complement tricks are left out.** Abacus traditions contain "10's complement" shortcuts
  that can make a subtraction correct on the frame while the written arithmetic underneath is
  not. Handbooks explicitly warn against teaching them. Nothing here teaches them.

Sources: [Soroban (Wikipedia)](https://en.wikipedia.org/wiki/Soroban),
[Basics of using the abacus (Sikana)](https://www.indianabacus.in/level1/images/Basics%20of%20using%20the%20abacus.pdf).

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

508 assertions run against the real `index.html` with a stubbed DOM, covering:

- every generated question is arithmetically exact
- every fact in every rung is derivable from rungs below it, and every scaffold step lands
  on the true answer
- the scaffold for any fact on any rung is a strategy, never a fallback to counting
- every strategy's generator honours its own precondition, and its rendered steps
  reconstruct the true answer
- sessions contain no duplicate and no interfering pair
- the abacus value model round-trips for 0–9999, and ~1400 additions and subtractions each
  land on the right number with every column staying in range
- all 13 columns render with the right bead order, unit dots land on every third column, and
  the hands panel lights the fingers for the **ones** column (not the biggest one)
- switching between 7, 9 and 13 columns never changes the number on the frame, and fewer
  columns always means bigger beads
- every times-table multiple is correct for all 12 tables against all three caps
- the table drill only ever asks the chosen multiplier
- the back-button router pushes and pops history correctly, and every view is reachable
- the review schedule widens the gap, caps at 30 days, resets on a wrong answer, and survives
  a save/load round trip
- a wrong answer is re-asked without costing a question or an attempt
- every backup is accepted or refused with a readable reason, and merging never loses facts
- every worksheet type is arithmetically correct, and the area model does not print its own
  answer
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
