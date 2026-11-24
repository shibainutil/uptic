import Toybox.ActivityMonitor;
import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

//! Today's steps, and below them either "Sending..." or when the last send went through.
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

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.68, Graphics.FONT_XTINY, gSending ? "Sending..." : lastSentText(), Graphics.TEXT_JUSTIFY_CENTER);
    }

    //! "Last sent 14:05", or with the date when it wasn't today.
    private function lastSentText() as String {
        var at = Storage.getValue("lastOk");
        if (!(at instanceof Number)) {
            return "Not sent yet";
        }
        var moment = new Time.Moment(at);
        var t = Gregorian.info(moment, Time.FORMAT_MEDIUM);
        var hhmm = t.hour.format("%02d") + ":" + t.min.format("%02d");
        if (moment.compare(Time.today()) >= 0) {
            return "Last sent " + hhmm;
        }
        return "Last sent " + t.day.format("%d") + " " + t.month + " " + hhmm;
    }
}

//! Tap the screen or press the upper (Start) button to send now.
class StepsDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER) {
            sendNow();
            return true;
        }
        return false;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        sendNow();
        return true;
    }

    function onSelect() as Boolean {
        sendNow();
        return true;
    }
}
