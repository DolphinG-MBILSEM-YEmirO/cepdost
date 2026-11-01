package app.sharloop.widgets;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

// Redraws every placed Sharloop widget, e.g. after a new snapshot.
final class WidgetUpdater {
    private WidgetUpdater() {}

    static void updateAll(Context context) {
        refresh(context, NextPlanWidget.class);
        refresh(context, FreeFriendsWidget.class);
        refresh(context, OnThisDayWidget.class);
    }

    private static void refresh(Context context, Class<?> provider) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider));
        if (ids.length == 0) return;
        Intent intent = new Intent(context, provider)
                .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(intent);
    }
}
