# World Builder — Architecture

> Status: **APPROVED 2026-10-12** (Stage 2 complete). Changes from here on need a new approval.
> Implements `docs/requirements.md` (approved 2026-10-12). Requirement IDs (W-, L-, I-, D-, X-, N-) are cited inline.

## 1. Overview

```
┌──────────────────────────── index.html (single file, N-1) ─────────────────────────────┐
│                                                                                        │
│  config/ ─────────────┐   brand, facility capacities, rates, weather presets (pure data)│
│                       ▼                                                                │
│  layout/  ──► one facility definition: buildings, lane graph, resources, areas          │
│     │                       │                                                          │
│     ▼                       ▼                                                          │
│  sim/ (pure TS, no three)   render/ (Three.js)          ui/ (Preact DOM overlay)        │
│  fixed-step, seeded    ──►  reads Snapshot,        ◄──  reads Snapshot + Metrics,       │
│  step() → Snapshot          interpolates, picks         sends Commands (select, area,   │
│        ▲                    ▲                           weather, time, theme)           │
│        └──────── app/ main loop: rAF + fixed-step accumulator + Command bus ───────────┘│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Core rule: the simulation is the single source of truth.** Render and UI never change agent state. They read immutable snapshots and send typed commands. This keeps the hard parts (no-overlap traffic and the lifecycle) deterministic and testable without a GPU (N-4, L-5).

## 2. Key decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| A1 | Simulation location | **Main thread** for M1. The API only passes plain data, so it can move into a Web Worker later without a redesign. | About 100 agents cost well under 1 ms per step, so a worker adds complexity for no gain yet. |
| A2 | Time model | **Two clocks** (L-6). Motion advances with *wall* dt × weather speed factor. Process timers advance with wall dt × `timeScale` (default 20). | Cars look natural while turnarounds still fit in minutes. |
| A3 | Fixed step | **20 Hz sim step** (`dt = 50 ms` wall). Render interpolates between the previous and current snapshot. | Deterministic (L-5) and cheap. Interpolation keeps motion smooth at 60 fps or more. |
| A4 | Traffic model | **1-D lane following on a lane graph** (IDM car-following), plus **conflict-zone reservations**, plus **resource reservation before moving**. | Guarantees no overlap by construction rather than by collision response (§4). |
| A5 | Camera | `PerspectiveCamera` with a narrow FOV (~30°) at an isometric-style pitch, driven by three's `MapControls` (left-drag pans, right-drag rotates, wheel or pinch zooms). | Matches I-1 out of the box. A narrow FOV reads as isometric but keeps depth cues. |
| A6 | UI framework | **Preact** (~4 KB) with `@preact/signals`. | M2 needs tabs, a live table, search and a bottom sheet. Vanilla DOM would be more code and harder to test. Preact is small and typed, and the UI can be tested in jsdom. |
| A7 | Labels | An HTML overlay positioned by projecting world points each frame, rather than `CSS2DRenderer`. | One code path for the ring label and the panel anchors. Easy to style as glass in M2. |
| A8 | Shadows | One directional light. Static buildings cast real shadows (shadow map 2048 on desktop, 1024 on mobile). Moving agents get instanced **blob shadows** on mobile and real shadows on desktop. | The soft clay look stays within the mobile budget (N-2). |
| A9 | Randomness | `sfc32` seeded PRNG passed through the sim. `Math.random`, `Date` and `performance` are banned in `src/sim/` by an ESLint rule. | Determinism (L-5). |
| A10 | Bundling | Vite + `vite-plugin-singlefile`. three is imported per module (tree-shaken), never as `import * as THREE`. | Keeps one HTML file small. Target: under 400 KB gzipped (three is about 170 KB of that). |

## 3. Module structure

```
src/
  config/          pure data, no logic
    brand.ts         names, colours, tier labels (N-7)
    facility.ts      capacities (W-5), fleet size and mix (L-2)
    rates.ts         maintenance %, SoC threshold, durations, demand curves (L-1)
    weather.ts       per-mode visual and sim modifiers (X-1)
  layout/          facility geometry, shared by sim and render
    hub.ts           building footprints, lane-graph spec, resources (bays, slots), areas (I-5)
    buildGraph.ts    spec → LaneGraph (arc-length tables, conflict zones)
  sim/             PURE TypeScript; importing 'three' is forbidden by lint
    rng.ts           sfc32 PRNG and helpers (pick, normal, poisson)
    graph/           LaneGraph, Edge (polyline + arc length), pathfinding (Dijkstra with cached routes)
    traffic/         idm.ts, leader.ts (look-ahead across edges), zones.ts (conflict reservations)
    resources.ts     FIFO resource pools: lanes, wash, service, chargers, pumps, slots, gates
    agents/          vehicle.ts (lifecycle FSM), shuttle.ts, cart.ts, tow.ts, pedestrian.ts
    lifecycle.ts     VehicleState enum ↔ the 6 tracker stages (D-5)
    demand.ts        return arrivals (on-rent pool), customer pickups (L-2)
    events.ts        typed event log (MaintenanceFlagged, TowDispatched, Dispatched, ...)
    metrics.ts       KPIs (turnaround, utilisation, EV SoC) and rolling history (D-3)
    datagen.ts       IDs, plates, agreement numbers, odometer (D-7)
    invariants.ts    overlap and gridlock checkers, used by tests and dev builds
    world.ts         createSim(config, seed) → { step, snapshot, apply(command) }
  render/          Three.js only reads snapshots
    scene.ts         renderer, lights, environment, theme palettes (X-4)
    builders/        procedural meshes per building and vehicle class, merged by material
    agents.ts        InstancedMesh pools: snapshot → instance matrices (interpolated)
    picking.ts       raycast → { kind, id }
    selection.ts     pulsing ring and label anchor (I-3)
    camera.ts        MapControls rig: glide, follow, area fly-to, bounds (I-1, I-2, I-5)
    quality.ts       adaptive tiers (pixel ratio, shadows, effects) from frame-time sampling
    fx/              (M2) weather particles, wet-asphalt material, day/night, heat shimmer
  ui/              Preact overlay
    store.ts         signals: selection, area, weather, timeOfDay, theme
    m1/              DetailPanel, AreaSwitcher (minimal)
    m2/              TopBar, KpiCards, ProcessTracker, LiveTable, Alerts, BottomSheet
  app/
    main.ts          bootstrap, WebGL 2 check (N-8), rAF loop, command bus
    loop.ts          fixed-step accumulator (A3)
