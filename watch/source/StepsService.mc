import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;

//! Runs every 5 minutes (Garmin's minimum), also while the app is closed, and sends the
//! step totals to Uptic on the phone through Garmin Connect.
(:background)
class StepsService extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        Communications.transmit(StepsPayload.build(), null, new BackgroundSendListener());
    }
}

(:background)
class BackgroundSendListener extends Communications.ConnectionListener {
    function initialize() {
        ConnectionListener.initialize();
    }

    function onComplete() as Void {
        Background.exit({ "ok" => true, "at" => Time.now().value() });
    }

    function onError() as Void {
        Background.exit({ "ok" => false, "at" => Time.now().value() });
    }
}
