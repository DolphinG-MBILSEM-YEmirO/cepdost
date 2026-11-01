package app.sharloop.widgets;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.TypedValue;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import org.json.JSONObject;

// What the three widgets share: reading the snapshot, redrawing on resize,
// and waking up again at the moment their content changes (a plan starts or
// ends, a friend becomes busy), not only on the system's half-hour tick.
abstract class BaseWidget extends AppWidgetProvider {

    // Draws one widget. `snapshot` is null before the app has run once.
    abstract RemoteViews render(Context context, @Nullable JSONObject snapshot, int widthDp, int heightDp, long now);

    // When this widget's content next changes on its own (epoch ms), or 0.
    long nextChangeAt(@Nullable JSONObject snapshot, long now) {
        return 0;
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject snapshot = WidgetStore.load(context);
        long now = System.currentTimeMillis();
        for (int id : ids) draw(context, manager, id, snapshot, now);
        scheduleNext(context, nextChangeAt(snapshot, now));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, id, WidgetStore.load(context), System.currentTimeMillis());
    }

    private void draw(Context context, AppWidgetManager manager, int id, @Nullable JSONObject snapshot, long now) {
        Bundle options = manager.getAppWidgetOptions(id);
        int width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 180);
        manager.updateAppWidget(id, render(context, snapshot, width, height, now));
    }

    // An inexact alarm is enough (no special permission): a widget that
    // changes a minute late still reads right.
    private void scheduleNext(Context context, long at) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        Intent intent = new Intent(context, getClass()).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        int[] ids = AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, getClass()));
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        PendingIntent pending = PendingIntent.getBroadcast(
                context, getClass().getName().hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.cancel(pending);
        if (at > System.currentTimeMillis() && ids.length > 0) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC, at + 1000, pending);
        }
    }

    @Override
    public void onDisabled(Context context) {
        scheduleNext(context, 0);
    }

    static int px(Context context, float dp) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp, context.getResources().getDisplayMetrics()));
    }
}
