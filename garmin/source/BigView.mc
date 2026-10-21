import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// One angle per screen: saw on top, big angle in the middle, hold below.
// START = cut (green), a short pulse and an automatic jump to the next
// open angle; UP/DOWN = browse.
class BigView extends WatchUi.View {
    var index as Number;
    var advance as AutoAdvance = new AutoAdvance();
    hidden var _p as Progress;

    function initialize(p as Progress) {
        View.initialize();
        _p = p;
        index = p.firstOpen();
    }

    function onHide() as Void {
        advance.cancel();
    }

    function jumpNext() as Void {
        index = _p.nextOpen(index);
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var e = _p.entries[index] as Array;
        dc.setColor(Graphics.COLOR_WHITE, _p.color(index));
        dc.clear();

        dc.drawText(w / 2, h * 0.17, Graphics.FONT_MEDIUM, e[0] as String,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // number fonts have no degree sign, so draw it separately
        var num = formatValue(e[1] as Float);
        var font = Graphics.FONT_NUMBER_THAI_HOT;
        var nw = dc.getTextWidthInPixels(num, font);
        var dw = dc.getTextWidthInPixels("°", Graphics.FONT_LARGE);
        var x = (w - nw - dw) / 2;
        dc.drawText(x, h * 0.46, font, num, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(x + nw, h * 0.34, Graphics.FONT_LARGE, "°", Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.drawText(w / 2, h * 0.72, Graphics.FONT_MEDIUM, e[2] as String,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        var mark = _p.allDone() ? "ALL DONE  " : (_p.isDone(index) ? "OK  " : (_p.isMissed(index) ? "MISSED  " : ""));
        dc.drawText(w / 2, h * 0.87, Graphics.FONT_XTINY, mark + (index + 1) + "/" + _p.entries.size(),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}

class BigDelegate extends WatchUi.BehaviorDelegate {
    hidden var _v as BigView;
    hidden var _p as Progress;

    function initialize(v as BigView, p as Progress) {
        BehaviorDelegate.initialize();
        _v = v;
        _p = p;
    }

    function onSelect() as Boolean {
        if (_v.advance.pending()) {
            _v.advance.fire();
            return true;
        }
        var wasDone = _p.isDone(_v.index);
        var warned = _p.toggle(_v.index);
        if (!wasDone) {
            if (_p.allDone()) {
                pulseAllDone();
            } else {
                _v.advance.start(_v.method(:jumpNext), warned);
            }
        }
        WatchUi.requestUpdate();
        return true;
    }

    function onNextPage() as Boolean {
        _v.advance.cancel();
        if (_v.index < _p.entries.size() - 1) {
            _v.index++;
            WatchUi.requestUpdate();
        }
        return true;
    }

    // Hold UP (MENU): back to the first angle.
    function onMenu() as Boolean {
        _v.advance.cancel();
        _v.index = 0;
        WatchUi.requestUpdate();
        return true;
    }

    function onPreviousPage() as Boolean {
        _v.advance.cancel();
        if (_v.index > 0) {
            _v.index--;
            WatchUi.requestUpdate();
        }
        return true;
    }
}
