package app.sharloop.calendar;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// "Add to my phone's calendar" for the web app (see src/lib/platform.ts).
// A WebView can't hand a downloaded .ics file to the calendar, so this opens
// the calendar app's own "new event" screen, filled in. Nothing is written
// without the person tapping Save there, so no calendar permission is needed.
//   addEvent({ title, location?, notes?, start, end, allDay })
// Times are epoch milliseconds. Android's insert screen has no reminder
// field, so alarmMinutes is ignored here (the calendar's default applies).
@CapacitorPlugin(name = "SharloopCalendar")
public class SharloopCalendarPlugin extends Plugin {

    @PluginMethod
    public void addEvent(PluginCall call) {
        String title = call.getString("title");
        Double start = call.getDouble("start");
        Double end = call.getDouble("end");
        if (title == null || start == null || end == null) {
            call.reject("title, start and end are required");
            return;
        }
        boolean allDay = Boolean.TRUE.equals(call.getBoolean("allDay", false));

        Intent intent = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.Events.TITLE, title)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start.longValue())
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end.longValue())
                .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, allDay);
        String location = call.getString("location");
        if (location != null) intent.putExtra(CalendarContract.Events.EVENT_LOCATION, location);
        String notes = call.getString("notes");
        if (notes != null) intent.putExtra(CalendarContract.Events.DESCRIPTION, notes);

        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No calendar app found", e);
        }
    }
}
