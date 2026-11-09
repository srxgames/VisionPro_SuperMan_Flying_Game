import SwiftUI

struct ContentView: View {
    @Environment(AppModel.self) private var appModel
    @Environment(\.openImmersiveSpace) private var openImmersiveSpace
    @Environment(\.dismissImmersiveSpace) private var dismissImmersiveSpace

    var body: some View {
        VStack(spacing: 28) {
            Text("SuperFlight")
                .font(.extraLargeTitle)

            VStack(alignment: .leading, spacing: 12) {
                Label("Reach your arms forward to fly", systemImage: "figure.arms.open")
                Label("Point your arms to steer, turn your body to turn", systemImage: "arrow.triangle.turn.up.right.diamond")
                Label("Make fists to boost", systemImage: "hand.raised.fingers.spread")
                Label("Drop your arms to hover", systemImage: "pause.circle")
                Label("Look at a ring and pinch to lock on", systemImage: "eye")
            }
            .font(.title3)

            HStack(spacing: 16) {
                Button(appModel.immersiveState == .open ? "Land" : "Take Off") {
                    Task { await toggleImmersiveSpace() }
                }
                .disabled(appModel.immersiveState == .inTransition)

                if appModel.immersiveState == .open {
                    Button("Reset Course") {
                        appModel.flight.reset()
                    }
                }
            }
            .controlSize(.extraLarge)
        }
        .padding(48)
    }

    private func toggleImmersiveSpace() async {
        switch appModel.immersiveState {
        case .open:
            appModel.immersiveState = .inTransition
            await dismissImmersiveSpace()
        case .closed:
            appModel.immersiveState = .inTransition
            switch await openImmersiveSpace(id: AppModel.immersiveSpaceID) {
            case .opened:
                break
            default:
                appModel.immersiveState = .closed
            }
        case .inTransition:
            break
        }
    }
}
