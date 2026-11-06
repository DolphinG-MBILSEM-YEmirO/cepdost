import Capacitor
import EventKit
import EventKitUI
import UIKit

// "Add to my phone's calendar" for the web app (see src/lib/platform.ts).
// A WebView can't hand a downloaded .ics file to Calendar, so this shows the
// system "New Event" sheet, filled in. Nothing is saved until the person taps
// Add there.
//   addEvent({ title, location?, notes?, start, end, allDay, alarmMinutes? })
// Times are epoch milliseconds; alarmMinutes counts back from the start.
//
// From iOS 17 the sheet runs outside the app and needs no calendar access.
// Older versions ask once (NSCalendarsUsageDescription, see apply-native.mjs).
@objc(SharloopCalendarPlugin)
public class SharloopCalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "SharloopCalendarPlugin"
    public let jsName = "SharloopCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addEvent", returnType: CAPPluginReturnPromise),
    ]

    private let store = EKEventStore()

    @objc func addEvent(_ call: CAPPluginCall) {
        guard let title = call.getString("title"),
              let start = call.getDouble("start"),
              let end = call.getDouble("end") else {
            call.reject("title, start and end are required")
            return
        }
        let event = EKEvent(eventStore: store)
        event.title = title
        event.location = call.getString("location")
        event.notes = call.getString("notes")
        event.startDate = Date(timeIntervalSince1970: start / 1000)
        event.endDate = Date(timeIntervalSince1970: end / 1000)
        event.isAllDay = call.getBool("allDay") ?? false
        if let minutes = call.getDouble("alarmMinutes") {
            event.addAlarm(EKAlarm(relativeOffset: -minutes * 60))
        }

        if #available(iOS 17.0, *) {
            present(event, call)
        } else {
            store.requestAccess(to: .event) { [weak self] granted, _ in
                guard granted else {
                    call.reject("Calendar access was not given")
                    return
                }
                self?.present(event, call)
            }
        }
    }

    private func present(_ event: EKEvent, _ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let host = self.bridge?.viewController else {
                call.reject("No screen to show the calendar on")
                return
            }
            if #unavailable(iOS 17.0) {
                event.calendar = self.store.defaultCalendarForNewEvents
            }
            let sheet = EKEventEditViewController()
            sheet.eventStore = self.store
            sheet.event = event
            sheet.editViewDelegate = self
            host.present(sheet, animated: true)
            // Saving or cancelling is the person's choice, not an error.
            call.resolve()
        }
    }

    public func eventEditViewController(_ controller: EKEventEditViewController,
                                        didCompleteWith action: EKEventEditViewAction) {
        controller.dismiss(animated: true)
    }
}
