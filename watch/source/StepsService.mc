import Toybox.Application.Storage;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;

//! Runs every SEND_EVERY seconds, also while the app is closed, and sends the step totals
//! to Uptic on the phone through Garmin Connect. Skips the send when today's count hasn't
//! changed since the last successful one (e.g. overnight), to save battery.
(:background)
class StepsService extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        var payload = StepsPayload.build();
        var sig = StepsPayload.signature(payload);
        if (sig.equals(Storage.getValue("sentSig"))) {
            Background.exit(null);
            return;
        }
        Communications.transmit(payload, null, new BackgroundSendListener(sig));
    }
}

(:background)
class BackgroundSendListener extends Communications.ConnectionListener {
    private var _sig as String;

    function initialize(sig as String) {
        ConnectionListener.initialize();
        _sig = sig;
    }

    function onComplete() as Void {
        // Only a delivered send counts, so a failed one is retried next time.
        Storage.setValue("sentSig", _sig);
        Background.exit({ "ok" => true, "at" => Time.now().value() });
    }

    function onError() as Void {
        Background.exit({ "ok" => false, "at" => Time.now().value() });
    }
}
