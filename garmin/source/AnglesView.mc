import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Colored list of all angles: green = cut, red = skipped.
// START marks / unmarks the focused angle; after a cut the focus jumps
// to the next open angle (same auto-advance as BIG MODE).
class AnglesView extends ScrollList {
    var advance as AutoAdvance = new AutoAdvance();
    hidden var _p as Progress;
    hidden var _rows as Array = [];   // entry index, or saw name for a header

    function initialize(p as Progress) {
        ScrollList.initialize();
        _p = p;
        var saw = "";
        var first = p.firstOpen();
        for (var i = 0; i < p.entries.size(); i++) {
            var s = p.entries[i][0] as String;
            if (!saw.equals(s)) {
                saw = s;
                _rows.add(s);
            }
            if (i == first) {
                index = _rows.size();
            }
            _rows.add(i);
        }
    }

    function count() as Number {
        return _rows.size();
    }

    function drawRow(dc as Graphics.Dc, r as Number, y as Number, rowH as Number, focused as Boolean) as Void {
        var w = dc.getWidth();
        var cx = w / 2;
        var mid = y + rowH / 2;
        var row = _rows[r];
        if (row instanceof String) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, mid, Graphics.FONT_SMALL, "- " + row + " -", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            if (focused) {
                drawFocus(dc, y, rowH);
            }
            return;
        }
        var i = row as Number;
        var e = _p.entries[i] as Array;
        var bg = _p.color(i);
        if (bg != Graphics.COLOR_BLACK) {
            dc.setColor(bg, bg);
            dc.fillRoundedRectangle(w / 10, y + 3, w - w / 5, rowH - 6, 12);
        }
        if (focused) {
            drawFocus(dc, y, rowH);
        }
        // angle + hold centered as one group, the name shortened if needed
        var angle = formatValue(e[1] as Float) + "°";
        var aw = dc.getTextWidthInPixels(angle, Graphics.FONT_MEDIUM);
        var gap = 10;
        var name = fit(dc, e[2] as String, Graphics.FONT_XTINY, rowWidth(dc, y, rowH) - aw - gap);
        var x = cx - (aw + gap + dc.getTextWidthInPixels(name, Graphics.FONT_XTINY)) / 2;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, mid, Graphics.FONT_MEDIUM, angle, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(x + aw + gap, mid, Graphics.FONT_XTINY, name, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function select() as Void {
        if (advance.pending()) {
            advance.fire();
            return;
        }
        var row = _rows[index];
        if (row instanceof Number) {
            var wasDone = _p.isDone(row);
            var warned = _p.toggle(row);
            if (!wasDone) {
                if (_p.allDone()) {
                    pulseAllDone();
                } else {
                    advance.start(method(:jumpNext), warned);
                }
            }
            WatchUi.requestUpdate();
        }
    }

    // Focus the row of the next open angle.
    function jumpNext() as Void {
        var row = _rows[index];
        if (row instanceof Number) {
            var target = _rows.indexOf(_p.nextOpen(row));
            if (target >= 0) {
                index = target;
            }
        }
        WatchUi.requestUpdate();
    }

    function move(step as Number) as Void {
        advance.cancel();
        ScrollList.move(step);
    }

    function onHide() as Void {
        advance.cancel();
    }
}
