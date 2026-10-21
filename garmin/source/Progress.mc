import Toybox.Attention;
import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Timer;

// Flat cut list for the picked holds + "done" marks saved on the watch,
// so leaving the app or pressing Back never loses progress.
// Entry: [saw, value, hold, key]; MAIN high to low, then STEFAN high to low.
class Progress {
    var entries as Array = [];
    hidden var _done as Array;

    function initialize(rows as Array) {
        addSaw(rows, 1, "MAIN", false);
        addSaw(rows, 2, "STEFAN", false);
        var d = Storage.getValue("done");
        _done = d instanceof Array ? d : [];
    }

    hidden function addSaw(rows as Array, col as Number, saw as String, ascending as Boolean) as Void {
        var list = [];
        for (var i = 0; i < rows.size(); i++) {
            var row = rows[i] as Array;
            var angles = row[col] as Array;
            for (var j = 0; j < angles.size(); j++) {
                list.add([(angles[j] as Numeric).toFloat(), row[0]]);
            }
        }
        // insertion sort: lists are short
        for (var i = 1; i < list.size(); i++) {
            var cur = list[i];
            var j = i - 1;
            while (j >= 0 && (ascending ? list[j][0] > cur[0] : list[j][0] < cur[0])) {
                list[j + 1] = list[j];
                j--;
            }
            list[j + 1] = cur;
        }
        for (var k = 0; k < list.size(); k++) {
            var v = list[k][0] as Float;
            var hold = list[k][1] as String;
            entries.add([saw, v, hold, saw + "|" + hold + "|" + v.format("%.1f")]);
        }
    }

    function isDone(i as Number) as Boolean {
        return _done.indexOf(entries[i][3]) >= 0;
    }

    // Returns true when the skip warning was played.
    function toggle(i as Number) as Boolean {
        var key = entries[i][3];
        if (_done.indexOf(key) >= 0) {
            _done.remove(key);
        } else {
            _done.add(key);
        }
        Storage.setValue("done", _done);
        if (isDone(i) && hasOpenBefore(i)) {
            warnSkipped();
            return true;
        }
        return false;
    }

    // An earlier angle of the same saw is still not cut.
    hidden function hasOpenBefore(i as Number) as Boolean {
        var saw = entries[i][0] as String;
        for (var j = i - 1; j >= 0 && saw.equals(entries[j][0]); j--) {
            if (!isDone(j)) {
                return true;
            }
        }
        return false;
    }

    // Not cut, but a later angle of the same saw already is: skipped by mistake.
    function isMissed(i as Number) as Boolean {
        if (isDone(i)) {
            return false;
        }
        var saw = entries[i][0] as String;
        for (var j = i + 1; j < entries.size() && saw.equals(entries[j][0]); j++) {
            if (isDone(j)) {
                return true;
            }
        }
        return false;
    }

    function color(i as Number) as Number {
        if (isDone(i)) {
            return 0x00A030;
        }
        return isMissed(i) ? 0xC00000 : 0x000000;
    }

    // First not-done index after i; otherwise the first open one above.
    function nextOpen(i as Number) as Number {
        for (var j = i + 1; j < entries.size(); j++) {
            if (!isDone(j)) {
                return j;
            }
        }
        return firstOpen();
    }

    function allDone() as Boolean {
        return doneCount() == entries.size();
    }

    function doneCount() as Number {
        var n = 0;
        for (var j = 0; j < entries.size(); j++) {
            if (isDone(j)) {
                n++;
            }
        }
        return n;
    }

    function firstOpen() as Number {
        for (var j = 0; j < entries.size(); j++) {
            if (!isDone(j)) {
                return j;
            }
        }
        return 0;
    }
}

// Two short pulses: an angle above was skipped.
function warnSkipped() as Void {
    if (Attention has :vibrate) {
        Attention.vibrate([
            new Attention.VibeProfile(100, 250),
            new Attention.VibeProfile(0, 150),
            new Attention.VibeProfile(100, 250)
        ]);
    }
}

// One short pulse: angle cut, moving on to the next one.
function pulseNext() as Void {
    if (Attention has :vibrate) {
        Attention.vibrate([new Attention.VibeProfile(80, 120)]);
    }
}

// One long pulse: every angle of the job is cut.
function pulseAllDone() as Void {
    if (Attention has :vibrate) {
        Attention.vibrate([new Attention.VibeProfile(100, 700)]);
    }
}

// How long a freshly cut angle stays green before the jump.
const ADVANCE_MS = 700;

// After a cut: keep the green row for a moment, pulse, then jump.
// A second START skips the wait; moving by hand or leaving cancels it.
class AutoAdvance {
    hidden var _timer as Timer.Timer or Null = null;
    hidden var _jump as Method or Null = null;
    hidden var _quiet as Boolean = false;

    function initialize() {
    }

    // quiet: the skip warning is already buzzing, so no extra pulse.
    function start(jump as Method, quiet as Boolean) as Void {
        cancel();
        _jump = jump;
        _quiet = quiet;
        _timer = new Timer.Timer();
        _timer.start(method(:fire), ADVANCE_MS, false);
    }

    function pending() as Boolean {
        return _jump != null;
    }

    function fire() as Void {
        var jump = _jump;
        cancel();
        if (jump != null) {
            if (!_quiet) {
                pulseNext();
            }
            jump.invoke();
        }
    }

    function cancel() as Void {
        if (_timer != null) {
            _timer.stop();
        }
        _timer = null;
        _jump = null;
    }
}

function clearProgress() as Void {
    Storage.setValue("done", []);
}

// 34 -> "34", 34.5 -> "34.5" (same rule as the web app, without the degree sign)
function formatValue(value as Float) as String {
    var rounded = Math.round(value);
    if ((value - rounded).abs() < 0.001) {
        return rounded.toNumber().toString();
    }
    return value.format("%.1f");
}
