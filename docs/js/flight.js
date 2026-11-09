import * as THREE from 'three';
import { RING_RADIUS, setRingState } from './world.js';

// Same feel settings as the native FlightController.Tuning.
export const TUNING = {
  cruiseSpeed: 40,
  boostMultiplier: 2.5,
  /** How quickly speed eases toward the throttle target (per second). */
  responsiveness: 1.8,
  /** How quickly the flight direction swings toward where you're steering (per second). */
  turnRate: 3,
  headSteerWeight: 0.4,
  /** Shoulder-to-palm distance (m): below reachStart you hover, at reachFull you're at full speed. */
  reachStart: 0.3,
  reachFull: 0.55,
  /** Neck pivot relative to the eyes, in head space, so turning or nodding doesn't move the shoulder estimate. */
  neckOffset: new THREE.Vector3(0, -0.08, 0.09),
  shoulderDropFromNeck: 0.17,
  lockOnDuration: 6,
  lockOnMinThrottle: 0.7,
  courseResetDelay: 5,
  startPosition: new THREE.Vector3(0, 40, 0),
};

/**
 * The player never moves; worldRoot is shifted opposite the player's position.
 * input = { mode: 'hands'|'controllers'|'head'|'desktop', head: {position, forward, quaternion} | null,
 *           hands: [{ palm, isFist }], throttle, boost }
 */
export class FlightController {
  constructor(worldRoot, rings) {
    this.worldRoot = worldRoot;
    this.rings = rings;
    this.player = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = new THREE.Vector3(0, 0, -1);
    this.reset();
  }

  reset() {
    this.player.copy(TUNING.startPosition);
    this.velocity.set(0, 0, 0);
    this.heading.set(0, 0, -1);
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

    // Speed and direction are eased separately so that turning never bleeds off speed.
    const targetSpeed = throttle * TUNING.cruiseSpeed * (boost ? TUNING.boostMultiplier : 1);
    this.speed += (targetSpeed - this.speed) * Math.min(1, TUNING.responsiveness * dt);
    this.heading.lerp(direction, Math.min(1, TUNING.turnRate * dt));
    if (this.heading.lengthSq() < 1e-6) this.heading.copy(direction);
    this.heading.normalize();
    this.velocity.copy(this.heading).multiplyScalar(this.speed);

    this.player.addScaledVector(this.velocity, dt);
    this.player.y = Math.max(this.player.y, 0);
    this.worldRoot.position.copy(this.player).negate();
    this.worldRoot.updateMatrixWorld();

    this.collectRings(head.position);

    if (this.isComplete) {
      this.completeTimer += dt;
      if (this.completeTimer > TUNING.courseResetDelay) this.reset();
    }

    this.altitude = this.player.y + head.position.y;
    this.isBoosting = boost;
  }

  /**
   * Superman pose: arm extension alone sets speed, arms + head steer, two fists boost.
   * No tracked hands means hover.
   */
  intent(input) {
    const head = input.head;
    if (input.mode !== 'hands') {
      return { throttle: input.throttle, direction: head.forward.clone(), boost: input.boost };
    }

    const idle = { throttle: 0, direction: this.heading.clone(), boost: false };
    if (input.hands.length === 0) return idle;

    const shoulders = TUNING.neckOffset.clone().applyQuaternion(head.quaternion).add(head.position);
    shoulders.y -= TUNING.shoulderDropFromNeck;
    const palms = new THREE.Vector3();
    input.hands.forEach((hand) => palms.add(hand.palm));
    palms.divideScalar(input.hands.length);

    // Reach is measured independent of where the head points. Downward reach is discounted so
    // arms hanging at your sides read as "not extended", while arms angled into a dive still give thrust.
    const toPalms = palms.sub(shoulders);
    const reachVector = toPalms.clone();
    if (reachVector.y < 0) reachVector.y *= 0.4;
    const throttle = THREE.MathUtils.smoothstep(reachVector.length(), TUNING.reachStart, TUNING.reachFull);
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
