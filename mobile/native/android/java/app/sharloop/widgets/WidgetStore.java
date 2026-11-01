package app.sharloop.widgets;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.Nullable;

import org.json.JSONException;
import org.json.JSONObject;

// Where the snapshot from the web app waits for the widgets: private
// SharedPreferences, readable by the widget providers in this same app.
final class WidgetStore {
    private static final String PREFS = "sharloop_widgets";
    private static final String KEY = "snapshot";
    // Must match WIDGET_SNAPSHOT_VERSION in src/widgets/types.ts.
    static final int SUPPORTED_VERSION = 1;

    private WidgetStore() {}

    static void save(Context context, String json) {
        prefs(context).edit().putString(KEY, json).apply();
    }

    @Nullable
    static JSONObject load(Context context) {
        String json = prefs(context).getString(KEY, null);
        if (json == null) return null;
        try {
            JSONObject snapshot = new JSONObject(json);
            return snapshot.optInt("version") == SUPPORTED_VERSION ? snapshot : null;
        } catch (JSONException e) {
            return null;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
