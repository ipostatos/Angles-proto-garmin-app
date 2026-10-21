# Garmin watch: setup and sync

Step-by-step guide to connect a Garmin watch to Angles, pair it to a station,
and keep it in sync. For several operators and several watches see
[`MULTI_OPERATOR.md`](MULTI_OPERATOR.md). For what the app does at the saw see
[`../garmin/README.md`](../garmin/README.md).

## What you need

| Item | Why |
|---|---|
| A supported Garmin watch | Tested: Instinct 3 AMOLED 45mm. Builds: Fenix 6 Pro, Instinct 3 (50mm, Solar 45mm), Fenix 7, Fenix 8 Solar 51mm, Forerunner 265 / 965, Venu 3, Vivoactive 5. |
| A phone with **Garmin Connect** | The watch has no internet of its own. Every sync goes watch → Bluetooth → Garmin Connect on the phone → HTTPS → Angles server. |
| Bluetooth on, phone online | Only during a sync. Between syncs the watch works without the phone. |
| The `.prg` file of Angles for your watch model | Built from `garmin/` (see [Build](../garmin/README.md#build)), or given to you by the admin. |
| A USB cable for the watch | To copy the app onto the watch (sideload). |
| An **admin** of your Angles site | Only an admin can pair a watch. |

## How sync works

```
 watch ──Bluetooth──▶ Garmin Connect (phone) ──HTTPS──▶ /api/watch ──▶ catalog + station job
   ▲                                                                        │
   └────────────────────── compact JSON (~3.5 KB, no images) ◀──────────────┘
```

1. When pairing starts, the server gives the watch a random **token**
   (32 characters) together with the code. The watch keeps the token in its own
   storage; the server only stores a SHA-256 of it.
2. Every request carries `Authorization: Bearer <token>`. An unknown token gets
   nothing: no catalog, no hold names.
3. **Pairing** ties the token to a **station** (a saw or an operator). An admin
   approves it with a 6-digit code shown on the watch.
4. After that, each sync returns the catalog (hold names and angles only) and
   the **job** last sent to that station. A new job replaces the ticked holds
   on the watch and clears its cut marks; the same job is never applied twice.
5. The catalog and the job are cached on the watch, so it keeps working when
   the phone is away, switched off or out of range.

A sync happens when the app starts and when you press **FROM PHONE**.

## 1. Install the app on the watch

1. Connect the watch to a computer with the USB cable.
2. Copy the `.prg` for your model into the `GARMIN\APPS` folder on the watch.
3. Disconnect. **Angles** (saw blade icon) appears in the watch's app list.

To update later, replace the file. Ticked holds, cut marks and the pairing are
kept.

## 2. Pair the watch to a station

On the website, as admin:

1. **ADMIN → SETTINGS → Stations and watches.** If there is no station yet,
   add one (for example `Saw 1` or the operator's name).
2. Under **Pair a watch** press **OPEN PAIRING (10 MIN)**. Watches can ask for
   a code only while this window is open.

On the watch:

3. Open **Angles**. On a new watch the item **FROM PHONE** says
   `not paired: press to pair`.
4. Select **FROM PHONE**. The **PAIR WATCH** screen opens and shows a
   **6-digit code** (it needs the phone connected to get one).

Back on the website:

5. Enter the code from the watch, pick the station, optionally give the watch
   a name (`Instinct Tomek`), press **PAIR**.

Back on the watch:

6. Within a few seconds the watch shows **PAIRED** and the station name, gives
   a short buzz and returns to the holds screen. **FROM PHONE** now shows the
   station name.

The code is valid for 15 minutes. If it expired, press START on the PAIR WATCH
screen to get a new one (pairing must be open).

## 3. Daily use

1. On the website select the holds of the job and press **⌚** (next to the
   print icon). Pick the station. Operators can do this with the workshop code;
   no admin needed.
2. On the watch open Angles (or press **FROM PHONE** if it is already open).
   The holds of the job are ticked and the cut marks are cleared.
3. **BIG MODE**: set the saw, cut, press START. The angle turns green, the watch
   buzzes once and moves to the next angle.

## Moving, replacing, removing a watch

| Task | Where |
|---|---|
| Watch goes to another saw / person | SETTINGS → the watch row → choose the other station. No re-pairing. |
| Watch lost or given away | SETTINGS → **Unpair**. Its token stops working at once. |
| New watch for the same person | Pair the new watch to the same station; unpair the old one. |
| Station no longer used | SETTINGS → **Delete** on the station. Its watches must be paired again. |

## Troubleshooting

| Watch shows | Meaning | What to do |
|---|---|---|
| `no phone / offline` | The request did not reach the server. | Phone near the watch, Bluetooth on, Garmin Connect running, phone online. Try FROM PHONE again. |
| `not paired: press to pair` | The server does not know this watch (new, or unpaired by an admin). | Pair it (section 2). |
| `pair code 123456` | Waiting for an admin to enter the code. | Admin: SETTINGS → Pair a watch. |
| `admin: open pairing` | Pairing is closed on the server. | Admin: SETTINGS → OPEN PAIRING, then START on the watch. |
| `too many tries, wait` | Too many pairing requests from this network. | Wait 15 minutes. |
| Old holds after sending a new job | The watch has not synced yet. | Press FROM PHONE. |
| Holds list empty | Fresh install, never synced. | Pair, then FROM PHONE. |

On the website, **No watch is waiting with this code** means the code is
wrong, expired, or the watch was already paired.

## Privacy and security notes

- The watch never receives drawings or pictures, only hold names and angles.
- The token is made by the server with a cryptographic random generator, is
  never shown, and the server keeps only its hash. Unpairing deletes it on the
  server and the watch forgets it on its next sync.
- Codes are handed out only while an admin has pairing open (10 minutes).
  Pairing requests and unknown tokens are limited per network, waiting codes
  are unique, and wrong codes on the admin side are throttled, so neither codes
  nor tokens can be guessed in bulk.
