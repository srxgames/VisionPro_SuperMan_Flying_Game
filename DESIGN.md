# SuperFlight — Design Basics

A full-immersion Apple Vision Pro game where you fly like Superman through a 3D
city using your head, eyes, and hands.

## Platform constraints that shape the design

| Input | What visionOS gives an app | How we use it |
|-------|---------------------------|---------------|
| Head  | Full 6DoF device pose (`WorldTrackingProvider.queryDeviceAnchor`) | Primary look/steer direction |
| Hands | 27 joints per hand (`HandTrackingProvider`, full space only) | Throttle, pitch/yaw steering, boost |
| Eyes  | **No raw gaze data.** Only system hover highlights + "look and pinch" targeting | Look at a ring + pinch = lock-on / auto-steer |

Because gaze is private, eyes are used for *targeting*, never for continuous steering.

## Core control scheme ("Superman pose")

- **Reach forward to fly.** Throttle = how far your hands are pushed out in front of
  your shoulders (≈25 cm = idle, ≈50 cm = full cruise).
- **Point to steer.** Flight direction blends the direction from your shoulders to your
  hands (60%) with your head's forward direction (40%). Raise your arms to climb, lower
  them to dive, turn your body to turn.
- **Make fists to boost.** Both fists while reaching = 2.5x speed.
- **Drop your arms to hover.** You decelerate smoothly to a stop.
- **Look + pinch a ring to lock on.** The ring highlights when you look at it (system
  hover effect). Pinch, and you auto-steer toward it for a few seconds.

## Locomotion & comfort

- The player never moves. The **world root moves opposite the player's velocity**, which is
  the standard approach for artificial locomotion in RealityKit.
- **No artificial rotation.** You turn by physically turning your body or head, which is
  the biggest single comfort win. Only translation is synthetic.
- Velocity is smoothed with exponential easing, so there are no instant jerks.
- The sky sphere stays centered on the player so the horizon is a stable reference.
- Planned: a speed-based vignette, a "comfort mode" with a lower top speed, and a seated mode.

## World (procedural placeholder)

- A large ground plane, roughly 460 box buildings with a clear flight canyon down the middle,
  and clouds.
- A course of rings snaking down the canyon. Fly through a ring to collect it.
- Everything is primitive meshes for now. These will be replaced with Reality Composer Pro
  assets later.

## Code map (`SuperFlight/`)

| File | Responsibility |
|------|----------------|
| `SuperFlightApp.swift` | Scenes: launcher window + full `ImmersiveSpace` |
| `AppModel.swift` | Shared state, per-frame tick |
| `ContentView.swift` | Launcher window (Take Off / Land / Reset) |
| `ImmersiveView.swift` | RealityView, per-frame update, look+pinch gesture, head-locked HUD |
| `Tracking/TrackingManager.swift` | ARKit session: head pose + hand anchors |
| `Tracking/PilotInput.swift` | Raw anchors → head pose, palm position, fist/pinch flags |
| `Flight/FlightController.swift` | Flight model: throttle, steering, boost, lock-on, rings |
| `World/WorldBuilder.swift` | Procedural sky, ground, city, clouds, ring course |
| `HUDView.swift` | Speed / altitude / rings readout |

## Next steps

1. Building collision (bounce or slow down), plus ground-skim effects.
2. Wind / whoosh audio driven by speed (spatial audio).
3. A calibration step that measures each player's arm reach.
4. Replace primitives with a real city in Reality Composer Pro.
5. Game modes: time trial through rings, rescue missions, free-fly.
