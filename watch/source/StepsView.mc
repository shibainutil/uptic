import Toybox.ActivityMonitor;
import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

//! Today's steps and when they were last sent to Uptic.
class StepsView extends WatchUi.View {
    function initialize() {
        View.initialize();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();

        var steps = ActivityMonitor.getInfo().steps;
        dc.drawText(w / 2, h * 0.28, Graphics.FONT_SMALL, "Steps today", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.38, Graphics.FONT_NUMBER_MEDIUM, (steps != null ? steps : 0).toString(), Graphics.TEXT_JUSTIFY_CENTER);

        var status = "Not sent yet";
        var last = Storage.getValue("last");
        if (last instanceof Dictionary && last["at"] != null) {
            var t = Gregorian.info(new Time.Moment(last["at"] as Number), Time.FORMAT_SHORT);
            var hhmm = t.hour.format("%02d") + ":" + t.min.format("%02d");
            status = (last["ok"] == true ? "Sent to Uptic " : "Send failed ") + hhmm;
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.68, Graphics.FONT_XTINY, status, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.76, Graphics.FONT_XTINY, "Tap to send now", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class StepsDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    //! Tap / select: send now.
    function onSelect() as Boolean {
        sendNow();
        return true;
    }
}
