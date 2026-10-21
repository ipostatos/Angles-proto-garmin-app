# Angles — Garmin watch app

<img src="docs/screenshots/icon.png" width="72" align="right" alt="Angles launcher icon: a saw blade">

**Version 1.1.** A Connect IQ watch app (Monkey C) that puts the saw angles of
the selected holds on the wrist of the operator. No drawings or images, only
hold names and MAIN / STEFAN angles, one press per cut.

Target devices: **Instinct 3 AMOLED 45mm** (tested on the watch) and
**Fenix 6 Pro** (builds clean; the manifest also lists a few other Garmin
models).

<p align="center">
  <img src="docs/screenshots/flow-big-mode.png" width="860" alt="BIG MODE: open angle, cut (green), automatic jump to the next angle, missed angle (red)">
  <br><sub>BIG MODE: open angle → START (green) → automatic jump with a short buzz → a skipped angle turns red</sub>
</p>

## Why a watch

At the saw both hands are on the panel and the clamp. A phone has to be taken
out, unlocked and kept clean of sawdust; paper has no memory of what is already
cut. The watch is always on the wrist, readable at a glance, and has physical
buttons: the operator looks down, cuts, presses START once, and the next angle
is already on the screen.

## How it works at the saw

1. **Pick the job.** Select holds on the website and press **⌚ Send to watch**,
   or tick them on the watch itself.
2. **Open BIG MODE.** One angle per screen in large digits: the set-up
   (MAIN / STEFAN) on top, the hold name below, the position in the job at the
   bottom.
3. **Set the saw, cut, press START.** The screen turns **green**, stays green
   for a moment so the operator sees the confirmation, then the watch gives a
   **short buzz** and **jumps to the next open angle** by itself. A second START
   skips the wait.
4. **Out of order?** Marking an angle while a higher one of the same set-up is
   still open gives a **double buzz**, and the skipped angle shows **red
   (MISSED)**, so it is noticed at the saw and not at assembly.
5. **Done.** When the last angle is cut the watch gives one long buzz and shows
   **ALL DONE**.

Progress is saved on the watch after every press, so Back, leaving the app,
a phone call or a reboot never lose the job.

For the workshop side (what MAIN and STEFAN are, how edges above 45° are cut)
see [`../docs/CUTTING.md`](../docs/CUTTING.md).

## Screens

| Holds | BIG MODE | LIST | About |
|---|---|---|---|
| <img src="docs/screenshots/holds.png" width="200"> | <img src="docs/screenshots/big-open.png" width="200"> | <img src="docs/screenshots/list.png" width="200"> | <img src="docs/screenshots/about.png" width="200"> |
| Actions on top, then every hold with a checkbox. | One big angle, set-up and hold. | All angles, colored; the focus also jumps after a cut. | Version and a short description. |

**Holds screen** (start screen):

| Item | What it does |
|---|---|
| **BIG MODE** · `N selected` | One angle per screen, large. |
| **LIST** | All angles of the selected holds as a colored list. |
| **RESET PROGRESS** | Asks *Reset progress?*, then clears the cut marks. Keeps the selected holds. |
| **RESET HOLDS** | Asks *Untick all holds?*, then unticks all holds. Keeps the cut marks. |
| **FROM PHONE** | Pulls the holds sent from the website. Shows `no phone / offline` if it fails. |
| **ABOUT** · `version 1.1` | Saw blade icon, version and a short description. |
| hold names | START ticks / unticks a hold (green box = picked). |

**Buttons everywhere:** UP / DOWN move, START selects or marks, BACK goes back.
Hold UP (MENU) jumps to the top of a list (in BIG MODE: back to the first angle).

**Order of angles:** MAIN high → low, then STEFAN high → low.

**Colors:** green = cut; red = missed (not cut, but a later angle of the same
set-up is already cut).

**Vibration:**

| Pattern | Meaning |
|---|---|
| one short buzz | angle cut, jumped to the next one |
| two short buzzes | you marked an angle while a higher one is still open |
| one long buzz | every angle of the job is cut |

All screens are drawn by the app itself (no system menus), so the Instinct 3
round subscreen never covers a row.

## Send to watch

