import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// ABOUT: saw blade icon, version and a short English description.
const ABOUT_LINES = [
    "Saw angles on the wrist.",
    "Pick holds, cut in order:",
    "green = cut, red = missed.",
    "A cut buzzes and jumps",
    "to the next angle."
];

class AboutView extends WatchUi.View {
    hidden var _icon as WatchUi.BitmapResource or Null = null;

    function initialize() {
        View.initialize();
    }

    function onLayout(dc as Graphics.Dc) as Void {
        _icon = WatchUi.loadResource(Rez.Drawables.LauncherIcon) as WatchUi.BitmapResource;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var y = h * 0.10;
        if (_icon != null) {
            dc.drawBitmap((w - _icon.getWidth()) / 2, y, _icon);
            y += _icon.getHeight() + 4;
        }
        var titleH = dc.getFontHeight(Graphics.FONT_SMALL);
        dc.drawText(w / 2, y + titleH / 2, Graphics.FONT_SMALL, "Angles v" + APP_VERSION,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        y += titleH + 2;
        var lineH = dc.getFontHeight(Graphics.FONT_XTINY);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < ABOUT_LINES.size(); i++) {
            dc.drawText(w / 2, y + lineH / 2, Graphics.FONT_XTINY, ABOUT_LINES[i],
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            y += lineH;
        }
    }
}
