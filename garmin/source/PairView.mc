import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

// Pairing: shows the 6-digit code the admin enters in SETTINGS → Pair a watch,
// and asks the server every few seconds until the watch is approved.
const PAIR_POLL_MS = 5000;

class PairView extends WatchUi.View {
    hidden var _timer as Timer.Timer or Null = null;
    hidden var _error as String or Null = null;
    hidden var _done as Boolean = false;

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        gPairView = self;
        if (!(Storage.getValue("pairCode") instanceof String)) {
            startPairing();
        }
        _timer = new Timer.Timer();
        _timer.start(method(:poll), PAIR_POLL_MS, true);
    }

    function onHide() as Void {
        if (_timer != null) {
            _timer.stop();
            _timer = null;
        }
        if (gPairView == self) {
            gPairView = null;
        }
    }

    function poll() as Void {
        if (Storage.getValue("pairCode") instanceof String) {
            syncFromPhone();
        }
    }


    function update(error as String or Null) as Void {
        _error = error;
        WatchUi.requestUpdate();
    }

    // Approved: show the station, then back to the holds screen.
    function paired() as Void {
        _done = true;
        if (_timer != null) {
            _timer.stop();
        }
        pulseNext();
        WatchUi.requestUpdate();
        _timer = new Timer.Timer();
        _timer.start(method(:leave), 1500, false);
    }

    function leave() as Void {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        showHolds();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        if (_done) {
            dc.setColor(0x00C040, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.42, Graphics.FONT_MEDIUM, "PAIRED", center);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            var st = Storage.getValue("station");
            dc.drawText(w / 2, h * 0.58, Graphics.FONT_SMALL, st instanceof String ? st : "", center);
            return;
        }
        dc.drawText(w / 2, h * 0.18, Graphics.FONT_SMALL, "PAIR WATCH", center);
        var code = Storage.getValue("pairCode");
        if (code instanceof String) {
            dc.setColor(0x00C040, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.44, Graphics.FONT_NUMBER_MEDIUM, code, center);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.66, Graphics.FONT_XTINY, "Admin: SETTINGS", center);
            dc.drawText(w / 2, h * 0.66 + dc.getFontHeight(Graphics.FONT_XTINY), Graphics.FONT_XTINY, "Pair a watch", center);
        } else {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.46, Graphics.FONT_SMALL, "getting code...", center);
        }
        if (_error != null) {
            dc.setColor(0xFF4040, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.86, Graphics.FONT_XTINY, _error, center);
        }
    }
}

class PairDelegate extends WatchUi.BehaviorDelegate {
    hidden var _v as PairView;

    function initialize(v as PairView) {
        BehaviorDelegate.initialize();
        _v = v;
    }

    // START: ask again right away (new code if the old one expired).
    function onSelect() as Boolean {
        _v.update(null);
        if (Storage.getValue("pairCode") instanceof String) {
            syncFromPhone();
        } else {
            startPairing();
        }
        return true;
    }
}