1. On the website select holds and press the **⌚** button next to the print icon.
2. The server stores that selection (`POST /api/watch`, table `watch_selection`).
3. When the app starts (or on **FROM PHONE**) the watch calls `GET /api/watch`
   through the phone (Garmin Connect app + Bluetooth must be on). A *new* send
   replaces the picked holds and clears the cut marks; the same send is not
   applied twice. The fresh catalog is cached too.

Without the phone the app works on what it saved last time.

### `/api/watch` response

```json
{ "r": 7, "h": [["Amon", [24.7, 39.8], [32, 39.8]], ...], "s": ["Amon"], "t": 1790939847 }
```

`h` — catalog rows `[name, [main], [stefan]]` (no images, ~3.5 KB);
`s` — hold names sent from the web; `t` — send time in unix **seconds**
(fits a Connect IQ 32-bit Number).

## What changed in 1.1

- **Auto-advance:** after START the angle stays green for 0.7 s, then a short
  buzz and an automatic jump to the next open angle (BIG MODE and LIST). If
  nothing is open after the current angle, the jump goes back to the first
  missed one.
- **ALL DONE** with a long buzz when the job is finished.
- **ABOUT** item with the version and a short description.
- **New launcher icon:** a saw blade with teeth instead of the angle sign.

## Build

Requirements: Connect IQ SDK (9.x tested) with the device files installed via
the SDK Manager, Java 17, and a developer key (`developer_key.der`). The key
and build output are **not** committed (`.gitignore`).

```bash
# 1. Optional: refresh the bundled offline catalog from production
node garmin/tools/build-catalog.mjs

# 2. Optional: redraw the launcher icon (Python + Pillow)
python garmin/tools/build-icon.py

# 3. Build (adjust SDK and key paths)
monkeyc -f garmin/monkey.jungle -d instinct3amoled45mm -o garmin/bin/angles-instinct3amoled45mm.prg -y path/to/developer_key.der
monkeyc -f garmin/monkey.jungle -d fenix6pro           -o garmin/bin/angles-fenix6pro.prg           -y path/to/developer_key.der
```

The bundled catalog (`resources/jsonData/catalog.json`) is only the fallback
for the very first start without a phone; after one successful sync the watch
uses its cached copy from the server.

## Install (sideload)

Connect the watch by USB and copy the `.prg` for your model to `GARMIN\APPS`.
Replace the file to update. Saved holds and progress are kept across updates.

## Files

| File | Purpose |
|---|---|
| `source/AnglesApp.mc` | App entry, version, catalog loading, sync with `/api/watch`. |
| `source/ScrollList.mc` | Shared full-screen list (focus row in the middle) + button delegate. |
| `source/HoldsView.mc` | Holds screen, its actions and reset confirmations. |
| `source/Progress.mc` | Ordered cut list, saved cut marks, missed detection, vibration, auto-advance timer. |
| `source/BigView.mc` | BIG MODE screen and buttons. |
| `source/AnglesView.mc` | Colored LIST view. |
| `source/AboutView.mc` | ABOUT screen. |
| `tools/build-catalog.mjs` | Writes the bundled catalog from `/api/state`. |
| `tools/build-icon.py` | Draws the saw blade launcher icon. |
| `docs/screenshots/` | Simulator screenshots (Instinct 3 AMOLED 45mm). |

## Notes from writing it in Monkey C

- **System menus were replaced by custom-drawn lists.** `Menu2` on the
  Instinct 3 reserves the round subscreen in the corner; drawing rows with
  `Dc` gives the full screen and lets the focused row sit in the middle.
- **Round screens need geometry.** Each row computes the chord of the circle at
  its height and shortens long hold names with an ellipsis so text never runs
  off the edge.
- **Number fonts have no degree sign.** BIG MODE draws the digits in
  `FONT_NUMBER_THAI_HOT` and the `°` separately in a text font.
- **Storage instead of state.** Cut marks are keyed by `saw|hold|angle` and
  written to `Application.Storage` on every press, so nothing depends on the
  app staying open.
- **Small payloads.** Connect IQ web requests go through the phone and must stay
  small, so `/api/watch` sends a compact array catalog (~3.5 KB) and a send
  time in seconds that fits a 32-bit Number.
