import { describe, expect, it } from 'vitest';
import { overlayBuilds } from './buildlog';
import { derive } from './derive';
import { buildFixtureEvents } from './fixtures/builds';
import { catalogue } from './fixtures/catalogue';
import { fixtureEvents } from './fixtures/world';

const KEEPER = 'boxout-fantasy.keeper-values';
const at = (day: string) => {
  const world = overlayBuilds(derive(fixtureEvents(), catalogue, day), buildFixtureEvents());
  return world.places.find((p) => p.id === 'boxout-fantasy')!.features.find((f) => f.id === KEEPER)!;
};

describe('the fixture build, edition by edition', () => {
  it('has no build state before a plan exists', () => {
    expect(at('2026-09-20').build).toBeUndefined();
    // A draft nobody has accepted is not a plan.
    expect(at('2026-09-28').build?.stage).toBe('idea');
  });

  it('walks ready, blocked, ready, building, verifying, done, and back to verifying', () => {
    expect(at('2026-09-30').build?.stage).toBe('ready');
    expect(at('2026-10-03').build?.stage).toBe('planned');
    expect(at('2026-10-03').build?.openBlockers).toHaveLength(1);
    expect(at('2026-10-05').build?.stage).toBe('ready');
    expect(at('2026-10-06').build?.stage).toBe('building');
    expect(at('2026-10-06').build?.stepsDone).toEqual(['costs', 'model']);
    expect(at('2026-10-08').build?.stage).toBe('building');
    expect(at('2026-10-09').build?.stage).toBe('verifying');
    expect(at('2026-10-09').build?.criteriaFailed).toEqual(['loads-fast']);
    expect(at('2026-10-10').build?.stage).toBe('done');
    expect(at('2026-10-11').build?.stage).toBe('done');
    expect(at('2026-10-12').build?.stage).toBe('verifying');
  });

  it('draws each stage with the vocabulary the map already has', () => {
    expect(at('2026-09-30').stage).toBe('designed');
    expect(at('2026-10-06').stage).toBe('building');
    expect(at('2026-10-06').progress).toBeCloseTo(0.4);
    expect(at('2026-10-09').stage).toBe('building');
    expect(at('2026-10-09').progress).toBe(1);
    expect(at('2026-10-10').stage).toBe('working');
    expect(at('2026-10-12').stage).toBe('building');
  });

  it('records who is building, how it was proven, and that the builder saying done did not make it so', () => {
    const today = at('2026-10-12');
    expect(today.build?.activeSession?.builder).toBe('claude-code');
    expect(at('2026-10-11').build?.activeSession).toBeUndefined();
    // Done rested partly on Patrick's word: only as proven as its weakest check.
    expect(at('2026-10-10').build?.provenBy).toBe('word');
    // On the 9th the agent reported build.completed with a failing check outstanding.
    expect(at('2026-10-09').build?.stage).not.toBe('done');
  });

  it('counts a dependency that stands by inference as done, and leaves unplanned features alone', () => {
    expect(at('2026-09-30').build?.waitingOn).toEqual([]);
    const world = overlayBuilds(derive(fixtureEvents(), catalogue, '2026-10-12'), buildFixtureEvents());
    const boxout = world.places.find((p) => p.id === 'boxout-fantasy')!;
    expect(boxout.features.filter((f) => f.build).map((f) => f.id).sort()).toEqual([KEEPER, 'boxout-fantasy.sleeper-sync'].sort());
    expect(boxout.features.find((f) => f.id === 'boxout-fantasy.sleeper-sync')!.build?.stage).toBe('specified');
    expect(world.places.find((p) => p.id === 'ledgerline')!.features.every((f) => !f.build)).toBe(true);
  });

  it('does not mutate the world it is given', () => {
    const base = derive(fixtureEvents(), catalogue, '2026-10-12');
    const copy = JSON.stringify(base);
    overlayBuilds(base, buildFixtureEvents());
    expect(JSON.stringify(base)).toBe(copy);
  });
});
