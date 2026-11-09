import RealityKit
import UIKit
import simd

/// Turns head + hand input into flight. The player stays put; the world root is moved
/// opposite the player's position so the city streams past them.
@MainActor
@Observable
final class FlightController {
    struct Tuning {
        var cruiseSpeed: Float = 40
        var boostMultiplier: Float = 2.5
        /// How quickly speed eases toward the throttle target. Lower is more comfortable.
        var responsiveness: Float = 1.8
        /// How quickly the flight direction swings toward where you're steering.
        var turnRate: Float = 3
        /// 0 = steer purely with hands, 1 = purely with head.
        var headSteerWeight: Float = 0.4
        /// Shoulder-to-palm distance (m): below reachStart you hover, at reachFull you're at full speed.
        var reachStart: Float = 0.30
        var reachFull: Float = 0.55
        /// Neck pivot relative to the eyes, in head space, so turning or nodding doesn't move the shoulder estimate.
        var neckOffset: SIMD3<Float> = [0, -0.08, 0.09]
        var shoulderDropFromNeck: Float = 0.17
        var lockOnDuration: Float = 6
        var lockOnMinThrottle: Float = 0.7
        var simulatorThrottle: Float = 0.5
        var ringRadius: Float = WorldBuilder.ringRadius
        var startPosition: SIMD3<Float> = [0, 40, 0]
    }

    var tuning = Tuning()

    private(set) var speed: Float = 0
    private(set) var altitude: Float = 0
    private(set) var ringsCollected = 0
    private(set) var totalRings = 0
    private(set) var isBoosting = false
    private(set) var isLockedOn = false

    @ObservationIgnored private var worldRoot: Entity?
    @ObservationIgnored private var rings: [Entity] = []
    @ObservationIgnored private var collectedRings: Set<ObjectIdentifier> = []
    @ObservationIgnored private var playerPosition: SIMD3<Float> = [0, 40, 0]
    @ObservationIgnored private var heading: SIMD3<Float> = [0, 0, -1]
    @ObservationIgnored private var lockTarget: Entity?
    @ObservationIgnored private var lockTimeRemaining: Float = 0

    func attach(worldRoot: Entity, rings: [Entity]) {
        self.worldRoot = worldRoot
        self.rings = rings
        reset()
    }

    func reset() {
        playerPosition = tuning.startPosition
        heading = [0, 0, -1]
        speed = 0
        lockTarget = nil
        lockTimeRemaining = 0
        collectedRings.removeAll()
        rings.forEach { WorldBuilder.setRingCollected($0, false) }
        ringsCollected = 0
        totalRings = rings.count
        worldRoot?.position = -playerPosition
    }

    func lockOn(to entity: Entity) {
        guard rings.contains(where: { $0 === entity }),
              !collectedRings.contains(ObjectIdentifier(entity))
        else { return }
        lockTarget = entity
        lockTimeRemaining = tuning.lockOnDuration
    }

    func update(input: PilotInput, deltaTime dt: Float) {
        guard let worldRoot, let head = input.head, dt > 0 else { return }

        var (throttle, direction, boosting) = handIntent(input: input, head: head)

        if let target = lockTarget, lockTimeRemaining > 0 {
            lockTimeRemaining -= dt
            let toTarget = target.position(relativeTo: nil) - head.position
            if simd_length(toTarget) > 0.01 {
                direction = simd_normalize(toTarget)
                throttle = max(throttle, tuning.lockOnMinThrottle)
            }
        } else {
            lockTarget = nil
        }

        // Speed and direction are eased separately so that turning never bleeds off speed.
        let targetSpeed = throttle * tuning.cruiseSpeed * (boosting ? tuning.boostMultiplier : 1)
        speed += (targetSpeed - speed) * min(1, tuning.responsiveness * dt)
        let turned = simd_mix(heading, direction, SIMD3(repeating: min(1, tuning.turnRate * dt)))
        heading = simd_length(turned) > 1e-3 ? simd_normalize(turned) : direction

        playerPosition += heading * speed * dt
        playerPosition.y = max(playerPosition.y, 0)
        worldRoot.position = -playerPosition

        collectRings(near: head.position)

        altitude = playerPosition.y + head.position.y
        isBoosting = boosting
        isLockedOn = lockTarget != nil
    }

    /// Superman pose: arm extension alone sets speed, arms + head steer, two fists boost.
    /// No tracked hands means hover.
    private func handIntent(input: PilotInput, head: HeadPose) -> (throttle: Float, direction: SIMD3<Float>, boosting: Bool) {
        guard input.handTrackingAvailable else {
            return (tuning.simulatorThrottle, head.forward, false)
        }

        let hands = [input.left, input.right].filter(\.isTracked)
        guard !hands.isEmpty else { return (0, heading, false) }

        let neck = head.position + head.orientation.act(tuning.neckOffset)
        let shoulders = neck - SIMD3<Float>(0, tuning.shoulderDropFromNeck, 0)
        let palms = hands.map(\.palmPosition).reduce(.zero, +) / Float(hands.count)
        let toPalms = palms - shoulders

        // Reach is measured independent of where the head points. Downward reach is discounted so
        // arms hanging at your sides read as "not extended", while arms angled into a dive still give thrust.
        var reachVector = toPalms
        if reachVector.y < 0 { reachVector.y *= 0.4 }
        let throttle = smoothstep(tuning.reachStart, tuning.reachFull, simd_length(reachVector))
        guard throttle > 0, simd_length(toPalms) > 0.01 else { return (0, heading, false) }

        let direction = simd_normalize(simd_mix(simd_normalize(toPalms), head.forward, SIMD3(repeating: tuning.headSteerWeight)))
        let boosting = hands.count == 2 && hands.allSatisfy(\.isFist) && throttle > 0.5
        return (throttle, direction, boosting)
    }

    private func collectRings(near headPosition: SIMD3<Float>) {
        for ring in rings where !collectedRings.contains(ObjectIdentifier(ring)) {
            if simd_distance(ring.position(relativeTo: nil), headPosition) < tuning.ringRadius {
                collectedRings.insert(ObjectIdentifier(ring))
                WorldBuilder.setRingCollected(ring, true)
                ringsCollected += 1
                if lockTarget === ring { lockTarget = nil }
            }
        }
    }

    private func smoothstep(_ edge0: Float, _ edge1: Float, _ x: Float) -> Float {
        let t = simd_clamp((x - edge0) / (edge1 - edge0), 0, 1)
        return t * t * (3 - 2 * t)
    }
}
