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

- **No network**: the built page makes no requests (asserted in E2E). A CSP meta tag is injected **at build only** by a Vite plugin (`vite.config.ts`, `apply: 'build'`). It must never be in `index.html`, or the dev server's separate module files are blocked and the page is blank (regression guarded by `tests/e2e/dev.spec.ts`). The policy is: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:`. Inline is unavoidable for a single file.
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
4. ✅ Render: scene, builders (blockout), agent instancing, interpolation.
5. ✅ Interaction: camera rig, picking, selection, M1 detail panel, area switcher. Then E2E.

**M2 (blocks 4–5)** ✅: glass UI shell, KPIs, tracker, table, search, alerts; then weather, day/night, theme, mobile bottom sheet; adaptive quality. *Remaining:* performance tuning on the real reference devices (N-8). It can't be verified in headless software rendering.

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

## 14. M1 steps 4–5: rendering and interaction (approved 2026-10-12)

### 14.1 Design
- **Pure logic is separated from Three.js and the DOM, and unit-tested:** `layout/positions` (unit poses, hub bounds), `app/loop` (fixed-step accumulator, at most 5 steps per frame), `app/webgl` (WebGL 2 probe), `render/cameraMath` (clamping, eased glides, follow smoothing, reduced motion), `render/interp` (snapshot interpolation, snapping moves over 20 m), `render/registry` (instance slots ↔ agent ids for picking), `ui/format` (labels and units), `ui/throughput` (per-unit completions per hour and last exit, derived from resource snapshots), and `ui/store` (selection and area signals).
- **Scene (blockout):**
  - Buildings come from `hub.buildings`. Roads and walkways are ribbons generated from lane-graph edges and merged per material.
  - Agents are drawn with one `InstancedMesh` per kind and class (body plus cabin), with slots managed by `render/registry`.
  - Clickable units (bays, chargers, kiosks, slots, gates) are an invisible instanced hit-box at each `unitPose`.
  - Dark palette by default (D6).
- **Picking:** a pointer press and release within 5 px and 300 ms counts as a click. It raycasts the agent meshes first, then the unit hit-boxes; clicking empty ground clears the selection (I-6). Esc also clears it.
- **Selection:** a pulsing gold ring under the object, plus a DOM label (`data-testid="selection-label"`) positioned by projecting the object's position each frame (A7).
- **Camera rig:** three's `MapControls` handles input (left-drag pan, right-drag rotate, wheel or pinch zoom), and the result is clamped by `cameraMath.clampState`. Selecting something or switching area starts an eased glide. **A selection is followed until it is deselected** (decision 2026-10-12): rotate and zoom work around the followed object, and a pan eases back onto it. Switching area deselects (and so stops following), keeping "following ⇔ selected" strictly true.
- **Loop:** `requestAnimationFrame` → `createAccumulator(0.05, 5)` → `sim.step()` × n → keep the previous and current snapshots → `interpolateAgents(alpha)` → render. The panel refreshes at 10 Hz (§5).
- **Fallback:** if `hasWebGL2` is false, a `role="alert"` message explains that WebGL 2 is needed, and the 3D view is not started.
- **Units:** speeds are shown in mph, to match the odometer in miles (approved).
- **Click vs drag:** press and release within 5 px and 300 ms (approved).
- **Test hooks:** `window.__hub` (`src/app/testHooks.ts`) exists only in `vite build --mode test` (`.env.test` sets `VITE_TEST_HOOKS=1`).

### 14.2 Test plan (written, failing)
| Layer | File | Covers |
|---|---|---|
| Unit | `tests/unit/layout/positions.test.ts` | Unit poses on their park edges; bounds; areas |
| Unit | `tests/unit/app/{loop,webgl}.test.ts` | A3 accumulator incl. step cap; N-8 probe |
| Unit | `tests/unit/render/{cameraMath,interp,registry}.test.ts` | I-1 clamps, I-2/I-5 glides and follow, N-5 reduced motion; interpolation and teleport snap; instance slots |
| Unit (jsdom) | `tests/unit/ui/{format,throughput,store}.test.ts`, `DetailPanel.test.tsx`, `AreaSwitcher.test.tsx` | I-4 panel fields per kind, "Left the hub", close; I-5 switcher with aria-pressed; labels and units |
| E2E | `tests/e2e/m1.spec.ts` (`npm run test:e2e`) | One file under 400 KB gzipped with no remote URLs; loads offline with no errors; ≥ 10 cars and something moving; draw calls < 150; area fly-to; click a moving car → selected, label, details, followed; click a bay → details; Esc clears; wheel zoom, zoom limit, pan; WebGL 2 fallback alert |

