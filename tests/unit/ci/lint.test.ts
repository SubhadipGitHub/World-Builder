import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// M9 (FE-1; architecture F2): energy type comes from energyOf(cls), never a literal `cls === 'ev'`.

const restricted = async (file: string): Promise<string> => {
  const config = (await new ESLint().calculateConfigForFile(file)) as { rules?: Record<string, unknown> };
  return JSON.stringify(config.rules?.['no-restricted-syntax'] ?? null);
};

describe('energyOf lint rule (F2)', () => {
  it('bans comparing a class with the literal "ev" in src', async () => {
    for (const file of ['src/sim/world.ts', 'src/ui/alerts.ts', 'src/render/agents.ts']) {
      const rule = await restricted(file);
      expect(rule).toContain('energyOf');
      expect(rule).toContain('ev');
    }
  });

  it('allows it in the fleet table, where energyOf lives', async () => {
    expect(await restricted('src/config/fleet.ts')).not.toContain('energyOf');
  });
});
