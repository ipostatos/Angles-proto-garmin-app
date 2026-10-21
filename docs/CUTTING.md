# How the angles are cut

Angles is built for the workshop of **AVA Volumes**, which makes climbing
holds and volumes from plywood. Every hold is a set of panels, and the edges
of those panels are cut at bevel angles so the panels meet cleanly when the
hold is assembled. A single hold can need a dozen different angles, and a
production job is usually several holds at once.

## Two set-ups on one saw: MAIN and STEFAN

The blade of the saw tilts only from 0° to 45°. To cover every angle the
catalog needs, the workshop uses two clamping beams, and the catalog keeps a
separate angle list for each one:

| Set-up | What it is | Panel position | Angles |
|---|---|---|---|
| **MAIN** | The normal clamping beam of the saw. | Panel lies flat. | Up to 45°. |
| **STEFAN** | A clamping beam mounted on the saw that holds the blank **vertically**. | Panel stands on its edge. | Edges **steeper than 45°**. |

## Cutting angles above 45°

A blade that cannot tilt past 45° cannot cut, for example, a 60° edge on a
panel lying flat. The STEFAN beam solves this by turning the panel instead of
the blade:

1. The blank is clamped **upright** in the STEFAN beam.
2. Because the panel now stands at 90° to its normal position, the blade tilt
   is measured against the other side of the angle: the edge you get relative
   to the panel face is the complement of the blade tilt
   (`edge = 90° − tilt`; a 30° tilt gives a 60° edge).
3. So the whole range of steep edges is reached with the same 0–45° tilt the
   saw already has, with no special blade or extra machine.

The STEFAN column in the app lists the angles for this upright set-up, sorted
so that one set-up is finished before the next one starts.

## Why the order matters

Within a saw the list runs **from the highest angle to the lowest**. The blade
tilt then moves in one direction through the job instead of jumping back and
forth, and every panel that needs the current angle is cut before the tilt
changes again.

That is also why the app marks a **missed** angle in red: if a lower angle is
already cut while a higher one is still open, the operator has passed a setting
that will need the saw to be tilted back. The Garmin app catches this at the
moment of the press with a double vibration.

## Where the app helps

| Before | With Angles |
|---|---|
| Paper sheets with angle lists per hold. | One shared catalog on the web, edited by named admins with a change history. |
| Merging lists of several holds by hand. | Select holds, get one MAIN list and one STEFAN list, sorted. |
| Keeping track of what is already cut in your head. | Tick off each angle: on the phone (work mode) or on the wrist (Garmin app). |

See the [Garmin app README](../garmin/README.md) for how the watch is used at the saw.
