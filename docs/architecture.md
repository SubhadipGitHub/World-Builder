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

## 18. M5: branding, building indicators and hub security (design approved 2026-10-12)

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
