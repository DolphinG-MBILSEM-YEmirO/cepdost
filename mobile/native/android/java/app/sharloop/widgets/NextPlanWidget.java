package app.sharloop.widgets;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import app.sharloop.R;

// Widget 1 — the next plan: emoji, name, when and where, a live ticking
// countdown (the system's Chronometer, so it ticks with the app closed) and
// who's coming. The bottom of the card flips between the countdown and the
// faces every few seconds. While the plan is on it shows a progress bar.
public class NextPlanWidget extends BaseWidget {

    private static final int MAX_FACES = 4;

    @Override
    RemoteViews render(Context context, @Nullable JSONObject snapshot, int widthDp, int heightDp, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_next_plan);
        JSONObject plan = snapshot == null ? null : WidgetTime.currentPlan(snapshot, now);

        if (plan == null) {
            views.setViewVisibility(R.id.plan_content, View.GONE);
            views.setViewVisibility(R.id.plan_empty, View.VISIBLE);
            views.setOnClickPendingIntent(R.id.widget_root, WidgetLinks.open(context, snapshot == null ? "home" : "new-plan"));
            return views;
        }
        views.setViewVisibility(R.id.plan_content, View.VISIBLE);
        views.setViewVisibility(R.id.plan_empty, View.GONE);
        views.setOnClickPendingIntent(R.id.widget_root, WidgetLinks.open(context, "plan:" + plan.optString("id")));

        long startsAt = plan.optLong("startsAt");
        long endsAt = plan.optLong("endsAt");
        boolean live = now >= startsAt;
        boolean soon = !live && startsAt - now <= WidgetTime.HOUR;

        views.setTextViewText(R.id.plan_label, live ? "ŞU AN" : "SIRADAKİ PLAN");
        views.setViewVisibility(R.id.plan_badge, live || soon ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.plan_badge, live ? "● Canlı" : "Az kaldı");

        String emoji = plan.optString("emoji", "");
        views.setTextViewText(R.id.plan_emoji, emoji.isEmpty() || "null".equals(emoji) ? "📅" : emoji);
        views.setTextViewText(R.id.plan_title, plan.optString("title"));
        String time = plan.isNull("time") ? null : plan.optString("time");
        views.setTextViewText(R.id.plan_when, WidgetTime.whenLabel(startsAt, time, now));

        String place = plan.isNull("place") ? "" : plan.optString("place");
        views.setViewVisibility(R.id.plan_place, place.isEmpty() || heightDp < 150 ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.plan_place, "📍 " + place);

        // The flipping footer: countdown (or progress) and the faces.
        views.removeAllViews(R.id.plan_flipper);
        RemoteViews timePage = new RemoteViews(context.getPackageName(), R.layout.widget_next_plan_time);
        if (live) {
            timePage.setViewVisibility(R.id.plan_countdown, View.GONE);
            timePage.setViewVisibility(R.id.plan_far, View.GONE);
            timePage.setViewVisibility(R.id.plan_progress, View.VISIBLE);
            int progress = (int) (100 * (now - startsAt) / Math.max(1, endsAt - startsAt));
            timePage.setProgressBar(R.id.plan_progress, 100, Math.min(100, progress), false);
            timePage.setTextViewText(R.id.plan_time_caption, "Keyfini çıkar!");
        } else if (startsAt - now < WidgetTime.DAY && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Chronometer counts down to its base on the elapsed-time clock.
            long base = SystemClock.elapsedRealtime() + (startsAt - now);
            timePage.setViewVisibility(R.id.plan_countdown, View.VISIBLE);
            timePage.setViewVisibility(R.id.plan_far, View.GONE);
            timePage.setViewVisibility(R.id.plan_progress, View.GONE);
            timePage.setChronometer(R.id.plan_countdown, base, null, true);
            timePage.setChronometerCountDown(R.id.plan_countdown, true);
            timePage.setTextViewText(R.id.plan_time_caption, "kaldı");
        } else {
            timePage.setViewVisibility(R.id.plan_countdown, View.GONE);
            timePage.setViewVisibility(R.id.plan_far, View.VISIBLE);
            timePage.setViewVisibility(R.id.plan_progress, View.GONE);
            timePage.setTextViewText(R.id.plan_far, WidgetTime.countdownPhrase(startsAt - now));
            timePage.setTextViewText(R.id.plan_time_caption, "geri sayım başladı");
        }
        views.addView(R.id.plan_flipper, timePage);

        JSONArray attendees = plan.optJSONArray("attendees");
        if (attendees != null && attendees.length() > 0) {
            RemoteViews facesPage = new RemoteViews(context.getPackageName(), R.layout.widget_next_plan_faces);
            facesPage.setImageViewBitmap(R.id.plan_faces, faces(context, attendees));
            facesPage.setTextViewText(R.id.plan_faces_caption, attendees.length() + " kişi geliyor");
            views.addView(R.id.plan_flipper, facesPage);
        }
        return views;
    }

    // Overlapping round faces in one bitmap, "+N" for the rest.
    private Bitmap faces(Context context, JSONArray people) {
        int size = px(context, 34);
        int step = Math.round(size * 0.68f);
        int shown = Math.min(MAX_FACES, people.length());
        int rest = people.length() - shown;
        int count = shown + (rest > 0 ? 1 : 0);
        Bitmap out = Bitmap.createBitmap(size + step * (count - 1), size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        int ring = px(context, 2);
        for (int i = 0; i < shown; i++) {
            JSONObject p = people.optJSONObject(i);
            Bitmap face = WidgetImages.avatar(
                    p.isNull("photo") ? null : p.optString("photo"),
                    p.isNull("emoji") ? null : p.optString("emoji"),
                    p.optString("name"), p.optString("color"), size, ring, Color.WHITE);
            canvas.drawBitmap(face, i * step, 0, null);
        }
        if (rest > 0) {
            Bitmap more = WidgetImages.avatar(null, "+" + rest, "", "#F43F5E", size, ring, Color.WHITE);
            canvas.drawBitmap(more, shown * step, 0, null);
        }
        return out;
    }

    // Redraw when the plan starts (countdown → live) and when it ends (next plan).
    @Override
    long nextChangeAt(@Nullable JSONObject snapshot, long now) {
        JSONObject plan = snapshot == null ? null : WidgetTime.currentPlan(snapshot, now);
        if (plan == null) return 0;
        long startsAt = plan.optLong("startsAt");
        if (now < startsAt) {
            // Also at "one hour left" (badge) and "one day left" (live countdown).
            long[] marks = {startsAt - WidgetTime.DAY, startsAt - WidgetTime.HOUR, startsAt};
            for (long mark : marks) if (mark > now) return mark;
        }
        return plan.optLong("endsAt");
    }
}
