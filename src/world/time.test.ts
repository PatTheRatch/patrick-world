import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayNumber,
  daysBetween,
  formatDay,
  formatMonthYear,
  isoFromDay,
  monthKey,
  monthsBetween,
  weekday,
  weekIndex,
} from './time';

describe('time', () => {
  it('converts days both ways', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2000-03-01')).toBe(11017);
    for (const iso of ['2023-02-12', '2024-02-29', '2024-12-31', '2026-10-12', '1999-01-01']) {
      expect(isoFromDay(dayNumber(iso))).toBe(iso);
    }
  });

  it('adds days across months, years and leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetween('2026-01-01', '2026-10-12')).toBe(284);
  });

  it('knows weekdays and weeks', () => {
    expect(weekday('2026-10-12')).toBe(1); // a Monday
    expect(weekday('2026-10-11')).toBe(0);
    // Monday to Sunday share a week; the next Monday starts another.
    expect(weekIndex(dayNumber('2026-10-05'))).toBe(weekIndex(dayNumber('2026-10-11')));
    expect(weekIndex(dayNumber('2026-10-12'))).toBe(weekIndex(dayNumber('2026-10-11')) + 1);
  });

  it('handles months', () => {
    expect(monthKey('2025-03-14')).toBe('2025-03');
    expect(monthsBetween('2025-11-20', '2026-02-01')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(formatMonthYear('2025-03-14')).toBe('March 2025');
    expect(formatMonthYear('2026-10')).toBe('October 2026');
    expect(formatDay('2025-03-04')).toBe('4 March 2025');
  });
});
