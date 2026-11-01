import Foundation

// The data the app leaves for the widgets (src/widgets/types.ts), and the
// time logic the widgets need between app launches. Mirrors
// src/widgets/widgetData.ts; keep the two in step.

struct WidgetPerson: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let photo: String?
    let emoji: String?
    let color: String
}

struct WidgetPlan: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let emoji: String?
    let place: String?
    let date: String
    let time: String?
    let allDay: Bool
    let startsAt: Double
    let endsAt: Double
    let attendees: [WidgetPerson]
    let withLabel: String?

    var start: Date { Date(timeIntervalSince1970: startsAt / 1000) }
    var end: Date { Date(timeIntervalSince1970: endsAt / 1000) }
}

struct BusyRange: Codable, Hashable {
    let date: String
    let start: String
    let end: String
}

struct ClockWindow: Codable, Hashable {
    let start: String
    let end: String
}

struct WidgetFriend: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let photo: String?
    let emoji: String?
    let color: String
    let busy: [BusyRange]
    let window: ClockWindow?

    var person: WidgetPerson { WidgetPerson(id: id, name: name, photo: photo, emoji: emoji, color: color) }
}

struct WidgetMemory: Codable, Hashable {
    let id: String
    let place: String
    let date: String
    let note: String?
    let label: String
    let kind: String
    let target: String?
    let photo: String?
}

struct WidgetSnapshot: Codable {
    // Must match WIDGET_SNAPSHOT_VERSION in src/widgets/types.ts.
    static let supportedVersion = 1

    let version: Int
    let updatedAt: Double
    let plans: [WidgetPlan]
    let friends: [WidgetFriend]
    let memory: WidgetMemory?
}

enum SnapshotStore {
    static let appGroup = "group.app.sharloop"
    static let fileName = "widget-snapshot.json"

    // nil before the app has run once (or after a breaking format change).
    static func load() -> WidgetSnapshot? {
        guard let folder = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup),
              let data = try? Data(contentsOf: folder.appendingPathComponent(fileName)),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
              snapshot.version == WidgetSnapshot.supportedVersion
        else { return nil }
        return snapshot
    }
}

// MARK: - Links

enum WidgetLink {
    // Opens the app on a target the web app understands (see App.tsx).
    static func url(_ target: String) -> URL {
        var c = URLComponents()
        c.scheme = "sharloop"
        c.host = "widget"
        c.queryItems = [URLQueryItem(name: "target", value: target)]
        return c.url!
    }
}

// MARK: - Time

enum WidgetTime {
    static let turkish = Locale(identifier: "tr_TR")

    static func dateKey(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    static func clockKey(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour!, c.minute!)
    }

    // The first plan that hasn't ended at `now`.
    static func currentPlan(_ snapshot: WidgetSnapshot?, at now: Date) -> WidgetPlan? {
        snapshot?.plans.first { $0.end > now }
    }

    // "Bugün 19:30", "Yarın", "Cumartesi 14:00", "12 Kasım".
    static func whenLabel(_ plan: WidgetPlan, now: Date) -> String {
        let cal = Calendar.current
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: plan.start)).day ?? 0
        let clock = plan.time.map { " \($0)" } ?? ""
        if days <= 0 { return "Bugün" + clock }
        if days == 1 { return "Yarın" + clock }
        let f = DateFormatter()
        f.locale = turkish
        f.dateFormat = days < 7 ? "EEEE" : "d MMMM"
        return f.string(from: plan.start) + clock
    }

    static func countdownPhrase(_ seconds: TimeInterval) -> String {
        if seconds <= 0 { return "Şimdi" }
        let total = Int(seconds)
        let days = total / 86_400, hours = (total % 86_400) / 3600, minutes = (total % 3600) / 60
        if days >= 2 { return "\(days) gün sonra" }
        if days == 1 { return hours > 0 ? "1 gün \(hours) sa sonra" : "1 gün sonra" }
        if hours > 0 { return minutes > 0 ? "\(hours) sa \(minutes) dk sonra" : "\(hours) sa sonra" }
        return "\(max(1, minutes)) dk sonra"
    }

    struct FreeFriend: Hashable, Identifiable {
        let friend: WidgetFriend
        let freeUntil: String?
        var id: String { friend.id }
    }

    // Friends free at `now`, the ones free longest first.
    static func freeFriends(_ snapshot: WidgetSnapshot?, at now: Date) -> [FreeFriend] {
        guard let snapshot else { return [] }
        let today = dateKey(now)
        let clock = clockKey(now)
        func within(_ s: String, _ e: String) -> Bool { clock >= s && clock < e }

        var free: [FreeFriend] = []
        for friend in snapshot.friends {
            if let w = friend.window, !within(w.start, w.end) { continue }
            let busyToday = friend.busy.filter { $0.date == today }
            if busyToday.contains(where: { within($0.start, $0.end) }) { continue }
            let nextBusy = busyToday.map(\.start).filter { $0 > clock }.min()
            let candidates = [nextBusy, friend.window?.end].compactMap { $0 }.filter { $0 > clock }
            free.append(FreeFriend(friend: friend, freeUntil: candidates.min()))
        }
        return free.sorted {
            let a = $0.freeUntil ?? "99:99", b = $1.freeUntil ?? "99:99"
            return a != b ? a > b : $0.friend.name.localizedCompare($1.friend.name) == .orderedAscending
        }
    }

    // "21:00'e kadar", "19:30'a kadar", "20:00'ye kadar".
    static func untilPhrase(_ clock: String) -> String {
        let parts = clock.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return clock }
        let n = parts[1] != 0 ? parts[1] : parts[0]
        let units = ["'a", "'e", "'ye", "'e", "'e", "'e", "'ya", "'ye", "'e", "'a"]
        let suffix: String
        if n % 10 != 0 { suffix = units[n % 10] }
        else if n == 0 { suffix = "'a" }
        else { suffix = [2, 5].contains((n / 10) % 10) ? "'ye" : "'a" }
        return clock + suffix + " kadar"
    }

    static func longDate(_ key: String) -> String {
        let p = DateFormatter()
        p.dateFormat = "yyyy-MM-dd"
        guard let d = p.date(from: key) else { return key }
        let f = DateFormatter()
        f.locale = turkish
        f.dateFormat = "d MMMM yyyy"
        return f.string(from: d)
    }
}