tests/
  unit/            mirrors src/ (Vitest)
  soak/            long headless runs (Vitest, separate script)
  e2e/             Playwright against dist/index.html via file://
```

## 4. The no-overlap engine (L-4)

This is the riskiest part, so the design aims to **make overlap impossible by construction**. A runtime check verifies it.

### 4.1 Lane graph
- Every road, aisle, bay approach and Ready-lot slot is a **directed edge** with a polyline centreline, a length, a speed limit and an allowed agent class. Bays and slots are **dead-end edges** (enter, park, leave by a separate exit edge).
- The facility flow is **acyclic**: entry → return lanes → wash → (service) → charge or fuel → lot → exit. A single one-way service loop is the only cycle, used by golf carts and the tow truck (§4.5).
- Edges are resampled into arc-length tables, so `positionAt(edge, s)` is O(log n).

### 4.2 Following on a lane (no rear-end overlap)
- Each mover has `(edgeId, s, v)` and a precomputed route.
- **Leader lookup** walks forward along the mover's *own route* across edge boundaries, up to a look-ahead distance, and finds the nearest obstacle. That is either another agent's rear, or a **virtual stop line** (an unreserved conflict zone, an unacquired resource, or a red barrier gate).
- Acceleration uses the **Intelligent Driver Model** with a minimum gap of `s0 = 1.5 m` bumper to bumper. Speed is clamped to `[0, vMax × weatherFactor]`. A hard clamp `s_next ≤ s_leader − length_leader − s0` guarantees no rear-end overlap even if the IDM integration overshoots.

### 4.3 Crossings and merges (no side overlap)
- When the layout is built, edge pairs whose **swept footprints** (centreline ± half the widest vehicle width + margin) intersect are grouped into **conflict zones**. Each zone stores the `[sEnter, sExit]` interval on every member edge.
- A mover must **reserve** a zone before its front reaches `sEnter`. Reservation is FIFO by arrival at the stop line. Ties break by priority (pedestrians > tow truck > shuttle > fleet car > golf cart), then by agent id, so the result is deterministic.
- **Don't block the box:** a reservation is only granted if the downstream edge has room for the mover's full length plus `s0`. So no agent ever stops inside a zone, which removes the classic gridlock.
- The reservation is released when the mover's *rear* passes `sExit`.
- Pedestrian crossings are conflict zones shared between a vehicle edge and a sidewalk edge.

### 4.4 Resources (no overlap at bays and slots, no gridlock)
- A vehicle requests its **next resource** (wash bay, charger, slot, gate) from a FIFO pool. It routes onto that resource's approach edge **only after the reservation is granted**. Until then it waits in the current stage's queue lane, whose capacity is fixed. When a queue lane is full, upstream stages back up, and the demand generator stops admitting returns until there is room (back-pressure).
- Every stage has a buffer, and the main flow is acyclic. So a car waiting for stage *k+1* never holds a resource that stage *k+1* needs. That rules out circular waits.

### 4.5 Service loop and tow
- Golf carts and the tow truck use a separate one-way service loop. They join the main flow only through conflict zones, with the same rules.
- When towing, the car being towed becomes a **child** of the tow truck (its pose is derived from the truck's) and is excluded from separate collision checks. The combined length is used for following and box checks.

### 4.6 Proof by testing
- `invariants.ts` builds oriented bounding boxes for every agent each step and checks every pair that shares a spatial-hash cell (separating axis test).
  - **Overlap** means any pair intersects, except parent and child during a tow.
  - **Gridlock** means any agent with speed 0 for longer than `Tmax` (default 10 simulated minutes) while not parked at a resource.
- In dev builds the invariant checker runs every step and logs an error. In production it is stripped.

## 5. Data flow and contracts

```ts
// sim/world.ts (sketch, final types arrive with the tests)
interface Sim {
  step(): void;                          // advance one fixed step (50 ms wall)
  snapshot(): Readonly<Snapshot>;        // plain data, structured-clone safe (A1)
  apply(cmd: Command): void;             // setWeather, setTimeScale, setTimeOfDay, ...
  metrics(): Readonly<Metrics>;
  drainEvents(): readonly SimEvent[];
}
interface AgentView { id: string; kind: AgentKind; cls?: VehicleClass;
  x: number; z: number; heading: number; speed: number;
  state: VehicleState; stage?: TrackerStage; fuelPct?: number; socPct?: number;
  odometerMi?: number; task?: string; etaSimSec?: number; parentId?: string }
