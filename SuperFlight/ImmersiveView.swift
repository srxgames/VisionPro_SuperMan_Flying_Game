import SwiftUI
import RealityKit

struct ImmersiveView: View {
    @Environment(AppModel.self) private var appModel
    @State private var updateSubscription: EventSubscription?

    var body: some View {
        RealityView { content, attachments in
            let world = WorldBuilder.build()
            content.add(world.root)
            content.add(world.sky)
            content.add(world.sun)
            appModel.flight.attach(worldRoot: world.root, rings: world.rings)

            if let hud = attachments.entity(for: "hud") {
                let headAnchor = AnchorEntity(.head)
                hud.position = [0, -0.5, -1.0]
                hud.orientation = simd_quatf(angle: -atan2(0.5, 1.0), axis: [1, 0, 0])
                headAnchor.addChild(hud)
                content.add(headAnchor)
            }

            updateSubscription = content.subscribe(to: SceneEvents.Update.self) { event in
                appModel.tick(deltaTime: Float(event.deltaTime))
            }
        } attachments: {
            Attachment(id: "hud") {
                HUDView(flight: appModel.flight)
            }
        }
        // The system routes the user's gaze to this gesture: look at a ring, pinch to lock on.
        .gesture(
            SpatialTapGesture()
                .targetedToAnyEntity()
                .onEnded { value in
                    appModel.lockOn(to: value.entity)
                }
        )
        .task {
            await appModel.tracking.start()
        }
        .task {
            await appModel.tracking.processHandUpdates()
        }
        .onAppear {
            appModel.immersiveState = .open
        }
        .onDisappear {
            updateSubscription?.cancel()
            updateSubscription = nil
            appModel.tracking.stop()
            appModel.immersiveState = .closed
        }
    }
}
