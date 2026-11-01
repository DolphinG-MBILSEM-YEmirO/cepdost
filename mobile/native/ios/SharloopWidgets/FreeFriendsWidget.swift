import AppIntents
import SwiftUI
import WidgetKit

// Widget 2 — friends free right now: faces with a green ring and until when
// they're free. Tapping a face opens the app on a plan invite for that
// friend; the arrow button (iOS 17 interactive widgets) slides to the next
// few friends without opening the app. Who is free is worked out on the
// phone from the busy ranges in the snapshot, every quarter hour.

struct FreeFriendsEntry: TimelineEntry {
    let date: Date
    let free: [WidgetTime.FreeFriend]
    let anyoneShares: Bool
    let page: Int
}

enum FriendsPager {
    private static let key = "freeFriendsPage"
    private static var defaults: UserDefaults? { UserDefaults(suiteName: SnapshotStore.appGroup) }

    static var page: Int {
        get { defaults?.integer(forKey: key) ?? 0 }
        set { defaults?.set(newValue, forKey: key) }
    }
}

// The "next friends" button.
struct NextFriendsIntent: AppIntent {
    static var title: LocalizedStringResource = "Sonraki arkadaşlar"
    static var isDiscoverable = false

    func perform() async throws -> some IntentResult {
        FriendsPager.page += 1
        return .result()
    }
}

struct FreeFriendsProvider: TimelineProvider {
    func placeholder(in context: Context) -> FreeFriendsEntry {
        FreeFriendsEntry(date: .now, free: Self.preview, anyoneShares: true, page: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (FreeFriendsEntry) -> Void) {
        let snapshot = SnapshotStore.load()
        let free = WidgetTime.freeFriends(snapshot, at: .now)
        completion(FreeFriendsEntry(
            date: .now, free: free.isEmpty && context.isPreview ? Self.preview : free,
            anyoneShares: !(snapshot?.friends.isEmpty ?? true) || context.isPreview, page: FriendsPager.page))
    }

    // Every 15 minutes for the next six hours, each with who is free then.
    func getTimeline(in context: Context, completion: @escaping (Timeline<FreeFriendsEntry>) -> Void) {
        let snapshot = SnapshotStore.load()
        let quarter: TimeInterval = 15 * 60
        let start = Date(timeIntervalSince1970: (Date.now.timeIntervalSince1970 / quarter).rounded(.down) * quarter)
        let page = FriendsPager.page
        let entries = (0..<24).map { i -> FreeFriendsEntry in
            let date = i == 0 ? Date.now : start.addingTimeInterval(Double(i) * quarter)
            return FreeFriendsEntry(
                date: date, free: WidgetTime.freeFriends(snapshot, at: date),
                anyoneShares: !(snapshot?.friends.isEmpty ?? true), page: page)
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }

    static let preview: [WidgetTime.FreeFriend] = [
        .init(friend: WidgetFriend(id: "1", name: "Ayşe", photo: nil, emoji: nil, color: "#F43F5E", busy: [], window: nil), freeUntil: nil),
        .init(friend: WidgetFriend(id: "2", name: "Can", photo: nil, emoji: "😎", color: "#0EA5E9", busy: [], window: nil), freeUntil: "21:00"),
        .init(friend: WidgetFriend(id: "3", name: "Deniz", photo: nil, emoji: nil, color: "#8B5CF6", busy: [], window: nil), freeUntil: "19:30"),
    ]
}

struct FreeFriendsView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FreeFriendsEntry

    private var perPage: Int { family == .systemSmall ? 2 : 3 }
    private var pageCount: Int { max(1, Int(ceil(Double(entry.free.count) / Double(perPage)))) }
    private var shown: [WidgetTime.FreeFriend] {
        let page = entry.page % pageCount
        return Array(entry.free.dropFirst(page * perPage).prefix(perPage))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                WidgetLabel(text: "Şu an boşta", systemImage: "person.2.fill", onDark: false)
                Spacer(minLength: 4)
                if !entry.free.isEmpty {
                    HStack(spacing: 4) {
                        Circle().fill(Theme.green).frame(width: 6, height: 6)
                        Text("\(entry.free.count) kişi").contentTransition(.numericText())
                    }
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(hex: "#047857"))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(Color(hex: "#ECFDF5"), in: Capsule())
                }
            }

            if entry.free.isEmpty {
                empty
            } else {
                HStack(alignment: .top, spacing: 6) {
                    ForEach(shown) { item in
                        Link(destination: WidgetLink.url("friend:\(item.friend.id)")) { face(item) }
                            .frame(maxWidth: .infinity)
                            .transition(.asymmetric(insertion: .push(from: .trailing), removal: .push(from: .leading)))
                    }
                }
                .id(entry.page % pageCount)
                .frame(maxHeight: .infinity)

                HStack {
                    Text("Dokun, plan öner").font(.system(size: 10, weight: .medium, design: .rounded)).foregroundStyle(Theme.inkSoft)
                    Spacer()
                    if pageCount > 1 {
                        Button(intent: NextFriendsIntent()) {
                            Image(systemName: "arrow.right")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 24, height: 24)
                                .background(Theme.gradient(), in: Circle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.8), value: entry.page)
        .animation(.spring(response: 0.45, dampingFraction: 0.8), value: entry.free.map(\.id))
        .widgetURL(WidgetLink.url("home"))
        .containerBackground(for: .widget) {
            LinearGradient(colors: [.white, Theme.mist], startPoint: .top, endPoint: .bottom)
        }
    }

    private func face(_ item: WidgetTime.FreeFriend) -> some View {
        VStack(spacing: 3) {
            ZStack {
                // A soft green halo stands in for the in-app breathing ring.
                Circle().fill(Theme.green.opacity(0.18)).frame(width: 58, height: 58).blur(radius: 4)
                FaceView(person: item.friend.person, size: 48, ring: Theme.green, ringWidth: 3)
            }
            Text(item.friend.name.split(separator: " ").first.map(String.init) ?? item.friend.name)
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
            Text(item.freeUntil.map(WidgetTime.untilPhrase) ?? "gün boyu")
                .font(.system(size: 9, weight: .semibold, design: .rounded))
                .foregroundStyle(Color(hex: "#059669"))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }

    private var empty: some View {
        VStack(spacing: 4) {
            Text("🫶").font(.system(size: 28))
            Text(entry.anyoneShares ? "Şu an herkes meşgul" : "Kim boşta, burada gör")
                .font(.system(size: 14, weight: .bold, design: .rounded)).foregroundStyle(Theme.ink)
            Text(entry.anyoneShares ? "Biri boşalınca burada belirecek." : "Müsaitliğini paylaşan arkadaşların burada belirir.")
                .font(.system(size: 11, design: .rounded)).foregroundStyle(Theme.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct FreeFriendsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SharloopFreeFriends", provider: FreeFriendsProvider()) { entry in
            FreeFriendsView(entry: entry)
        }
        .configurationDisplayName("Şu an boşta")
        .description("Şu an boş olan arkadaşların. Birine dokun, plan öner.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
