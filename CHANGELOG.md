# Changelog

All notable changes to GoldLane Hub, one entry per milestone. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).
The full specification for each milestone is in `docs/requirements.md` and `docs/architecture.md`.

## [0.9.0] - 2026-10-13

M9: fleet economics, sound, weather effects and notifications (requirements §14).

### Added
- Four new rental classes: economy hatchback, premium saloon, 7-seat minivan and crew-cab pickup, each with
  its own model, daily rate and service interval. Seven classes in all, still 120 cars.
- Mileage-based maintenance: a car is flagged for scheduled service once it reaches its class interval.
- A "Revenue today" KPI card with the revenue at risk from customers waiting at the counter, and its
  what-if delta against the baseline. Rates and service status in the detail panel; class and rate in the
  checkout log.
- Fog and Thunderstorm weather, morning mist, lightning (photosensitivity-safe), wind that sways trees and
  flags and slants the rain, a windsock, fog halos around lights, and ambient particles (exhaust from petrol
  cars, wash spray, puddle splashes, jet exhaust, leaves and dust).
- A procedural soundscape (no audio files), muted by default: the speaker button or `M`, with a volume slider.
- Pop-up alerts for warnings and critical alerts, with a "Pop-up alerts" switch.

### Changed
- The ready lot's rows are Cars, SUVs & vans, and EV; stalls are named by row (e.g. "Cars row · stall 4").
- KPI cards wrap 2 × 2 on a phone.

## [0.8.0] - 2026-10-13

M8: ship and share (requirements §13).

### Added
- GitHub Pages workflow: every push to `main` runs the checks and E2E, then publishes the single file.
- Release workflow: a `v*.*.*` tag creates a GitHub Release with `goldlane-hub-<version>.html` attached.
- Deep links for area, camera, weather, time of day, speed, labels, theme, quality, seed, what-if preset,
  selection, kiosk and embed, plus "Copy link" in the user menu (with a manual-copy fallback).
- Embed mode (`?embed=1`) with a compact overlay and an "Open full view" link.
- Kiosk auto-tour (`?kiosk=1` or "Start tour"): six areas, 20 s each; input pauses it for 60 s; Esc exits.
- Screenshot button and `P` key: a PNG of the 3D view with a caption strip.
- Help dialog (`?` key or button) with quick help on hover; version and build date.
- README, this changelog and the MIT licence.

## [0.7.0] - 2026-10-13

M7: ops realism tuning (requirements §12).

### Added
- An airport day demand curve (morning and evening peaks), with rental returns shaped by the same curve.
- A demand readout next to the clock.
- Charge-later policy and an energy bypass lane for cars with enough charge or fuel.
- A day-long soak test: 3 seeds × 4 weathers × 24 simulated hours against the Balanced targets.

### Changed
- The hub clock runs at 15× (speed buttons 15× / 30× / 45×).
- Faster gate cycle: early release and two-deep staging at drive-through units, and an 8–15 s checkout.
- Express wash (45–90 s). The flight cadence follows the demand curve (30–120 s between movements).
- The top bar keeps the controls on one line at laptop widths.

## [0.6.0] - 2026-10-13

M6: airport context (requirements §11).

### Added
- A mid-size airport to the north: terminal, gates, runway, control tower, parking garage and cell phone lot.
- Visual-only flights from three fictional airlines on a deterministic schedule, with an extra arrival during a surge.
- Airport name labels and an "Airport" area.

## [0.5.0] - 2026-10-12

M5: branding, building indicators and hub security (requirements §10).

### Added
- Building signage, entrance pylon and flags, wayfinding signs, fleet livery.
- Live building labels with status (OK, Busy, Offline), switchable and remembered.
- Perimeter fence, entry checkpoint with booms, CCTV, light masts and a patrol car.

## [0.4.0] - 2026-10-12

M4: what-if scenarios (requirements §9).

### Added
- What-if drawer: presets, unit outages, crew levels and a demand surge.
- A shadow baseline simulation, so the KPI cards show deltas against an unchanged hub.
- Simulation speed control with pause.

## [0.3.0] - 2026-10-12

M3: premium visuals (requirements §8).

### Added
- Warm roadside street lights with light pools, soft bloom at night, and weather effects.
- Automatic quality tiers that keep the frame rate within budget.

## [0.2.0] - 2026-10-12

M2: operations dashboard.

### Added
- Glass dashboard: KPI cards, process tracker, live tables, alerts, search, and light and dark themes.

## [0.1.0] - 2026-10-12

M1: the living world.

### Added
- A deterministic hub simulation: returns, inspection, wash, service, charging and fuelling, the ready lot and exit gates.
- A 3D hub with cars, shuttles, carts and pedestrians on a lane graph that never lets them overlap.
- Camera controls, area switcher, selection and follow, all in one offline HTML file.
