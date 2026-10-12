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
- **L-6 Time scale.** A simulated clock runs at **20× real time** and is adjustable. Process durations (inspection, wash, charging, rental) use realistic simulated minutes, so a full turnaround takes about 2–4 real minutes. On-screen driving speed is clamped so it looks natural rather than sped up.
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
  - Lamp posts along every vehicle road and the walkway, about every 25 m. Main roads have them on both sides.
  - Each lamp lights a warm pool with a radial falloff on the ground; the Ready lot has floodlights.
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
