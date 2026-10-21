# Several operators, several watches

How Angles keeps the work of several sawyers apart, so nobody overwrites
somebody else's job or progress.

## The three layers

| Layer | Shared by | Stored | Who changes it |
|---|---|---|---|
| **Catalog** (holds, angles, drawings) | Everyone | Server | Admins |
| **Job** (holds sent with ⌚) | One **station** | Server, per station | Anyone with the workshop code or an admin |
| **Cut marks** (green / red) | One device | On the watch, or in the phone's browser | Whoever uses that device |

A **station** is whatever makes sense in your workshop: one per saw
(`Saw 1`, `Saw 2`) or one per person (`Tomek`, `Alessandro`). Each station has
its own job. Each watch is paired to exactly one station.

## Typical set-ups

**One saw, one operator.** One station, one watch. Same as before v2.0.

**Two saws, two operators, two watches.**

```
Station "Saw 1" ── job: Amon, Austin ──▶ watch A (Tomek)
Station "Saw 2" ── job: Base 15     ──▶ watch B (Alessandro)
```

Sending a job to `Saw 2` never touches `Saw 1`. Each watch keeps its own cut
marks.

**Two operators sharing one saw in shifts.** Either one station per person
(each sends their own job), or one station for the saw and both watches paired
to it. In the second case both watches receive the same job, but cut marks are
still separate per watch: they do not see each other's progress.

**One watch shared between people.** Pair it to the station of the saw, not of
a person. Cut marks live on the watch, so the next person continues where the
last one stopped (or uses RESET PROGRESS).

## Rules that prevent overwriting

1. **Jobs are per station.** The ⌚ button always asks which station; the last
   choice on that device is highlighted.
2. **A new job resets only that station's watches.** It replaces their ticked
   holds and clears their cut marks; other stations are untouched. The same job
   is never applied twice, so a watch that syncs again keeps its progress.
3. **Cut marks never leave the device.** Nobody can clear another person's
   progress from the website.
4. **Catalog edits by several admins are merged.** If two admins edit at the
   same time, the second SAVE combines both sets of changes. Only when both
   changed the same angle or hold differently does the app ask which version to
   keep. Every save is logged in HISTORY with the admin's name.

## Access for the team

| Person | Gets | Can |
|---|---|---|
| Operator | The **workshop code** | Open the catalog, work mode, print, send jobs to stations. |
| Admin | Own name and password | Everything above, plus edit the catalog, manage stations, pair watches, change the workshop code, see HISTORY. |

When someone leaves the team: set a **new workshop code** (SETTINGS) — every
operator device is signed out and needs the new code — and **unpair** their
watch.

## Checklist for a new operator

1. Give them the workshop code; they open the site once on their phone.
2. Decide the station (their saw or their name). Add it if needed.
3. Install Angles on their watch and pair it to that station
   ([`WATCH_SETUP.md`](WATCH_SETUP.md)).
4. Show them ⌚ → their station, then FROM PHONE on the watch.
