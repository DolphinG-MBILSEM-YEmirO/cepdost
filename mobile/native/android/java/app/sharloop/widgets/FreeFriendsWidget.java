package app.sharloop.widgets;

import android.content.Context;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.List;

import app.sharloop.R;

// Widget 2 — friends free right now, each with a green ring and until when.
// With more friends than fit, pages of faces slide past one after another.
// Tapping a face opens the app on a plan invite for that friend. Who is free
// is worked out on the phone from the busy ranges in the snapshot, so it
// stays right between app launches.
public class FreeFriendsWidget extends BaseWidget {

    private static final int[] SLOTS = {R.id.friend_slot_0, R.id.friend_slot_1, R.id.friend_slot_2};
    private static final int[] FACES = {R.id.friend_face_0, R.id.friend_face_1, R.id.friend_face_2};
    private static final int[] NAMES = {R.id.friend_name_0, R.id.friend_name_1, R.id.friend_name_2};
    private static final int[] UNTIL = {R.id.friend_until_0, R.id.friend_until_1, R.id.friend_until_2};
    private static final int MAX_PAGES = 4;
    private static final int RING_GREEN = Color.parseColor("#34D399");

    @Override
    RemoteViews render(Context context, @Nullable JSONObject snapshot, int widthDp, int heightDp, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_free_friends);
        views.setOnClickPendingIntent(R.id.widget_root, WidgetLinks.open(context, "home"));
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        List<WidgetTime.FreeFriend> free = snapshot == null ? java.util.Collections.emptyList() : WidgetTime.freeFriendsAt(snapshot, cal);

        views.removeAllViews(R.id.friends_flipper);
        if (free.isEmpty()) {
            boolean nobodyShares = snapshot == null || snapshot.optJSONArray("friends") == null
                    || snapshot.optJSONArray("friends").length() == 0;
            views.setViewVisibility(R.id.friends_flipper, View.GONE);
            views.setViewVisibility(R.id.friends_count, View.GONE);
            views.setViewVisibility(R.id.friends_empty, View.VISIBLE);
            views.setTextViewText(R.id.friends_empty_title, nobodyShares ? "Kim boşta, burada gör" : "Şu an herkes meşgul");
            views.setTextViewText(R.id.friends_empty_text, nobodyShares
                    ? "Müsaitliğini paylaşan arkadaşların burada belirir."
                    : "Biri boşalınca burada belirecek.");
            return views;
        }

        views.setViewVisibility(R.id.friends_flipper, View.VISIBLE);
        views.setViewVisibility(R.id.friends_empty, View.GONE);
        views.setViewVisibility(R.id.friends_count, View.VISIBLE);
        views.setTextViewText(R.id.friends_count, "● " + free.size() + " kişi");

        int perPage = widthDp < 200 ? 2 : 3;
        int face = px(context, 52);
        for (int page = 0; page * perPage < free.size() && page < MAX_PAGES; page++) {
            RemoteViews pageViews = new RemoteViews(context.getPackageName(), R.layout.widget_free_friends_page);
            for (int slot = 0; slot < SLOTS.length; slot++) {
                int index = page * perPage + slot;
                if (slot >= perPage || index >= free.size()) {
                    pageViews.setViewVisibility(SLOTS[slot], View.GONE);
                    continue;
                }
                WidgetTime.FreeFriend f = free.get(index);
                JSONObject p = f.friend;
                pageViews.setViewVisibility(SLOTS[slot], View.VISIBLE);
                pageViews.setImageViewBitmap(FACES[slot], WidgetImages.avatar(
                        p.isNull("photo") ? null : p.optString("photo"),
                        p.isNull("emoji") ? null : p.optString("emoji"),
                        p.optString("name"), p.optString("color"), face, px(context, 3), RING_GREEN));
                pageViews.setTextViewText(NAMES[slot], p.optString("name").split(" ")[0]);
                pageViews.setTextViewText(UNTIL[slot], f.freeUntil == null ? "gün boyu" : WidgetTime.untilPhrase(f.freeUntil));
                pageViews.setOnClickPendingIntent(SLOTS[slot], WidgetLinks.open(context, "friend:" + p.optString("id")));
            }
            views.addView(R.id.friends_flipper, pageViews);
        }
        return views;
    }

    // Someone's free/busy state changes at the start or end of a range;
    // checking every quarter hour is close enough and cheap.
    @Override
    long nextChangeAt(@Nullable JSONObject snapshot, long now) {
        if (snapshot == null) return 0;
        long quarter = 15 * WidgetTime.MINUTE;
        return (now / quarter + 1) * quarter;
    }
}
