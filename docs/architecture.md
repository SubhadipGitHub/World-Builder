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


## 16. M3: premium visuals (design approved 2026-10-12; implemented, reviewed and committed)

Implements requirements §8 (V-1…V-9, D9–D12). No simulation changes, and no external assets (W-1).

### 16.1 Key techniques
| # | Decision | Why |
|---|---|---|
| P1 | **Vertex colours instead of many materials.** Each asset is assembled from shapes whose colours are baked into a `color` attribute, then merged into one geometry with one `MeshStandardMaterial({ vertexColors })`. | Rich, multi-coloured Pixar-style models at about one draw call per asset type (budget §8.3). |
| P2 | **Paint / trim / lamps split for instanced vehicles and people.** *Paint* takes per-instance colour (car paint, clothing); *trim* is vertex-coloured and untinted (tyres, glass, chrome, skin); *lamps* is an emissive mesh whose glow follows `nightFactor`. | `instanceColor` multiplies the whole mesh, so tinted and untinted parts must be separate meshes. |
| P3 | **Shape kit** `render/kit/`: rounded box (three's `RoundedBoxGeometry`), capsule, lathe, cylinder, wedge; `paint(geometry, colour)` and `assemble(parts)` produce merged vertex-coloured geometry. | One vocabulary for every asset, so the style stays consistent (V-1). |
| P4 | **Roadside lamps are generated from the lane graph** (`layout/lamps.ts`, pure). Spacing is about 35 m along each vehicle road (25 m before the visual review), offset outside the road's corridor, on both sides of main roads. Lamps are skipped where they would fall inside any corridor, building or other lamp's spacing. | Lighting follows the roads automatically and never blocks traffic (V-6). |
| P5 | **Staggered lamps via per-instance colour:** lamp heads (`MeshBasicMaterial`) and light pools (additive, radial falloff) take an instance colour of `lampLevel(nightFactor, i)`, where each lamp has a pseudo-random switch-on offset. | Lamps come on one by one at dusk at no extra draw-call cost (V-6). |
| P6 | **Post-processing chain** (`render/post.ts`): `EffectComposer` → `RenderPass` → [`UnrealBloomPass` at night, tier 0] → [heat shimmer as a `ShaderPass`, tier 0, motion allowed] → `OutputPass`. With no effect active it falls back to a plain `renderer.render`. | One pipeline for bloom and shimmer (V-7, X-1). The fallback keeps lower tiers cheap. |
| P7 | **Contact shadows:** one instanced radial "blob" decal under moving agents. Static props get blobs merged into the ground-detail mesh. | Grounded, soft Pixar look for about 2 draw calls (V-8). |
| P8 | **Sky dome:** a large inverted sphere with a gradient `ShaderMaterial` (zenith, horizon, ground colours), plus a few instanced soft cloud puffs. `skyColours(env)` is pure. | Atmosphere that follows the day/night cycle and weather (V-4). |
| P9 | **Live details from existing snapshot data:** `render/details.detailStates(snapshot)` (pure) maps resources and agents to which brushes spin, doors open, barriers lift, charger lights and the tow beacon. A gate barrier is up from 80% of the checkout dwell until the departing car's rear is 1 m past the arm (1.4 m beyond the stop line, `layout/positions.unitStop`), read from agent positions because the sim releases the gate when the car's front leaves the lane (R-1). | Animation with zero simulation changes (V-9). |
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
| Unit | **Kit:** merged geometry has positions, normals and colours; `assemble` keeps the colours of each part. **Asset footprints (P10):** every vehicle and person bounding box is within ±5% of its simulation dimensions, wheels touch the ground (min y ≈ 0), and nothing is below ground. **`layout/lamps`:** spacing 35 m ± tolerance; no lamp inside any road corridor or building footprint; both sides of main roads; deterministic. **`lampLevel`:** 0 by day, 1 at full night, monotonic, staggered across lamps. **`skyColours`:** day brighter than night, rain greyer, deterministic. **`detailStates`:** brushes spin only for occupied, washing bays; doors open for occupied service bays; barriers up for an occupied gate; charger lights; tow beacon only while towing. |
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
- **Fewer, softer lamps (review decision, 2026-10-12):**
  - `LAMP_SPACING` 35 m, and 8 lot floodlights instead of 16
  - main roads zig-zag (alternating sides every 21 m) instead of a lamp pair every 25 m
  - result: 159 lamps down to about 110
  - pools are larger and dimmer: peak 0.24, radius 8.5 m (street), 5 m (walkway), 11 m (flood)
  - canopy glow kept as is
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

## 17. M4: ops what-if scenarios (design approved 2026-10-12; implemented)

Implements requirements §9 (S-1…S-20, D13–D16). The simulation gains scenario commands. The app runs a second, shadow simulation as the baseline. The UI gains a What-if drawer, chips, a speed control and KPI deltas. The render layer gains hazard cones. Nothing is loaded at runtime, and it is still one offline file.

### 17.1 Key decisions
| # | Decision | Why |
|---|---|---|
| W1 | **Scenario state lives inside the simulation**: unit online flags, crew levels and the surge window, all in simulation time. It is changed only through `sim.apply(command)` between steps. | Determinism (S-15): seed + `[stepIndex, command]` log → identical run. The surge countdown follows simulation time, so pause and speed are respected automatically. |
| W2 | **Pure scenario core** `sim/scenario.ts`, with no three and no DOM: the state type, the commands, `reduceScenario(state, command, ctx) → { state, events }`, `canTakeOffline(state, unitId)`, `durationFactor(state, station)` and `pickupFactor(state, now)`. `world.ts` delegates to it. | The rules can be unit-tested without spinning up the whole hub. |
| W3 | **Outages are done in the resource pool:** `ResourcePool.setOnline(unitId, online)`. `allocate()` and `freeCount()` skip offline units. An occupant keeps its unit until its normal `release()`. | One change gives correct FIFO behaviour at every station (S-2). The queue and traffic code is untouched. |
| W4 | **The last-unit rule is enforced in the simulation**, not just the UI. An invalid offline command is a no-op that emits a `scenarioRejected` event. The UI disables the control using the same `canTakeOffline`. | The hub can never be gridlocked, even through the test hook. |
| W5 | **Surge** is `RentPool.pullForward(n, now)`: the n rentals due soonest get `returnAt = now`, in order. Arrival still goes through `admitReturns()`, which admits 1 per step and re-queues a car if its spawn is blocked (back-pressure, L-4). Pickups are multiplied by 2 until `surgeUntil`. | Reuses the existing admission path, so a surge cannot create overlapping cars. |
| W6 | **Crew levels multiply durations when a job starts** (`startWork`): inspection is the return lane, wash is the wash bay, service is the service bay. Detailing in the service bay uses the service crew. | A job already running keeps its duration (S-3). |
| W7 | **Shadow baseline:** `main.ts` creates `baseline = createSim({ seed })` at load and steps it in lockstep: the same number of steps per frame and the same weather commands, never scenario commands. Its events are drained and discarded. Its metrics and queue summary are read only at panel refresh (10 Hz). | Gives the deltas S-11/S-12 asks for. Measured cost: 0.08 ms per step plus 0.17 ms per snapshot, which is under 1 ms per frame at 60× (budget 4 ms). |
| W8 | **Presets and weather memory live in the app layer** (`ui/scenario.ts`, pure). A preset expands into simulation commands; its weather change goes to the **visible simulation only** and remembers the previous weather. Reset sends `resetScenario` and restores that weather. A manual weather change goes to **both** simulations and clears the memory (the user's choice wins). | Weather is a global setting, not simulation scenario state. This keeps S-5 and S-11 consistent. |
| W9 | **Speed = steps per tick** (S-19). The app keeps `speed ∈ {0, 1, 2, 3}` (Pause, 20×, 40×, 60×). Each frame pushes `dt × speed` into the accumulator, whose step cap is `5 × speed`. Both simulations run the same steps. `setTimeScale` is not used. | KPIs stay comparable across speeds, and baseline deltas stay valid (S-20). Pause leaves the camera and UI live, because only the simulation stops. |
| W11 | **Departure back-pressure** (added in Stage 4): customers wait at the counter instead of walking to their car once departures pending (cars heading to the gates plus customers walking to them) reach `DEPARTURE_BACKLOG_PER_GATE` (10) × online gates. | The gate-closure soak found that one gate turns a car around in about 245 simulated seconds (about 15 an hour, against demand of about 20). The gate queue then grew without limit, spilled across the lot walkway and trapped customers (a pedestrian gridlock). With the cap, a closure shows as fewer checkouts and lower utilisation, which is the honest what-if answer. With a cap of 10, all M1 soak runs pass and the tightest case (seed 2 in rain) matches the uncapped checkout count; caps of 6 and 8 throttled normal running. |
| W10 | **Deltas are pure:** `kpiDelta(id, scenarioValue, baselineValue)` returns `{ text, tone }`. Within the noise band (turnaround ±2 min, utilisation ±1 pt, SoC ±1 pt) it reads "≈ normal". Tone is good or bad per KPI (turnaround up is bad). `deltaVisible(state, now)` covers "while active and for 60 simulated minutes after Reset". | Honest numbers (S-13); easy to test. |

### 17.2 Contracts
```ts
// sim/scenario.ts
type CrewStation = 'inspection' | 'wash' | 'service';
type CrewLevel = 'short' | 'normal' | 'extra';
interface ScenarioState {
  readonly offline: ReadonlySet<string>;               // unit ids
  readonly crews: Readonly<Record<CrewStation, CrewLevel>>;
  readonly surgeUntil: number | null;                  // sim seconds
  readonly lastChangeAt: number | null;                // drives the 60-min post-reset delta window
}
type ScenarioCommand =
  | { type: 'surge' }
  | { type: 'setUnitOnline'; unitId: string; online: boolean }
  | { type: 'setCrew'; station: CrewStation; level: CrewLevel }
  | { type: 'resetScenario' };

// sim/world.ts
type Command = { type: 'setWeather' … } | { type: 'setTimeScale' … } | ScenarioCommand;
interface ResourceView { …; readonly online: boolean }
interface Snapshot { …; readonly scenario: ScenarioView }   // offline ids, crews, surgeRemainingSec, active
// outageable kinds: returnLane, wash, service, charger, pump, gate (not slot or towBay)

// sim/events.ts: new event
| { type: 'scenario'; change: 'surgeStarted' | 'surgeEnded' | 'unitOffline' | 'unitOnline' | 'crewChanged' | 'reset' | 'rejected';
    unitId?: string; station?: CrewStation; level?: CrewLevel; simTimeSec: number }

// sim/resources.ts
interface ResourcePool { …; setOnline(unitId: string, online: boolean): void; isOnline(unitId: string): boolean }
// sim/demand.ts
interface RentPool { …; pullForward(n: number, nowSimSec: number): readonly string[] }

// config/scenarios.ts: surge { returns: 15, pickupFactor: 2, durationSimSec: 3600 },
//   crew multipliers { short: 1.5, normal: 1, extra: 0.7 }, noise bands, the 4 presets.

// ui/scenario.ts (pure)
presetCommands(id) → { commands: ScenarioCommand[]; weather?: WeatherMode }
createScenarioController() → { applyPreset, reset, onManualWeather, weatherToRestore }
kpiDelta(id, scenario, baseline) → { text: string; tone: 'good' | 'bad' | 'neutral' } | null
deltaVisible(view, nowSimSec) → boolean
queueSummary(snapshot) → Record<'returnLane' | 'wash' | 'service' | 'charger' | 'gate', number>
scenarioChips(view) → string[]            // "Surge 42 min", "2 units offline", "Wash: short"
```
- **Alerts:** `Alert` gains `unitId: string | null`, so a click on a scenario alert selects the unit (S-9). `scenarioRejected` is not shown, because the UI never sends it.
- **Test hooks** (test build only): `scenario()`, `baselineMetrics()`, `applyScenario(command)`, `setSpeed(n)`.

### 17.3 Modules
```
src/config/scenarios.ts      surge, crew, noise and preset constants
src/sim/scenario.ts          pure scenario reducer and rules (W2)
src/sim/resources.ts         + setOnline / isOnline (W3)
src/sim/demand.ts            + pullForward (W5)
src/sim/world.ts             commands, crew factors, pickup factor, ResourceView.online, Snapshot.scenario
src/ui/scenario.ts           presets, weather memory, deltas, chips, queue summary (pure)
src/ui/m4/WhatIfDrawer.tsx   drawer (S-6, S-14), bottom sheet on phones (S-10)
src/ui/m4/SpeedControl.tsx   Pause / 20× / 40× / 60× (S-18)
src/ui/m2/TopBar.tsx         + What-if button, chips, speed control
src/ui/m2/KpiCards.tsx       + delta line (S-12)
src/ui/m1/DetailPanel.tsx    + offline toggle and badge for units (S-8)
src/render/world.ts          + instanced hazard cones and a red status light for offline units
src/render/details.ts        + offlineUnits from the snapshot
src/app/main.ts             baseline sim, speed, routing of commands, hooks
```

### 17.4 Performance and security
- **Simulation:** two simulations at 60× means 6 steps per tick, about 0.5 ms. The baseline snapshot is taken only at the 10 Hz panel refresh.
- **Render:** hazard cones are 1 instanced mesh (+1 draw call), the status light reuses the charger status mesh pattern (+1). The draw-call budgets in §8.3 are unchanged.
- **Memory:** baseline events are drained every frame, so nothing accumulates.
- **Security:** no new inputs reach the network or storage. Commands are typed unions, and unknown unit ids are rejected (a no-op plus `rejected`).

### 17.5 Test plan (Stage 3 preview)
| Layer | What's tested |
|---|---|
| Unit: `sim/scenario` | Reducer: offline/online toggles; the last-unit rule rejects the command; slot and towBay can't be taken offline; crew changes; surge sets `surgeUntil` and a second surge restarts it; reset clears everything; the expected events are emitted. `durationFactor` and `pickupFactor` (×2 only inside the window). |
| Unit: `resources` | `setOnline(false)` skips that unit in `allocate` and `freeCount`; the occupant keeps the unit until release; nothing new is granted after release; going back online allows grants again; FIFO is kept. |
| Unit: `demand` | `pullForward` moves the n soonest rentals to now, in order; n larger than the pool size; it combines with `due()` back-pressure. |
| Integration: `sim/world` | Determinism: same seed + command log → identical snapshots. Baseline equivalence (S-16). Offline wash bay 1: no new grant on it, and bay 2 is used. Short-staffed wash: mean wash time ×1.5 (statistical, seeded). A surge raises arrivals. `ResourceView.online` and `Snapshot.scenario` are correct. |
| Soak | Each preset runs for 6 simulated hours with no overlap, no gridlock and no invariant violations, and recovers after reset. |
| Unit: `ui/scenario` | Preset expansion; weather memory (a preset changes it, Reset restores it, a manual change clears it); `kpiDelta` signs, tones and noise bands; `deltaVisible` window; chips text; queue summary. |
| Unit: components | The drawer renders levers, disables the last unit with its reason, and a preset click calls back; the speed control has aria-pressed; KPI delta text; the detail-panel toggle. |
| E2E | The What-if drawer opens; "Wash tunnel down" → bay 1 offline (hook), chips shown and cones present; the baseline diverges (`baselineMetrics` differs over time); Reset clears the chips; Pause freezes `simTimeSec` while the camera still moves; 60× advances the clock about 3× faster than 20×; phone bottom sheet; draw-call budgets still hold. |

### 17.6 Risks
| Risk | Mitigation |
|---|---|
| A surge plus closures back up the entry road into gridlock | Admission back-pressure (W5), the last-unit rule (W4), and preset soak tests with the gridlock invariant |
| Noisy deltas mislead the user | Smoothed KPIs, the noise band ("≈ normal"), and deltas shown only while relevant (W10) |
| The two simulations drift out of lockstep | A single loop steps both; an E2E/unit check that both report the same `tick` |
| UI clutter on phones | The drawer becomes a bottom sheet; chips collapse to a count on narrow screens |

### 17.7 Stage 3 status (2026-10-12)
- **Contracts (stubbed with `notImplemented`):**
  - `config/scenarios` (real constants)
  - `sim/scenario`: reducer, tick, rules, view and unit catalogue
  - `ResourcePool.setOnline/isOnline`, `RentPool.pullForward`
  - `Command` now includes the scenario commands; `ResourceView.online`, `Snapshot.scenario` and the `scenario` event
  - `ui/scenario`: presets, weather memory, deltas, chips and the queue summary
  - `Alert.unitId`, `DetailStates.offlineUnits`
  - components: `SpeedControl`, `WhatIfDrawer`, the `KpiCards` deltas, the `DetailPanel` `unitControl`, and `TopBar` with speed, chips and the What-if button
  - `Dashboard` gains `ScenarioActions`; test hooks `scenario`, `baselineMetrics`, `applyScenario`, `setSpeed` and `simTimes`
- **Failing tests:**
  - 46 unit tests in 12 files. `sim/scenario.test.ts` fails at load, because its catalogue is built at module scope from a stub.
  - 4 preset soak runs (`tests/soak/scenario.soak.test.ts`)
  - 5 E2E tests (`tests/e2e/m4.spec.ts`)
- **Existing suites:** all 348 earlier unit tests still pass. Test fixtures were updated for the new required fields (`online`, `scenario`, `unitId`).
- **Soak length:** 4 simulated hours under each preset plus 2 hours of recovery after Reset (6 in total, matching §17.5).

### 17.8 Implementation notes (Stage 4, 2026-10-12)
- **Departure back-pressure (W11)** was added after the gate-closure soak found a pedestrian gridlock (§17.1).
  - `DEPARTURE_BACKLOG_PER_GATE = 10`.
  - A cap of 6 or 8 throttled normal two-gate running below the M1 soak floor (seed 2 in rain: 24 checkouts at a cap of 8, 26 with no cap or a cap of 10).
- **Finding: the exit gates are the hub's bottleneck.** A gate cycle is about 245 simulated seconds, because driving runs at natural speed (L-6). Two gates handle about 18–20 departures an hour against base demand of 20. Not changed in M4; a candidate for later tuning (shorter gate approach, or release the gate when the barrier is cleared).
- **Surge test threshold** after measuring: early returns queue on the entry road (back-pressure), so the on-rent gap reaches about 9 cars after 1,000 steps, not 10 after 400. The test now expects at least 8 after 1,000 steps.
- **Helpers added in Stage 4,** with their own tests: `outageGroups()`, `isOutageable()` and `offlineReason()` in `ui/scenario`, which mirrors the simulation's last-unit rule for the UI.
- **Command routing in `main.ts`:**
  - Levers and preset weather go to the visible simulation only. Manual weather and speed go to both.
  - After a command, events are drained and `curr` is refreshed at the same tick, so chips, the panel and cones update at once, even while paused.
- **Hazard cones:**
  - three per offline unit at 1.4× scale, plus a red light that flashes (steady with reduced motion)
  - wash-bay cones stand outside the tunnel entrance; others stand 3.2 m behind the parking spot
- **E2E tuning:**
  - the baseline-divergence test runs at 60× (via `setSpeed`) with a 40 s poll, because software WebGL reaches only about 300 steps in 15 s
  - "60× ≈ 3× faster than 20×" is asserted as more than 2×

### 17.9 Verified results (2026-10-12)
- **Checks:** typecheck and lint are clean. 414 unit tests and 16 soak runs pass: 12 hub runs and 4 presets, each 4 h of scenario plus 2 h of recovery, with no overlap or gridlock. All 27 E2E tests pass; the M4 spec also passed twice in a row on its own.
- **Production bundle:** 202.3 KB gzipped (budget 600 KB), with no test hooks.
- **Screenshots for review:** the drawer with the Wash tunnel down preset, top-bar chips and speed, KPI "≈ normal" delta lines, Wash bay 1 offline with its badge, cones and "Bring online", and the phone bottom sheet.

## 18. M5: branding, building indicators and hub security (design approved 2026-10-12; implemented)

Implements requirements §10 (B-1…B-4, I-1…I-4, SEC-1…SEC-4, ENV-1, D17–D21). Render and UI only, plus one read-only snapshot field (`counterQueue`). There are no simulation behaviour changes, no asset files, and it is still one offline file.

### 18.1 Key decisions
| # | Decision | Why |
|---|---|---|
| G1 | **One pure site plan,** `layout/site.ts` (no three). It computes every M5 placement from the hub layout: <ul><li>the fence rectangle (`hubBounds(14)`) and its openings</li><li>visual road extensions west of x = −220 to the edge of the grass</li><li>the patrol loop (`hubBounds(26)`, rounded corners)</li><li>gantries, direction signs, painted ground text, the pylon, flags, booths and booms</li><li>CCTV, light masts, call boxes, bollards and ground props</li></ul> Every item is checked against road corridors, buildings, lamps and other items with the lamp rules (P4). The corridor maths moves to a shared `layout/geometry.ts` used by lamps, the site plan and planting. | Placement stays deterministic and testable without WebGL. One clearance rule set means a prop never lands in a lane or bay. |
| G2 | **Text atlas drawn at runtime** (W-1 kept). The pure `packAtlas(entries, measure, width)` does shelf packing to UV rectangles. At runtime, `createTextAtlas()` draws every sign string once onto a canvas (system sans-serif, bold, white on transparent) and wraps it in a `CanvasTexture`. Without a 2D canvas it returns null and signs render as plain lit panels. | No font or image files. One texture serves every sign. Tests cover the packing, not the pixels. |
| G3 | **Signs cost 3 draw calls:** one merged vertex-coloured mesh for all sign boards and frames; one merged mesh for all text faces (UVs into the atlas, `MeshBasicMaterial`, colour scalar 1 by day and 1.9 at night, so bloom picks it up); and one for the painted ground text (transparent, polygon offset). Two-faced signs are two quads back to back, so text never reads mirrored. | Branding everywhere for a fixed, small cost (budget §10.5). |
| G4 | **Static site meshes merged by role:** <ul><li>`siteStatic`: booths, gantries, the pylon, sign posts, CCTV poles, mast poles, call-box bodies and bollards. Always shown.</li><li>`siteClutter`: Jersey barriers, planters, benches, shelters and bins. Hidden on tier 2.</li><li>The fence: instanced posts plus one merged rails-and-wire mesh, and one translucent fabric strip.</li></ul> | Few draw calls, and tier 2 can drop clutter by hiding one mesh (D21). |
| G5 | **Animation is CPU-side and pure where it matters:** <ul><li>`boomTarget(vehicles, boom)`: up when a vehicle is within 14 m approaching or 4 m past.</li><li>`flagWave(t, u, v, rate)`: vertex displacement for 6 merged flags, updated at ≤ 30 Hz.</li><li>`patrolPose(loop, t)`: position and heading at 8 m/s along the loop.</li><li>`cctvPan(t, i)`.</li></ul> Render applies them with easing. | Deterministic and unit-tested; nothing touches the simulation. |
| G6 | **Patrol car** reuses `vehicleAsset('suv')` with a white-and-gold security paint, plus a light-bar mesh (red/blue `MeshBasic`, flashing at night). | Consistent Pixar style for about 3 draw calls. |
| G7 | **Light masts** are a new lamp kind, `'mast'` (4 over the Ready lot): taller pole, wider pool. They are placed by `layout/lamps.ts` and drawn by `lampsView`, so the night switching and stagger work for free. | Reuses V-6. Draw calls are unchanged (instances only). |
| G8 | **Facility labels are DOM, not 3D:** `ui/m5/FacilityLabels.tsx` renders up to 9 buttons. `main` sets each label's transform every frame from a projected anchor (as for the selection label, A7). Text refreshes at 10 Hz through a signal. The pure `ui/facilities.ts` provides `FACILITIES` (id, name, stations, anchor, priority, camera distance), `facilityStatuses(snapshot)`, `labelName()` and `declutter(rects)`. | Crisp, accessible text with no extra draw calls. Logic is testable in jsdom. |
| G9 | **Preferences:** `ui/prefs.ts` generalises the theme storage into `loadFlag` / `saveFlag` (key `goldlane.labels`, default on). A failure to save is harmless (X-4). | One pattern for every remembered setting. |
| G10 | **Detail by tier:** the pure `siteDetail(tier, reducedMotion)` returns `{ flagRate: 1 \| 0.5 \| 0, cctvMotion, patrol, clutter }`. | D21 in one tested place. |
| G11 | **Livery:** a gold stripe and door mark are added to the untinted trim of sedans, SUVs and EVs, so no new draw calls. Footprint tests (P10) still apply. | B-4 for free. |
| G12 | **`Snapshot.counterQueue`** = customers waiting at the counter (the existing internal queue). It is read-only. | I-3 without behaviour change. |

### 18.2 Contracts
```ts
// layout/geometry.ts (moved out of lamps)
distanceToEdge(p, edge): number; inCorridor(p, clearance): boolean; inBuilding(p, margin): boolean

// layout/site.ts
interface SitePlan {
  fence: { rect: Rect; openings: readonly { side: 'west' | 'east' | 'north' | 'south'; from: number; to: number }[] };
  roadExtensions: readonly { z: number; width: number; fromX: number; toX: number }[];
  patrolLoop: readonly Vec2[];                       // closed polyline, outside the fence
  gantries: readonly { x: number; z: number; heading: number; span: number; clearance: number; text: string }[];
  directionSigns: readonly { x: number; z: number; heading: number; lines: readonly string[] }[];
  groundText: readonly { x: number; z: number; heading: number; text: 'RETURN' | 'SLOW' }[];
  pylon: Pose; flags: readonly Pose[]; booths: readonly { pose: Pose; boom: Boom }[];
  cctv: readonly Pose[]; callBoxes: readonly Pose[]; bollards: readonly Vec2[];
  props: readonly { kind: 'barrier' | 'planter' | 'bench' | 'shelter' | 'bin'; pose: Pose }[];
}
sitePlan(): SitePlan                                  // cached, deterministic

// config/signage.ts: building signs (B-1): facility, text, face, size, height
// render/text/atlas.ts
packAtlas(entries, measure, width) → { height; rects: Map<string, { u0, v0, u1, v1 }> }
createTextAtlas(texts) → { texture; uv(text) } | null

// render/site/*: anim.ts (pure: boomTarget, flagWave, patrolPose, cctvPan, siteDetail),
//   signs.ts, security.ts, props.ts, patrol.ts; render/site.ts composes them →
//   SiteView { group; update({ dt, wallTime, night, agents, tier, reducedMotion }); boomOpen(id); patrolPose() }

// ui/facilities.ts
type FacilityId = 'return' | 'wash' | 'service' | 'evHub' | 'fuel' | 'lot' | 'gates' | 'terminal';
interface FacilityStatus { id; name; status: 'ok' | 'busy' | 'offline'; busy; total; queue; offline; detail: string }
facilityStatuses(snapshot): readonly FacilityStatus[]
labelName(s): string                               // "Express Wash, Busy, 2 of 2 busy, queue 4"
declutter(rects: { id; priority; x; y; w; h }[]): ReadonlySet<string>   // ids to show

// sim/world.ts: Snapshot.counterQueue: number
// app/testHooks: facilityLabels(), boomOpen(id), patrolPose(), labelsOn()
```

### 18.3 Modules
```
src/layout/geometry.ts     shared corridor/building clearance maths (lamps, site, planting)
src/layout/site.ts         the site plan (G1)
src/layout/lamps.ts        + 'mast' kind (G7)
src/config/signage.ts      sign texts and faces (B-1)
src/render/text/atlas.ts   packAtlas (pure) + runtime canvas atlas (G2)
src/render/site/           anim.ts (pure), signs.ts, security.ts, props.ts, patrol.ts
src/render/site.ts         SiteView composition
src/render/landscape.ts    + road extensions; planting keeps clear of the site plan
src/render/assets/vehicles.ts + livery (G11)
src/ui/facilities.ts       statuses, names, declutter (pure)
src/ui/prefs.ts            loadFlag/saveFlag (theme moves onto it)
src/ui/m5/FacilityLabels.tsx
src/ui/m2/TopBar.tsx       + "Building labels" switch in the user menu
src/app/main.ts            site view, labels, hooks
```

### 18.4 Performance plan
| Group | Draw calls (tier 0) |
|---|---|
| Sign boards, sign text, ground text | 3 |
| Site static, clutter | 2 |
| Fence posts, rails and wire, fabric | 3 |
| Booms, CCTV heads, flags, glow lights (call boxes) | 4 |
| Patrol car (paint, trim, lamps, light bar) | 4 |
| Shadow casters (static, clutter, fence posts, patrol, flags) | about 6 |
| **Total added** | **about 22** (budget 30) |

- **Totals:** today about 94 at night with bloom, so M5 brings it to about 116. Tier 2 drops clutter, the patrol car and flag motion: from 48 to about 62.
- **Geometry:** the fence is about 1.3 km of posts, at about 430 instances of about 40 triangles; the site total is about 60k triangles.
- **Labels:** 9 DOM nodes, with transforms each frame and text at 10 Hz.
- **Text atlas:** 2048 × 1024, about 8 MB of GPU memory, built once at start.

### 18.5 Test plan (Stage 3 preview)
| Layer | What's tested |
|---|---|
| Unit: `layout/site` | <ul><li>Deterministic.</li><li>The fence lies outside every road and building, with an opening wherever a road extension crosses it (and only there).</li><li>The patrol loop is closed and stays at least 6 m outside the fence; it crosses only the visual road extensions.</li><li>Gantries span their road's width plus 1 m, with clearance ≥ 5.5 m.</li><li>No sign, prop, booth, CCTV pole or bollard lies in a road corridor, a building, or within 2 m of a lamp.</li><li>Booms sit across the entry and exit roads.</li><li>Ground text sits on the entry lanes and before crossings.</li></ul> |
| Unit: `layout/lamps` | 4 `'mast'` lamps over the lot; the existing lamp rules still hold. |
| Unit: atlas | Shelf packing: no overlaps, within bounds, every entry present, UVs in [0, 1], deterministic. |
| Unit: `render/site/anim` | <ul><li>`boomTarget`: up for approaching and just-passed vehicles, down otherwise; ignores pedestrians.</li><li>`flagWave` is bounded and zero at the pole edge.</li><li>`patrolPose` is continuous, its speed is 8 m/s, and it wraps around.</li><li>`siteDetail` is correct per tier and with reduced motion.</li></ul> |
| Unit: vehicles | Livery parts are present in the trim colours, and footprints stay within ±5%. |
| Unit: `ui/facilities` | Statuses: ok, busy (no free unit, or queue ≥ 3), offline counts; lot "n/48 staged"; terminal "Counter: n waiting"; accessible names; declutter keeps the higher priority and drops overlaps. |
| Unit: `ui/prefs`, components | Load/save flag with a failing storage. `FacilityLabels` renders buttons with names, status text and click callbacks. The user-menu switch toggles. |
| Unit: `sim/world` | `counterQueue` is ≥ 0, grows when back-pressure holds customers, and the snapshot stays structured-clone safe. |
| E2E | <ul><li>Labels show for the facilities, with their status.</li><li>"Wash tunnel down" turns the wash label Offline.</li><li>Clicking a label flies the camera to it.</li><li>The switch hides the labels and the choice survives a reload.</li><li>The entry boom opens for an arriving car (hook).</li><li>The patrol car moves.</li><li>Draw calls stay ≤ 300 (tier 0, night, rain) and ≤ 150 (tier 2).</li><li>No console errors; bundle ≤ 600 KB.</li></ul> |
| Visual review | Screenshots: entrance and pylon, gantry, signs by day and night, the labels, the fence and patrol, and a phone. |

### 18.6 Risks
| Risk | Mitigation |
|---|---|
| Sign text is unreadable from the default camera | Letters at least 0.9 m tall on building signs (3 m on the roof sign); screenshot review |
| System fonts differ by OS | Bold generic sans-serif; text is measured before packing; signs scale to the measured width |
| Labels clutter the view or hide each other | Declutter by priority, a compact mode when zoomed out, and the switch |
| Props or trees collide with roads or each other | One clearance module (G1); planting avoids the site plan; unit tests on every placement |
| Fence or text adds shadow-pass cost | Fabric and text cast no shadows; only the merged static meshes do |

### 18.7 Stage 3 status (2026-10-12)
- **Contracts (stubbed):**
  - `layout/geometry`, `layout/site` (types and the `sitePlan` stub)
  - the `'mast'` lamp kind, `config/signage` (real texts)
  - `render/text/atlas`, `render/site/anim`
  - `ui/facilities` (`FACILITIES` is real; the functions are stubs), `ui/prefs`, `ui/m5/FacilityLabels`
  - `TopBar` gains `labelsOn` / `onLabels`; `Dashboard` gains facilities, compact labels, the `labels` setting, `onLabels` and `onFacility`
  - `Snapshot.counterQueue` (a placeholder of 0)
  - test hooks `facilityLabels`, `boomOpen`, `patrolPose`
- **Failing tests:**
  - 37 unit tests in 11 files. `site.test.ts` and `atlas.test.ts` fail at load, because they call stubs at module scope. The lamp determinism test now also expects the 4 masts.
  - 6 E2E tests (`tests/e2e/m5.spec.ts`).
- **Existing suites:** the other 413 unit tests pass. Fixtures were updated for `counterQueue` and the TopBar labels props.
- **Plan detail fixed by the tests:** only the entry and exit roads leave the hub to the west (the shuttle loop turns back inside), so there are 2 road extensions and 2 fence openings.

### 18.8 Implementation notes (Stage 4, 2026-10-12)
- **Modules as built:**
  - `render/site/signs.ts`: text quads, boards and atlas entries
  - `render/site/anim.ts`: pure animation helpers
  - `render/site.ts`: the composition
  - Security, props and patrol live in `render/site.ts` rather than separate files; it stays under 400 lines.
  - `layout/geometry.ts` is shared by lamps, the site plan and planting; landscape and lamps dropped their copies of `distanceToEdge`.
- **New kit shape `slab(w, h, d)`** (a plain 12-triangle box, with a test) for decals and thin panels. The rounded-box livery pushed the SUV over its 2,500-triangle budget; slabs keep it inside.
- **Labels hide behind dashboard panels.** `declutter(rects, blockers)` treats panel rectangles as already taken (found by E2E: the Fuel label sat under the live table and couldn't be clicked). Unit-tested.
- **Light masts** are the 4 `'mast'` lamps (G7): tried at the Ready lot's corners, then along its sides, 4 m outside the surface.
- **Fixed during the screenshot review:** sign boards were placed in front of their text (the normal was derived from the text's right vector with the wrong sign). Boards now sit behind.
- **Two Stage 3 test-data errors corrected:**
  - an atlas test entry wider than the 1024 px test atlas
  - the terminal "OK at 3 waiting" case, which contradicted rule I-2; the spec wins, so 3 waiting is Busy
- **E2E:** the wash-offline test checks the label's accessible name, because labels are compact (no detail line) at the overview zoom by design. The label-click test starts at the EV area, so the Fuel label is clear of the panels.

### 18.9 Verified results (2026-10-12)
- **Checks:** typecheck and lint are clean. 471 unit tests, 16 soak runs and 33 E2E tests (M1–M5 and the dev server) pass.
- **Production bundle:** 211.2 KB gzipped (budget 600 KB), with no test hooks.
- **Draw calls at 1280 × 800** (M5 adds about 20, budget 30):

| Setting | Before M5 | With M5 | Limit |
|---|---|---|---|
| Tier 0, day | 77 | 97 | — |
| Tier 0, night with rain and bloom | 94 | 114 | 300 |
| Tier 2 | 48 | 62 | 150 |

- **Screenshots for review:** overview labels (compact), the return canopy with its full label, the entrance (pylon, flags, booth with boom, barriers, RETURN, gantry, fence) by day and night, and night overview signs.

## 19. M6: airport context (design approved 2026-10-12; implemented)

Implements requirements §11 (A-1…A-6, F-1…F-5, L-1, L-2, D22–D25). The simulation is untouched. The airport is a pure plan plus pure motion schedules, rendered by one new view.

### 19.1 Key decisions
| # | Decision | Why |
|---|---|---|
| H1 | **A new pure folder, `src/airport/`** (no three, no DOM, same rules as `src/sim`): <ul><li>`plan.ts`: the static layout</li><li>`flights.ts`: the flight schedule</li><li>`traffic.ts`: background and airport vehicles</li><li>`paths.ts`: polyline and keyframe maths</li></ul> | Deterministic and testable without WebGL. Kept apart from the simulation, so the hub's calibrated behaviour can't change (D20). |
| H2 | **An airport clock.** `main` advances `airportTime += dt × speed` (speed 0–3, M4), so pause freezes jets and traffic together with the hub, and 60× speeds them up. Every airport pose is a pure function of `airportTime`. | Consistent with the hub's pause and speed control, and reproducible in tests. |
| H3 | **Flights as a timeline of movements.** <ul><li>Cycle P = 80 s: an arrival at k·P and a departure at k·P + 40.</li><li>Each movement is a keyframed 3D path (`Keyframe { t, x, y, z }`) built once from the plan: approach (3° glide), flare, roll-out, rapid exit, apron taxi lane, gate; or pushback, taxiway east, line-up, roll west, rotate, climb.</li><li>`movementsAt(t)` returns active aircraft poses (position, heading, pitch, gear, lights, phase).</li></ul> | Simple, exact separation by construction: one runway direction (27), departures on the taxiway (eastbound), arrivals on the apron lane (westbound), and runway occupancy windows that never overlap. |
| H4 | **Gate assignment is a deterministic replay:** the starting occupancy is 6 of 8 gates (A1–A6), arrivals take the lowest free gate, and departures leave from the gate occupied longest. `gateStateAt(t)` replays the cycles up to t (cached per cycle). | Gate use is always consistent, and testable. |
| H5 | **Extra arrival (F-2):** `scheduleExtra(t)` picks the first approach start in [t, t + 5] whose runway window is free. If there is none, it uses a holding variant (an extended approach) that lands in the next free window. If every gate is full, the jet parks at the remote stand by the cargo apron. | Meets "within 5 s" without breaking runway exclusivity or gate consistency. |
| H6 | **Background traffic** moves along closed loops at constant speed and fixed spacing (`pose = path(s0 + v·t mod L)`), so it can't overlap by construction. <ul><li>Boulevard: 4 lanes, separate loops per direction.</li><li>Terminal curb: cars, plus a separate bus bay loop with dwell.</li><li>Airport vehicles: the tug is attached to the departing jet's nose during pushback, then returns. The fuel truck and follow-me car run on their own service-road loops.</li></ul> | Cheap and safe. Nothing touches the hub simulation. |
| H7 | **One shared text atlas.** `main` builds a single atlas holding the M5 site strings and the M6 airport strings, and passes it to both views. | One texture and no duplicate glyph work. The M5 sign code is unchanged. |
| H8 | **Airport floodlight masts go through `lampsView`:** `createLampsView(extra)` takes extra placements (8 apron masts, kind `'mast'`), so they switch with the street lights. Airfield lights (runway edge, threshold, taxiway) are one instanced `MeshBasic` mesh with per-instance colour, scaled by the same lamp level. | Night lighting stays consistent (V-6) for 1 draw call. |
| H9 | **Jets are instanced per part** (capacity 12): body (white fuselage and wings), livery (tail and cheatline, tinted per airline by instance colour), windows (dark band; scaled to zero on the freighter), and nav and beacon lights (`MeshBasic`, flashing by material). Gear is a separate small instanced mesh, scaled by `gear`. | About 5 draw calls for every aircraft. One geometry stays within its 2.5k-triangle budget. |
| H10 | **Static airport geometry is merged by material,** as in M5 G4: `airportStatic` (buildings, bridges' fixed parts, tower, garage, hotel, cargo, fuel farm, fire station and engine, boulevard deck and piers, fences, sign boards), `airportGlass`, `airportGlow` (windows and signs at night), `pavement` (runway, taxiway and apron surfaces) and `markings`. Jet bridge tunnels and cabs are instanced and animated. | Few draw calls for a large area. |
| H11 | **Labels:** `ui/places.ts` defines `PLACES` (airport name labels, with priority below every hub facility). `FacilityLabels` also renders place labels (no status dot) through the same overlay, declutter and blockers. Hooks: the existing `facilityLabels()` keeps returning hub facilities only (M5 tests unchanged), and a new `placeLabels()` returns the airport ones. | One label system; the M5 contract is preserved. |
| H12 | **Camera and area:** `AreaId` gains `'airport'` (x 0, z 380, distance 700). The camera limits become the union of the hub bounds and the airport plan bounds, with `maxDistance` 1100. Hub areas are unchanged. | L-2. |
| H13 | **Detail by tier:** the pure `airportDetail(tier, reducedMotion)` returns `{ flights, traffic: 1 \| 0.5 \| 0, vehicles, lightAnim }`. Reduced motion stops beacon rotation and strobes but keeps flights (§11.7). | D21 in one tested place. |

### 19.2 Contracts
```ts
// airport/paths.ts
interface Keyframe { t: number; x: number; y: number; z: number }
sampleKeyframes(keys, t) → { x, y, z, heading, pitch }        // clamped; heading from motion
polylineLength(pts); pointAtDistance(pts, s, closed) → { x, z, heading }

// airport/plan.ts
interface AirportPlan {
  bounds: Bounds2D;                                           // whole airport, for camera limits
  airsideFence: { z: number; fromX: number; toX: number; gate: Pose };
  terminal: Box; curb: { z: number; fromX: number; toX: number };
  gates: readonly { id: 'A1' | … | 'A8'; stand: Pose; bridgeRoot: Vec2 }[];   // stand: jet nose-in pose
  runway: { z: number; fromX: number; toX: number; width: number };
  taxiway: { z: number; fromX: number; toX: number }; apronLane: { z: number };
  rapidExit: readonly Vec2[]; buildings: readonly Box[];      // tower, fire, fuel, cargo, garage, hotel, cellLot
  boulevard: { x: number; fromZ: number; toZ: number; deckY: number; width: number };
  overpasses: readonly { z: number; clearance: number }[];    // over the hub road extensions
  remoteStand: Pose; masts: readonly LampPlacement[];
  airfieldLights: readonly { x: number; z: number; colour: 'white' | 'green' | 'red' | 'blue' }[];
  gantries: readonly Gantry[]; labels: readonly PlaceAnchor[];
}
airportPlan(): AirportPlan                                     // cached, deterministic

// airport/flights.ts
type Airline = 'pacificGateway' | 'coastline' | 'sunlineCargo';
interface AircraftPose { id: string; airline: Airline; x; y; z; heading; pitch; gear: number; phase: 'approach' | 'landing' | 'taxiIn' | 'parked' | 'pushback' | 'taxiOut' | 'takeoff' | 'climb'; gate: string | null; landingLights: boolean }
createFlightSchedule(): { aircraftAt(t): readonly AircraftPose[]; gatesAt(t): ReadonlyMap<string, string | null>; scheduleExtra(t): number /* approach start */ }
export const CYCLE_SEC = 80; RUNWAY_SEPARATION etc.

// airport/traffic.ts
trafficAt(t, density: 1 | 0.5 | 0) → readonly { id; kind: 'car' | 'taxi' | 'bus'; x; y; z; heading }[]
serviceVehiclesAt(t, aircraft) → readonly { id; kind: 'tug' | 'fuel' | 'followMe'; x; z; heading }[]
airportDetail(tier, reducedMotion) → { flights; traffic: 1 | 0.5 | 0; vehicles; lightAnim }

// render/airport/*: aircraft.ts (jet geometry and parts), buildings.ts, view.ts →
//   AirportView { group; update({ time, night, tier, reducedMotion, lampLevel }); aircraft(): readonly AircraftPose[] }
// ui/places.ts: PLACES; FacilityLabels gains `places` (name-only).
// app/testHooks: placeLabels(), aircraft(), airportTime()
```

### 19.3 Performance plan
| Group | Draw calls (tier 0) |
|---|---|
| Pavement, markings | 2 |
| Static buildings, glass, glow | 3 |
| Jet bridges (tunnels, cabs) | 2 |
| Jets (body, livery, windows, lights, gear) | 5 |
| Airfield lights, tower beacon | 2 |
| Traffic (cars: paint, trim, lamps; buses: paint, trim, lamps) | 6 |
| Airport vehicles (tug, fuel truck, follow-me), palms | 4 |
| Shadow casters | about 12 |
| **Total added** | **about 36** (budget 60) |

- **Totals:** tier 0 at night with rain goes from about 114 to about 150 (limit 300). Tier 2 goes from 62 to about 85 (limit 150), with no traffic or vehicles.
- **Triangles:** jets about 30k, traffic about 28 cars × 1.9k + 4 buses = about 60k, buildings about 60k. About 150k in total (budget 250k).
- **Software WebGL (E2E):** traffic counts stay modest, and the E2E draw-call tests run at the Airport area, so the heaviest view is measured.

### 19.4 Test plan (Stage 3 preview)
| Layer | What's tested |
|---|---|
| Unit: `airport/paths` | Keyframe sampling (clamping, interpolation, heading and pitch); polyline length and point at a distance, open and closed |
| Unit: `airport/plan` | <ul><li>Deterministic.</li><li>No building, pavement or light inside the hub fence, on the patrol loop, or within 6 m of a road extension; the overpasses span the extensions with ≥ 5.5 m clearance.</li><li>The runway (1,200 × 45 m) and all airport bounds lie inside the ground.</li><li>8 gates with stands ≥ 45 m apart, and jets at stands clear of the terminal and of each other.</li><li>Buildings don't overlap.</li><li>The airside fence runs between the patrol loop and the terminal.</li><li>Airfield lights line both runway edges and the taxiway.</li><li>Every L-1 label has an anchor.</li></ul> |
| Unit: `airport/flights` | <ul><li>Deterministic, with one movement about every 40 s.</li><li>Runway occupancy never overlaps.</li><li>Moving and parked aircraft stay ≥ 50 m apart (sampled every 0.25 s over 10 cycles).</li><li>Gate occupancy is consistent: at most one jet per gate, an arrival docks at a free gate, a departure frees its gate, 6–7 gates are occupied.</li><li>The approach follows a 3° glide (±10%); gear is down below 60 m; climb-out leaves view; ground speeds stay within limits.</li><li>Poses are continuous.</li><li>`scheduleExtra` starts the approach within 5 s and keeps every rule above; with all gates full it uses the remote stand.</li></ul> |
| Unit: `airport/traffic` | <ul><li>Vehicles in a lane stay at their spacing.</li><li>Buses dwell at the curb.</li><li>Density 0.5 halves the count and 0 empties it.</li><li>The tug is at the nose during pushback.</li><li>Service loops stay on their own roads.</li><li>`airportDetail` returns the right detail per tier and with reduced motion.</li></ul> |
| Unit: UI | `PLACES` priorities are below every hub facility; `FacilityLabels` renders place labels without a status, clickable; `AreaSwitcher` shows "Airport"; the camera limits include the airport bounds. |
| E2E | <ul><li>The "Airport" area flies the camera there.</li><li>Airport labels show and clicking one flies there.</li><li>A landing and a take-off are seen (via the `aircraft()` hook, at 60×).</li><li>A surge brings an approach within 5 s of airport time.</li><li>Pause freezes `airportTime`.</li><li>Draw calls at the Airport area at night in rain: ≤ 300 on tier 0, ≤ 150 on tier 2.</li><li>No errors; bundle ≤ 600 KB; the M1–M5 suites stay green.</li></ul> |
| Visual review | Screenshots: the airport by day and night, a landing, a jet docked at a gate, the boulevard overpass, and the hub with the airport behind it. |

### 19.5 Risks
| Risk | Mitigation |
|---|---|
| Software-WebGL E2E slows down with a bigger scene | Modest traffic counts and instancing; tier 2 has no traffic; poll timeouts as in M3/M4 |
| Aircraft look wrong (scale, pitch, gear) | Keyframe tests (glide slope, gear height); screenshot review of a landing |
| Planes or traffic cross the hub or each other | Pure clearance and separation tests (H3, H6); nothing shares a path with the simulation |
| Labels clutter the wide airport view | Places have the lowest priority, compact mode, declutter and blockers (M5) |
| Bundle and triangle growth | Procedural low-poly kit; budgets asserted (§11.7) |

### 19.6 Stage 3 status (2026-10-12)
- **Contracts (stubbed):**
  - `src/airport/paths`, `plan`, `flights`, `traffic` (types, constants, stubs); the ESLint purity rules now also cover `src/airport` (H1)
  - `ui/places` (`PLACES` is real config)
  - `FacilityLabels` gains `places` / `onPlace`
  - `app/limits` (`cameraLimits`, `MAX_DISTANCE`)
  - test hooks `placeLabels`, `aircraft`, `airportTime`
- **Failing tests:**
  - **Unit:** paths (5); plan, flights and traffic (fail at load, because they call stubs at module scope); camera limits; the Airport area; place labels.
  - **E2E:** `tests/e2e/m6.spec.ts` (5).
- **Existing suites:** all 474 other unit tests pass (`places.test.ts` passes already, as it checks config).
- **Fixed by the tests:** the separation rule is ≥ max(45 m, wingspan + 6 m) between any two aircraft, including parked neighbours. So gate stands are ≥ 45 m apart and the apron lane runs ≥ 45 m beyond the stands.

### 19.7 Implementation notes (Stage 4, 2026-10-12)
- **Flight timeline as built (H3 refined):**
  - Arrivals roll west and leave by a **west-end exit** (x ≈ −200), west of every gate, then taxi east on the apron lane. Departures taxi only east of their gate on the taxiway. So the two flows never share ground.
  - Runway windows per 80 s cycle: arrival [0, 20.5], departure about [44, 70]. A surge extra touches down at c + 21.5 (one per cycle); its approach starts immediately (F-2), and a longer approach covers the wait.
  - Departures start at k = 1, so the 6 initial gates are all held at t = 0.
  - Two remote stands (x −330 and −380) sit beside the cargo freighter. An extra with every stand taken diverts (it isn't added).
  - Every rule is unit-tested at 0.25 s over 10 cycles.
- **Plan details:**
  - The apron lane extends to x −400 (the remote stands).
  - The overpasses are derived from the M5 road extensions.
  - The boulevard deck is level to z 200, then ramps to the curb.
- **Airport clock (H2 refined):** advances by the real frame time (capped at 1 s, as for the camera in M3) times the speed (0–3). Pause still freezes it, and flights keep pace even when software WebGL drops frames.
- **Shared atlas (H7):** `createSiteView(palette, atlas)` and `createAirportView(palette, atlas)` take one atlas, built in `main` from `signEntries` and `airportTexts`. `site.ts` exports `at`, `boardFor`, `gantry` and its colours for reuse.
- **Lamps:** `createLampsView(extra)` takes the 6 apron masts (H8).
- **Labels:** `declutter` is generic over label ids; places sort after facilities on ties.
- **Fixed during the screenshot review:** terminal and garage roofs are now a light membrane grey (graphite read as a black slab from above).
- **Tests updated for the approved L-2:**
  - The M1 area list now ends with `'airport'`.
  - The "contains every camera area" test covers the hub areas (the airport area lies in the airport).
  - The M1 zoom test checks `MAX_DISTANCE` (1,100) instead of 600.
  - The M6 flight E2E tests pin tier 0 (tier 2 parks jets by design, and software WebGL drops there); the jets test allows 150 s.

### 19.8 Verified results (2026-10-12)
- **Checks:** typecheck and lint are clean. 516 unit tests, 16 soak runs and 38 E2E tests (M1–M6 and the dev server) pass.
- **Production bundle:** 220.9 KB gzipped (budget 600 KB), with no test hooks.
- **Draw calls at 1280 × 800, tier 0:**

| View | Draw calls | Limit |
|---|---|---|
| Hub overview by day, airport in view | 129 | — |
| Airport area by day | 125 | — |
| Airport area at night in rain | 142 | 300 |
| Airport area on tier 2 | 76 | 150 |

- **Jet model:** 1,224 triangles (budget 2,500).
- **Screenshots for review:** the airport with labels and a landing, the terminal close-up (bridges, gate numbers, liveries), the hub with the airport, and the airport at night (runway, taxiway and apron lights).

## 20. M7: ops realism tuning (design approved 2026-10-13; implemented and approved 2026-10-13)

Implements requirements §12 (R-1…R-8, D26–D39). The changes are confined to the simulation's timing and demand, a small UI readout, and the airport cadence. The one layout change is the energy bypass lane (D33, §20.7); there are no new visual assets.

### 20.1 Measurements behind the design (2026-10-13)
- **Where a unit's cycle goes** (seed `goldlane`, 2 simulated hours, 20×):

  | Unit | Drive-in (grant → stop) | Work | Leave | Idle |
  |---|---|---|---|---|
  | Exit gate | 273 s | 15 s | 47 s | 88 s |
  | Wash bay | 133 s | 144 s | 47 s | 347 s |

  The drive-in from the queue head to the stop dominates. A release rule alone (R-1) only trims the 47 s "leave".
- **Time scale against daily KPIs** (flat demand, clear):

  | Time scale | Turnaround | Served | Utilisation |
  |---|---|---|---|
  | 20× | 57.0 min | 97% | 62.7% |
  | 15× | 43.0 min | 98% | 62.7% |
  | 12× | 35.0 min | 103% | 69.4% |

  Turnaround is mostly inter-station driving at natural speed, which counts × the time scale. Hence D30.
- **Unit approach lanes hold two cars:** gate 25.5 m, wash 16.6 m, service 33.1 m, charger 38.5 m, pump 35.0 m, return lane 42.2 m.

### 20.2 Key decisions
| # | Decision | Why |
|---|---|---|
| K1 | **Hub clock 15×** (`rates.timeScale` 20 → 15; D30). The speed buttons become **15× / 30× / 45×** (still 1, 2 or 3 steps per tick, M4 W9). The airport maps 15 hub seconds per airport second (one hub day = 96 airport minutes). | Turnaround 43 min with natural driving (§20.1). It's one constant: rates, KPIs and the curve all read it. |
| K2 | **Release when the front leaves the unit's lane (R-1).** `processReleases` frees a unit as soon as the leaving car's front is off the unit's park edge, instead of waiting for its whole body to clear. The traffic engine's no-overlap rules (L-4, IDM following across edges) keep the next car behind it. | Trims "leave" for every bay type (Q1), with safety still guaranteed by the engine. |
| K3 | **Roll-up staging (two-deep lanes).** `ResourcePool` gains a per-unit `next`: when a unit is occupied and has no `next`, the first matching waiting agent is granted as `next` (FIFO, tags respected) and drives into the unit's lane, stopping behind the occupant. On release, `next` becomes the occupant and pulls up to the stop. It applies to return lanes, wash bays, chargers, pumps and gates; **not** service bays (tow-truck hand-offs) or slots and the tow bay. | Removes most of the 273 s gate drive-in (and the wash's 133 s). This is how real exit gates and wash tunnels queue. Every lane holds two cars inside the unit's own edge, so nothing blocks a shared lane (§20.1). |
| K4 | **Gate dwell 8–15 s** (R-2): `GATE_DWELL`. | R-2. |
| K5 | **Day curve as a pure function,** `sim/demand.ts`: `dayCurve(hours)` is piecewise linear through the R-3 anchor values (at hour mid-points), normalised so its 24 h mean is exactly 1.0. Also `periodOf(hours)` ("Overnight", "Morning peak", …). Pickup arrivals use the rate × weather × surge × `dayCurve(clockHours)`. | R-3; testable on its own. |
| K6 | **Returns shaped by time-warping (R-4).** A rental's duration is drawn as today (exponential, mean 3.9 h). Its return time is the moment the curve-weighted clock has advanced by that duration: `returnAt = C⁻¹(C(pickup) + duration)`, where C is the cumulative curve. Returns then arrive at a rate ∝ the curve, the mean real duration over a day equals the drawn mean, and the 30-min minimum is enforced in real time. | Returns cluster at peaks without a second random model, and stay deterministic. |
| K7 | **Snapshot demand.** `Snapshot.demand = { factor, period }`, where factor = curve × weather × surge (what the hub is experiencing). It is read-only. | R-7 without the UI re-deriving simulation rules. |
| K8 | **Flight cadence by hub hour (R-5).** The airport timeline becomes a sequence of cycles: c₍k+1₎ = c_k + 2·I(h(c_k)), where I(h) = clamp(40 / dayCurve(h), I_min, 120) and h(t) = 8 + 15·t/3600. <ul><li>Arrival touchdown at c; departure line-up at c + I + 4, with a 20 s take-off roll.</li><li>I_min = 25 s if the separation tests pass, otherwise 30 s; both are "about 25 s" (R-5).</li><li>A surge extra inserts an 80 s arrival-only cycle at the first boundary ≥ t + 35 s. Later cycles shift; already-started flights are unaffected, and the approach still begins within 5 s.</li></ul> | Keeps every M6 safety rule checkable by the same unit tests. |
| K9 | **Demand readout:** the pure `demandText({ factor, period })` gives "Demand ×1.6 · Morning peak" (one decimal; "×1.0"). `TopBar` shows it next to the clock (aria-label "Demand"). | R-7. |

### 20.3 Contracts
```ts
// sim/demand.ts
dayCurve(hours: number): number                    // ≥ 0, 24 h mean = 1, piecewise linear
periodOf(hours: number): 'Overnight' | 'Early morning' | 'Morning peak' | 'Midday' | 'Evening peak' | 'Late evening'
cumulativeDemand(hours: number): number             // ∫ curve from 0 to hours (hours in [0, ∞); 24 per day)
warpReturn(pickupClockSec: number, durationSec: number, minSec: number): number   // seconds until the return
// sim/resources.ts
interface Grant { …; readonly next?: boolean }       // granted as the unit's next (staged)
interface ResourcePool { …; nextOf(unitId: string): string | null }
createResourcePool(units, { staging: boolean })      // staging on for the K3 kinds
// sim/world.ts
Snapshot.demand: { readonly factor: number; readonly period: string }
// config/rates.ts: timeScale 15; GATE_DWELL { min: 8, max: 15 }
// airport/flights.ts: CYCLE_SEC replaced by movementInterval(hours); hubHoursAt(airportTime)
// ui/demand.ts: demandText(demand) → string; TopBar prop `demand`
```

### 20.4 Test plan (Stage 3 preview)
| Layer | What's tested |
|---|---|
| Unit: `sim/demand` | The curve's anchor values; its 24 h mean is 1 (±1e-9); no steps (continuous); period names by hour. `cumulativeDemand` is monotonic and adds 24 per day. `warpReturn` is ≥ the minimum; over many draws the mean real duration matches the drawn mean ±5%, and the share of returns in peak hours is ≥ 1.4× the mean. |
| Unit: resources | Staging: `next` is granted only while occupied; FIFO and tags; promotion on release; no staging when disabled; `nextOf`. |
| Integration: `sim/world` | `timeScale` 15; gate dwell within 8–15 s; release happens before the leaving car's rear clears the lane; staged cars never overlap (invariants every step); `Snapshot.demand` follows the curve, weather and surge; determinism (S-15) still holds; the baseline still matches a pristine run (S-16). |
| Soak: day-long (new) | Seeds 1–3 × clear, overcast, rain × 24 simulated hours: turnaround ≤ 45 min; utilisation 60–70%; served ≥ 90%; gate, wash, service and charger queues ≤ 10 at all times and ≤ 3 within 60 simulated minutes after each peak; counter recovery; no overlap or gridlock. Heatwave: no overlap or gridlock, served ≥ 80%, queues recover. |
| Unit: airport | The interval follows the curve (≈ 25 s peak, 40 s midday, 120 s overnight). All M6 flight tests still pass across a full hub day of cycles, including extras inserted at a peak. |
| Unit: UI | `demandText`; TopBar shows the readout; the speed control labels 15× / 30× / 45×. |
| E2E | The demand readout is visible next to the clock and changes with weather; the M4 speed test uses the new labels; existing suites stay green. |

### 20.5 Risks
| Risk | Mitigation |
|---|---|
| Staging causes deadlock where lanes merge | Staging only on units whose own park edge holds two cars (all K3 kinds, §20.1); the day-long soak checks for gridlock in every weather |
| The clock change shifts calibrated tests (M1 soak floors, M4 surge thresholds, speed labels) | Stage 3 lists each change with its reason; assertions are re-derived from `rates`, not weakened silently |
| A 25 s peak cadence breaks aircraft separation | I_min falls back to 30 s if the tests require it (K8) |
| The airport and hub clocks drift at low frame rates | Cosmetic only; the cadence mapping is a pure function of airport time (documented) |

### 20.6 Stage 3 status (2026-10-13)
- **Contracts (stubbed):**
  - `sim/demand`: `dayCurve`, `periodOf`, `cumulativeDemand`, `warpReturn`
  - `ResourcePool` options `{ staging }`, `Grant.next`, `nextOf`
  - `Snapshot.demand` (a placeholder of ×1.0 · Midday)
  - `airport/flights`: `hubHoursAt`, `movementInterval`, `MIN_INTERVAL` / `MAX_INTERVAL`
  - `ui/demand`: `demandText`; `TopBar` gains `demand` (passed by `Dashboard`)
  - A staged car's task reads "Waiting behind …"
- **Failing tests:**
  - 26 unit tests in 7 files: day curve, staging pool, M7 world, flight cadence, demand text, TopBar readout and speed labels.
  - The new day-long soak (`tests/soak/day.soak.test.ts`: 9 Balanced runs plus 3 heatwave runs). Seed 1 in clear today: turnaround 60.5 min against ≤ 45.
  - 2 E2E tests (`tests/e2e/m7.spec.ts`).
- **Existing tests changed because of the approved D30 / K8,** each re-derived from the spec rather than loosened:
  - Speed labels: 20× / 40× / 60× → 15× / 30× / 45× (`SpeedControl`, `TopBar`, the M4 E2E speed test).
  - The M6 flight cadence: the fixed 80 s gap became 2 × `movementInterval` at the touchdown's hub hour.
- **Existing suites:** the other 514 unit tests pass.

### 20.7 Implementation notes (Stage 4 calibration, 2026-10-13)
The day-long soak drove several changes from the approved design. Each was measured, and the requirement-level ones were decided by the user (D31–D39). The remaining calibration choices (the energy bypass lane, K2 on drive-through units only, no staging at chargers and pumps, a backlog of 9 per gate, the 30 s flight floor) were approved on 2026-10-13.

| Area | As designed | As built | Why |
|---|---|---|---|
| K2 release rule | Every bay type | **Drive-through units only** (return lanes, wash, gates): free the unit once the leaver's front is off its lane. Service, chargers, pumps and the tow hand-off keep the whole-body rule. | Early release at stalls and bays let the next car in while the previous one was still manoeuvring out, which jammed (wash-tunnel-down preset). A "leaver must be moving" variant made the day runs worse (10 failures vs 8) and was dropped. |
| K3 staging | Return lanes, wash, chargers, pumps, gates | **Return lanes, wash and gates** (`STAGED` in `world.ts`) | A car staged behind a charger or pump could wait 20+ minutes while another unit freed up, and the gridlock check flagged it. |
| Gridlock check (D36) | A granted car should be moving | A car on its way to its unit counts as queued if it is stopped (≤ 0.1 m/s) **nose-to-tail (≤ 4 m) behind a queued car**, or while **a queued car still occupies its unit** (K2 leaver part-way out) | At the morning peak the wash queue backs up through the return lanes, and with gate 2 closed the energy queue backs up onto the wash exits. These are long queues, not deadlocks; the head of the line is still checked. |
| Charge later (R-8, D33) | (not in design) | `shouldChargeLater(level, waiting)`: ≥ 50% and ≥ 4 waiting. The car takes `graph.route(from, lotQueue, 'fleet', avoid)`, where `avoid` is every unit lane, over the new **`energy_bypass`** edge: (170, −10) → (189, 8) → (189, 60) → (170, 72), at lane speed. | Heatwave charger spill-back jammed the wash exit. The first version routed skip cars through charger stalls (the shortest path), so `route()` gained an `avoid` set (cached per key) and the hub gained a bypass. |
| Departure backlog | 10 per gate (M4) | **9 per gate** | 10 gave gate queues of 11–13 and a jam; 8 left seed 1 in rain at 88% served. |
| Flight interval floor (K8) | 25 s, or 30 s if separation fails | **30 s** | At 25 s a pushback came within 43.8 m of an arrival. Gate claims also gained a `freeFrom` time, so an arrival never claims a gate before the departing jet has pushed back. |
| Demand curve (D34) | Evening ×1.8 | **Evening ×1.4** (raw); normalised: ×1.68 morning, ×1.05 midday, ×1.47 evening | The evening counter backlog took 1–3+ hours to clear. Equal peaks (×1.4 both) only moved the backlog back to the evening. |
| Exit gates (D38) | 2 | **2, now generated from `facility.exitGates`** (6 m pitch, centred; the building depth follows). A third gate was tried and reverted. | Saturated throughput was 28–30 cars/h with 2 or 3 gates. The limit is ready-car supply: free ready cars are ≈ 0 every hour on busy seeds, and a customer's walk to the car takes ≈ 20 hub minutes at 15×. 135 and 150 cars didn't clear the counter either (150 also pushed turnaround to 60–100 min). |
| Warm start | Steps | **Sim-seconds based** (`PREROLL_SIM_SEC` = 1,800). The initial fleet's returns use no 30-minute minimum. | Otherwise the first 600 steps had no returns at all. |
| Soak "served" (D39) | Checkouts ÷ expected demand (480 × weather) | Checkouts ÷ the pickups customers actually requested (checkouts + still waiting at the end − waiting at the start) | The seeds' random arrival counts differ by ±8%, so the expected-demand ratio ranged from 89% to 107% for the same service. |
| Top bar (R-7) | Readout next to the clock | Unchanged, plus the grid now sizes the controls column to its content, and the search box (max 320 px) gives way first | At 1280 px the readout wrapped the controls onto a second line under the KPI cards, which blocked the area buttons (4 E2E failures). |

### 20.8 Verified results (2026-10-13)
- **Day-long soak** (seeds 1–3, 24 simulated hours, 2 gates, 120 cars). Overcast matches clear because it changes neither demand nor speed.

  | Run | Turnaround | Utilisation | Served | Longest queue | Queues at 11:00 / 21:00 | Counter at 11:00 / 21:00 (not a target) |
  |---|---|---|---|---|---|---|
  | s1 clear | 43.8 min | 64.0% | 99.8% | 9 | 6 / 6 | 2 / 1 |
  | s1 rain | 51.2 min | 67.3% | 97.6% | 10 | 3 / 6 | 14 / 22 |
  | s2 clear | 40.4 min | 60.6% | 98.2% | 9 | 4 / 3 | 0 / 0 |
  | s2 rain | 46.7 min | 63.6% | 98.4% | 10 | 6 / 2 | 5 / 0 |
  | s3 clear | 41.6 min | 73.3% | 100.8% | 11 | 4 / 6 | 6 / 26 |
  | s3 rain | 47.7 min | 72.0% | 91.8% | 9 | 4 / 4 | 18 / 58 |

  All 9 Balanced runs meet §12.4 (≤ 45 min, or ≤ 55 in rain; 60–75%; ≥ 90%; ≤ 12; ≤ 8). The 3 heatwave runs pass (served ≥ 80%, evening queue ≤ 10), as do all 4 M4 presets (4 h, then reset and 2 h) and the M1 soaks: **28 of 28 soak tests**.
- **Unit and integration:** 545 tests in 72 files, plus typecheck and lint, all green. Two new M7 tests cover D36: one for a nose-to-tail driver, and one for the gate-closure preset passing step 5,139 without a gridlock flag. Both fail with the rule removed.
- **E2E:** 40 of 40, run on their own. The M5 patrol test now polls for movement instead of sampling after a fixed 1.5 s (under software WebGL a surge at the morning peak can stretch a frame past that).
- **Simulation cost:** step ≈ 0.08 ms and snapshot ≈ 0.10 ms in Node at the morning peak (worst step + snapshot 0.65 ms), well within the §9.6 budget.
- **Production bundle:** 222.3 KB gzipped (budget 600 KB), with no test hooks.

## 21. M8: Ship & share (design approved 2026-10-13; implemented, awaiting review)

Implements requirements §13 (SH-1…SH-15, D40–D47). The simulation, world and dashboard logic are unchanged. M8 adds:
- a pure `src/share/` layer (link state, kiosk scheduler, caption and help text);
- thin browser adapters (capture, clipboard, wake lock);
- a few Preact components;
- CI workflows and the docs files.

### 21.1 Component breakdown
| Module | Kind | Responsibility |
|---|---|---|
| `src/share/link.ts` | pure | `LinkState`, `parseLink(search)` and `formatLink(base, state)`, built from allow-lists derived from config (area ids, weather modes, preset ids, unit and facility ids). It has no DOM access. |
| `src/share/kiosk.ts` | pure | `createKioskScheduler({ areas, dwellSec: 20, idleSec: 60 })`: wall-time state machine (touring, paused, exited) |
| `src/share/caption.ts` | pure | The screenshot caption and file name, and the kiosk's live fact per area (reusing `facilityStatuses`) |
| `src/share/help.ts` | pure | `SHORTCUTS`: the single list both the key handler and the help content read; `QUICK_HELP` is its first five entries |
| `src/share/version.ts` | pure | `APP_VERSION` and `BUILD_DATE`, from Vite `define` (`__APP_VERSION__` from `package.json`, `__BUILD_DATE__` as an ISO date at build time) |
| `src/app/capture.ts` | DOM | `captureFrame(source, caption, maxWidth)`: synchronous `drawImage` of the WebGL canvas into a 2D canvas, a caption strip, then `toBlob`; plus `downloadBlob(blob, name)` |
| `src/app/clipboard.ts` | DOM | `copyText(text): Promise<boolean>`: the async Clipboard API, `false` on any failure (the UI then shows the fallback) |
| `src/app/wakeLock.ts` | DOM | `requestWakeLock()` and `release()`: feature-detected, re-acquired on `visibilitychange`, and silent where unsupported |
| `src/ui/m8/` | Preact | `HelpButton` (quick-help popover), `HelpDialog`, `CopyLinkDialog`, `Notice` (polite live region), `KioskCaption` (with the paused chip), `EmbedHud` |
| `src/app/main.ts` | wiring | Applies the link at start-up, holds the UI `mode`, adds the key handler, wires the kiosk and screenshot into the frame loop, and adds test hooks |
| `src/airport/flights.ts` | pure | Gains `nextTouchdown(t): number \| null` (airport seconds until the next landing) for the airport fact |
| `.github/workflows/pages.yml`, `release.yml` | CI | SH-1, SH-2 |
| `scripts/changelog-section.mjs` | Node | Prints one version's CHANGELOG section (release notes) |
| `scripts/screenshots.ts` | Playwright | Regenerates `docs/media/*.jpg` for the README (`npm run screenshots`, run locally) |
| `README.md`, `CHANGELOG.md`, `LICENSE` | docs | SH-13…SH-15 |

### 21.2 Key decisions
| # | Decision | Why |
|---|---|---|
| J1 | **Link parsing is pure and allow-listed.** `parseLink` returns `{ state: Partial<LinkState>; ignored: string[] }`. Each key has a validator: enums against config-derived lists, `seed` against `/^[A-Za-z0-9_-]{1,32}$/`, `cam` as 5 finite numbers clamped to `cameraLimits()`, and `select` against the unit and facility ids. The first occurrence of a duplicate key wins. Values never reach HTML except as text, which Preact escapes. | SH-5, SH-6. Unit-testable, and nothing a URL contains can inject markup or run code. |
| J2 | **Link precedence at start-up:** seed → weather → time of day → theme and labels (in memory only) → quality pin → preset → area → select → camera. `cam` is ignored (and listed as ignored) when `select` is present, because selecting follows the object. Speed is applied last, so a paused link still shows the preset's effect at once (`applyVisible`). | D42 and S-15: the same link always produces the same state. |
| J3 | **Preferences are not written by a link.** `theme` and `labels` from a link set the in-memory settings only. `saveTheme` and `saveFlag` are called only by the existing user handlers. | D42 |
| J4 | **Copy link reads live state.** `formatLink(location.origin + location.pathname, currentLinkState())` omits defaults. The preset is included only while `activePreset` is set: `onPreset` sets it, and any other scenario command or Reset clears it. The camera comes from `rig.state()`, rounded (positions 0.1 m, angles 0.1°). | SH-7. A short, readable and exact link. |
| J5 | **One `mode` signal (`'normal' \| 'embed' \| 'kiosk'`).** The Dashboard renders the top bar, KPIs, sheet and what-if drawer only in `normal`. Embed adds `EmbedHud`; kiosk adds `KioskCaption`. Facility labels follow the labels setting in every mode. The label declutter treats the HUD and caption as blockers. | One switch point, so panels can't leak into kiosk or embed. |
| J6 | **Kiosk scheduler is wall-time and input-driven.** `tick(rawDt)` returns the area to fly to when a dwell ends. `input()` pauses and resets the 60 s idle countdown, and `exit()` ends it. The camera uses `rig.glideTo` (or `jump` with reduced motion) and MapControls' `autoRotate` (0.6°/s) while dwelling. Input listeners (pointerdown, wheel, touchstart, keydown) are passive and on `window`. | SH-9, SH-10. Testable without a browser, and the simulation is untouched. |
| J7 | **Screenshot in the frame loop.** `P` or the button sets `captureRequested`. Right after `post.render()` in that frame, `captureFrame` copies the canvas with `drawImage`, synchronously, before the buffer is presented. That avoids `preserveDrawingBuffer` and its cost on every frame. Width is capped at 4096 px, with the aspect ratio kept. The caption strip is drawn with Canvas 2D text in the UI font. | SH-11: never blank, with no per-frame cost. |
| J8 | **Downloads and clipboard work under the existing CSP.** `img-src data: blob:` already allows the image; the download is an `<a download>` on an object URL, revoked after the click. The clipboard needs no CSP change. No network request is made. | SH-4. The CSP is unchanged. |
| J9 | **Keyboard map from `SHORTCUTS`.** `P` captures and `?` opens help; Esc exits kiosk, then closes dialogs, then clears the selection (existing). Keys are ignored while typing in an input. In an iframe the page only gets keys while it has focus. | SH-8, SH-12. The help text and the behaviour can't drift (a unit test compares them). |
| J10 | **Quick help on hover.** `HelpButton` shows its popover on `pointerenter`/`focus` and hides on leave/blur. On `(hover: none)` devices it shows no popover, and a tap opens `HelpDialog`. The popover is linked with `aria-describedby`. `HelpDialog` is a `<dialog>` with focus return. | SH-12a (Q4) |
| J11 | **CI order: check → E2E → production build → deploy.** `test:e2e` builds with `--mode test` into `dist/`. The production `npm run build` runs after it, so the deployed and released file never contains test hooks. Pages uses `actions/upload-pages-artifact` + `actions/deploy-pages` with `permissions: { pages: write, id-token: write }` and `concurrency: pages`. Release uses `contents: write` and the `gh` CLI, and checks `GITHUB_REF_NAME == "v" + package.json version`. Node 22, `npm ci`, `npx playwright install --with-deps chromium`. | SH-1, SH-2: least privilege, and no test hooks in published files. |
| J12 | **Version compiled in.** `package.json` is 0.8.0. Vite's `define` injects the version and build date, typed in `src/env.d.ts`. | SH-3 |

### 21.3 Contracts
```ts
// share/link.ts
type SpeedLink = 0 | 15 | 30 | 45;                       // ↔ Speed 0 | 1 | 2 | 3
interface CamLink { x: number; z: number; azimuthDeg: number; elevationDeg: number; distance: number } // elevation = 90° − polar
interface LinkState {
  area: AreaId; cam: CamLink | null; weather: WeatherMode; tod: DayNight; speed: SpeedLink;
  labels: boolean | null; theme: Theme | null; quality: 'auto' | 0 | 1 | 2; seed: string;
  preset: PresetId | null; select: string | null; kiosk: boolean; embed: boolean;
}
const LINK_DEFAULTS: LinkState
parseLink(search: string): { state: Partial<LinkState>; ignored: readonly string[] }
formatLink(base: string, state: LinkState): string        // defaults omitted, fixed key order
// share/kiosk.ts
interface KioskState { phase: 'touring' | 'paused' | 'exited'; area: AreaId; dwellLeftSec: number; resumeInSec: number | null }
createKioskScheduler(opts: { areas: readonly AreaId[]; dwellSec: number; idleSec: number }): {
  tick(dtSec: number): AreaId | null;                       // the area to fly to now, if the dwell ended or the tour resumed
  input(): void; exit(): void; state(): KioskState;
}
// share/caption.ts
screenshotCaption(p: { area: string; clock: string; weather: string }): string
screenshotFileName(d: Date): string                         // goldlane-hub-YYYYMMDD-HHMMSS.png (local time)
kioskFact(area: AreaId, snap: Snapshot, nextLandingSec: number | null): string
// share/help.ts
interface Shortcut { keys: string; action: string; key?: string }   // `key` set when handled by the key handler
const SHORTCUTS: readonly Shortcut[]; const QUICK_HELP: readonly Shortcut[]
// app/capture.ts
captureFrame(source: HTMLCanvasElement, caption: string, maxWidth?: number): Promise<Blob>
downloadBlob(blob: Blob, fileName: string): void
// app/clipboard.ts
copyText(text: string): Promise<boolean>
// airport/flights.ts
FlightSchedule.nextTouchdown(t: number): number | null
// test hooks (test builds only): mode(), link(), kiosk(), help(): boolean
```

### 21.4 Security
| Risk | Mitigation |
|---|---|
| Malicious query strings (markup injection, absurd numbers) | J1: allow-lists, a regex for `seed`, finite and clamped numbers, ids checked against known sets. Ignored keys are logged as text. No `innerHTML` anywhere on the M8 paths. |
| Clickjacking through the embed | The page has no account, data entry or privileged actions; the worst case is a misleading frame around a demo. It is accepted and documented (SH-8): a `<meta>` CSP can't set `frame-ancestors`, and Pages can't set headers. |
| "Open full view" opening an untrusted target | Built from our own `location` and `formatLink`, `target="_blank" rel="noopener noreferrer"` |
| CI supply chain | `npm ci` against the lockfile, least-privilege `permissions` per workflow, no secrets beyond `GITHUB_TOKEN`, and only first-party `actions/*` (major-version tags; pinning to SHAs is noted as an option) |
| Publishing by accident | Workflows run only on the user's push or tag. Pages needs the user to enable it in the settings. Release checks the tag against the version. |
| Leaking test hooks | J11: the deployed and released file comes from the production build, and an E2E test already asserts `__hub` is absent in production (M1) |

### 21.5 Performance
- **Kiosk:** O(1) per frame. The orbit uses MapControls' built-in auto-rotate, with no extra render passes.
- **Screenshot:** one `drawImage` (≈ 5–20 ms at 4K under software rendering) and an async PNG encode, only when requested. Nothing per frame.
- **Embed and kiosk:** they hide DOM panels, so fewer label blockers, and the draw calls are unchanged (budgets checked in E2E).
- **Bundle:** an estimated +8–12 KB gzipped (components, help text, link tables), within the +15 KB budget.

### 21.6 Test plan (Stage 3 preview)
| Layer | What's tested |
|---|---|
| Unit: `share/link` | Each key valid and invalid; duplicates (first wins); unknown keys ignored; `cam` clamped; seed regex; `formatLink` omits defaults and has a stable order; parse(format(s)) = s for random valid states (seeded); speed mapping |
| Unit: `share/kiosk` | Order and wrap-around; 20 s dwell; input pauses and resets the 60 s countdown; the tour resumes on the next area; exit is final |
| Unit: `share/caption` | Caption text; file name from a fixed local date; the fact per area (from a fixture snapshot); "Next landing in 0:40" formatting |
| Unit: `share/help` | Every key-handled shortcut appears in `SHORTCUTS`, and `QUICK_HELP` is a subset |
| Unit: `airport/flights` | `nextTouchdown` equals the gap to the next approach → landing phase change across a day |
| Unit: UI | `HelpButton` popover on hover/focus and the dialog on click; `HelpDialog` focus trap and Esc; `CopyLinkDialog` shows the link selected; `KioskCaption` paused chip and exit; `EmbedHud` "Open full view" href drops `embed`; Dashboard hides the panels in embed and kiosk |
| Unit: workflows | Both YAML files exist; Pages runs check → E2E → build → deploy in that order; Release checks the tag against the version and attaches `goldlane-hub-<version>.html` |
| E2E (`tests/e2e/m8.spec.ts`) | A deep link applies area, weather, time of day, speed, labels, preset and select, and leaves `localStorage` unchanged; invalid values fall back without errors; Copy link round-trips; embed mode shows the HUD only; kiosk moves on after 20 s (fast-forwarded with a test hook), pauses on input and exits on Esc; `P` downloads a PNG of the canvas size that isn't one colour; `?` opens help and Esc closes it; draw calls in embed and kiosk stay in budget |

### 21.7 Risks
| Risk | Mitigation |
|---|---|
| `drawImage` of a WebGL canvas returns blank in some browsers when not done in the same task as the render | J7 captures in the same frame, right after `post.render()`. The E2E test checks that the PNG isn't uniform. |
| The Clipboard API is refused (`file://`, iframe without permission) | The `copyText` → `false` → `CopyLinkDialog` fallback (SH-7) |
| Wake Lock is unsupported (Firefox, `file://`) | Feature-detected and silent (SH-9) |
| CI E2E on the hosted runner is slower than locally (software WebGL) | Tests already poll rather than sleep. A 20-minute job timeout. Playwright's retries stay at 0, so real failures surface. |
| The first Pages deploy fails until Pages is enabled | It's documented in the README and in §13.2 as a user step |

### 21.8 Stage 3 status (2026-10-13)
- **Contracts, stubbed and typed:**
  - `share/link`, `share/kiosk`, `share/caption`, `share/help`, `share/version`
  - `app/clipboard`, `app/capture`, `app/wakeLock`
  - `ui/m8`: `HelpButton`, `HelpDialog`, `CopyLinkDialog`, `Notice`, `KioskCaption`, `EmbedHud`, plus `types` (`UiMode`, `ShareState`, `ShareActions`)
  - `FlightSchedule.nextTouchdown`
  - `TopBar` gains `onCopyLink`, `onStartTour`, `onScreenshot` and `onOpenHelp`; `Dashboard` gains `share` and `shareActions`. `main.ts` passes placeholders.
  - Test hooks: `mode`, `link`, `kiosk`, `advanceKiosk`, `help`
- **Failing tests:**
  - **Unit:** 70 failing tests in 9 files (link 19, kiosk 8, caption 6, help/version/licence 5, clipboard 3, publishing 10, M8 components and Dashboard modes 15, TopBar 3, flights 1).
  - **E2E:** 7 failing in `tests/e2e/m8.spec.ts`.
- **Tests that pass already**, because they pin facts that hold today:
  - the kiosk constants;
  - the Dashboard in normal mode;
  - a closed help dialog renders nothing;
  - "every handled key is listed once" (vacuous until shortcuts exist);
  - an unknown changelog version fails (the script is missing);
  - invalid link values fall back to defaults (links are ignored today).
- **Existing suites:** the other 550 unit tests pass, and typecheck and lint are clean.
- **Test-only changes to existing files:** `TopBar.test.tsx` passes the four new handlers in its setup.

### 21.9 Implementation notes (Stage 4, 2026-10-13)
| Area | As designed | As built | Why |
|---|---|---|---|
| Dialogs (J10) | `<dialog>` element | `div role="dialog" aria-modal="true"` with a shared hook (`ui/m8/dialog.ts`): focus moves in, Tab wraps, Esc closes (and stops there), and focus returns on close | Works the same in jsdom and every target browser, and one implementation serves both dialogs |
| Kiosk caption | Area, clock, demand, fact | The clock and the paused chip are `aria-hidden`, so the polite live region isn't re-announced every tick. On the overview the demand shows once, because the fact is the demand readout itself. | Accessibility and a cleaner caption |
| Copy link (J4) | Current state | `labels` is carried only when off and `theme` only when light (the defaults most viewers have). The link base is `location.href` without query or hash. | Short links; `location.origin` is "null" on `file://` |
| Mode precedence | (not specified) | If a link has both `kiosk=1` and `embed=1`, kiosk wins | Kiosk is the more specific presentation |
| Rig (J6) | MapControls auto-rotate | `CameraRig.setAutoRotate(degPerSec)`. `controls.update(dt)` now receives the frame time, so the orbit runs in real seconds (three r186: speed 1 = 6°/s). | The orbit speed is independent of frame rate |
| Airport fact | `nextTouchdown(t)` | Touchdown times are recorded in the built schedule (only arrivals that land, not diverted extras), and `AirportView.nextLandingSec()` exposes them | Exact, with no sampling |
| Brand | Caption text | `brand.siteName = 'Pacific Gateway'` | All brand strings stay in one config (N-7) |
| Tooling | — | `npm run screenshots` (`scripts/screenshots.mjs`, Playwright against the test build); `scripts/*.mjs` linted without type information | Reproducible README images |
| E2E robustness | — | M5's draw-call test now waits for a tier-2 frame (polls `patrolPose() === null`) instead of a fixed 800 ms, before checking ≤ 150 draw calls | It failed once in a full run when a software-WebGL frame took longer than 800 ms; the check is now stricter, not looser |

### 21.10 Verified results (2026-10-13)
- **Unit and integration:** 620 tests in 79 files, plus typecheck and lint, all green. This includes the 70 M8 tests from Stage 3, which all pass.
- **E2E:** 48 of 48, including the 8 M8 tests:
  - a deep link applies the view and leaves saved preferences untouched;
  - invalid values fall back without errors;
  - Copy link round-trips;
  - embed shows the HUD only, within the draw-call budget;
  - kiosk tours, pauses on input and exits with Esc;
  - Start tour enters kiosk mode;
  - `P` downloads a PNG of the canvas size;
  - help appears on hover, opens with `?` and closes with Esc.
- **Soak:** 28 of 28 (unchanged simulation).
- **Production bundle:** 228.7 KB gzipped (budget 600 KB; +6.4 KB over M7, within the +15 KB M8 budget), with no test hooks.
- **Workflows:** shape and order are pinned by unit tests. They run for real only after the user pushes: Pages needs "Settings → Pages → Source: GitHub Actions", and a Release needs a pushed `v0.8.0` tag.