Headless Chromium uses SwiftShader WebGL 2 (`playwright.config.ts`), verified on this machine.

### 14.3 Implementation notes (Stage 4, 2026-10-12)
- **Contract addition:** `layout/positions.unitMarker(unitId)` (tested). Each unit has an equipment post (kiosk, charger post, pump, gate post, wash control) 1.2 m past the front of its parking spot, with a gold cap. The post is both the visual and the click target, so clicking a bay never hits the car parked in it. Picking order: unit markers, then agents, then the nearest projected agent or marker within 14 px (small objects seen from far away).
- **Canopies** (return lanes, wash, service, EV hub, fuel, depot) have open roof frames with a gold fascia, so the bays stay visible from above.
- **Follow:** while gliding to a followed object, the glide re-aims at its live position every frame, so it lands on the object rather than where it was when clicked.
- **Overview framing:** distance 560 m (max 600) at (0, 35), so the whole hub fits on screen.
- **E2E robustness:** camera-dependent checks wait for the condition (camera arrived, car centred) with a timeout instead of a fixed sleep. Under load, software WebGL frames can exceed the 0.25 s frame cap, so camera time runs slower than wall-clock time. The assertions themselves are unchanged.

### 14.4 Verified results (2026-10-12)
- 221 unit tests, 12 soak runs and 7 E2E tests pass (E2E green on 5 consecutive full-suite runs after the fixes). Typecheck and lint are clean.
- Production `dist/index.html`: 175 KB gzipped (budget 400 KB), with no test hooks (`__hub` absent). The test build adds them via `vite build --mode test`.
- Draw calls well under 150 (asserted in E2E). Coverage on `src/sim` is unchanged (97% statements, 91% branches).


## 15. M2: dashboard and extras (approved 2026-10-12, implemented)

