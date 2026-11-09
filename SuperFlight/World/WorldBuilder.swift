import RealityKit
import UIKit

struct FlightWorld {
    /// Everything that scrolls past the player. Moved by `FlightController`.
    let root: Entity
    /// Stays centered on the player so the horizon never drifts.
    let sky: Entity
    let sun: Entity
    let rings: [Entity]
}

/// Procedural placeholder world. Swap pieces out for Reality Composer Pro assets later.
@MainActor
enum WorldBuilder {
    static let ringRadius: Float = 6
    static let eyeHeight: Float = 1.6

    private static let ringIdleMaterial = SimpleMaterial(color: .systemYellow, roughness: 0.3, isMetallic: true)
    private static let ringCollectedMaterial = SimpleMaterial(color: UIColor.systemGreen.withAlphaComponent(0.35), roughness: 0.3, isMetallic: false)

    static func build(seed: UInt64 = 42) -> FlightWorld {
        var rng = SeededGenerator(seed: seed)
        let root = Entity()
        root.name = "WorldRoot"

        root.addChild(makeGround())
        root.addChild(makeCity(using: &rng))
        root.addChild(makeClouds(using: &rng))

        let rings = makeRingCourse(count: 14)
        rings.forEach { root.addChild($0) }

        return FlightWorld(root: root, sky: makeSky(), sun: makeSun(), rings: rings)
    }

    static func setRingCollected(_ ring: Entity, _ collected: Bool) {
        let material = collected ? ringCollectedMaterial : ringIdleMaterial
        for case let bead as ModelEntity in ring.children {
            bead.model?.materials = [material]
        }
    }

    // MARK: - Pieces

    private static func makeSky() -> Entity {
        let sky = ModelEntity(
            mesh: .generateSphere(radius: 1500),
            materials: [UnlitMaterial(color: UIColor(red: 0.45, green: 0.70, blue: 0.98, alpha: 1))]
        )
        sky.name = "Sky"
        sky.scale = [-1, 1, 1] // flip normals inward
        return sky
    }

    private static func makeSun() -> Entity {
        let sun = Entity()
        sun.name = "Sun"
        sun.components.set(DirectionalLightComponent(color: .white, intensity: 3000))
        sun.look(at: .zero, from: [300, 500, 200], relativeTo: nil)
        return sun
    }

    private static func makeGround() -> Entity {
        let ground = ModelEntity(
            mesh: .generatePlane(width: 4000, depth: 4000),
            materials: [SimpleMaterial(color: UIColor(red: 0.30, green: 0.45, blue: 0.28, alpha: 1), roughness: 1, isMetallic: false)]
        )
        ground.name = "Ground"
        return ground
    }

    private static func makeCity(using rng: inout SeededGenerator) -> Entity {
        let city = Entity()
        city.name = "City"

        let box = MeshResource.generateBox(size: 1)
        let palette: [SimpleMaterial] = [
            UIColor(white: 0.55, alpha: 1), UIColor(white: 0.70, alpha: 1),
            UIColor(red: 0.55, green: 0.60, blue: 0.70, alpha: 1), UIColor(red: 0.70, green: 0.62, blue: 0.52, alpha: 1),
        ].map { SimpleMaterial(color: $0, roughness: 0.8, isMetallic: false) }

        let canyonHalfWidth: Float = 80
        for x in stride(from: Float(-600), through: 600, by: 50) {
            for z in stride(from: Float(-1300), through: 400, by: 50) {
                guard abs(x) > canyonHalfWidth, Float.random(in: 0...1, using: &rng) < 0.6 else { continue }

                let width = Float.random(in: 15...35, using: &rng)
                let depth = Float.random(in: 15...35, using: &rng)
                let height = Float.random(in: 10...130, using: &rng)
                let building = ModelEntity(mesh: box, materials: [palette.randomElement(using: &rng)!])
                building.scale = [width, height, depth]
                building.position = [x, height / 2, z]
                city.addChild(building)
            }
        }
        return city
    }

    private static func makeClouds(using rng: inout SeededGenerator) -> Entity {
        let clouds = Entity()
        clouds.name = "Clouds"
        let puff = MeshResource.generateSphere(radius: 1)
        let white = SimpleMaterial(color: UIColor(white: 1, alpha: 0.9), roughness: 1, isMetallic: false)

        for _ in 0..<60 {
            let cloud = Entity()
            cloud.position = [
                Float.random(in: -900...900, using: &rng),
                Float.random(in: 150...230, using: &rng),
                Float.random(in: -1500...600, using: &rng),
            ]
            for _ in 0..<4 {
                let p = ModelEntity(mesh: puff, materials: [white])
                p.scale = SIMD3(repeating: Float.random(in: 10...22, using: &rng))
                p.position = [Float.random(in: -20...20, using: &rng), Float.random(in: -4...4, using: &rng), Float.random(in: -10...10, using: &rng)]
                cloud.addChild(p)
            }
            clouds.addChild(cloud)
        }
        return clouds
    }

    /// Rings snake down the canyon. Each ring faces the next one.
    private static func makeRingCourse(count: Int) -> [Entity] {
        let points: [SIMD3<Float>] = (0..<count).map { i in
            let t = Float(i)
            return [sin(t * 0.6) * 50, 40 + eyeHeight + sin(t * 0.9) * 20, -60 - t * 80]
        }

        return points.enumerated().map { index, point in
            let ring = makeRing()
            ring.name = "Ring\(index)"
            ring.position = point
            let next = index + 1 < points.count ? points[index + 1] : point + [0, 0, -80]
            ring.look(at: next, from: point, relativeTo: nil)
            return ring
        }
    }

    private static func makeRing() -> Entity {
        let ring = Entity()
        let bead = MeshResource.generateSphere(radius: 0.7)
        let beadCount = 24
        for i in 0..<beadCount {
            let angle = Float(i) / Float(beadCount) * 2 * .pi
            let b = ModelEntity(mesh: bead, materials: [ringIdleMaterial])
            b.position = [cos(angle) * ringRadius, sin(angle) * ringRadius, 0]
            ring.addChild(b)
        }

        // Makes the ring a gaze + pinch target with a system hover highlight.
        ring.components.set(CollisionComponent(shapes: [.generateSphere(radius: ringRadius)]))
        ring.components.set(InputTargetComponent())
        ring.components.set(HoverEffectComponent())
        return ring
    }
}

/// Deterministic RNG (SplitMix64) so the city layout is the same every launch.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
