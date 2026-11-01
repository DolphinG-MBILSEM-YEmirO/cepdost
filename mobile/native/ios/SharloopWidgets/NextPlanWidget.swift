import SwiftUI
import WidgetKit

// Widget 1 — the next plan: emoji, name, when and where, a countdown that
// ticks by itself (WidgetKit's live timer text), and who's coming. While
// the plan is on, a progress bar fills up on its own. Small, medium and the
// lock screen.

struct NextPlanEntry: TimelineEntry {
    let date: Date
    let plan: WidgetPlan?
    let hasData: Bool
    // Moves the gradient a little between entries, so the card feels alive.
    let phase: Double
}

struct NextPlanProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextPlanEntry {
        NextPlanEntry(date: .now, plan: .preview, hasData: true, phase: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (NextPlanEntry) -> Void) {
        let snapshot = SnapshotStore.load()
        let plan = WidgetTime.currentPlan(snapshot, at: .now) ?? (context.isPreview ? .preview : nil)
        completion(NextPlanEntry(date: .now, plan: plan, hasData: snapshot != nil || context.isPreview, phase: 0))
    }

    // An entry now, at each moment the card changes (a day left, an hour
    // left, start, end) and every 20 minutes in between for the colour drift.
    func getTimeline(in context: Context, completion: @escaping (Timeline<NextPlanEntry>) -> Void) {
        let snapshot = SnapshotStore.load()
        let now = Date.now
        var moments: Set<Date> = [now]
        for i in 1...12 { moments.insert(now.addingTimeInterval(Double(i) * 20 * 60)) }
        for plan in snapshot?.plans ?? [] {
            for mark in [plan.start.addingTimeInterval(-86_400), plan.start.addingTimeInterval(-3600), plan.start, plan.end]
            where mark > now && mark < now.addingTimeInterval(86_400) {
                moments.insert(mark)
            }
        }
        let entries = moments.sorted().enumerated().map { index, date in
            NextPlanEntry(
                date: date, plan: WidgetTime.currentPlan(snapshot, at: date), hasData: snapshot != nil,
                phase: index % 2 == 0 ? 0 : 1)
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct NextPlanView: View {
    @Environment(\.widgetFamily) private var family
    let entry: NextPlanEntry

    var body: some View {
        Group {
            if family == .accessoryRectangular {
                lockScreen
            } else if let plan = entry.plan {
                card(plan)
            } else {
                empty
            }
        }
        .widgetURL(WidgetLink.url(entry.plan.map { "plan:\($0.id)" } ?? (entry.hasData ? "new-plan" : "home")))
        .containerBackground(for: .widget) {
            if family == .accessoryRectangular {
                Color.clear
            } else {
                ZStack {
                    Theme.gradient(phase: entry.phase)
                    Circle().fill(.white.opacity(0.16)).frame(width: 150).blur(radius: 30)
                        .offset(x: 70 - entry.phase * 30, y: -60 + entry.phase * 20)
                    Circle().fill(.white.opacity(0.10)).frame(width: 170).blur(radius: 34)
                        .offset(x: -80 + entry.phase * 25, y: 80)
                }
                .animation(.easeInOut(duration: 2), value: entry.phase)
            }
        }
    }

    private func phase(of plan: WidgetPlan) -> (live: Bool, soon: Bool) {
        let live = entry.date >= plan.start
        return (live, !live && plan.start.timeIntervalSince(entry.date) <= 3600)
    }

    @ViewBuilder private func card(_ plan: WidgetPlan) -> some View {
        let (live, soon) = phase(of: plan)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                WidgetLabel(text: live ? "Şu an" : "Sıradaki plan", systemImage: live ? "flame.fill" : "calendar")
                Spacer(minLength: 4)
                if live {
                    Text("● Canlı").font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(.white).padding(.horizontal, 7).padding(.vertical, 2)
                        .background(.white.opacity(0.25), in: Capsule())
                } else if soon {
                    Text("Az kaldı").font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.rose).padding(.horizontal, 7).padding(.vertical, 2)
                        .background(.white, in: Capsule())
                        .transition(.scale.combined(with: .opacity))
                }
            }

            HStack(spacing: 10) {
                Text(plan.emoji ?? "📅")
                    .font(.system(size: family == .systemSmall ? 22 : 26))
                    .frame(width: family == .systemSmall ? 38 : 46, height: family == .systemSmall ? 38 : 46)
                    .background(.white.opacity(0.2), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(.white.opacity(0.3)))
                VStack(alignment: .leading, spacing: 1) {
                    Text(plan.title)
                        .font(.system(size: family == .systemSmall ? 15 : 17, weight: .bold, design: .rounded))
                        .lineLimit(2)
                        .contentTransition(.opacity)
                    Text(WidgetTime.whenLabel(plan, now: entry.date))
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .opacity(0.85)
                }
            }
            .foregroundStyle(.white)
            .id(plan.id)
            .transition(.push(from: .bottom))

            if family != .systemSmall, let place = plan.place, !place.isEmpty {
                Label(place, systemImage: "mappin.and.ellipse")
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            HStack(alignment: .bottom) {
                footer(plan, live: live)
                Spacer(minLength: 4)
                if family != .systemSmall, !plan.attendees.isEmpty {
                    FaceStack(people: plan.attendees, max: 4, size: 28)
                        .transition(.scale.combined(with: .opacity))
                }
            }
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.75), value: plan.id)
        .animation(.spring(response: 0.5, dampingFraction: 0.75), value: live)
    }

