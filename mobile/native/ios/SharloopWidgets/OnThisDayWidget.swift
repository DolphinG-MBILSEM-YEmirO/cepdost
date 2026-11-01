import SwiftUI
import WidgetKit

// Widget 3 — "on this day": a memory's photo edge to edge under a soft dark
// fade, with "1 yıl önce bugün", the place and the date. Between timeline
// entries the photo zooms and drifts a little (a slow Ken Burns that
// WidgetKit animates). Tapping opens the chat the memory lives in.

struct OnThisDayEntry: TimelineEntry {
    let date: Date
    let memory: WidgetMemory?
    let image: UIImage?
    let step: Int
}

struct OnThisDayProvider: TimelineProvider {
    func placeholder(in context: Context) -> OnThisDayEntry {
        OnThisDayEntry(date: .now, memory: Self.preview, image: nil, step: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (OnThisDayEntry) -> Void) {
        let memory = SnapshotStore.load()?.memory ?? (context.isPreview ? Self.preview : nil)
        completion(OnThisDayEntry(date: .now, memory: memory, image: DataImage.decode(memory?.photo), step: 0))
    }

    // One entry every 30 minutes for six hours; each nudges the photo.
    func getTimeline(in context: Context, completion: @escaping (Timeline<OnThisDayEntry>) -> Void) {
        let memory = SnapshotStore.load()?.memory
        let image = DataImage.decode(memory?.photo)
        let entries = (0..<12).map { i in
            OnThisDayEntry(date: Date.now.addingTimeInterval(Double(i) * 30 * 60), memory: memory, image: image, step: i)
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }

    static let preview = WidgetMemory(
        id: "preview", place: "Bozcaada gün batımı", date: "2025-11-01", note: nil, label: "1 yıl önce bugün",
        kind: "years", target: nil, photo: nil)
}

struct OnThisDayView: View {
    @Environment(\.widgetFamily) private var family
    let entry: OnThisDayEntry

    // Four framings the photo moves between.
    private static let framings: [(scale: CGFloat, x: CGFloat, y: CGFloat)] = [
        (1.04, 0, 0), (1.14, -8, -6), (1.10, 6, -10), (1.18, -4, 6),
    ]
    private var framing: (scale: CGFloat, x: CGFloat, y: CGFloat) { Self.framings[entry.step % Self.framings.count] }

    var body: some View {
        Group {
            if let memory = entry.memory {
                content(memory)
            } else {
                empty
            }
        }
        .widgetURL(WidgetLink.url("memory:\(entry.memory?.target ?? "")"))
        .containerBackground(for: .widget) {
            ZStack {
                if let image = entry.image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .scaleEffect(framing.scale)
                        .offset(x: framing.x, y: framing.y)
                        .animation(.easeInOut(duration: 3), value: entry.step)
                } else {
                    Theme.gradient(phase: Double(entry.step % 2))
                }
                LinearGradient(
                    stops: [.init(color: .black.opacity(0.45), location: 0), .init(color: .clear, location: 0.4),
                            .init(color: .black.opacity(0.75), location: 1)],
                    startPoint: .top, endPoint: .bottom)
            }
        }
    }

    private func content(_ memory: WidgetMemory) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Label(memory.label, systemImage: memory.kind == "recent" ? "star.fill" : "clock.arrow.circlepath")
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(.ultraThinMaterial.opacity(0.8), in: Capsule())
                .overlay(Capsule().stroke(.white.opacity(0.3)))
            Spacer(minLength: 0)
            Text(memory.place)
                .font(.system(size: family == .systemSmall ? 16 : 19, weight: .bold, design: .rounded))
                .lineLimit(2)
                .shadow(color: .black.opacity(0.4), radius: 6)
            HStack(spacing: 4) {
                Image(systemName: "calendar")
                Text(WidgetTime.longDate(memory.date))
                if family != .systemSmall, let note = memory.note, !note.isEmpty {
                    Text("· \(note)").lineLimit(1)
                }
            }
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .opacity(0.85)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        // Margins are off so the photo bleeds to the edges; text keeps its own.
        .padding(14)
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("📸").font(.system(size: 30))
            Spacer(minLength: 0)
            Text("Anılar birikiyor").font(.system(size: 16, weight: .bold, design: .rounded))
            Text("Planlardan sonra fotoğraf ekle.").font(.system(size: 11, design: .rounded)).opacity(0.85)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        // Margins are off so the photo bleeds to the edges; text keeps its own.
        .padding(14)
    }
}

struct OnThisDayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SharloopOnThisDay", provider: OnThisDayProvider()) { entry in
            OnThisDayView(entry: entry)
        }
        .configurationDisplayName("Bugün geçmişte")
        .description("Bu günden bir anı fotoğrafı.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}