```

- The render keeps `prev` and `curr` snapshots and draws `lerp(prev, curr, alpha)`, using shortest-arc interpolation for heading.
- The UI reads snapshots through signals, throttled to **4 Hz** for tables and **10 Hz** for the detail panel, so DOM work stays off the frame budget.
- Commands are the only way to cause change. The camera and selection live in render and UI, not in the sim.

## 6. Rendering and performance plan (N-2)

| Item | Approach | Est. draw calls |
|---|---|---|
| Ground, roads, markings | Merged into 2–3 meshes; markings via one instanced decal quad | 3 |
| Buildings (7 zones) | Procedural boxes, cylinders and extrusions, merged per material | ~12 |
| Fleet cars (3 classes) | One `InstancedMesh` per class per part (body, glass, wheels, lights) | ~12 |
| Shuttles, carts, tow, van | Instanced per type | ~8 |
| Pedestrians | Instanced capsule body and head | 2 |
| Props (palms, poles, chargers, barriers) | Instanced | ~8 |
| Selection ring, blob shadows | 1 + 1 | 2 |
| M2 particles (rain, spray, heat) | `Points` or instanced quads | ~3 |
| **Total** | | **≈ 50**, well under the 150 budget |

- **Adaptive quality** (`quality.ts`) samples frame time over 2 s windows. Three tiers adjust pixel-ratio cap (2.0, 1.5, 1.0), shadow-map size, agent shadows (real or blob), and post effects. Tiers step down after a sustained frame time over 22 ms and step up after a sustained frame time under 12 ms.
- **No per-frame allocations** in the render loop: matrices and vectors are reused.

## 7. M2 hooks, designed in now

- **Weather** is one `WeatherPreset` object, read by both sim (speed and demand factors) and render (light, fog, material uniforms, particles). Switching weather is one command.
- **Day/night** is a `timeOfDay ∈ [0,24)` driven by the sim clock (or forced by the toggle). Render maps it to sun angle, ambient light, emissive strength and the floodlight on/off schedule.
- **Theme** swaps a `Palette` object (CSS custom properties plus scene colours). The choice is stored in `localStorage` inside try/catch (X-4).
- **Mobile**: the UI layout uses a CSS breakpoint at 720 px. Below it, panels become a bottom sheet. `quality.ts` starts one tier lower on touch devices.

## 8. Testing strategy (Stage 3 preview)

| Layer | Tool | What's tested |
|---|---|---|
| Unit | Vitest | rng reproducibility, arc-length sampling, pathfinding, IDM and the hard gap clamp, zone reservation order and the box rule, resource FIFO, lifecycle transitions and the stage mapping, demand back-pressure, KPI formulas (utilisation = on rent ÷ 120, D8), datagen formats (regex), palette contrast ≥ 4.5:1 where text is used (N-5) |
| Property | Vitest + `fast-check` | Random scenarios with random agents and timings on mini graphs (a single merge, a crossing, a bay cluster): no overlap and no gridlock |
| Soak | Vitest (`npm run test:soak`) | Full hub: 3 seeds × 4 weather modes × 2 simulated hours. Zero overlaps, zero gridlock, throughput ≥ floor, KPIs within plausible bands |
| Determinism | Vitest | Same seed and N steps → identical snapshot hash. A different seed gives a different hash |
| UI | Vitest + `@testing-library/preact` (jsdom) | Detail panel fields per selected kind, area switcher commands, (M2) table row → selection |
| E2E | Playwright on `file://dist/index.html` | Loads with no console errors and no network requests, canvas not blank, clicking a known car selects it and the panel shows its ID, area switch moves the camera. A test-only `window.__hub` hook exists only when `VITE_TEST_HOOKS=1` |
| Static | `tsc --noEmit`, ESLint | strict mode, no `any`, no `three` imports and no `Math.random` / `Date` in `src/sim` |

