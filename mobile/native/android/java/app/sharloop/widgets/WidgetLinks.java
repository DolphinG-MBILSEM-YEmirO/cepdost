package app.sharloop.widgets;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.Nullable;

import app.sharloop.MainActivity;

// Widget taps: each one opens the app with a target the web app understands
// ('plan:<id>', 'friend:<id>', 'memory:<chat>', 'new-plan', 'home'). The
// target rides in the intent's data URI (sharloop://widget?target=…) so every
// tap gets its own PendingIntent.
final class WidgetLinks {
    private static final String SCHEME = "sharloop";

    private WidgetLinks() {}

    static PendingIntent open(Context context, String target) {
        Intent intent = new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(new Uri.Builder().scheme(SCHEME).authority("widget").appendQueryParameter("target", target).build())
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                context, target.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Nullable
    static String targetOf(@Nullable Intent intent) {
        if (intent == null || intent.getData() == null) return null;
        Uri data = intent.getData();
        if (!SCHEME.equals(data.getScheme()) || !"widget".equals(data.getAuthority())) return null;
        return data.getQueryParameter("target");
    }
}
