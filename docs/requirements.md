# World Builder — Requirements

> Status: **APPROVED 2026-10-12** (Stage 1 complete). Changes from here on need a new approval.
> Source: `docs/World_Prompt_Pack.pdf` (blank template, p.21) plus the decisions below.
> Defaults that filled gaps in the brief (capacities, rates, fleet mix, time scale, ID formats, heatwave modifiers) were approved with this doc. All of them are configurable.

## 1. Decisions so far

| # | Decision | Choice |
|---|----------|--------|
| D1 | Which world | **Custom world: airport car-rental fleet hub** (§3). |
| D2 | Stack | **TypeScript (strict) + Vite + Three.js**, bundled by `vite-plugin-singlefile` into **one self-contained `index.html`**. |
| D3 | Testing | **Vitest** for simulation, routing, give-way and data logic. **Playwright** smoke tests for the built HTML. |
| D4 | Release plan | **Phased.** M1 = blocks 1–3 (World, Life, Interaction). M2 = blocks 4–5 (Dashboard, Extras). |
| D5 | Branding | **Fictional brand** "GoldLane Rentals". No real rental, car-maker or airport names, tier names or trade dress. All brand strings live in one config file, so a licensed rebrand later is a config swap. |
| D6 | Theme | **Dark first** (graphite), with a **light toggle**. |
| D7 | Night | Weather mode is **Overcast** only. Night visuals come from the day/night cycle, so any weather can happen at night. |
| D8 | Utilisation KPI | **On rent ÷ total fleet**, with a sub-line showing Ready count · In-turnaround count. |
| D9 | M3 asset style (2026-10-12) | **Procedural Pixar-style**: every asset is still built in code (W-1 unchanged, no model or texture files), redesigned with rounded, bevelled, chunky, characterful forms. |
| D10 | M3 lighting (2026-10-12) | **Roadside street lights with light pools, plus a soft bloom glow at night** on the top quality tier; bloom turns off automatically on lower tiers. |
| D11 | M3 scope (2026-10-12) | **Vehicles, buildings, landscape and people.** |
| D12 | M3 budgets (2026-10-12) | **Relaxed for visuals** (§8.3). Phone performance is revisited after real-device testing. |
| D13 | M4 focus (2026-10-12) | **Ops what-if scenarios**: demand surge, unit outages, crew levels and named presets (§9). |
| D14 | M4 impact readout (2026-10-12) | **Shadow baseline**: a second, invisible simulation with the same seed runs without the scenario, and the KPI cards show live deltas against it. |
| D15 | M4 controls (2026-10-12) | A **What-if** button in the top bar opens a scenarios drawer. Outages can also be toggled from a unit's detail panel. |
| D16 | M4 simulation speed (2026-10-12) | **Pause plus speed steps** in the top bar (exact semantics in §9.5). |
| D17 | M5/M6 delivery (2026-10-12) | **Two milestones.** M5: branding, building indicators, and security and ground details around the hub (§10). M6: airport context (§11). |
| D18 | M5 scope (2026-10-12) | **All of it.** Building signage, the entrance pylon and flags, wayfinding, fleet livery, live building indicators (names plus status), the perimeter and checkpoint, CCTV and light masts, the patrol car, and ground details. |
| D19 | M6 layout (2026-10-12) | **Airside to the north** of the hub, landside to the west and south. The map grows about 2×, and an "Airport" area is added. |
| D20 | M6 flights (2026-10-12) | **Visual only**, on a deterministic schedule; the simulation is unchanged. |
| D21 | M5/M6 performance (2026-10-12) | **Detail scales by quality tier.** The ≤ 300 / ≤ 150 draw-call budgets stay. |
| D22–D25 | M6 airport (2026-10-12) | Mid-size airport, a movement about every 40 s, name labels, three fictional airlines (§11.1). |
| D26–D39 | M7 ops realism (2026-10-13) | Faster gate cycle, an airport day demand curve, flights following the curve, Balanced targets, then the Stage 4 calibration decisions (§12.1). |
| D40–D47 | M8 ship & share (2026-10-13) | GitHub Pages, Releases and an embed mode; full deep links; kiosk tour; screenshots; README, help overlay and changelog (§13.1). |

> Note on D2: the pack loads Three.js "from a CDN". We bundle it inline instead. The result is still one HTML file and it works offline.

## 2. Product summary

A browser-based, live 3D operations dashboard that feels like a strategy game. It shows a low-poly isometric **airport car-rental return, maintenance and pick-up facility** called **"GoldLane Hub: Pacific Gateway Fleet Ops"**, at the fictional Pacific Gateway International Airport. It is built entirely in code with no external models. Returned cars flow through inspection, wash, charging or fuelling, and staging, then leave with new customers. Clicking any car, bay or gate shows live stats, and frosted-glass panels show turnaround, utilisation and EV charge KPIs.

The layout is stylised and fictional. It is inspired by a typical US airport rental facility but models no real site.

## 3. Template slots

