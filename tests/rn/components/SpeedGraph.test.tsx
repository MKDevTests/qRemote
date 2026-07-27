import React from 'react';
import { render } from '@testing-library/react-native';
import { SpeedGraph, niceGraphCeiling } from '@/components/SpeedGraph';

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ colors: require('./theme-mock').mockColors }),
}));

describe('SpeedGraph', () => {
  it('renders empty-state dashed line when data is empty', async () => {
    const { toJSON } = await render(<SpeedGraph data={[]} color="#00f" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders single data point as a vertical line', async () => {
    const { toJSON } = await render(<SpeedGraph data={[42]} color="#00f" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders multi-point polyline with custom dimensions and maxValue', async () => {
    const { toJSON } = await render(
      <SpeedGraph data={[1, 5, 3, 8, 2]} color="#0f0" width={200} height={80} maxValue={10} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('handles all-zero data without dividing by zero', async () => {
    const { toJSON } = await render(<SpeedGraph data={[0, 0, 0]} color="#f00" />);
    expect(toJSON()).toBeTruthy();
  });
});

describe('niceGraphCeiling', () => {
  it('rounds a mid-range peak up to the next 1/2/5/10 step', () => {
    // 51,000,000 B/s (~48.6 MiB/s) should round up to 50 MiB/s exactly.
    expect(niceGraphCeiling(51_000_000)).toBe(50 * 1024 * 1024);
  });

  it('leaves an already-clean value unchanged', () => {
    // Exactly 10 MiB/s — a plausible configured rate limit — should not get
    // bumped to 20 MiB/s by floating-point noise at the step boundary.
    const tenMib = 10 * 1024 * 1024;
    expect(niceGraphCeiling(tenMib)).toBe(tenMib);
  });

  it('floors non-positive input at 1', () => {
    expect(niceGraphCeiling(0)).toBe(1);
    expect(niceGraphCeiling(-5)).toBe(1);
  });

  it('never rounds below the input value', () => {
    for (const value of [1, 42, 1_500, 952_320, 51_000_000, 987_654_321]) {
      expect(niceGraphCeiling(value)).toBeGreaterThanOrEqual(value);
    }
  });
});
