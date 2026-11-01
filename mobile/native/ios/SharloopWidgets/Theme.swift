import SwiftUI
import UIKit

// Sharloop's look on the home screen: the Planlar tab's flowing gradient
// (shared/tasarim.json), frosted tiles, and round faces.

enum Theme {
    static let orange = Color(hex: "#EA580C")
    static let rose = Color(hex: "#E11D48")
    static let magenta = Color(hex: "#C026D3")
    static let ink = Color(hex: "#262137")
    static let inkSoft = Color(hex: "#8E879F")
    static let mist = Color(hex: "#F6F4FB")
    static let green = Color(hex: "#10B981")

    // The card gradient. `phase` (0…1) slides its stops a little, so the
    // colours drift between timeline entries.
    static func gradient(phase: Double = 0) -> LinearGradient {
        LinearGradient(
            colors: [orange, rose, magenta],
            startPoint: UnitPoint(x: 0 + phase * 0.3, y: 0),
            endPoint: UnitPoint(x: 1, y: 1 - phase * 0.3))
    }
}

extension Color {
    init(hex: String) {
        var value: UInt64 = 0
        Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255)
    }
}

enum DataImage {
    // A data URL from the snapshot as an image (small, already widget-sized).
    static func decode(_ dataURL: String?) -> UIImage? {
        guard let dataURL, dataURL.hasPrefix("data:"), let comma = dataURL.firstIndex(of: ",") else { return nil }
        guard let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]), options: .ignoreUnknownCharacters)
        else { return nil }
        return UIImage(data: data)
    }
}

// A round face: photo, else emoji or initial on the person's colour.
struct FaceView: View {
    let person: WidgetPerson
    var size: CGFloat = 32
    var ring: Color = .white
    var ringWidth: CGFloat = 2

    var body: some View {
        ZStack {
            if let image = DataImage.decode(person.photo) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                LinearGradient(
                    colors: [Color(hex: person.color), Color(hex: person.color).opacity(0.7)],
                    startPoint: .topLeading, endPoint: .bottomTrailing)
                Text(person.emoji ?? String(person.name.prefix(1)).uppercased(with: WidgetTime.turkish))
                    .font(.system(size: size * 0.42, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(ring, lineWidth: ringWidth))
        .accessibilityLabel(person.name)
    }
}

// Overlapping faces with "+N".
struct FaceStack: View {
    let people: [WidgetPerson]
    var max: Int = 4
    var size: CGFloat = 28

    var body: some View {
        HStack(spacing: -size * 0.32) {
            ForEach(people.prefix(max)) { FaceView(person: $0, size: size) }
            if people.count > max {
                Text("+\(people.count - max)")
                    .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(width: size, height: size)
                    .background(.white.opacity(0.25), in: Circle())
                    .overlay(Circle().stroke(.white, lineWidth: 2))
            }
        }
    }
}

// The small capital label at the top of each widget.
struct WidgetLabel: View {
    let text: String
    let systemImage: String
    var onDark = true

    var body: some View {
        Label(text.uppercased(with: WidgetTime.turkish), systemImage: systemImage)
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .tracking(0.8)
            .foregroundStyle(onDark ? .white.opacity(0.85) : Theme.inkSoft)
            .labelStyle(.titleAndIcon)
    }
}
