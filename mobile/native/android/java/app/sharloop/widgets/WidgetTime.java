package app.sharloop.widgets;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

// Time logic the widgets need between app launches. Mirrors
// src/widgets/widgetData.ts (freeFriendsAt, countdownPhrase, planWhenLabel,
// untilPhrase); keep the two in step.
final class WidgetTime {
    static final Locale TR = new Locale("tr", "TR");
    static final long MINUTE = 60_000L;
    static final long HOUR = 60 * MINUTE;
    static final long DAY = 24 * HOUR;

    private WidgetTime() {}

    static String dateKey(Calendar c) {
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static String clockKey(Calendar c) {
        return String.format(Locale.US, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
    }

    // ---------- next plan ----------

    // The first plan in the snapshot that hasn't ended yet, or null.
    static JSONObject currentPlan(JSONObject snapshot, long now) {
        JSONArray plans = snapshot.optJSONArray("plans");
        if (plans == null) return null;
        for (int i = 0; i < plans.length(); i++) {
            JSONObject plan = plans.optJSONObject(i);
            if (plan != null && plan.optLong("endsAt") > now) return plan;
        }
        return null;
    }

    static String countdownPhrase(long ms) {
        if (ms <= 0) return "Şimdi";
        long days = ms / DAY, hours = (ms % DAY) / HOUR, minutes = (ms % HOUR) / MINUTE;
        if (days >= 2) return days + " gün sonra";
        if (days == 1) return hours > 0 ? "1 gün " + hours + " sa sonra" : "1 gün sonra";
        if (hours > 0) return minutes > 0 ? hours + " sa " + minutes + " dk sonra" : hours + " sa sonra";
        return Math.max(1, minutes) + " dk sonra";
    }

    // "Bugün 19:30", "Yarın", "Cumartesi 14:00", "12 Kasım".
    static String whenLabel(long startsAt, String time, long now) {
        Calendar start = Calendar.getInstance();
        start.setTimeInMillis(startsAt);
        Calendar today = Calendar.getInstance();
        today.setTimeInMillis(now);
        int days = daysBetween(today, start);
        String clock = time == null || time.isEmpty() ? "" : " " + time;
        if (days <= 0) return "Bugün" + clock;
        if (days == 1) return "Yarın" + clock;
        String pattern = days < 7 ? "EEEE" : "d MMMM";
        return new SimpleDateFormat(pattern, TR).format(new Date(startsAt)) + clock;
    }

    private static int daysBetween(Calendar from, Calendar to) {
        Calendar a = (Calendar) from.clone();
        Calendar b = (Calendar) to.clone();
        for (Calendar c : new Calendar[] {a, b}) {
            c.set(Calendar.HOUR_OF_DAY, 12);
            c.set(Calendar.MINUTE, 0);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
        }
        return Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / (float) DAY);
    }

    // ---------- friends free now ----------

    static final class FreeFriend {
        final JSONObject friend;
        final String freeUntil;

        FreeFriend(JSONObject friend, String freeUntil) {
            this.friend = friend;
            this.freeUntil = freeUntil;
        }
    }

    static List<FreeFriend> freeFriendsAt(JSONObject snapshot, Calendar now) {
        List<FreeFriend> free = new ArrayList<>();
        JSONArray friends = snapshot.optJSONArray("friends");
        if (friends == null) return free;
        String today = dateKey(now);
        String clock = clockKey(now);
        for (int i = 0; i < friends.length(); i++) {
            JSONObject friend = friends.optJSONObject(i);
            if (friend == null) continue;
            JSONObject window = friend.optJSONObject("window");
            if (window != null && !within(clock, window.optString("start"), window.optString("end"))) continue;

            boolean busyNow = false;
            String nextBusy = null;
            JSONArray busy = friend.optJSONArray("busy");
            for (int j = 0; busy != null && j < busy.length(); j++) {
                JSONObject b = busy.optJSONObject(j);
                if (b == null || !today.equals(b.optString("date"))) continue;
                String start = b.optString("start");
                if (within(clock, start, b.optString("end"))) busyNow = true;
                else if (start.compareTo(clock) > 0 && (nextBusy == null || start.compareTo(nextBusy) < 0)) nextBusy = start;
            }
            if (busyNow) continue;

            String until = nextBusy;
            String windowEnd = window != null ? window.optString("end", null) : null;
            if (windowEnd != null && windowEnd.compareTo(clock) > 0 && (until == null || windowEnd.compareTo(until) < 0)) until = windowEnd;
            free.add(new FreeFriend(friend, until));
        }
        // Free all day first, then by how long they stay free, then by name.
        Collections.sort(free, (a, b) -> {
            String ua = a.freeUntil == null ? "99:99" : a.freeUntil;
            String ub = b.freeUntil == null ? "99:99" : b.freeUntil;
            int byTime = ub.compareTo(ua);
            return byTime != 0 ? byTime : a.friend.optString("name").compareToIgnoreCase(b.friend.optString("name"));
        });
        return free;
    }

    private static boolean within(String clock, String start, String end) {
        return clock.compareTo(start) >= 0 && clock.compareTo(end) < 0;
    }

    // ---------- Turkish ----------

    private static final String[] UNIT_SUFFIX = {"'a", "'e", "'ye", "'e", "'e", "'e", "'ya", "'ye", "'e", "'a"};

    // "21:00'e kadar", "19:30'a kadar", "20:00'ye kadar".
    static String untilPhrase(String clock) {
        String[] parts = clock.split(":");
        int h = Integer.parseInt(parts[0]);
        int m = Integer.parseInt(parts[1]);
        int n = m != 0 ? m : h;
        String suffix;
        if (n % 10 != 0) suffix = UNIT_SUFFIX[n % 10];
        else if (n == 0) suffix = "'a";
        else {
            int tens = (n / 10) % 10;
            suffix = tens == 2 || tens == 5 ? "'ye" : "'a";
        }
        return clock + suffix + " kadar";
    }
}
