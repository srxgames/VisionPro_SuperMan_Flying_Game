import SwiftUI

struct HUDView: View {
    let flight: FlightController

    var body: some View {
        HStack(spacing: 32) {
            stat("SPEED", String(format: "%.0f m/s", flight.speed))
            stat("ALT", String(format: "%.0f m", flight.altitude))
            stat("RINGS", "\(flight.ringsCollected)/\(flight.totalRings)")
            if flight.isBoosting {
                Text("BOOST").font(.headline).foregroundStyle(.orange)
            }
            if flight.isLockedOn {
                Text("LOCKED").font(.headline).foregroundStyle(.cyan)
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 14)
        .glassBackgroundEffect()
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.monospacedDigit()).bold()
        }
    }
}
