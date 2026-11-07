package app.sharloop.navigation;

import android.app.Activity;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;

// The phone's back button (and the back gesture) for Sharloop's web app.
//
// Without this, Android closes the app on the first press, wherever the
// person is. Instead the press is handed to the web app, which keeps a stack
// of everything back should undo (open sheets, dialogs, wizard steps, a tab
// other than Planlar; see src/lib/geriTusu.ts). `window.sharloopGeri()`
// takes the top one away and answers true, or answers false on the root
// screen, and only then does the app go to the background.
//
// A page that doesn't answer (still loading, or an older web version
// without the function) falls back to the WebView's own history.
public class BackButtonHandler extends OnBackPressedCallback {
    private static final String ASK_WEB_APP =
        "(function(){try{return typeof window.sharloopGeri==='function'?(window.sharloopGeri()?'handled':'root'):'unknown'}catch(e){return 'unknown'}})()";

    private final Activity activity;
    private final Bridge bridge;

    public BackButtonHandler(Activity activity, Bridge bridge) {
        super(true);
        this.activity = activity;
        this.bridge = bridge;
    }

    @Override
    public void handleOnBackPressed() {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) {
            leaveApp();
            return;
        }
        webView.evaluateJavascript(ASK_WEB_APP, (answer) -> {
            // The answer arrives as a JSON string, quotes included.
            String result = answer == null ? "" : answer.replace("\"", "");
            switch (result) {
                case "handled":
                    break;
                case "root":
                    leaveApp();
                    break;
                default:
                    if (webView.canGoBack()) webView.goBack();
                    else leaveApp();
            }
        });
    }

    // Like the system's own back on a launcher screen: the app goes to the
    // background and keeps its state, so opening it again is instant.
    private void leaveApp() {
        activity.moveTaskToBack(true);
    }
}
