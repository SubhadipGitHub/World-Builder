# World Builder

A custom 3D "living world" ops dashboard based on the blank template in `docs/World_Prompt_Pack.pdf`.
The current spec lives in `docs/requirements.md`, and later in `docs/architecture.md`.

## Workflow: spec-driven + TDD (strict order, with an approval gate between stages)
1. **Plan & Elicit (what and why).** Ask about requirements, edge cases and constraints. Update `docs/requirements.md` and the user stories.
2. **Design & Architecture (how).** Propose the design and component breakdown, and flag security and performance risks. Record decisions in `docs/architecture.md`.
3. **TDD.** Write failing unit/integration tests before any feature code.
4. **Implement & Review.** Strictly typed code. Run lint, typecheck and tests, and fix everything before asking for review.

Never write implementation code until the requirements, architecture and failing tests are defined and approved.

## Rules
- **Stack:** TypeScript (strict), Vite, Three.js, Vitest, Playwright. `vite-plugin-singlefile` produces one self-contained `dist/index.html`.
- **Simulation code** (`src/sim/`) must not import Three.js. It is deterministic with a fixed timestep and a seed.
- **Git:** Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`).
- **Docs:** `docs/` is the single source of truth. Keep it updated in the same change as the code.
- **Plan mode:** default to plan/ask mode for complex tasks.