**Coverage gate:** at least 90% lines and branches for `src/sim/**`. Render code is covered by E2E rather than line coverage.

## 9. Security and privacy

- **No network**: the built page makes no requests (asserted in E2E). A CSP meta tag is injected at build: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:`. Inline is unavoidable for a single file.
- No `eval` or `new Function`. Any user-visible text comes from config or datagen and is rendered as text, never as HTML.
- `localStorage` is only used for the theme choice, wrapped in try/catch.
- Dependencies are kept minimal (three, preact, @preact/signals at runtime). A lockfile is committed and `npm audit` runs in the check script.
- **Accepted audit finding (2026-10-12):** GHSA-vfj7-8cjw-p6xm (`braces` ≤ 3.0.3, via `micromatch` in `vite-plugin-singlefile`) is a denial of service triggered by deeply nested glob patterns. It is build-time only, nothing from it ships in the page, and the plugin only sees our own config. No patched `braces` exists yet. Revisit when one is released.

## 10. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Gridlock in rare timing combinations | World freezes | Acyclic flow, the box rule, bounded queues with back-pressure, a soak test across seeds, and a gridlock invariant in dev |
| Tight curves cause visual overlap despite a correct 1-D gap | Breaks L-4 visually | Swept-footprint conflict zones on curves, and the OBB invariant checks the real 2-D footprint, not just `s` |
| Mobile GPU too slow (wet reflections, shimmer) | Under 30 fps | Adaptive tiers. Shimmer is off on mobile. Wet asphalt uses a cheap roughness/env trick, not real reflections |
| Bundle size (three is large) | Slow first load | Per-module imports, tree shaking, a size check in CI (fails over 400 KB gzipped) |
| Scope creep in procedural modelling | Schedule | Each building gets a "blockout" pass first (M1). A detail pass only if time allows |

## 11. Delivery plan

**M1 (blocks 1–3)**, with each step test-first:
1. ✅ Scaffold: Vite, TS strict, ESLint, Vitest, Playwright, singlefile build, CI scripts, `git init`.
2. ✅ `sim/rng`, `graph`, then `traffic` (IDM, zones), then `resources`, then `lifecycle` and agents, then `demand`, then `metrics` and `datagen`. Then soak tests.
3. ✅ `layout/hub` with the real facility graph. Soak passes on the real layout.
4. Render: scene, builders (blockout), agent instancing, interpolation.
5. Interaction: camera rig, picking, selection, M1 detail panel, area switcher. Then E2E.

**M2 (blocks 4–5)**: glass UI shell, KPIs, tracker, table, search, alerts; then weather, day/night, theme, mobile bottom sheet; then performance tuning on the reference devices.

## 12. Approval record
Approved 2026-10-12: A1–A10 (including Preact for UI and the simulation on the main thread), the traffic design in §4, the 400 KB gzipped bundle budget and the 90% coverage gate on `src/sim`.

## 13. Implementation notes (Stage 4: M1 steps 1–3, 2026-10-12)

Decisions and contract changes made while implementing, each covered by tests.

### 13.1 Contract additions (additive; nothing approved was removed)
| Module | Addition | Why |
|---|---|---|
| `graph/laneGraph` | `EdgeSpec.group`: edges sharing a group never conflict | The tow truck's approach to the tow bay crosses the bay's own corridor. A single reservation covers both, so they are never in use at the same time. |
| `graph/laneGraph` | Edges joined by a forward hop shorter than their clearance do not conflict | Collinear segments of the same aisle 3.2 m apart were stitching whole aisles into one giant zone, which starved pedestrians and departures. Traffic on one lane is already ordered by car-following, and the per-stall zones keep the turn-offs safe. |
| `traffic/engine` | `spawn(spec, s?)` | Places a car exactly where it physically is: initial stalls, and a towed car set down in a service bay. |
| `traffic/engine` | `setLength`, `occupies`, `pointBehind` | Tow truck length while carrying; releasing a bay only after the car has fully left it; the towed car tracking the truck's path. |
| `sim/world` | `SimConfig.rateOverrides` | Lets tests force rare paths (for example, every inspection severe). |

### 13.2 Engine behaviour refinements
- **Body-span occupancy (bug fix, regression-tested):** agents are listed on every edge their body covers, not just the edge their front is on. A leader that has turned off the follower's route stays visible through its rear. The soak test found this as pedestrian–pedestrian overlaps.
- **Arrival at the route end:** the end is treated as an obstacle 0.6 m beyond, so a car arrives instead of creeping up asymptotically, and it is clamped exactly at the end. This removed several seconds of creep per bay.
- **Zone chains:** zones closer together than a box length are reserved together, all-or-nothing, with one shared ticket. Only the agent at the front of its lane may request. Together with strict FIFO, this gives a single global order, so chain reservations cannot deadlock.

### 13.3 Simulation decisions
- **Severe path:** a severe car is detailed in the service bay after the repair (the building does tyres, oil and detailing). The lifecycle still runs `inService → washQueue → washing → energyQueue` and emits the `washed` milestone, but no second physical trip to the wash is needed, which keeps the flow acyclic.
- **Tow bay:** after inspection, a severe car drives to a tow-bay spur north of the road. The tow truck stops in front of it, the car is lifted, and its pose blends onto the truck's track over the first 10 m.
- **Queues:** the car at the front of a queue lane requests its unit while still rolling, so it doesn't stop at the queue head. Units are released only when the car's rear has fully left the bay.
- **Customers** walk from the terminal to a median beside their car's row at the south end of the lot, where the walkway crosses the exit aisles clear of every stall merge. There they board, and the car departs. (M1 simplification: they don't walk up to the stall itself.)
- **Warm start:** 1,800 wall steps (90 s) are run before t = 0, so the hub opens mid-operation.
- **Gridlock detector:** cars waiting for capacity (queue states, staged, working, or heading to the tow bay through the wash queue road) count as parked. A real deadlock still shows up as a throughput collapse, which the soak test asserts.

### 13.4 Tuning, from soak profiling
| Setting | Was | Now | Reason |
|---|---|---|---|
| Pickups per sim hour | 26 | **20** | At 20×, physical driving dominates bay cycles. Two wash bays sustain about 26/h, so 20/h keeps up in normal weather, and the heatwave (+40%) builds queues, matching the user story. |
| Mean rental | 3 h | **3.9 h** | Little's law keeps about 78 of 120 cars on rent (≈65% utilisation). |
| Bay approach speed | 3 m/s | **4.5 m/s** | Stall stubs stay at 3 m/s. |
| Fleet IDM a / b | 1.4 / 2.0 | **2.0 / 2.5** m/s² | Shorter stop-and-go at every station. |
| Wash bay length | 35 m | **16 m** | The minimum for the lanes to separate before the parking spot. |
| Heatwave | pickups +40% | **pickups and returns +40%** | Requirement X-1 (rental durations ÷ demand factor). |

**Soak floor:** a car must reach checkout and staging at **≥ 60% of the configured base demand** in every weather (24 per 2 h at 20/h), replacing the fixed 30. It is tied to configuration so it stays meaningful when demand is tuned.

### 13.5 Verified results (2026-10-12)
- 166 unit and property tests and 12 soak runs (3 seeds × 4 weathers × 2 simulated hours) pass, with zero overlaps and zero gridlock.
- Typical KPIs: utilisation 53–69%, turnaround 48–64 min, ready EV state of charge ≥ 80%.
- Coverage on `src/sim`: 97% statements, 91% branches, 100% functions, 98.5% lines. Branch coverage for `traffic/engine` (87%), `world` (88.5%), `idm` and `rng` (86%) is below 90% individually; the gate applies to `src/sim` as a whole.
