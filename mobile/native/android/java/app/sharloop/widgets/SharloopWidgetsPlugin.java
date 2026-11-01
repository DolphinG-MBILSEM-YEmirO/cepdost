package app.sharloop.widgets;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// The web app's door to the widgets (see src/widgets/nativeBridge.ts):
//   update({ snapshot })   saves the JSON and redraws every widget
//   consumeLaunchTarget()  the widget tap that opened the app, once
//   "widgetTap" event      a widget tapped while the app is open
@CapacitorPlugin(name = "SharloopWidgets")
public class SharloopWidgetsPlugin extends Plugin {

    private String launchTarget;

    @Override
    public void load() {
        launchTarget = WidgetLinks.targetOf(getActivity().getIntent());
    }

    @PluginMethod
    public void update(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        WidgetStore.save(getContext(), snapshot);
        WidgetUpdater.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void consumeLaunchTarget(PluginCall call) {
        JSObject result = new JSObject();
        result.put("target", launchTarget);
        launchTarget = null;
        call.resolve(result);
    }

    // The app was already running and a widget brought it to the front.
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String target = WidgetLinks.targetOf(intent);
        if (target == null) return;
        JSObject data = new JSObject();
        data.put("target", target);
        notifyListeners("widgetTap", data, true);
    }
}