    @ViewBuilder private func footer(_ plan: WidgetPlan, live: Bool) -> some View {
        if live {
            VStack(alignment: .leading, spacing: 4) {
                ProgressView(timerInterval: plan.start...plan.end, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                    .progressViewStyle(.linear)
                    .tint(.white)
                Text("Keyfini çıkar!").font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.white.opacity(0.85))
            }
        } else if plan.start.timeIntervalSince(entry.date) < 86_400 {
            // Live, ticking text: WidgetKit redraws it every second.
            VStack(alignment: .leading, spacing: 0) {
                Text(timerInterval: entry.date...plan.start, countsDown: true)
                    .font(.system(size: family == .systemSmall ? 22 : 26, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                Text("kaldı").font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundStyle(.white.opacity(0.8))
            }
        } else {
            Text(WidgetTime.countdownPhrase(plan.start.timeIntervalSince(entry.date)))
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(.white.opacity(0.2), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .contentTransition(.numericText())
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("✨").font(.system(size: 30))
            Spacer(minLength: 0)
            Text("Takvim bomboş").font(.system(size: 17, weight: .bold, design: .rounded))
            Text("Bir plan kur, geri sayım başlasın.").font(.system(size: 12, design: .rounded)).opacity(0.85)
            if family != .systemSmall {
                Label("Plan kur", systemImage: "plus")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(.white, in: Capsule())
                    .padding(.top, 4)
            }
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // Lock screen: one line of title, one of countdown.
    @ViewBuilder private var lockScreen: some View {
        if let plan = entry.plan {
            VStack(alignment: .leading, spacing: 1) {
                Text("\(plan.emoji ?? "📅") \(plan.title)").font(.headline).lineLimit(1)
                if entry.date >= plan.start {
                    Text("Şu an").font(.caption)
                } else {
                    Text(plan.start, style: .relative).font(.caption).monospacedDigit()
                }
            }
        } else {
            Text("Sıradaki plan yok").font(.caption)
        }
    }
}

struct NextPlanWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SharloopNextPlan", provider: NextPlanProvider()) { entry in
            NextPlanView(entry: entry)
        }
        .configurationDisplayName("Sıradaki plan")
        .description("Sıradaki planın, canlı geri sayım ve kimlerin geldiği.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

extension WidgetPlan {
    static let preview = WidgetPlan(
        id: "preview", title: "Moda sahilinde kahve", emoji: "☕", place: "Moda Sahili, Kadıköy", date: "", time: "19:30",
        allDay: false, startsAt: (Date.now.timeIntervalSince1970 + 3 * 3600) * 1000,
        endsAt: (Date.now.timeIntervalSince1970 + 5 * 3600) * 1000,
        attendees: [
            WidgetPerson(id: "1", name: "Ayşe", photo: nil, emoji: nil, color: "#F43F5E"),
            WidgetPerson(id: "2", name: "Can", photo: nil, emoji: "😎", color: "#0EA5E9"),
            WidgetPerson(id: "3", name: "Deniz", photo: nil, emoji: nil, color: "#8B5CF6"),
        ],
        withLabel: nil)
}
