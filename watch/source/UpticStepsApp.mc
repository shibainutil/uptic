import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

const SEND_EVERY = 5 * 60; // seconds; Garmin doesn't allow less

(:background)
class UpticStepsApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
    }

    //! Result of the last background send, kept for the screen.
    function onBackgroundData(data as PersistableType) as Void {
        if (data instanceof Dictionary) {
            Storage.setValue("last", data);
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

//! Keeps the 5-minute background send registered (it survives closing the app), and
//! sends once right away.
(:typecheck(disableBackgroundCheck))
function startSending() as Void {
    if (Background.getTemporalEventRegisteredTime() == null) {
        Background.registerForTemporalEvent(new Time.Duration(SEND_EVERY));
    }
    sendNow();
}

(:typecheck(disableBackgroundCheck))
function sendNow() as Void {
    Communications.transmit(StepsPayload.build(), null, new ForegroundSendListener());
}

(:typecheck(disableBackgroundCheck))
class ForegroundSendListener extends Communications.ConnectionListener {
    function initialize() {
        ConnectionListener.initialize();
    }

    function onComplete() as Void {
        Storage.setValue("last", { "ok" => true, "at" => Time.now().value() });
        WatchUi.requestUpdate();
    }

    function onError() as Void {
        Storage.setValue("last", { "ok" => false, "at" => Time.now().value() });
        WatchUi.requestUpdate();
    }
}
