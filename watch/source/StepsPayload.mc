import Toybox.ActivityMonitor;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;

//! The message sent to Uptic: full totals for today plus the watch's daily history, so a
//! lost message is simply corrected by the next one.
//! { "v" => 1, "days" => [ { "d" => "YYYY-MM-DD", "s" => steps, "m" => metres, "c" => kcal }, ... ] }
(:background)
module StepsPayload {
    function dateKey(moment as Time.Moment) as String {
        var g = Gregorian.info(moment, Time.FORMAT_SHORT);
        return Lang.format("$1$-$2$-$3$", [
            g.year.format("%04d"), (g.month as Number).format("%02d"), g.day.format("%02d"),
        ]);
    }

    function day(key as String, steps as Number?, cm as Number?, kcal as Number?) as Dictionary {
        return {
            "d" => key,
            "s" => steps != null ? steps : 0,
            "m" => cm != null ? cm / 100 : 0,
            "c" => kcal != null ? kcal : 0,
        };
    }

    function build() as Dictionary {
        var days = [] as Array<Dictionary>;
        var today = dateKey(Time.today());

        var info = ActivityMonitor.getInfo();
        days.add(day(today, info.steps, info.distance, info.calories));

        var history = ActivityMonitor.getHistory();
        if (history != null) {
            for (var i = 0; i < history.size(); i++) {
                var h = history[i];
                if (h == null || h.startOfDay == null) {
                    continue;
                }
                var key = dateKey(h.startOfDay as Time.Moment);
                if (key.equals(today)) {
                    continue; // today comes from getInfo(), which is live
                }
                days.add(day(key, h.steps, h.distance, h.calories));
            }
        }
        return { "v" => 1, "days" => days };
    }

    //! Today's date and steps: when either changes, there's something new to send.
    //! (A new date also carries yesterday's final total in the history.)
    function signature(payload as Dictionary) as String {
        var days = payload["days"] as Array<Dictionary>;
        var today = days[0];
        return (today["d"] as String) + ":" + (today["s"] as Number).toString();
    }
}
