import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

const SEND_EVERY = 15 * 60; // seconds (Garmin's minimum is 5 minutes)

(:background)
class UpticStepsApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
    }

    //! Result of a background send: remember when the last one went through.
    function onBackgroundData(data as PersistableType) as Void {
        if (data instanceof Dictionary && data["ok"] == true && data["at"] != null) {
            Storage.setValue("lastOk", data["at"]);
        }
        WatchUi.requestUpdate();
    }

    (:typecheck(disableBackgroundCheck))
    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        startSending();
        return [new StepsView(), new StepsDelegate()];
    }

    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new StepsService()];
    }
}

//! Keeps the background send registered (it survives closing the app), and sends once
//! right away.
(:typecheck(disableBackgroundCheck))
function startSending() as Void {
    // (Re-)register when missing or set to a different interval by an older version.
    var registered = Background.getTemporalEventRegisteredTime();
    if (!(registered instanceof Time.Duration) || (registered as Time.Duration).value() != SEND_EVERY) {
        Background.registerForTemporalEvent(new Time.Duration(SEND_EVERY));
    }
    sendNow();
}

//! True while a send started on the watch is under way.
var gSending as Boolean = false;
var gSendTimeout as Timer.Timer? = null;

//! Sends now, unless a send is already under way (so a tap and a button press together
//! still send only once).
(:typecheck(disableBackgroundCheck))
function sendNow() as Void {
    if (gSending) {
        return;
    }
    gSending = true;
    // Safety net: never show "Sending..." for longer than 30 seconds.
    var t = new Timer.Timer();
    t.start(new Lang.Method($, :sendFinished), 30000, false);
    gSendTimeout = t;
    WatchUi.requestUpdate();
    var payload = StepsPayload.build();
    Communications.transmit(payload, null, new ForegroundSendListener(StepsPayload.signature(payload)));
}

(:typecheck(disableBackgroundCheck))
function sendFinished() as Void {
    gSending = false;
    var t = gSendTimeout;
    if (t != null) {
        t.stop();
        gSendTimeout = null;
    }
    WatchUi.requestUpdate();
}

(:typecheck(disableBackgroundCheck))
class ForegroundSendListener extends Communications.ConnectionListener {
    private var _sig as String;

    function initialize(sig as String) {
        ConnectionListener.initialize();
        _sig = sig;
    }

    function onComplete() as Void {
        Storage.setValue("sentSig", _sig);
        Storage.setValue("lastOk", Time.now().value());
        sendFinished();
    }

    function onError() as Void {
        sendFinished();
    }
}
