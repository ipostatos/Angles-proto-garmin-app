import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Communications;
import Toybox.Cryptography;
import Toybox.Lang;
import Toybox.Math;
import Toybox.StringUtil;
import Toybox.System;
import Toybox.WatchUi;

// Catalog row: [name, [main angles], [stefan angles]]
// GET response: { h: catalog, s: [hold names sent to this station], t: sentAt seconds, n: station name }
// The watch is identified by a random token it makes on first start; an admin
// pairs it to a station with the 6-digit code from POST ?a=pair.
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

// 32 hex characters, made once and kept in Storage.
function watchToken() as String {
    var t = Storage.getValue("token");
    if (t instanceof String && t.length() >= 32) {
        return t;
    }
    var hex = "";
    if (Toybox has :Cryptography) {
        hex = StringUtil.convertEncodedString(Cryptography.randomBytes(16), {
            :fromRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY,
            :toRepresentation => StringUtil.REPRESENTATION_STRING_HEX
        }) as String;
    } else {
        Math.srand(System.getTimer());
        while (hex.length() < 32) {
            hex += (Math.rand() & 0xFFFF).format("%04x");
        }
    }
    Storage.setValue("token", hex);
    return hex;
}

function requestOptions(method as Communications.HttpRequestMethod) as Dictionary {
    return {
        :method => method,
        :headers => {
            "Authorization" => "Bearer " + watchToken(),
            "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
        },
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
            // unknown to the server: forget any old pairing
            Storage.deleteValue("station");
            Storage.deleteValue("pairCode");
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
