package app.sharloop;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.sharloop.calendar.SharloopCalendarPlugin;
import app.sharloop.widgets.SharloopWidgetsPlugin;

// The app's only screen: Sharloop's web app in Capacitor's WebView, plus our
// own plugins: one feeds the home-screen widgets, one opens the phone's
// calendar with a plan filled in.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge starts.
        registerPlugin(SharloopWidgetsPlugin.class);
        registerPlugin(SharloopCalendarPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
