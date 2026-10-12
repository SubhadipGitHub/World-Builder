// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeedControl } from '../../../src/ui/m4/SpeedControl';

afterEach(cleanup);

describe('SpeedControl (S-18)', () => {
  it('shows Pause and three speeds, with the current one pressed', () => {
    render(<SpeedControl speed={1} onSpeed={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Simulation speed' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Pause', '20×', '40×', '60×']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
  });

  it('reports the picked speed', () => {
    const onSpeed = vi.fn();
    render(<SpeedControl speed={1} onSpeed={onSpeed} />);
    fireEvent.click(screen.getByRole('button', { name: '60×' }));
    expect(onSpeed).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onSpeed).toHaveBeenLastCalledWith(0);
  });
});
