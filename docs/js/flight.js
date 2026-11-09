import * as THREE from 'three';
import { RING_RADIUS, setRingState } from './world.js';

// Same feel settings as the native FlightController.Tuning.
export const TUNING = {
  cruiseSpeed: 40,
  boostMultiplier: 2.5,
  responsiveness: 1.8,
  headSteerWeight: 0.4,
  reachStart: 0.25,
  reachFull: 0.5,
  shoulderDrop: 0.25,
  lockOnDuration: 6,
  lockOnMinThrottle: 0.7,
  courseResetDelay: 5,
  startPosition: new THREE.Vector3(0, 40, 0),
};

/**
 * The player never moves; worldRoot is shifted opposite the player's position.
 * input = { mode: 'hands'|'controllers'|'head'|'desktop', head: {position, forward} | null,
 *           hands: [{ palm, isFist }], throttle, boost }
 */
export class FlightController {
  constructor(worldRoot, rings) {
    this.worldRoot = worldRoot;
    this.rings = rings;
    this.player = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.player.copy(TUNING.startPosition);
    this.velocity.set(0, 0, 0);
    this.collected = new Set();
    this.lockTarget = null;
    this.lockTimeRemaining = 0;
    this.completeTimer = 0;
    this.speed = 0;
    this.altitude = 0;
    this.isBoosting = false;
    this.rings.forEach((ring) => setRingState(ring, 'idle'));
    this.worldRoot.position.copy(this.player).negate();
  }

  get ringsCollected() { return this.collected.size; }
  get totalRings() { return this.rings.length; }
  get isComplete() { return this.collected.size === this.rings.length; }
  get isLockedOn() { return this.lockTarget !== null; }

  /** Lock onto the ring closest to the given ray (gaze ray on Vision Pro, view center on desktop). */
  lockOnAlong(origin, direction) {
    const center = new THREE.Vector3();
    let best = null;
    let bestAngle = Infinity;

    for (const ring of this.rings) {
      if (this.collected.has(ring)) continue;
      ring.getWorldPosition(center);
      const toRing = center.sub(origin);
      const along = toRing.dot(direction);
      if (along <= 0) continue;
      const offAxis = toRing.addScaledVector(direction, -along).length();
      // Gaze gets less precise with distance, so widen the hit cone the farther away the ring is.
      if (offAxis > RING_RADIUS * 1.5 + along * 0.03) continue;
      const angle = offAxis / along;
      if (angle < bestAngle) { bestAngle = angle; best = ring; }
    }

    if (!best) return;
    if (this.lockTarget && this.lockTarget !== best) setRingState(this.lockTarget, 'idle');
    this.lockTarget = best;
    this.lockTimeRemaining = TUNING.lockOnDuration;
    setRingState(best, 'locked');
  }

  update(input, dt) {
    if (!input.head || dt <= 0) return;
    const head = input.head;
    let { throttle, direction, boost } = this.intent(input);

    if (this.lockTarget) {
      this.lockTimeRemaining -= dt;
      if (this.lockTimeRemaining <= 0) {
        setRingState(this.lockTarget, 'idle');
        this.lockTarget = null;
      } else {
        const toTarget = this.lockTarget.getWorldPosition(new THREE.Vector3()).sub(head.position);
        if (toTarget.lengthSq() > 1e-4) {
          direction = toTarget.normalize();
          throttle = Math.max(throttle, TUNING.lockOnMinThrottle);
        }
      }
    }

    const targetSpeed = throttle * TUNING.cruiseSpeed * (boost ? TUNING.boostMultiplier : 1);
    const desired = direction.multiplyScalar(targetSpeed);
    this.velocity.lerp(desired, Math.min(1, TUNING.responsiveness * dt));

    this.player.addScaledVector(this.velocity, dt);
    this.player.y = Math.max(this.player.y, 0);
    this.worldRoot.position.copy(this.player).negate();
    this.worldRoot.updateMatrixWorld();

    this.collectRings(head.position);

    if (this.isComplete) {
      this.completeTimer += dt;
      if (this.completeTimer > TUNING.courseResetDelay) this.reset();
    }

    this.speed = this.velocity.length();
    this.altitude = this.player.y + head.position.y;
    this.isBoosting = boost;
  }

  /** Superman pose: reach forward to fly, point to steer, two fists to boost. */
  intent(input) {
    const head = input.head;
    if (input.mode !== 'hands') {
      return { throttle: input.throttle, direction: head.forward.clone(), boost: input.boost };
    }

    const idle = { throttle: 0, direction: head.forward.clone(), boost: false };
    const flatForward = new THREE.Vector3(head.forward.x, 0, head.forward.z);
    if (flatForward.lengthSq() < 1e-4) return idle;
    flatForward.normalize();

    const shoulders = head.position.clone();
    shoulders.y -= TUNING.shoulderDrop;
    const palms = new THREE.Vector3();
    input.hands.forEach((hand) => palms.add(hand.palm));
    palms.divideScalar(input.hands.length);

    const toPalms = palms.sub(shoulders);
    const reach = toPalms.dot(flatForward);
    const throttle = THREE.MathUtils.smoothstep(reach, TUNING.reachStart, TUNING.reachFull);
    if (throttle <= 0 || toPalms.lengthSq() < 1e-4) return idle;

    const direction = toPalms.normalize().lerp(head.forward, TUNING.headSteerWeight).normalize();
    const boost = input.hands.length === 2 && input.hands.every((h) => h.isFist) && throttle > 0.5;
    return { throttle, direction, boost };
  }

  collectRings(headPosition) {
    const center = new THREE.Vector3();
    for (const ring of this.rings) {
      if (this.collected.has(ring)) continue;
      if (ring.getWorldPosition(center).distanceTo(headPosition) < RING_RADIUS) {
        this.collected.add(ring);
        setRingState(ring, 'collected');
        if (this.lockTarget === ring) this.lockTarget = null;
      }
    }
  }
}