| Slot | Value |
|------|-------|
| WHAT IT RUNS | Airport car rental fleet lifecycle and operations hub |
| NAME | GoldLane Hub: Pacific Gateway Fleet Ops (brand: "GoldLane Rentals") |
| PLACE | Airport car rental return, maintenance and pick-up facility |
| Buildings and zones (7) | 1. Main customer terminal and GoldLane Express counter · 2. Vehicle return canopy and inspection lanes · 3. Express automated wash bay · 4. Maintenance and service bays (tyres, oil, detailing) · 5. EV fast-charging hub and fuel station · 6. Ready-for-Rent staging lot (Sedan, SUV, EV) · 7. Customer exit and automated barrier gates |
| Vehicles and mobile units (5) | 8. Gold shuttle bus · 9. Compact EV crossover (EV fleet) · 10. Full-size SUV · 11. Mid-size sedan · 12. Tow truck and service van |
| Accent HEX / background | Amber gold **#F2B33D** / graphite **#1E1E24** (dark, default) and **#F4F5F8** (light toggle) |
| Main loop | Rental lifecycle: return → inspect → wash → charge or fuel (or maintenance) → stage → dispatch (§4, L-1) |
| Other moving things | Shuttle buses looping between the terminal and the airport (off-map) · technicians on golf carts · customers walking to their cars |
| Clickable OBJECTS | Vehicles (sedans, SUVs, EVs, shuttles), wash bays, EV chargers, inspection kiosks, service bays, exit gates |
| AREAS (5) | 1. Overview / all hub · 2. Return and inspection zone · 3. Wash and maintenance facility · 4. EV charging and fuel hub · 5. Ready lot and customer exit gate |
| KPI 1 / 2 / 3 | **Turnaround time** (average minutes from return to Ready Lot) · **Fleet utilisation rate** (on rent ÷ total fleet, with a sub-line "Ready n · In turnaround n") · **EV fleet state of charge** (average SoC % across ready EVs) |
| PROCESS tracker (6) | Returned → Inspected → Washed & detailed → Refuelled / charged → Staged → Dispatched |
| Table tabs (3) | **Active fleet tracker** (vehicle ID, make/model, status, battery/fuel, location) · **Turnaround & service queue** (bay #, vehicle ID, service type, est. time remaining) · **Customer checkout log** (rental agreement #, vehicle ID, tier [Gold / Platinum], exit gate) |
| Data UNITS | Battery SoC %, fuel level %, turnaround (min), odometer (mi), wash cycle (s), charging rate (kW) |
| Weather modes (4) | Clear / sunny · Heavy rain / slick · Overcast · Heatwave / high demand. Night comes from the day/night cycle and combines with any of these. |

## 4. Functional requirements

### M1: Block 1, WORLD
- **W-1** The scene is a low-poly isometric diorama built only from Three.js primitives and procedural geometry. No external model or texture files.
- **W-2** It contains all 7 buildings and zones and all 5 vehicle and mobile-unit types from §3. Car models are stylised and recognisable by silhouette (compact crossover EV, large boxy SUV, mid-size sedan), with no manufacturer logos.
- **W-3** Visual style: clean, toy-like clay look, soft shadows, amber-gold accent. Dark graphite scene by default, with a light variant.
- **W-4** Repeated objects (parked cars, parking-bay markings, light poles, palms, pedestrians) use `InstancedMesh`.
- **W-5 Facility capacities.** These drive queueing and are configurable:

  | Resource | Count |
  |---|---|
  | Return / inspection lanes (each with a kiosk) | 4 |
  | Automated wash bays | 2 |
  | Maintenance / service bays | 3 |
  | EV fast chargers | 8 |
  | Fuel pumps | 4 |
  | Ready-lot slots (rows: Sedan, SUV, EV) | 48 |
  | Exit gates | 2 |

### M1: Block 2, LIFE
- **L-1 Main loop.** Every vehicle runs this state machine forever:
  1. **Returned.** A customer drives in from the entry road to a free return lane.
  2. **Inspected.** The kiosk scan records mileage, fuel or SoC, and tyre state. About 10% of inspections raise a maintenance alert (tyres, oil or damage).
  3. **Washed & detailed.** The car queues for a wash bay. Cycle time is 90–180 s of simulated time.
  4. **Refuelled / charged.** EVs go to a charger and charge until they reach at least **80% SoC**. Petrol cars go to a pump and fill to 100%. Cars with a maintenance alert visit a service bay first. About 2% of alerts are severe: the tow truck tows that car to a service bay.
  5. **Staged.** The car is driven to a free Ready-lot slot in its class row.
  6. **Dispatched.** A customer walks from the terminal to the car and drives it out through an exit gate.
- **L-2 Fleet pool.** Total fleet is **120 vehicles**, with a mix of **35% EV, 25% SUV, 40% sedan**. Dispatched cars join an off-map "on rent" pool, and each one returns after a random rental duration, so the loop never runs dry. Up to about 60 cars are on the map at once. The utilisation KPI is the size of this on-rent pool divided by 120.
- **L-3** Secondary actors: 2 shuttle buses loop between the terminal kerb and an off-map airport exit. 3 technicians on golf carts drive to service bays and flagged cars. Up to about 30 pedestrians walk between the terminal and the Ready lot.
- **L-4 No overlap, ever.** Vehicles, golf carts and shuttles move on a lane graph. They give way at junctions and merges, queue behind each other with a safe gap, and wait for a free bay or slot before entering. Vehicles stop for pedestrians at marked crossings. This is the hardest requirement and has the most tests.
- **L-5** The simulation is deterministic for a given seed and fixed timestep, so tests can replay it. Rendering interpolates between steps.
- **L-6 Time scale.** A simulated clock runs at **15× real time** (20× until M7; changed by D30) and is adjustable. Process durations (inspection, wash, charging, rental) use realistic simulated minutes, so a full turnaround takes about 2–4 real minutes. On-screen driving speed is clamped so it looks natural rather than sped up.
- **L-7** Every agent has live state (status, location, speed, current task, ETA, fuel or SoC, odometer) that the UI can read.

### M1: Block 3, INTERACTION
- **I-1** Drag to pan, right-drag to rotate, scroll or pinch to zoom, all within camera bounds.
- **I-2** Clicking any clickable object from §3 makes the camera glide (eased) to it, and keep following it while it moves.
- **I-3** The selected object gets a pulsing gold ring and a floating label (e.g. a vehicle ID, or "Wash Bay 2").
- **I-4** A minimal detail panel shows the selected object's live stats. M2 restyles it as glass.
  - **Vehicle:** ID, model, class, status/stage, fuel or SoC, odometer, time in turnaround.
  - **Bay, charger or kiosk:** occupant, cycle progress, queue length, throughput per hour.
  - **Gate:** last exit and exits per hour.
- **I-5** An area switcher flies the camera between the 5 areas in §3.
- **I-6** Esc or clicking empty ground clears the selection.

### M2: Block 4, DASHBOARD
- **D-1** Frosted-glass panels sit over the 3D view.
- **D-2** Top bar: logo, search (by vehicle ID, plate, agreement # or bay; selecting a result flies to it), area switcher, weather menu, live clock (hub local time, America/Los_Angeles), alerts, day/night toggle, user chip.
- **D-3** 3 KPI cards from §3, computed from the live simulation rather than hard-coded, each with a small trend arrow.
- **D-4** Right detail panel (the restyled I-4).
- **D-5** Bottom-left process tracker with 6 steps and timestamps for the selected vehicle. With no vehicle selected, it shows how many vehicles are at each step.
- **D-6** Tabbed live table with the 3 tabs from §3. Clicking a row selects the object.
- **D-7** Data looks realistic and comes from a seeded generator, with no lorem ipsum. Formats:
  - vehicle IDs like `GL-PGW-04817`
  - plates like `8ABC123` (randomly generated, not real)
  - rental agreements like `RA-26-0012345`
  - customer tiers Gold and Platinum
  - odometer readings from 3,000 to 45,000 mi
  - charging rates from 50 to 250 kW
- **D-8 Alerts** come from the simulation: maintenance flags, tow dispatch, queue overflow (a wash or charger queue over N), and EV staged below the SoC threshold.

### M2: Block 5, EXTRAS
- **X-1** A weather menu with 4 modes, each changing visuals and simulation rules:

  | Mode | Visuals | Simulation |
  |---|---|---|
  | Clear / sunny | Default lighting | Baseline speeds and demand |
  | Heavy rain / slick | Wet asphalt with reflections, rain particles, animated wipers, spray behind moving cars | Vehicle speeds −20% |
  | Overcast | Flat grey sky, soft shadows, lower contrast, light haze | Baseline |
  | Heatwave / high demand | Warm amber grade, heat shimmer | Return and dispatch rates up (+40%), EV charging slower (−15%, thermal derate) |

  Heat shimmer is a full-screen post effect. It is disabled on mobile (see N-2).
- **X-2** Animated day/night cycle, plus a manual toggle. At night: glowing GoldLane terminal signage and windows, headlight and taillight beams, and floodlights over the Ready lot. Night works with every weather mode (e.g. rain at night shows reflections of the lights on wet asphalt).
- **X-3** Works on mobile: touch gestures, and the panels collapse into a bottom sheet.
- **X-4** A theme toggle in the user menu switches between dark (default) and light UI panels and scene palette. The choice is remembered per browser, and a failure to save it is harmless.

## 5. Non-functional requirements
- **N-1 Single file.** `npm run build` produces one `dist/index.html` that runs from `file://` with no network access.
- **N-2 Performance.** 60 fps on a mid-range laptop and at least 30 fps on a mid-range phone, with about 60 cars, 30 pedestrians and 5 service vehicles in the scene. Instancing and merged static geometry keep draw calls low (target: under 150). Costly effects (heat shimmer, reflections) scale down on low-end devices.
- **N-3 Strictness.** `tsconfig` has `strict: true` with no `any`. ESLint and typecheck must be clean.
- **N-4 Testability.** Simulation code has no dependency on Three.js and lives in its own modules.
- **N-5 Accessibility.** UI panels can be used with the keyboard, contrast is WCAG AA, and `prefers-reduced-motion` turns off camera easing and shimmer. Amber gold passes AA as text on graphite. **On the light background it fails AA, so in light mode gold is only used for fills and icons, with dark text on gold.** A contrast check runs in tests.
- **N-6 Data safety.** All people, agreement numbers, plates and IDs are fictional. There is no telemetry and no external calls.
- **N-7 No real brands.** The app shows no real company, car-maker, airport or loyalty-tier names and no logos. Brand strings and colours come from a single `brand` config.
- **N-8 Browser support.** The last 2 versions of Chrome, Edge, Safari (macOS and iOS) and Firefox, with WebGL 2 required. Reference devices are a 2022-era laptop with integrated graphics and a mid-range 2023 Android phone or an iPhone 12 or newer. If WebGL 2 is missing, a static message explains what's needed.

## 6. Open questions
All resolved:
- branding (D5), theme (D6), night versus weather (D7), utilisation definition (D8)
- Ready-lot rows are Sedan / SUV / EV, because the fleet has no luxury model
- target devices and browsers (N-8, the default; nothing specific was requested)
- all defaults approved on 2026-10-12

## 7. User stories
- As a **viewer**, I open one HTML file and immediately see cars rolling into the return canopy, through the wash and out of the gates, so the hub feels alive within 3 seconds.
- As a **viewer**, I click a car and the camera follows it through each stage while its fuel, SoC and status update live, so I understand the turnaround.
- As a **viewer**, I toggle to night while it's raining and see headlights reflected on the wet lot.
- As a **viewer**, I click Wash Bay 2 or an EV charger and see its occupant, its cycle progress and its queue.
- As a **viewer**, I switch to "EV Charging & Fuel Hub" and the camera flies there smoothly.
- As an **ops manager** (M2), I glance at turnaround time, utilisation and EV SoC to see whether the hub is keeping up with demand.
- As an **ops manager** (M2), I see an alert when a car is flagged for maintenance, click it, and follow the tow truck.
- As a **viewer** (M2), I switch to Heavy rain or Heatwave and see the world and its KPIs react: traffic slows in the rain, and queues build in the heatwave.

## 8. M3: Premium visuals (APPROVED 2026-10-12)

Goal: a premium, Pixar-style living diorama with warm roadside lighting at night, without changing what the hub *does*. The simulation, dashboard and interaction requirements above are unchanged. Everything stays procedural and in one offline file (W-1, N-1).

### 8.1 Visual requirements
- **V-1 Style kit.** A shared library of shapes (rounded and bevelled boxes, capsules, lathe forms, rounded windows) and a warmer, more saturated palette. Proportions are chunky and toy-like, with soft, rounded edges throughout. GoldLane amber gold stays the single accent (W-3).
- **V-2 Vehicles.** Each class has a distinct, recognisable silhouette with no real-brand cues (N-7):
  - **Fleet cars:** a rounded body, a glass cabin with window frames, 4 wheels with hubcaps, headlights, and red taillights.
    - **Sedan:** low, three-box shape.
    - **SUV:** tall, boxy, with roof rails.
    - **EV crossover:** smooth front with a light bar.
  - **Shuttle bus:** rounded, with a row of windows, a gold livery stripe and a roof unit.
  - **Tow truck:** cab, flatbed and an amber roof beacon (flashing while towing).
  - **Technician carts:** canopy and seats.
  - **Service van:** with a GoldLane stripe.
  - At night, headlights and taillights glow. Cars stay instanced, one draw call per part per class (architecture §6).
- **V-3 Buildings.** Bays must stay visible from above, through cutaway, glass or open-frame roofs.
  - **Terminal:** glass curtain wall with mullions, an entrance canopy, rooftop units, a GoldLane sign panel with the logo mark (no fonts needed), and planters.
  - **Return canopy:** skylit roof, with a kiosk pod and screen on each lane.
  - **Wash tunnel:** entry and exit arches, plus brushes that spin while a car is washing.
  - **Service garage:** 3 roll-up doors that open while a bay is occupied.
  - **EV hub and fuel station:** solar-panel canopies; charger pillars with cables and a status light (green while charging); pumps with displays.
  - **Exit gates:** a booth with windows, and barrier arms that lift when a car passes.
  - **Tow depot:** a small garage.
- **V-4 Landscape.**
  - Grass, with subtle colour variation, around paved areas.
  - Kerbs and sidewalks along roads; lane markings (dashed centre lines, direction arrows).
  - Varied trees (round, conifer, palm) in groups, plus bushes and planters.
  - A gradient sky dome with a few soft clouds, and a distant horizon. It follows the day/night cycle and weather.
- **V-5 People.** Pixar-style characters: head, body, arms and legs, with a simple walk bob and varied clothing colours. Staff wear gold hi-vis vests.
- **V-6 Roadside lighting.**
  - Lamp posts along every vehicle road and the walkway, about every 35 m (revised from 25 m after the visual review, 2026-10-12: fewer, softer lamps). Main roads have them on both sides, staggered; minor roads on one side.
  - Each lamp lights a warm pool with a radial falloff on the ground; the Ready lot has 8 floodlights. Under glass canopies the pools stay visible, so canopies read as lit at night (kept after review).
  - Lamps switch on at dusk, staggered over a few seconds, rather than all at once, and switch off at dawn (X-2).
- **V-7 Bloom.** At night, a soft glow around lamps, headlights, signage and windows. On the top quality tier only; it turns off on lower tiers and on touch devices by default.
- **V-8 Lighting finish.**
  - A warmer key light and a soft fill.
  - Contact shadows: soft dark "blob" shadows under vehicles, people, trees and props, so things sit on the ground.
  - Softer shadow edges.
- **V-9 Live details,** driven by simulation state that already exists (no simulation changes):
  - wash brushes spin while a bay is in use
  - garage doors open for occupied service bays
  - charger lights show charging or idle
  - gate barriers lift for the car at the gate
  - the tow beacon flashes while towing

### 8.2 Unchanged
- W-1: still no external model or texture files.
- N-1: one offline file.
- N-5: accessibility. Reduced motion stops brush and beacon animation, and stops the lamp stagger.
- N-7: no real brands.
- All interaction, dashboard and simulation requirements and tests stay as they are.

### 8.3 Budgets (D12, approved 2026-10-12)
| Budget | Was | Now |
|---|---|---|
| Single file, gzipped (N-1, A10) | ≤ 400 KB | **≤ 600 KB** |
| Draw calls, top tier (N-2) | < 150 | **≤ 300** |
| Draw calls, tier 2 (lowest) | < 150 | **≤ 150**, kept as the floor for weak devices |
| Desktop frame rate (N-2) | 60 fps | 60 fps target, unchanged |
| Phone frame rate (N-2) | ≥ 30 fps | **Deferred**: revisited after real-device testing; quality tiers still apply |

### 8.4 Resolved
- The hub still opens at **08:00**, as now. Street lights first appear at dusk (about 30 real minutes in), or straight away with the Night button.
- The budget numbers in §8.3 are approved.

## 9. M4: Ops what-if scenarios (APPROVED 2026-10-12)

Goal: turn the hub from a view into a decision tool. An ops manager injects a disruption or a staffing change, watches the hub react, and reads the impact as live deltas against an undisturbed baseline. The world, dashboard and visuals from M1–M3 are unchanged apart from the additions below. Everything stays deterministic and in one offline file (N-1).

### 9.1 Scenario levers
- **S-1 Demand surge ("flight bank lands").**
  - The 15 rentals due back soonest return now (at most as many as are on rent).
  - Customer pickups run at ×2 for the next 60 simulated minutes.
  - Triggering it again while a surge is active restarts the 60-minute window and pulls forward another batch.
  - Admission still respects the existing back-pressure: cars that can't enter yet wait off-map rather than spawning on top of each other (L-4).
- **S-2 Unit outages.**
  - Any return lane, wash bay, service bay, EV charger, fuel pump or exit gate can be taken **offline** or brought back **online**.
  - An occupied unit finishes its current job, then accepts no one new. Waiting cars are served by the remaining units, in the same FIFO order.
  - **The last online unit of a station cannot be taken offline.** The control is disabled with the reason "At least one wash bay must stay open". This avoids an unrecoverable hub-wide gridlock.
  - An offline unit shows hazard cones and a red status light in the world, and an "Offline" badge in its detail panel.
  - **Departure back-pressure** (added 2026-10-12, found by the gate-closure soak): when the gates can't keep up, customers wait at the counter rather than walking to their car. The gate queue therefore never spills across the lot walkway; the cost shows as fewer checkouts and lower utilisation.
- **S-3 Crew levels.**
  - Three stations can be staffed independently: **inspection**, **wash** and **service**.
  - The levels are **Short-staffed**, **Normal** and **Extra crew**. They multiply the station's job durations by ×1.5, ×1 and ×0.7.
  - A change applies to jobs that start after it; a job already running keeps its duration.
- **S-4 Named presets.** Each preset applies several levers at once:

  | Preset | Levers |
  |---|---|
  | Friday evening rush | Surge (S-1), wash short-staffed |
  | Wash tunnel down | Wash bay 1 offline, wash short-staffed |
  | Heatwave + charger fault | Weather heatwave, 3 of 8 chargers offline |
  | Gate closure | Exit gate 2 offline, inspection short-staffed |

- **S-5 Reset to normal.**
  - Brings every unit back online, sets every crew to Normal and ends any surge.
  - Restores the weather that was active before a preset changed it.
  - Manual weather changes are not part of a scenario: the menu changes both simulations (§9.3).

### 9.2 Controls (D15)
- **S-6 What-if drawer.** A top-bar button opens a glass drawer (D-1 style) containing:
  - the surge button, with a countdown while active
  - the crew level per station (a segmented control)
  - outages grouped by station: chips you tap to toggle each unit
  - the presets
  - Reset to normal
- **S-7 Active-scenario chips.** While any lever is not at its normal setting, the top bar shows compact chips, e.g. "Surge 42 min", "2 units offline" and "Wash: short". Tapping a chip opens the drawer. With no scenario active, nothing is shown.
- **S-8 Unit detail panel.** A unit's panel (I-4 / D-4) gains a "Take offline" / "Bring online" toggle, with the same rules as S-2.
- **S-9 Alerts and log.** Starting or ending each lever raises an info alert in the existing feed (D-8), e.g. "Wash bay 1 taken offline" or "Surge ended". Clicking it selects the unit.
- **S-10 Phone.** On a phone the drawer opens as a bottom sheet (X-3).

### 9.3 Impact against a baseline (D14)
- **S-11 Shadow baseline.**
  - A second simulation with the same seed runs in lockstep from load, invisibly.
  - It receives the same weather and speed commands as the visible one, but no scenario levers.
- **S-12 KPI deltas.** While a scenario is active, and for 60 simulated minutes after Reset, each KPI card (D-3) shows its delta against the baseline, e.g. "Turnaround 41 min, +12 vs normal". Colour shows good or bad: for turnaround, up is bad; for utilisation and EV state of charge, up is good.
- **S-13 Honest noise.**
  - The two simulations diverge randomly once their paths differ. Deltas therefore use the KPIs' existing smoothing (turnaround is already a 2-hour rolling mean).
  - A delta smaller than the noise band (turnaround ±2 min, utilisation ±1 pt, SoC ±1 pt) reads "≈ normal".
- **S-14 Queue impact.** The drawer shows live queue lengths for return, wash, service, charger and gate: scenario against baseline, side by side.

### 9.4 Determinism and testability
- **S-15** Scenario levers are simulation commands. The same seed plus the same command log (each command tagged with its step index) produces identical snapshots and metrics.
- **S-16** The baseline simulation, given the same commands minus the scenario levers, is identical to a simulation that never had a scenario.
- **S-17** Test hooks: `scenario()` (the active levers), `baselineMetrics()` and `applyScenario(command)`, all in the test build only (as in M1–M3).

### 9.5 Simulation speed (D16)
- **S-18** Top-bar control: **Pause**, then three speeds. Pause freezes the simulation, but the camera, selection and UI keep working.
- **S-19 Recommended semantics: fast-forward the whole world.**
  - The speeds are **20× (normal)**, **40×** and **60×** hub clock. Each runs 1, 2 or 3 simulation steps per tick, so cars visibly drive faster too.
  - KPIs stay comparable across speeds, because the simulation is the same step for step.
  - The alternative, changing only the process clock (`setTimeScale`), would leave driving at natural speed (L-6). At 60× a 30-second drive would count as 30 simulated minutes, inflating turnaround depending on the speed chosen. A true "1× real time" would make the hub look frozen (a wash would take 3 real minutes), so it is replaced by Pause. **See open question Q1.**
- **S-20** Speed applies to both simulations equally, so baseline deltas stay valid.

### 9.6 Budgets and non-functional
- Both simulations together at 60× (6 steps per tick) take ≤ 4 ms per frame on desktop. Measured today: 0.08 ms per step, about 0.5 ms.
- Bundle ≤ 600 KB gzipped (§8.3). Draw-call budgets are unchanged: hazard cones are one instanced mesh.
- Accessibility (N-5): every control is keyboard-reachable and labelled, and chips have text, not just colour.
- Unchanged: N-1 one offline file, N-7 no real brands, and all M1–M3 requirements and tests.

### 9.7 User stories
- As an **ops manager**, I tap "Friday evening rush" and watch return lanes and the wash queue swell. The turnaround card reads "+14 vs normal", so I can see what a rush costs.
- As an **ops manager**, I take Wash bay 1 offline from its panel. Cars queue for bay 2, cones appear on bay 1, and an alert is logged.
- As an **ops manager**, I set the wash to Extra crew during the outage and see the turnaround delta shrink. That tells me whether extra staff offsets the outage.
- As a **viewer**, I fast-forward to 60× to see a scenario play out, then pause to inspect a queue.

### 9.8 Resolved (approved 2026-10-12: all proposed defaults accepted)
- **Q1 Speed control.** **Pause / 20× / 40× / 60× by fast-forwarding the whole world (S-19)**, instead of the "1×" originally picked (see S-19 for why).
- **Q2 Surge size.** **15 early returns, plus pickups ×2 for 60 simulated minutes.**
- **Q3 Crew multipliers.** **×1.5 / ×1 / ×0.7.**
- **Q4 Last-unit rule.** **Keep at least one unit per station online** (S-2), instead of allowing a full closure, which would gridlock the hub.
- **Q5 Presets.** **The 4 listed in S-4.**

## 10. M5: Branding, building indicators and hub security (APPROVED 2026-10-12)

Goal: the hub reads as a real, branded rental car center at an airport. Signs name every facility, labels show live status above each building, and a secured perimeter, wayfinding and street furniture frame it. Everything is still procedural (W-1; text is drawn at runtime, with no font or image files), fictional (N-7), and in one offline file (N-1). The simulation is unchanged except for one read-only snapshot field (I-3).

### 10.1 Branding
- **B-1 Building signage.** Each facility gets a sign in GoldLane style: a gold or white panel with dark or white text and the GoldLane mark. Signs glow at night (picked up by bloom on the top tier) and can be read from both sides where the building is open.

  | Facility | Sign text |
  |---|---|
  | Terminal (roof, two faces) | GoldLane Rentals |
  | Terminal (entrance) | GoldLane Express |
  | Return canopy | Rental Car Return |
  | Wash | Express Wash |
  | Service garage | Service Center |
  | EV hub | EV Fast Charge |
  | Fuel station | Fuel |
  | Exit gates | Exit · Thank you for choosing GoldLane |
  | Tow depot | Tow Depot |

  Text is drawn onto a canvas at runtime using the system sans-serif font, packed into one texture atlas.
- **B-2 Entrance pylon and flags.**
  - A 12 m GoldLane totem pylon stands at the hub entrance, lit at night.
  - 6 gold flags on poles along the entry frontage wave gently. They stop with reduced motion and on tier 2.
  - GoldLane banners hang on the street-facing perimeter fence (SEC-1) about every 40 m.
- **B-3 Wayfinding.**
  - An overhead sign gantry spans the entry road: "Rental Car Return →".
  - The exit road has a gantry: "Airport Terminals ↑ · Exit to Airport Blvd".
  - Roadside direction signs at the main junctions inside the hub: Wash, Service, EV Charging & Fuel, Ready Lot, Exit.
  - Painted ground text on the entry lanes ("RETURN") and "SLOW" before pedestrian crossings.
  - Placement follows the lamp rules (P4): never inside a road corridor, a building or another sign's spacing. Gantries clear the road by at least 5.5 m.
- **B-4 Fleet livery.** Fleet cars get a gold GoldLane stripe and a small door mark on both sides, in every theme. It is part of the car's untinted trim, so it adds no draw calls. Roof numbers are not drawn (see Q1); the selection label already shows the car's ID.

### 10.2 Building indicators
- **I-1 Live facility labels.** A floating glass label above each facility (return canopy, wash, service, EV hub, fuel, Ready lot, exit gates, terminal), positioned every frame like the selection label (A7). Contents, refreshed at 10 Hz:
  - the name, plus a status dot with text (status is never shown by colour alone): **OK** (green), **Busy** (amber) or **Offline** (red)
  - a detail line:

    | Facility | Detail line |
    |---|---|
    | Bays, lanes, chargers, pumps, gates | "2/3 busy · queue 4" |
    | Ready lot | "18/48 staged" |
    | Terminal | "Counter: 3 waiting" (I-3) |

- **I-2 Status rules (pure, tested).**
  - **Offline:** any unit of the facility is offline (the text says how many, e.g. "1 offline").
  - **Busy:** no free online unit, or a queue of 3 or more.
  - **OK:** otherwise.
- **I-3 Counter queue.** The snapshot gains `counterQueue`: customers waiting at the counter. It is read-only and changes no behaviour; since W11 it is meaningful, because back-pressure holds customers there.
- **I-4 Declutter and interaction.**
  - Zoomed out (camera distance over 350 m), a label shows only its name and status dot.
  - Labels behind the camera or off screen are hidden.
  - Where two labels overlap on screen, the lower-priority one hides (terminal and Ready lot have the lowest priority).
  - Clicking a label flies the camera to that facility (Q2).
  - Labels are buttons with an accessible name such as "Express Wash, Busy, 2 of 2 busy, queue 4".
  - A "Building labels" switch in the user menu turns them off; the choice is remembered like the theme (X-4).

### 10.3 Security and environment around the hub
- **SEC-1 Perimeter.**
  - A chain-link fence with a barbed-wire top runs around the hub, about 12 m outside its roads. It has openings where the entry, exit and shuttle roads cross it.
  - Concrete posts every 3 m. One instanced mesh plus a fence-fabric strip (draw-call budget, §10.5).
- **SEC-2 Entrance checkpoint.**
  - A guard booth with a staff figure stands beside the entry road, with a boom gate across the lane.
  - The boom lifts as a vehicle approaches and lowers after it passes. This is render-only: vehicles never stop for it, and the simulation is unchanged.
  - A smaller booth stands at the exit road.
- **SEC-3 Surveillance and lighting.**
  - CCTV poles at the entrance, the exit, the lot corners and the bays, with camera heads that pan slowly (static with reduced motion and on tier 2).
  - 4 tall light masts over the Ready lot (they join the night lighting as floods, V-6).
  - Emergency call boxes with a blue light along the walkway.
  - Bollards at pedestrian crossings and the terminal frontage.
- **SEC-4 Security patrol car.**
  - A white-and-gold "GoldLane Security" SUV with a light bar drives a perimeter service road just outside the fence, at about 8 m/s.
  - It is visual only, not a simulation agent, on its own road, so it can never meet hub traffic.
  - The light bar is dim amber by day and flashes at night. It is hidden on tier 2.
- **ENV-1 Ground details.**
  - Jersey barriers along the entry road edge, planters and benches at the terminal frontage, and a bus shelter with a shuttle-stop sign at each shuttle stop.
  - Trash bins, and ground signage (B-3).
  - All of it is instanced, and placed with the same clearance rules as lamps.

### 10.4 Quality tiers (D21)
| Tier | Shown |
|---|---|
| 0 | Everything |
| 1 | Everything, but flags wave at half rate and CCTV heads are static |
| 2 | Buildings, signs, indicators, fence, booths, gantries and light masts. No flag motion, patrol car, CCTV motion or ground clutter (benches, bins, planters, barriers). |

### 10.5 Budgets and non-functional
- **Draw calls:** M5 adds at most 30 at tier 0. The existing limits stay: ≤ 300 on tier 0 and ≤ 150 on tier 2, in rain at night (§8.3). Signs share one atlas texture and material.
- **Bundle:** ≤ 600 KB gzipped (currently 202 KB).
- **Labels:** at most 10 DOM elements; positions every frame, text at 10 Hz.
- **Accessibility (N-5):** labels are keyboard-focusable buttons with text status, and all motion stops with reduced motion.
- **Unchanged:** N-1, N-7, and every M1–M4 requirement and test. Picking, cars and people are never hidden behind new props: nothing is placed inside a road corridor or bay.

### 10.6 User stories
- As a **viewer**, I open the hub and immediately read "GoldLane Rentals" on the terminal, follow "Rental Car Return →" from the entry gantry, and see the guard booth lift its boom for each returning car.
- As an **ops manager**, I glance at the labels: "Express Wash · Busy · 2/2 busy · queue 5" in amber tells me where to look, and clicking it flies me there.
- As an **ops manager** running "Wash tunnel down", the wash label turns red: "Offline · 1 offline".
- As a **viewer** at night, the signs, pylon and light masts glow, and the security car's light bar flashes as it patrols the fence.

### 10.7 Resolved (approved 2026-10-12: all proposed defaults accepted)
- **Q1 Roof numbers on fleet cars.** **No** (they need a per-car texture atlas and a custom shader). The door stripe and mark carry the brand, and the ID shows on selection.
- **Q2 Clicking a label.** **Flies the camera to the facility** (like the area switcher), without selecting a unit.
- **Q3 Counter queue in the terminal label.** **Yes** (adds the read-only `counterQueue` to the snapshot).
- **Q4 Labels switch.** **In the user menu, on by default**, remembered per browser.
- **Q5 Sign texts.** **As in B-1.**

## 11. M6: Airport context (APPROVED 2026-10-12; implemented)

Goal: the rental hub sits inside a believable, living **Pacific Gateway International Airport** (fictional). There is a terminal with jet bridges, a control tower, a runway with jets landing and taking off, landside garages and a hotel, and an elevated boulevard with traffic. All of it is procedural (W-1), fictional (N-7) and in one offline file (N-1). The simulation is unchanged: flights and background traffic are visual only (D20).

### 11.1 Decisions
| # | Decision | Choice |
|---|---|---|
| D22 | Airport scale (2026-10-12) | **Mid-size:** one terminal with 8 gates (A1–A8) and jet bridges, one runway of about 1.2 km plus a parallel taxiway, and 6 parked jets |
| D23 | Flight cadence (2026-10-12) | **One movement about every 40 real seconds,** alternating landing and take-off, plus a jet taxiing between the runway and a gate |
| D24 | Airport labels (2026-10-12) | **Name-only labels** for airport buildings, sharing the hub labels' switch, declutter and fly-to |
| D25 | Airlines (2026-10-12) | **Pacific Gateway Air** (navy and gold), **Coastline** (teal and white) and **Sunline Cargo** (orange, freighter). All fictional. |

### 11.2 Layout (D19)
| Zone | Where (metres; hub fence x −249…195, z −134…207) |
|---|---|
| Airside fence | Along z ≈ 235 from the west to the east edge of the ground, with a guarded airside gate (booth and boom, reusing M5's) near the cargo area |
| Terminal and curb road | Terminal along x −150…150 at z ≈ 290 (300 × 40 m, 3 levels, about 18 m tall). Departures and arrivals curb road on its south side (z ≈ 262), joined to the boulevard |
| Gates and apron | 8 jet bridges on the north side at z ≈ 312; a concrete apron over z 315…400, x −210…220; gate stands at z ≈ 345 |
| Taxiway | Parallel at z ≈ 430, x −560…560, with links to the apron |
| Runway 09/27 | z ≈ 482, x −600…600, 45 m wide: threshold markings, a centre line, designators "09" and "27", touchdown zones |
| Control tower | x ≈ 260, z ≈ 330, about 60 m tall, with a glazed cab and a rotating beacon |
| Fire station | x ≈ 340, z ≈ 380 (airside, by the runway), with a red airport fire engine on its apron |
| Fuel farm | x ≈ 440, z ≈ 300: 4 white tanks behind a bund wall |
| Cargo | x ≈ −430, z ≈ 330: a warehouse with a Sunline Cargo freighter on its stand |
| Airport Blvd | Elevated (about 8 m) dual carriageway running north–south at x ≈ −420, from z −470 to the terminal curb. It passes over the hub's road extensions (M5) on an overpass, with palm-lined medians |
| Parking garage | x ≈ −330, z ≈ 60: 5 levels, 70 × 90 m, lit decks at night, a "P" sign |
| Airport hotel | x ≈ −340, z ≈ −260: a 40 m tower with lit windows and a rooftop "Gateway Hotel" sign |
| Cell-phone waiting lot | x ≈ −60, z ≈ −250: marked stalls, a shelter and a sign |

Nothing is placed inside the hub fence, on the patrol loop (M5), or within 6 m of a hub road extension, except the overpass, which spans the extensions with at least 5.5 m clearance.

### 11.3 Buildings and details
- **A-1 Terminal.**
  - A glass curtain wall, a gold "Pacific Gateway International" roof sign facing the hub, and a departures/arrivals canopy over the curb.
  - Gate numbers A1–A8 on the jet bridges.
  - Windows glow at night.
- **A-2 Jet bridges.** 8 telescoping bridges, each with a rotunda and a cab, docked to parked jets; the bridge for the taxiing jet's gate retracts and extends.
- **A-3 Control tower.** A tapered shaft and a glass cab with a gold band. The beacon alternates green and white and rotates (steady with reduced motion).
- **A-4 Landside buildings.**
  - Parking garage: open decks with parked-car silhouettes, and ramps.
  - Hotel: a tower and podium.
  - Cell-phone lot: stalls and a shelter.
  - Cargo warehouse: roller doors and a loading apron.
  - Fuel farm: tanks, pipes and a bund.
  - Fire station: 3 bays and a hose tower.
  - All in the Pixar kit style (V-1).
- **A-5 Ground markings and lights.**
  - Runway edge lights (white), threshold lights (green and red), taxiway edge lights (blue) and apron floodlight masts (the lamp `'flood'` kind, V-6).
  - All lit at night, switching on with the street lights.
- **A-6 Wayfinding (B-3 style).**
  - Boulevard gantries: "Terminal A · Departures / Arrivals", "Rental Car Return → GoldLane" (at the hub exit ramp) and "Parking · Hotel · Cell Phone Lot".
  - Airside signs: "Fire Station" and "Cargo".

### 11.4 Life
- **F-1 Flights (D23).** A deterministic schedule (pure, tested):
  - **Arrival:** final approach from the east on a 3° glide path, flare, touchdown, roll-out, exit onto the taxiway, taxi to a free gate. The jet bridge extends, and the jet stays parked.
  - **Departure:** the bridge retracts, pushback, taxi to the runway's east end, take-off roll west, rotate and climb out to the west until out of view.
  - Movements alternate about every 40 s. At most 2 jets move at once, and they never overlap: runway occupancy is exclusive, and taxi paths are separated by time.
  - Gate use is consistent: an arrival takes a free gate, a departure frees one, and 6 of 8 gates are occupied on average.
- **F-2 "Flight bank lands" (M4).** Starting a surge also schedules an extra arrival within 5 s.
- **F-3 Aircraft.**
  - Procedural jets about 38 m long: fuselage, swept wings with engines, tail fin in airline colours, cockpit windows and a passenger window band (none on the freighter).
  - Navigation lights (red left, green right, white tail), flashing beacons and landing lights at night.
  - Gear is down when on the ground or below 60 m.
- **F-4 Background traffic.**
  - Visual-only cars, taxis and airport buses loop the boulevard and the terminal curb, with headlights and taillights at night. They are not simulation agents and are separated by fixed spacing on their own paths.
  - Buses stop briefly at the curb.
- **F-5 Airport vehicles.** A pushback tug for each departure, a fuel truck between the fuel farm and the apron, and a follow-me car. All visual only, on fixed paths.

### 11.5 Labels and camera
- **L-1 Airport labels (D24).**
  - Name-only labels on the same overlay and switch as the hub labels (I-1, I-4): "Terminal A · Gates A1–A8", "Control Tower", "Runway 09/27", "Parking Garage", "Gateway Hotel", "Cell Phone Lot", "Sunline Cargo", "Fire Station" and "Fuel Farm".
  - Lower priority than the hub labels. No status dot, because flights are visual only.
  - Clicking one flies the camera there.
- **L-2 Airport area.**
  - The area switcher gains "Airport", centred on the terminal and apron, about 700 m out.
  - The camera can zoom out to about 1,100 m, and its pan limits grow to the airport.
  - Hub areas and their framings are unchanged.

### 11.6 Quality tiers (D21)
| Tier | Shown |
|---|---|
| 0 | Everything |
| 1 | Background traffic halved; airport vehicles off |
| 2 | Buildings, markings, parked jets, signs and labels. Aircraft are parked only (no movements), with no traffic, airport vehicles or runway and taxiway light animation; lights are static. |

### 11.7 Budgets and non-functional
- **Draw calls:** M6 adds at most 60 at tier 0. The limits stay: ≤ 300 at tier 0 at night in rain, and ≤ 150 at tier 2. Jets are instanced per part (body, livery, glass, lights), and lights are instanced.
- **Triangles:** M6 adds at most about 250k at tier 0 (jets: 2.5k each).
- **Bundle:** ≤ 600 KB gzipped (currently 211 KB).
- **Accessibility (N-5):** reduced motion stills the beacons and strobes, but aircraft still land and take off, as cars still drive.
- **Unchanged:** N-1, N-7, all hub behaviour, and every M1–M5 requirement and test.

### 11.8 User stories
- As a **viewer**, I click "Airport" and the camera pulls back over the terminal: a Coastline jet touches down on runway 09/27, taxis to gate A4 and docks with its jet bridge, while a Pacific Gateway Air jet pushes back from A2.
- As a **viewer at night**, runway and taxiway lights, the tower beacon and the boulevard's headlight streams frame the glowing GoldLane hub.
- As an **ops manager**, triggering "Friday evening rush" lands a flight within seconds, and I watch its passengers' rental returns swell the hub.
- As a **viewer** on a weak device, the lowest tier keeps the airport's look (buildings, parked jets, labels) at a draw-call cost the device can handle.

### 11.9 Resolved (approved 2026-10-12: all proposed defaults accepted)
- **Q1 Runway direction:** **east–west (09/27)**, landing from the east and departing to the west.
- **Q2 Airside gate:** **a guarded airside gate near the cargo area** (reusing M5's booth and boom).
- **Q3 Garage location:** **west of the hub, between its fence and the boulevard** (x ≈ −330).
- **Q4 Flight-bank tie-in (F-2):** **yes**, an extra visible arrival when a surge starts.

## 12. M7: Ops realism tuning (APPROVED 2026-10-13)

Goal: the hub behaves like a real airport rental operation through a whole day. Demand rises and falls with the flight banks, the exit gates (and other bottlenecks) keep up, and the KPIs land in realistic ranges, all measured over full simulated days. The world, dashboard and visuals are unchanged except for a small demand indicator (R-7).

### 12.1 Decisions
| # | Decision | Choice |
|---|---|---|
| D26 | Exit-gate fix (2026-10-13) | **Faster gate cycle.** Keep 2 gates: release the gate as soon as the car clears the barrier, and shorten the checkout dwell. Simulation only; the layout and visuals are unchanged. |
| D27 | Demand pattern (2026-10-13) | **An airport day curve** of hourly multipliers on returns and pickups, with the same daily total as today. Weather and what-if surges multiply on top. |
| D28 | Flights (2026-10-13) | **The flight cadence follows the curve:** still visual only (D20), with more movements at peaks and fewer overnight. |
| D29 | Targets (2026-10-13) | **Balanced** (§12.4). |
| D30 | Hub clock (2026-10-13) | **15× real time** (was 20×, L-6 amended). Measured: turnaround 57 → 43 min, because inter-station driving at natural speed counts × the clock. The speed buttons become 15× / 30× / 45×, and a hub day takes 96 real minutes. |
| D31 | Wash and rain target (2026-10-13) | **Express wash, 60–120 s** (was 90–180 s), plus a **turnaround target of ≤ 55 min in rain** (≤ 45 in clear and overcast). Measured in Stage 4: the wash queue reached 19 at the peaks; with the express wash, a day's turnaround is 44.9 min in clear and 52.2 in rain (rain slows driving by 20%). |
| D32 | Wash time (2026-10-13) | **45–90 s** (supersedes D31's 60–120 s). At 60–120 s the wash queue still peaked at 12–14. |
| D33 | Energy at peaks (2026-10-13) | **Charge later** (R-8): a car with ≥ 50% charge or fuel skips the energy stage when 4 or more cars already wait there, and goes straight to the lot on a new **energy bypass lane** (the only layout change in M7). In a heatwave, charger queues spilled back onto the wash exit and jammed. |
| D34 | Evening peak (2026-10-13) | **Softened from ×1.8 to ×1.4** (raw band value, R-3). After normalisation the morning peak is ×1.68 and the evening ×1.47. At ×1.8 the evening counter backlog took 1–3+ hours to clear. |
| D35 | Queue targets (2026-10-13) | **Longest queue ≤ 12, and ≤ 8 an hour after each peak** (was ≤ 10 and ≤ 3). Queues run at 2–8 even at midday. |
| D36 | Gridlock check (2026-10-13) | **A car waiting behind a queued car counts as queued.** This covers a car on its way to its unit that is stopped nose-to-tail behind a queued car, or stopped while the unit's previous occupant, itself queued, is still part-way out. A real deadlock still shows at the head of the line. |
| D37 | Utilisation target (2026-10-13) | **60–75%** (was 60–70%), to allow for the ±8% seed-to-seed spread in demand. |
| D38 | Third exit gate (2026-10-13) | **Tried and reverted: 2 gates stay.** Saturated throughput was 28–30 cars/h with 2 or 3 gates; the limit is ready-car supply, not the gates. Gate lanes are now generated from `facility.exitGates`. |
| D39 | Counter target (2026-10-13) | **No counter-recovery target; served ≥ 90% is the service-level measure**, now measured as checkouts ÷ the pickups customers actually requested. On busy seeds the hub runs out of ready cars at the peaks, and neither 135–150 cars nor a larger departure backlog cleared the counter within an hour. |

### 12.2 Baseline (measured 2026-10-13: seed `goldlane`, one simulated day, flat demand)
| Weather | Pickups served | Avg turnaround | Avg utilisation | Max queue: gate / wash / counter |
|---|---|---|---|---|
| Clear | 97% (465/480) | 57.0 min | 62.7% | 9 / 13 / 6 |
| Rain | 94% (450/480) | 64.7 min | 62.3% | 11 / 11 / 26 |

Turnaround already misses the target, and the wash queue (13) is a second bottleneck. Both come from the same cause: a unit is released only when the car has left the unit's whole approach lane, and that driving time counts at 20× (L-6).

### 12.3 Requirements
- **R-1 Faster unit release.**
  - An exit gate is released as soon as the departing car's rear clears the barrier line.
  - The same rule applies to the drive-through units (return lanes and wash bays): released once the leaving car's front is off the unit's lane, and the next car can wait right behind the occupant (roll-up staging).
  - Service bays, chargers, pumps and the tow hand-off keep the whole-body rule and the plain queue. Stage 4 found jams when the next car entered while the previous one was still manoeuvring out, and a car staged behind a charger could wait 20+ minutes while another charger freed up. (This narrows Q1's "all bay types"; approved 2026-10-13.)
  - Units are still never shared: the next car is granted only once the previous one has physically cleared (L-4 no-overlap is unchanged).
- **R-2 Checkout dwell.** The gate dwell drops from 10–20 s to **8–15 s** (simulated).
- **R-3 Airport day curve (D27).** Hourly multipliers by hub clock hour, with a daily mean of exactly 1.0:

  | Hours | 00–05 | 05–07 | 07–10 | 10–16 | 16–20 | 20–24 |
  |---|---|---|---|---|---|---|
  | Multiplier | ×0.2 | ×0.8 | **×1.6** | ×1.0 | **×1.4** (D34; was ×1.8) | ×0.7 |

  The values are normalised so the daily total of pickups equals today's (20/h × 24). After normalisation the curve is ×1.68 at 08:30, ×1.05 at 13:00, ×1.47 at 18:00 and ×0.21 at 02:30. The curve is piecewise linear between hour boundaries, so there are no steps. It multiplies with weather (heatwave ×1.4) and the M4 surge (×2).
- **R-4 Returns follow the curve.** Rental return times are shaped by the same curve, so the hourly returns at peaks are ≥ 1.4× the daily mean and overnight ≤ 0.5×. Rental lengths keep their mean (3.9 h) and minimum (30 min).
- **R-5 Flights follow the curve (D28).**
  - The time between movements scales with the multiplier: 40 s ÷ the multiplier, clamped to 30–120 s. That gives 30 s at both peaks, about 38 s at midday and 120 s overnight. (The 30 s floor is because at 25 s a pushback came within 43.8 m of an arrival.)
  - Airport time maps to hub time at 15 hub seconds per airport second (one hub day = 96 airport minutes; D30).
  - All M6 rules still hold: one runway occupant, ≥ 45 m separation, consistent gates and the surge extra.
- **R-6 Determinism and baseline.** The curve depends only on the hub clock, so seed + command log still reproduces a run (S-15), and the M4 shadow baseline follows the same curve (deltas stay valid).
- **R-7 Demand indicator.**
  - A compact top-bar readout next to the clock: "Demand ×1.6 · Morning peak", "×1.0 · Midday", "×0.2 · Overnight".
  - The value includes weather and an active surge. It has a text label and doesn't rely on colour alone.
- **R-8 Charge later (D33).** When 4 or more cars already wait for the energy station, a car arriving with ≥ 50% charge or fuel skips it and parks in the ready lot. It reaches the lot on the energy bypass lane, which runs just east of the fuel pumps, from the energy-area entrance (170, −10) to the merge after the pumps (170, 72). It never drives through the charger or pump stalls.

### 12.4 Calibration targets (D29, Balanced)
These are measured over **one full simulated day** for seeds 1–3 in clear, overcast and rain, by a new day-long soak (§12.5):

| KPI | Target |
|---|---|
| Average turnaround (mean of the 2-hour rolling KPI across the day) | ≤ 45 min in clear and overcast; ≤ 55 min in rain (D31) |
| Average utilisation | 60–75% (D37) |
| Pickups served (checkouts ÷ the pickups customers requested, D39) | ≥ 90% |
| Gate, wash, service, charger queues | ≤ 12 at all times, and back to ≤ 8 within 60 simulated minutes after each peak ends (D35) |
| Counter queue | Not a target (D39); shown live in the UI |
| Overlaps and gridlock | None (L-4, unchanged; D36 defines a queued car) |

Heatwave (×1.4 on top of the peaks, ×2.5 at the evening peak) is a stress case: no overlaps or gridlock, served ≥ 80%, and queues recover after the peak (Q2).

### 12.5 Testing and budgets
- **New day-long soak:** 3 seeds × 4 weathers × 24 simulated hours, checking the targets above. It runs in the soak suite, not the default `npm test`.
- **Unit tests:** the curve's shape and normalisation, return shaping, the release rule, the dwell range, the flight cadence by hour and the indicator text.
- **Existing tests whose calibrated numbers change** (for example M1 soak floors, or M4 surge thresholds) will be listed in Stage 3 with the reason, and no assertion is weakened without a note.
- **Budgets are unchanged:** the simulation steps stay ≤ 4 ms per frame at 60× with the baseline (§9.6), and the bundle and draw calls are as for M6.

### 12.6 Resolved (approved 2026-10-13: all proposed defaults accepted)
- **Q1 Release rule scope:** **all bay types** (R-1), since the wash queue is a bottleneck too, rather than gates only.
- **Q2 Heatwave:** **a stress case** with relaxed targets (served ≥ 80%) rather than the full Balanced targets.
- **Q3 Curve values:** **as in R-3**.
- **Q4 Demand indicator:** **yes**, next to the clock (R-7).

## 13. M8: Ship & share (APPROVED 2026-10-13; implemented)

Goal: anyone can open the world from a link, a downloaded file or an embed, land on exactly the view that was shared, present it unattended, and understand it without help from us. The simulation, the world and the dashboard behave as in M7. M8 adds ways in, a presentation mode, a capture tool and documentation.

### 13.1 Decisions
| # | Decision | Choice |
|---|---|---|
| D40 | Distribution (2026-10-13) | **All three:** a GitHub Pages site, a downloadable file on GitHub Releases, and an embeddable mode for iframes. The offline single file (N-1) stays the build output. |
| D41 | Deep links (2026-10-13) | **Full deep links** (§13.3) and a **Copy link** button that captures the current view. |
| D42 | Link vs saved preferences (2026-10-13) | **The link wins for that visit; saved preferences are untouched** unless the viewer changes something. Invalid values are ignored and defaults are used. |
| D43 | Presentation (2026-10-13) | **Kiosk auto-tour** and a **screenshot button**. (No separate clean-view toggle.) |
| D44 | Kiosk input (2026-10-13) | **Input pauses the tour, and it resumes after 60 s idle.** Esc or a button leaves kiosk mode. |
| D45 | Screenshot content (2026-10-13) | **The 3D view plus a baked-in caption** (brand, area, hub clock, weather). Dashboard panels are not captured. |
| D46 | Publishing (2026-10-13) | **Pages redeploys on every push to `main`, and a version tag (`v*`) creates a Release** with the file attached. Workflows run only after the user pushes. |
| D47 | Documentation (2026-10-13) | **README, in-app help overlay and CHANGELOG.** |

### 13.2 Publishing (D40, D46)
- **SH-1 Pages workflow.** `.github/workflows/pages.yml` runs on push to `main` (and by hand). It installs, runs `npm run check` and the E2E suite (Chromium), builds for production, then deploys `dist/index.html` to GitHub Pages. If any step fails, nothing is deployed. The soak suite is not run in CI (too slow); it stays a local gate before a release.
- **SH-2 Release workflow.** `.github/workflows/release.yml` runs on a pushed tag `v*.*.*`. It runs the same checks and build, then creates a GitHub Release named after the tag, with the file attached as `goldlane-hub-<version>.html` and the notes taken from that version's CHANGELOG section. The tag must match the version in `package.json`, or the workflow fails.
- **SH-3 Version.** `package.json` moves to `0.8.0` for M8. The version and build date are compiled in and shown in the help overlay (SH-12).
- **SH-4 Still one offline file.** The Pages site, the Release file and a local build are the same single `index.html` (N-1). It makes no network requests, the CSP is unchanged, and it still opens from `file://`.
- **Preconditions (user actions, not code):**
  - In the repo settings, set Pages → Source to "GitHub Actions".
  - GitHub Pages on a private repo needs a paid plan. On a public repo the site is public.
  - Nothing is published until the user pushes.

### 13.3 Deep links (D41, D42)
- **SH-5 URL options.** These are read once at start from the query string (`?…`). Every option is optional, and unknown keys are ignored.

  | Key | Values | Default | Effect |
  |---|---|---|---|
  | `area` | `overview`, `return`, `wash`, `energy`, `lot`, `airport` | `overview` | Starting area (I-5) |
  | `cam` | `x,z,azimuth,elevation,distance` (numbers; angles in degrees) | the area's view | Exact camera, clamped to the camera limits (I-1). It overrides `area`'s camera but keeps its highlight. |
  | `weather` | `clear`, `overcast`, `rain`, `heatwave` | `clear` | Starting weather |
  | `tod` | `auto`, `day`, `night` | `auto` | Time of day |
  | `speed` | `0` (paused), `15`, `30`, `45` | `15` | Simulation speed |
  | `labels` | `0`, `1` | saved preference | Building labels (not saved, D42) |
  | `theme` | `dark`, `light` | saved preference | UI theme (not saved, D42) |
  | `quality` | `auto`, `0`, `1`, `2` | `auto` | Quality tier. A number pins it and turns adaptive switching off. |
  | `seed` | 1–32 characters from `A–Z a–z 0–9 - _` | `goldlane` | Simulation seed for the hub and its baseline |
  | `preset` | `fridayRush`, `washDown`, `heatCharger`, `gateClosure` | none | Starts that what-if preset (M4) |
  | `select` | a facility or unit id, e.g. `wash1`, `gate2`, `terminal` | none | Opens its details, as if clicked |
  | `kiosk` | `1` | off | Starts the kiosk tour (SH-9) |
  | `embed` | `1` | off | Embed mode (SH-8) |

- **SH-6 Validation.** Parsing is a pure function from the query string to a typed link state, plus the list of ignored keys.
  - An invalid value is dropped, so that option uses its default. It is logged once with `console.info`, never thrown or shown as an error.
  - If a key appears twice, the first one wins.
- **SH-7 Copy link.** A "Copy link" item in the user menu builds a link to the current state.
  - The link covers: area, camera, weather, time of day, speed, labels, theme, pinned quality, seed, the selected facility or unit, and `embed`/`kiosk` if active.
  - It includes the active preset only when the current what-if state is an unmodified preset.
  - Default values are left out to keep links short.
  - It copies to the clipboard and confirms with a short "Link copied" notice. If the clipboard is unavailable (e.g. `file://` or a refused permission), a small dialog shows the link already selected for manual copy.
  - A shared link reproduces the same *settings*, not the same moment. The hub always starts at 08:00 (L-6), and the same seed plus preset gives the same run (S-15).

### 13.4 Embed mode (D40)
- **SH-8 Embed (`?embed=1`).**
  - Hides the top bar, KPI cards, process tracker, live table, alerts and what-if drawer.
  - Shows a compact overlay: the brand mark, the hub clock, the demand readout (R-7), and an "Open full view ↗" link. The link opens the same URL without `embed` in a new tab.
  - The camera works as usual (drag, wheel, touch). Keyboard shortcuts only act while the frame has focus, and the page never scrolls the host page.
  - It fits any frame size down to 320 × 240, and respects reduced motion (X-2).
  - The README gives a copy-paste `<iframe>` snippet.
  - Embedding is allowed on any site: a `<meta>` CSP cannot restrict `frame-ancestors`, and Pages can't set headers.

### 13.5 Kiosk auto-tour (D43, D44)
- **SH-9 Tour.** Started by `?kiosk=1` or by "Start tour" in the user menu.
  - Hides the panels as in embed mode and shows a caption bar with the area name, hub clock, demand and one live fact for that area (e.g. "Wash queue 3", "Counter: 0 waiting", "Next landing in 0:40").
  - Visits overview → return → wash → energy → lot → airport and repeats, **20 s per area**. It uses the usual camera flight and a slow orbit while it stays on an area.
  - With reduced motion it cuts between areas instead of flying, and doesn't orbit.
  - Keeps the screen awake with the Wake Lock API where it is available, and ignores it silently elsewhere.
- **SH-10 Input during the tour (D44).**
  - Any pointer, wheel, touch or key input pauses the tour and gives normal control.
  - A "Tour paused · resumes in 60 s" chip counts down and resets on each input.
  - Esc, or the chip's "Exit tour", leaves kiosk mode and restores the panels.
  - The tour never changes simulation settings.

### 13.6 Screenshot (D45)
- **SH-11 Save a picture.** A camera button in the top bar (or the `P` key) saves `goldlane-hub-YYYYMMDD-HHMMSS.png` to the downloads folder, named with the viewer's local time.
  - The image is the 3D view at the current canvas resolution (capped at 4096 px wide), with a caption strip along the bottom: "GoldLane Hub · Pacific Gateway · <area> · <hub clock> · <weather>".
  - Dashboard panels, the DOM label overlay and the selection outline are not in the image. The world's own 3D text (signs) is included.
  - It works offline and from `file://`. It captures the next fully rendered frame, so the image is never blank.

### 13.7 Help and documentation (D47)
- **SH-12 Help overlay.** A "?" button in the top bar, or the `?` key, opens a dialog with:
  - controls for mouse, touch and keyboard, including the new `P` and `?` keys;
  - a legend: status colours, label states and the demand readout;
  - what each KPI means, and how the speed and what-if controls work;
  - the note that all brands and names are fictional (N-7);
  - the version and build date (SH-3).

  The dialog traps focus, closes with Esc or its close button, and returns focus to where it was. It is not shown automatically.
- **SH-12a Quick help on hover (Q4).** Hovering over or focusing the "?" button shows a small popover with the five most-used controls (drag, wheel, area buttons, `P`, `?`) and "Click for full help". It hides when the pointer or focus leaves, never traps focus, and is announced as the button's description. On touch screens (no hover), a tap opens the full dialog.
- **SH-13 README.md.** It covers:
  - what the world is, with screenshots generated by a script into `docs/media/`, and the live Pages link;
  - features by milestone;
  - quick start (`npm ci`, `npm run dev`), and the build and test commands (check, soak, E2E);
  - the deep-link table (SH-5), the embed snippet and kiosk usage;
  - the tech stack, the folder layout and the spec-driven workflow (`docs/`);
  - the fictional-brand note.

  The README states the MIT licence (Q1).
- **SH-15 Licence.** A `LICENSE` file with the MIT licence, © 2026 Subhadip Dutta. `package.json` gets `"license": "MIT"`. The fictional-brand note (N-7) still applies to names and marks in the world.
- **SH-14 CHANGELOG.md.** In "Keep a Changelog" format, with one entry per milestone. M1–M7 are added retroactively as 0.1.0–0.7.0, with dates from the git history; M8 is 0.8.0.

### 13.8 Non-functional
- No new runtime dependencies. Bundle growth ≤ 15 KB gzipped (budget 600 KB).
- No network access at runtime, and the CSP is unchanged (N-1, SH-4). Downloads use a `blob:` link. The clipboard uses the async Clipboard API, with the SH-7 fallback.
- Embed and kiosk modes keep the draw-call budgets (≤ 300 / ≤ 150 by tier) and the simulation budgets.
- Accessibility:
  - The new buttons have labels and keyboard access.
  - The help dialog and the copy-link fallback trap focus.
  - The kiosk caption and the "Link copied" notice use a polite live region.

### 13.9 User stories
- *As a team lead,* I paste a link in chat and colleagues land on the wash area in rain with the "Wash tunnel down" preset running.
- *As a presenter,* I put the world on a lobby screen with `?kiosk=1`. It tours on its own, and if someone pokes it, it resumes a minute later.
- *As a portfolio owner,* I embed the world in a page with an iframe and a link to the full view.
- *As a reviewer,* I download the release file and open it offline.
- *As a newcomer,* I press `?` to learn the controls and what the KPIs mean, and the README tells me how to run and test it.
- *As anyone,* I press `P` to save a captioned picture to share.

### 13.10 Testing
- **Unit:**
  - link parsing and formatting: round trip, every key valid and invalid, defaults omitted, duplicate keys;
  - the kiosk scheduler: order, 20 s dwell, pause and resume at 60 s, exit;
  - caption and file-name text;
  - the "is an unmodified preset" check;
  - help content: the keys listed match the key handler.
- **E2E:**
  - A deep link applies area, weather, time of day, speed, labels, preset and selection, and leaves saved preferences unchanged.
  - Copy link round-trips: opening the copied link gives the same state.
  - Embed hides the panels, and the "Open full view" link drops `embed`.
  - Kiosk moves to the next area after 20 s, pauses on input and exits with Esc.
  - The screenshot downloads a non-blank PNG of the canvas size.
  - Help opens with `?`, traps focus and closes with Esc.
  - Draw calls in embed and kiosk modes stay in budget, and the bundle stays ≤ 600 KB.
- **Workflows:** a unit test checks that both workflow files exist and run `npm run check`, the E2E suite and the build, and that the release job checks the tag against `package.json`. They are proven for real on the first push (a user action).

### 13.11 Resolved (2026-10-13)
- **Q1 Licence:** **MIT** (SH-15).
- **Q2 E2E in CI:** **yes**, Chromium only (about 6 min per push). The soak stays local.
- **Q3 Kiosk areas:** **all six areas**, 20 s each (a 2-minute loop).
- **Q4 Help on first visit:** **not shown automatically; quick help on hover** over the "?" button, full help on click or `?` (SH-12a).

