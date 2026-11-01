package app.sharloop.widgets;

import android.content.Context;
import android.graphics.Bitmap;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;

import app.sharloop.R;

// Widget 3 — "on this day": a memory's photo edge to edge under a soft dark
// fade, with "1 yıl önce bugün", the place and the date. Tapping opens the
// chat the memory lives in.
public class OnThisDayWidget extends BaseWidget {

    @Override
    RemoteViews render(Context context, @Nullable JSONObject snapshot, int widthDp, int heightDp, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_on_this_day);
        JSONObject memory = snapshot == null ? null : snapshot.optJSONObject("memory");
        if (memory == null) {
            views.setViewVisibility(R.id.memory_content, View.GONE);
            views.setViewVisibility(R.id.memory_empty, View.VISIBLE);
            views.setOnClickPendingIntent(R.id.widget_root, WidgetLinks.open(context, "home"));
            return views;
        }
        views.setViewVisibility(R.id.memory_content, View.VISIBLE);
        views.setViewVisibility(R.id.memory_empty, View.GONE);
        String target = memory.isNull("target") ? "" : memory.optString("target");
        views.setOnClickPendingIntent(R.id.widget_root, WidgetLinks.open(context, "memory:" + target));

        Bitmap photo = WidgetImages.decodeDataUrl(memory.isNull("photo") ? null : memory.optString("photo"));
        if (photo != null) {
            // Drawn at the widget's size (capped) so the widget stays within
            // the bitmap memory Android allows it.
            int w = Math.min(px(context, widthDp), 720);
            int h = Math.max(1, Math.round(w * (heightDp / (float) Math.max(1, widthDp))));
            views.setImageViewBitmap(R.id.memory_photo, WidgetImages.roundedCover(photo, w, h, 0));
        } else {
            views.setImageViewResource(R.id.memory_photo, R.drawable.widget_bg_gradient);
        }
        views.setTextViewText(R.id.memory_label, memory.optString("label"));
        views.setTextViewText(R.id.memory_place, memory.optString("place"));
        views.setTextViewText(R.id.memory_date, formatDate(memory.optString("date")));
        return views;
    }

    // A new day may bring a new memory, but only the app can pick it; the
    // half-hourly system update is enough here.

    private static String formatDate(String date) {
        try {
            Date d = new SimpleDateFormat("yyyy-MM-dd", WidgetTime.TR).parse(date);
            return d == null ? date : new SimpleDateFormat("d MMMM yyyy", WidgetTime.TR).format(d);
        } catch (java.text.ParseException e) {
            return date;
        }
    }
}