### 15.1 Data the dashboard needs, and where it comes from
| Need | Source | Module |
|---|---|---|
| KPI cards and trends (D-3) | `sim.metrics()`, sampled every 5 simulated minutes for the trend arrow | `ui/kpis` |
| Tracker timestamps (D-5) | `milestone` events, per vehicle, reset on `returned` | `ui/timeline` |
| Alerts (D-8) | `maintenanceFlagged`, `towDispatched`, `queueOverflow` events, plus a snapshot check for an EV staged below the SoC threshold (once per vehicle) | `ui/alerts` |
| Checkout log tab (D-6) | `checkout` events, newest first, capped | `ui/tables` |
| Fleet and queue tabs (D-6) | snapshot agents and resources | `ui/tables` |
| Search (D-2) | snapshot agents (ID, plate, **agreement #**) and units (label) | `ui/search` |
| Location column | position → area | `layout/positions.areaOf` |

**Contract addition:** `AgentView.agreementNo` (set while a car is departing with a customer, otherwise null), so search can find agreement numbers (D-2).

The render loop drains sim events every frame into timeline, alerts and the checkout log. The overlay re-renders at 4 Hz for tables and 10 Hz for the panel and tracker (§5).

### 15.2 Components (Preact; all pure props-in, callbacks-out, tested in jsdom)
- `TopBar`:
  - logo (brand mark, app name, hub name)
  - search (a combobox: arrow keys, Enter, click; picking a result selects and flies, D-2)
  - area switcher (existing)
  - weather menu (4 modes, X-1)
  - live clock (hub local time)
  - alerts button with an unread badge and a list (click an alert → select its vehicle)
  - day/night control: Auto / Day / Night (X-2)
  - user chip with the theme toggle (X-4)
- `KpiCards`: 3 cards, each with a value, a sub-line and a trend arrow labelled for screen readers.
- `ProcessTracker` (bottom-left): with a vehicle selected, the 6 steps with timestamps, current step marked `aria-current="step"`. With nothing selected, the number of vehicles at each step.
- `LiveTable` (bottom): ARIA tabs (Active fleet / Turnaround & service queue / Customer checkout log); clicking a row selects it.
- `DetailPanel` (existing), restyled as glass.
- Glass: `backdrop-filter: blur(14px) saturate(140%)` on translucent panels. Tokens per theme on `:root[data-theme]`.

### 15.3 Weather, day/night and quality (render)
- `render/environment.environmentFor(weather, clockHours, dayNight)` is pure. It returns:
  - sun elevation and intensity, ambient intensity
  - fog density
  - `nightFactor` in [0, 1] (sunrise 06:00, sunset 19:00, with a 1 h twilight blend)
  - `wetness`, `rain`, `heat`, `shimmer`
  - `dayNight` is `auto | day | night`: day forces noon, night forces 22:00.
- The Three.js side applies the result each frame:
  - lights and fog
  - wet asphalt: darker and less rough
  - an instanced rain-streak field
  - at night: emissive windows, signage and lot floodlights, plus instanced headlight cones on moving cars
  - heatwave: an amber grade, and a cheap shimmer (vertex wobble on a full-screen quad), off with reduced motion or on the low tier (N-5, N-2)
- Changing the weather sends the existing `setWeather` command, so the simulation rules change too (X-1).
- `render/quality` is pure:
  - It samples frame time in 2 s windows and returns tier 0–2. It steps down after a window averaging over 22 ms and up after one under 12 ms (A-plan §6).
  - Each tier caps pixel ratio (2 / 1.5 / 1), sets shadow-map size (2048 / 1024 / off), and turns shimmer on or off.
  - Touch devices start on tier 1.

### 15.4 Theme and mobile
- `ui/theme`: `loadTheme(storage)` defaults to `dark`, and `saveTheme(storage, theme)`. Both are wrapped in try/catch, so blocked storage is harmless (X-4). The theme is applied as `<html data-theme>`, and the scene palette switches to the light variant.
- Below 720 px: the top bar compacts, the KPI cards scroll sideways, and the detail panel, tracker and table move into a **bottom sheet** with a drag handle. MapControls already supports touch (X-3). No horizontal page scroll.

### 15.5 Test hooks (additions to `window.__hub`)
`weather()`, `environment()` (the current `environmentFor` result), `theme()`, `qualityTier()`.

### 15.6 Test plan
| Layer | Files | Covers |
|---|---|---|
| Unit | `ui/{kpis,timeline,alerts,tables,search,theme}.test.ts`, `render/{environment,quality}.test.ts`, `layout/positions.test.ts` (areaOf), `sim/world.test.ts` (agreementNo) | D-3, D-5, D-6, D-8, D-2, X-1, X-2, X-4, N-2 |
| Unit (jsdom) | `ui/{TopBar,KpiCards,ProcessTracker,LiveTable}.test.tsx` | Component behaviour and accessibility |
| E2E | `tests/e2e/m2.spec.ts` | Glass panels; KPIs visible; search → select and fly; table row → select; weather → sim and visuals; night → night factor; theme persists across reload; mobile 390 × 844 with no horizontal scroll and a bottom sheet; reduced motion turns shimmer off; draw calls < 150 in rain at night |

### 15.7 Implementation notes (Stage 4, 2026-10-12)
- **Approved choices:** Auto / Day / Night; weather as a native `<select>`; trend arrows against 5 simulated minutes ago with a ±0.5 dead band; clicking an alert selects its car; agreement numbers searchable while departing; the EV-below-threshold alert kept as a safety net; phone layout below 720 px.
- **New render modules:**
  - `render/atmosphere` applies `environmentFor()` each frame: sun, moon, ambient light, fog, background, wet asphalt, night glow, headlights and rain.
  - `render/rain` is one instanced draw call of streaks around the camera target.
  - `render/shimmer` is a heat-haze post pass (one extra draw call) on tier 0 with motion allowed. (M3: replaced by the shimmer pass in `render/post`, §16.7.)
  - `world` and `agents` expose `setConditions` / `setNight` / `setPalette`.
  - The light palette lives in `render/palette`.
- **Contract additions:**
  - `AreaLayout.azimuth` (optional). Areas are now viewed from the south, so their east–west layout runs across the uncovered middle of the screen rather than diagonally under the panels. Measured in E2E profiling: 22 of 22 facility units are on exposed canvas, up from 13.
  - `CameraRig.glideTo(target, distance?, azimuth?)`.
  - Area framings were retuned (return 130 m, wash 170 m, energy 150 m, lot 250 m).
- **Bug fixed (would have shipped): the glass blur was missing in Chromium.** The CSS minifier treats `-webkit-backdrop-filter` and `backdrop-filter` as duplicates and keeps only the last; the prefixed form came last. The prefixed form now comes first, so both survive (verified in the built file). The E2E glass test caught it.
- **Night readability:** soft moonlight and ambient light at night; lighter fog (rain 0.0015, overcast 0.0007, heat 0.0004); floodlight pools and headlight beams skip fog and tone mapping, and use radial vertex-colour falloff.
- **Fleet table:** the location reads "On hub roads" outside every named area.
- **M1 E2E tests updated for the dashboard:** the click tests now pick points where the canvas is exposed (`elementFromPoint`), since panels cover parts of the screen. The assertions are unchanged.
- The M1 overlay `ui/m1/App.tsx` was replaced by `ui/m2/Dashboard.tsx` and removed.

### 15.8 Verified results (2026-10-12)
- 271 unit tests, 12 soak runs and 17 E2E tests (M1, M2 and dev server) pass; E2E was green on two consecutive full runs. Typecheck and lint are clean.
- Production bundle: 184.5 KB gzipped (budget 400 KB), no test hooks. Coverage on `src/sim`: 97% statements, 91% branches.
- Draw calls stay under 150 in rain at night (asserted).


## 16. M3: premium visuals (design approved 2026-10-12; implemented, awaiting visual review)

Implements requirements §8 (V-1…V-9, D9–D12). No simulation changes, and no external assets (W-1).

### 16.1 Key techniques
| # | Decision | Why |
|---|---|---|
| P1 | **Vertex colours instead of many materials.** Each asset is assembled from shapes whose colours are baked into a `color` attribute, then merged into one geometry with one `MeshStandardMaterial({ vertexColors })`. | Rich, multi-coloured Pixar-style models at about one draw call per asset type (budget §8.3). |
| P2 | **Paint / trim / lamps split for instanced vehicles and people.** *Paint* takes per-instance colour (car paint, clothing); *trim* is vertex-coloured and untinted (tyres, glass, chrome, skin); *lamps* is an emissive mesh whose glow follows `nightFactor`. | `instanceColor` multiplies the whole mesh, so tinted and untinted parts must be separate meshes. |
| P3 | **Shape kit** `render/kit/`: rounded box (three's `RoundedBoxGeometry`), capsule, lathe, cylinder, wedge; `paint(geometry, colour)` and `assemble(parts)` produce merged vertex-coloured geometry. | One vocabulary for every asset, so the style stays consistent (V-1). |
| P4 | **Roadside lamps are generated from the lane graph** (`layout/lamps.ts`, pure). Spacing is about 25 m along each vehicle road, offset outside the road's corridor, on both sides of main roads. Lamps are skipped where they would fall inside any corridor, building or other lamp's spacing. | Lighting follows the roads automatically and never blocks traffic (V-6). |
| P5 | **Staggered lamps via per-instance colour:** lamp heads (`MeshBasicMaterial`) and light pools (additive, radial falloff) take an instance colour of `lampLevel(nightFactor, i)`, where each lamp has a pseudo-random switch-on offset. | Lamps come on one by one at dusk at no extra draw-call cost (V-6). |
| P6 | **Post-processing chain** (`render/post.ts`): `EffectComposer` → `RenderPass` → [`UnrealBloomPass` at night, tier 0] → [heat shimmer as a `ShaderPass`, tier 0, motion allowed] → `OutputPass`. With no effect active it falls back to a plain `renderer.render`. | One pipeline for bloom and shimmer (V-7, X-1). The fallback keeps lower tiers cheap. |
| P7 | **Contact shadows:** one instanced radial "blob" decal under moving agents. Static props get blobs merged into the ground-detail mesh. | Grounded, soft Pixar look for about 2 draw calls (V-8). |
| P8 | **Sky dome:** a large inverted sphere with a gradient `ShaderMaterial` (zenith, horizon, ground colours), plus a few instanced soft cloud puffs. `skyColours(env)` is pure. | Atmosphere that follows the day/night cycle and weather (V-4). |
| P9 | **Live details from existing snapshot data:** `render/details.detailStates(snapshot)` (pure) maps resources and agents to which brushes spin, doors open, barriers lift, charger lights and the tow beacon. | Animation with zero simulation changes (V-9). |
| P10 | **Footprint fidelity:** every vehicle and person asset must fit inside its simulation footprint (length × width from `config/facility`), within ±5%. | What you see matches what the no-overlap engine guarantees, so cars never visually clip (L-4). |

### 16.2 Modules
```
src/render/kit/        shapes.ts (rounded box, capsule, lathe…), assemble.ts (paint, merge, vertex colours)
src/render/assets/     vehicles.ts, people.ts, buildings.ts, landscape.ts, sky.ts, lamps.ts
src/layout/lamps.ts    lamp placement from the lane graph (pure)
src/render/details.ts  detailStates(snapshot) (pure) + the animator that applies them
src/render/post.ts     composer: bloom, shimmer, output (replaces shimmer.ts)
src/render/sky.ts      skyColours(env) (pure) + dome
```
`world.ts` and `agents.ts` keep their public API (`setConditions`, `setNight`, `setPalette`, `pick`, `pickUnit`) but build from the new assets. Picking and markers are unchanged.

### 16.3 Performance plan (budget §8.3)
| Group | Draw calls (top tier) |
|---|---|
| Ground, grass variation, kerbs, sidewalks, lane markings | ~6 |
| Buildings (solid, glass, emissive, animated parts) | ~14 |
| Trees and bushes (3 tree types + bushes, instanced) | ~5 |
| Lamps (posts, heads, pools) | 3 |
| Vehicles (3 car classes × paint/trim/lamps, plus shuttle, tow, van, cart, beams) | ~19 |
| People (clothing + skin), contact shadows | 3 |
| Sky dome and clouds; rain | 3 |
| Shadow-map pass (re-draws shadow casters) | ~40 |
| Post (bloom about 10 passes, output) | ~12 |
| **Total** | **≈ 105–140**, well inside 300 |

- **Tier 2** (lowest): no bloom, no shadows, half the lamp pools, clouds off. Expected ≤ 150 (asserted).
- **Geometry:** rounded boxes use low segment counts (2–3), about 300–600 triangles per vehicle. The scene stays under about 400k triangles.
- **Bundle:** the add-ons add about 40 KB unminified; asset code about 30 KB. Expected about 230–260 KB gzipped (budget 600).

### 16.4 Test plan (Stage 3 preview)
| Layer | What's tested |
|---|---|
| Unit | **Kit:** merged geometry has positions, normals and colours; `assemble` keeps the colours of each part. **Asset footprints (P10):** every vehicle and person bounding box is within ±5% of its simulation dimensions, wheels touch the ground (min y ≈ 0), and nothing is below ground. **`layout/lamps`:** spacing 25 m ± tolerance; no lamp inside any road corridor or building footprint; both sides of main roads; deterministic. **`lampLevel`:** 0 by day, 1 at full night, monotonic, staggered across lamps. **`skyColours`:** day brighter than night, rain greyer, deterministic. **`detailStates`:** brushes spin only for occupied, washing bays; doors open for occupied service bays; barriers up for an occupied gate; charger lights; tow beacon only while towing. |
| E2E | Bundle ≤ 600 KB gzipped. Draw calls ≤ 300 at night with bloom on tier 0, and ≤ 150 on tier 2 (a test-only `setQualityTier` hook). Bloom on at night on tier 0 and off by day or on tier 2 (`postEffects()` hook). All lamps lit at full night and none by day (`lampsLit()` hook). The existing M1/M2 E2E suite still passes unchanged. |
| Visual review | A screenshot set (day, golden hour, rain at night, light theme, phone) attached for your review, since beauty isn't unit-testable. |

### 16.5 Risks
| Risk | Mitigation |
|---|---|
| Too many triangles from rounded shapes | Low segment counts; a triangle-count assertion in a unit test per asset |
| Bloom washes out the light theme or the daytime view | Bloom is gated to night × tier 0; threshold tuned so only emissive parts bloom |
| Visual changes break picking or footprints | P10 footprint tests; picking meshes (paint) unchanged in role; M1 E2E click tests stay |
| Scope creep in modelling | Each asset has a fixed part list in code review; polish passes are time-boxed |

### 16.6 Stage 3 status (2026-10-12)
- **Contracts:**
  - `render/kit/{shapes,assemble}`
  - `render/assets/{vehicles,people,buildings}`
  - `layout/lamps`, `render/{lampLevel,sky,details,post}`
  - `QualitySettings` extended with `bloom`, `clouds` and `lampPoolFraction`
  - test hooks `postEffects()`, `lampsLit()` and `setQualityTier()`
- **Failing tests:**
  - 65 unit tests
  - 4 E2E tests (lights on and off, the staggered switch-on, bloom with the 300 draw-call budget, the lowest tier within 150)
- **Approved budget updates applied to existing E2E:** bundle ≤ 600 KB gzipped; top-tier draw calls ≤ 300.
- **Lamp switching** is time-based (each lamp waits 0–3 s, then fades over 0.4 s), so the stagger also shows when the Night button flips the night factor instantly.

### 16.7 Implementation notes (Stage 4, 2026-10-12)
- **Modules as built** (small differences from §16.2):
  - `render/landscape.ts`: grass, roads, kerbs, markings, the lot and seeded planting
  - `render/lampsView.ts`: lamp poles, lenses and light pools
  - the sky dome lives in `render/sky.ts` and the composer in `render/post.ts`
  - `render/shimmer.ts` is removed
- **`WorldHandle.update(frame)`** drives the lamps and the live details. `lampsLit()` feeds the test hook.
- **`AgentLayer.update(…, timeSec)` and `setBeacon(on)`** add the walk bob and the tow beacon.
- **Equipment fix:** the M1 unit markers stood in the exit lanes. Visible chargers, pumps and bollards now sit beside their bays. The invisible hit boxes stay at `unitMarker`, so picking and the selection label are unchanged.
- **Colours that don't follow the theme:**
  - Vehicle paint is the same in both themes.
  - Grass has its own palette colour (`grass`): green in both themes, a little deeper in the dark one. Requirement V-4 asks for grass; tinting by `ground` gave black or pale-grey lawns.
- **Night tuning after the screenshot review:**
  - light pools peak at 0.32, with radius 6.5 m (street), 4 m (walkway) and 8.5 m (flood)
  - canopy glass glow at night is 0.12
- **Sky dome draw order:** drawn after the opaque scene with the depth test on, so only uncovered sky pixels are shaded. It follows the camera sideways; the clouds stay fixed in the world.
- **Camera glides run on wall-clock time** (frame time capped at 1 s; the simulation keeps its 0.25 s cap). A glide therefore lands on time even when a frame stalls, for example while shaders recompile after a quality-tier change.
- **E2E change:** the area-switch poll timeout in the M1 tests went from 5 s to 15 s. The assertion itself is unchanged.
  - Under software WebGL (SwiftShader, 4–10 fps), the adaptive drop to tier 2 recompiles every shader, because the shadow defines change. That stalls frames for several seconds.
  - The glide itself is still at most 2 s.

### 16.8 Verified results (2026-10-12)
- **Checks:** typecheck and lint are clean. 343 unit tests, 12 soak runs and 22 E2E tests (M1, M2, M3 and the dev server) pass.
- **Production bundle:** 197.7 KB gzipped (budget 600 KB), with no test hooks.
- **Measured draw calls (1280 × 800):**

| Setting | Draw calls |
|---|---|
| Tier 0, day | 77 |
| Tier 0, night with bloom | 94 |
| Tier 2 | 48 |

- **Triangles:** about 250k static plus about 2k per vehicle.
- **Screenshots** for visual review: day overview and close-ups, night with bloom, rain at night, the light theme and a phone. There is no golden-hour shot: the UI offers only Auto, Day and Night, and the clock starts at 08:00.

