import ARKit
import QuartzCore

@MainActor
final class TrackingManager {
    private var session = ARKitSession()
    private var worldTracking = WorldTrackingProvider()
    private var handTracking = HandTrackingProvider()

    private var leftHand: HandAnchor?
    private var rightHand: HandAnchor?

    var handTrackingAvailable: Bool { HandTrackingProvider.isSupported }

    func start() async {
        // Providers can't be rerun after a session stops, so build fresh ones each flight.
        session = ARKitSession()
        worldTracking = WorldTrackingProvider()
        handTracking = HandTrackingProvider()

        var providers: [any DataProvider] = []
        if WorldTrackingProvider.isSupported { providers.append(worldTracking) }
        if HandTrackingProvider.isSupported { providers.append(handTracking) }

        do {
            try await session.run(providers)
        } catch {
            print("ARKit session failed to start: \(error)")
        }
    }

    func processHandUpdates() async {
        guard HandTrackingProvider.isSupported else { return }
        for await update in handTracking.anchorUpdates {
            let anchor = update.anchor
            switch anchor.chirality {
            case .left: leftHand = anchor
            case .right: rightHand = anchor
            }
        }
    }

    func stop() {
        session.stop()
        leftHand = nil
        rightHand = nil
    }

    func currentInput() -> PilotInput {
        PilotInput(
            head: headPose(),
            left: HandState(anchor: leftHand),
            right: HandState(anchor: rightHand),
            handTrackingAvailable: handTrackingAvailable
        )
    }

    private func headPose() -> HeadPose? {
        guard worldTracking.state == .running,
              let device = worldTracking.queryDeviceAnchor(atTimestamp: CACurrentMediaTime()),
              device.isTracked
        else { return nil }
        return HeadPose(transform: device.originFromAnchorTransform)
    }
}
