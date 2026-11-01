package app.sharloop;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.sharloop.widgets.SharloopWidgetsPlugin;

// The app's only screen: Sharloop's web app in Capacitor's WebView, plus our
// own plugin that feeds the home-screen widgets.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge starts.
        registerPlugin(SharloopWidgetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
