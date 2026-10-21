import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.WatchUi;

// Catalog row: [name, [main angles], [stefan angles]]
// GET response: { h: catalog, s: [hold names sent to this station], t: sentAt seconds, n: station name }
// The watch is identified by a random token the server issues with the
// 6-digit pairing code (POST ?a=pair); an admin pairs it to a station.
const CATALOG_URL = "https://avacut.vercel.app/api/watch";
const APP_VERSION = "1.2";

// The hold menu currently on screen (null while angles are shown).
var gHoldsView as HoldsView or Null = null;
// The pairing screen while it is open.
var gPairView as PairView or Null = null;

function loadCatalog() as Array {
    var cached = Storage.getValue("catalog");
    if (cached instanceof Array && cached.size() > 0) {
        return cached;
    }
    return WatchUi.loadResource(Rez.JsonData.Catalog) as Array;
}

function showHolds() as Void {
    var v = new HoldsView(loadCatalog());
    WatchUi.switchToView(v, new ScrollDelegate(v), WatchUi.SLIDE_IMMEDIATE);
}

// Token from the server (kept in Storage); none before the first pairing.
function requestOptions(method as Communications.HttpRequestMethod) as Dictionary {
    var headers = { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON };
    var token = Storage.getValue("token");
    if (token instanceof String) {
        headers["Authorization"] = "Bearer " + token;
    }
    return {
        :method => method,
        :headers => headers,
        :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
    };
}

// Status line under FROM PHONE: station name, pairing code or a hint.
function syncStatus() as String {
    var code = Storage.getValue("pairCode");
    if (code instanceof String) {
        return "pair code " + code;
    }
    var station = Storage.getValue("station");
    return station instanceof String ? station : "not paired: press to pair";
}

function showSyncStatus(text as String) as Void {
    if (gHoldsView != null) {
        gHoldsView.setSyncStatus(text);
    }
}

// Ask the server (through the phone) for the catalog and this station's job.
function syncFromPhone() as Void {
    Communications.makeWebRequest(CATALOG_URL, null,
        requestOptions(Communications.HTTP_REQUEST_METHOD_GET), new SyncHandler().method(:onResponse));
}

// Get a pairing code for the admin; the PairView shows it and keeps polling.
function startPairing() as Void {
    Communications.makeWebRequest(CATALOG_URL + "?a=pair", {},
        requestOptions(Communications.HTTP_REQUEST_METHOD_POST), new PairHandler().method(:onResponse));
}

class PairHandler {
    function initialize() {
    }

    function onResponse(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary && data["c"] instanceof String) {
            Storage.setValue("pairCode", data["c"]);
            Storage.deleteValue("station");
            if (data["k"] instanceof String) {
                Storage.setValue("token", data["k"]);
            }
        } else if (code == 200) {
            // already paired: just sync
            Storage.deleteValue("pairCode");
            syncFromPhone();
        }
        if (gPairView != null) {
            gPairView.update(code == 200 ? null : (code == 429 ? "too many tries, wait" : "no phone / offline"));
        }
        showSyncStatus(syncStatus());
    }
}

class SyncHandler {
    function initialize() {
    }

    function onResponse(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 401) {
            // unknown to the server (unpaired by an admin): forget the old pairing
            Storage.deleteValue("station");
            Storage.deleteValue("pairCode");
            Storage.deleteValue("token");
            showSyncStatus(syncStatus());
            return;
        }
        if (code == 403) {
            showSyncStatus(syncStatus());
            if (gPairView != null) {
                gPairView.update(null);
            }
            return;
        }
        if (code != 200 || !(data instanceof Dictionary)) {
            showSyncStatus("no phone / offline");
            if (gPairView != null) {
                gPairView.update("no phone / offline");
            }
            return;
        }
        Storage.deleteValue("pairCode");
        var name = data["n"];
        if (name instanceof String) {
            Storage.setValue("station", name);
        }
        var holds = data["h"];
        if (holds instanceof Array && holds.size() > 0) {
            Storage.setValue("catalog", holds);
        }
        // A new send to this station replaces the picks and starts a fresh job.
        var sent = data["s"];
        var t = data["t"];
        var lastT = Storage.getValue("sentT");
        if (sent instanceof Array && t instanceof Number && t > 0 && (lastT == null || t != lastT)) {
            Storage.setValue("sentT", t);
            Storage.setValue("picked", sent);
            clearProgress();
        }
        if (gPairView != null) {
            gPairView.paired();
        } else if (gHoldsView != null) {
            showHolds();
        }
    }
}

class AnglesApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        syncFromPhone();
        var v = new HoldsView(loadCatalog());
        return [v, new ScrollDelegate(v)];
    }
}
