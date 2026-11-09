import ARKit
import simd

/// One frame of player input, distilled from ARKit anchors. All positions are in
/// ARKit origin space, which matches RealityKit world space in a full ImmersiveSpace.
struct PilotInput {
    var head: HeadPose?
    var left: HandState
    var right: HandState
    /// False in the simulator, which has no hand tracking.
    var handTrackingAvailable: Bool
}

struct HeadPose {
    var position: SIMD3<Float>
    var forward: SIMD3<Float>

    init(transform: simd_float4x4) {
        position = transform.columns.3.xyz
        forward = -simd_normalize(transform.columns.2.xyz)
    }
}

struct HandState {
    var isTracked = false
    var palmPosition: SIMD3<Float> = .zero
    var isFist = false
    var isPinching = false

    static let untracked = HandState()

    /// Average wrist-to-fingertip distance below which the hand counts as a fist (open hand is ~0.17 m).
    static let fistThreshold: Float = 0.10
    static let pinchThreshold: Float = 0.02

    init() {}

    init(anchor: HandAnchor?) {
        guard let anchor, anchor.isTracked, let skeleton = anchor.handSkeleton else {
            self = .untracked
            return
        }

        func position(_ joint: HandSkeleton.JointName) -> SIMD3<Float> {
            (anchor.originFromAnchorTransform * skeleton.joint(joint).anchorFromJointTransform).columns.3.xyz
        }

        let wrist = position(.wrist)
        let tips: [HandSkeleton.JointName] = [.indexFingerTip, .middleFingerTip, .ringFingerTip, .littleFingerTip]
        let averageCurl = tips.map { simd_distance(position($0), wrist) }.reduce(0, +) / Float(tips.count)

        isTracked = true
        palmPosition = (wrist + position(.middleFingerKnuckle)) * 0.5
        isFist = averageCurl < Self.fistThreshold
        isPinching = simd_distance(position(.thumbTip), position(.indexFingerTip)) < Self.pinchThreshold
    }
}

extension SIMD4 where Scalar == Float {
    var xyz: SIMD3<Float> { SIMD3(x, y, z) }
}
