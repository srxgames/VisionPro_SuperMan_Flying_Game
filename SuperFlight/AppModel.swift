import SwiftUI
import RealityKit

@MainActor
@Observable
final class AppModel {
    static let immersiveSpaceID = "FlightSpace"

    enum ImmersiveState {
        case closed, inTransition, open
    }

    var immersiveState: ImmersiveState = .closed

    let tracking = TrackingManager()
    let flight = FlightController()

    func tick(deltaTime: Float) {
        flight.update(input: tracking.currentInput(), deltaTime: deltaTime)
    }

    func lockOn(to entity: Entity) {
        flight.lockOn(to: entity)
    }
}
