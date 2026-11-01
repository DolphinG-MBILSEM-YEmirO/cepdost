import SwiftUI
import WidgetKit

// The widget extension's entry point: Sharloop's three home-screen widgets.
@main
struct SharloopWidgetsBundle: WidgetBundle {
    var body: some Widget {
        NextPlanWidget()
        FreeFriendsWidget()
        OnThisDayWidget()
    }
}
