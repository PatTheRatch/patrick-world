// A fictional build, told in events, for the specimen world: one feature of Boxout Fantasy
// taken from an accepted plan through a blocker, three builder sessions (an agent, Patrick by
// hand, an agent again), a failed check, a pass, and a regression that is being looked at
// today. Scrub the edition dial across early October 2026 to watch it happen.

import type { BuildEvent, BuildPlan } from '../build';

const PLACE = 'boxout-fantasy';
const KEEPER = 'boxout-fantasy.keeper-values';
const SLEEPER = 'boxout-fantasy.sleeper-sync';

const keeperPlan: BuildPlan = {
  place: PLACE,
  feature: KEEPER,
  revision: 1,
  objective:
    "Show every keeper-eligible player's surplus value, so a manager can decide who to keep before the league's deadline.",
  criteria: [
    {
      id: 'surplus-matches',
      statement: 'Surplus values match the hand-checked sheet for the 2025 league.',
      verification: { kind: 'command', how: 'pytest tests/keepers/test_surplus.py' },
    },
    {
      id: 'loads-fast',
      statement: 'The sheet loads in under two seconds for a 14-team league.',
      verification: { kind: 'command', how: 'pytest tests/keepers/test_perf.py' },
    },
    {
      id: 'reads-on-phone',
      statement: 'A manager can read keep or cut at a glance on a phone.',
      verification: { kind: 'manual', how: 'Open the sheet on a phone with a real roster.' },
    },
    {
      id: 'method-agrees',
      statement: 'The valuation agrees with the draft-room projections it sits beside.',
      verification: { kind: 'review', how: 'Someone other than the builder compares ten players against the draft board.' },
    },
  ],
  steps: [
    { id: 'costs', title: 'Pull keeper costs from league history', touches: ['boxout/keepers/costs.py'] },
    { id: 'model', title: 'Surplus model', after: ['costs'], touches: ['boxout/keepers/surplus.py'] },
    { id: 'endpoint', title: 'Sheet endpoint', after: ['model'], touches: ['boxout/api/keepers.py'] },
    { id: 'view', title: 'Sheet view', after: ['endpoint'], touches: ['web/src/keepers/Sheet.tsx'] },
    { id: 'phone', title: 'Phone layout', after: ['view'], touches: ['web/src/keepers/Sheet.css'] },
  ],
  dependsOn: ['boxout-fantasy/boxout-fantasy.league-store'],
  verification: ['The existing draft-room tests keep passing.'],
};

const sleeperPlan: BuildPlan = {
  place: PLACE,
  feature: SLEEPER,
  revision: 1,
  objective: 'Read rosters and scoring from Sleeper leagues the way ESPN and Yahoo leagues are read today.',
  criteria: [
    {
      id: 'roster-parity',
      statement: 'A Sleeper league imports with the same roster shape as an ESPN league.',
      verification: { kind: 'command', how: 'pytest tests/leagues/test_sleeper.py' },
    },
  ],
  steps: [],
  dependsOn: [],
};

export function buildFixtureEvents(): BuildEvent[] {
  let n = 0;
  const out: BuildEvent[] = [];
  const add = (at: string, feature: string, e: Record<string, unknown>) => {
    out.push({ id: `fx-build-${String(n++).padStart(3, '0')}`, at, place: PLACE, feature, ...e } as BuildEvent);
  };
  const k = (at: string, e: Record<string, unknown>) => add(at, KEEPER, e);

  // A plan is drafted by an agent, and becomes the plan when Patrick accepts it.
  k('2026-09-28T19:10:00Z', { type: 'plan.written', plan: keeperPlan, author: 'claude-code', accepted: false });
  k('2026-09-29T08:40:00Z', { type: 'plan.written', plan: keeperPlan, author: 'patrick', accepted: true });
  k('2026-10-02T21:05:00Z', {
    type: 'blocker.raised',
    blocker: 'traded-keepers',
    reason: 'Keeper cost for a traded player differs by league; the rule has to be chosen first.',
    by: 'patrick',
  });
  k('2026-10-04T09:30:00Z', { type: 'blocker.cleared', blocker: 'traded-keepers', resolution: 'Cost follows the player. Written into the league settings.' });

  // First session: an agent lays the groundwork.
  k('2026-10-06T18:00:00Z', { type: 'session.started', session: 'kv-1', builder: 'claude-code', revision: 1 });
  k('2026-10-06T18:02:00Z', { type: 'step.started', session: 'kv-1', step: 'costs' });
  k('2026-10-06T18:31:00Z', { type: 'file.changed', session: 'kv-1', path: 'boxout/keepers/costs.py', added: 142, removed: 0 });
  k('2026-10-06T18:33:00Z', { type: 'step.completed', session: 'kv-1', step: 'costs' });
  k('2026-10-06T18:34:00Z', { type: 'step.started', session: 'kv-1', step: 'model' });
  k('2026-10-06T19:20:00Z', { type: 'file.changed', session: 'kv-1', path: 'boxout/keepers/surplus.py', added: 208, removed: 0 });
  k('2026-10-06T19:24:00Z', { type: 'test.run', session: 'kv-1', command: 'pytest tests/keepers', passed: 18, failed: 0 });
  k('2026-10-06T19:25:00Z', { type: 'step.completed', session: 'kv-1', step: 'model' });
  k('2026-10-06T19:26:00Z', { type: 'session.ended', session: 'kv-1', outcome: 'finished' });

  // Second session: Patrick, by hand. The same plan, the same steps.
  k('2026-10-08T20:15:00Z', { type: 'session.started', session: 'kv-2', builder: 'manual', revision: 1 });
  k('2026-10-08T21:02:00Z', { type: 'step.completed', session: 'kv-2', step: 'endpoint' });
  k('2026-10-08T22:10:00Z', { type: 'step.completed', session: 'kv-2', step: 'view' });
  k('2026-10-08T22:11:00Z', { type: 'session.ended', session: 'kv-2', outcome: 'finished' });

  // Third: the agent finishes and says so. That alone changes nothing; the checks decide.
  k('2026-10-09T17:40:00Z', { type: 'session.started', session: 'kv-3', builder: 'claude-code', revision: 1 });
  k('2026-10-09T18:12:00Z', { type: 'step.completed', session: 'kv-3', step: 'phone' });
  k('2026-10-09T18:13:00Z', { type: 'verification.started', session: 'kv-3' });
  k('2026-10-09T18:15:00Z', {
    type: 'criterion.checked',
    session: 'kv-3',
    criterion: 'surplus-matches',
    revision: 1,
    passed: true,
    evidence: '31 passed in 1.84s',
    by: 'claude-code',
  });
  k('2026-10-09T18:16:00Z', {
    type: 'criterion.checked',
    session: 'kv-3',
    criterion: 'loads-fast',
    revision: 1,
    passed: false,
    evidence: 'AssertionError: 3.41s for 14 teams (limit 2.0s)',
    by: 'claude-code',
  });
  k('2026-10-09T18:17:00Z', { type: 'build.completed', session: 'kv-3' });
  k('2026-10-09T18:17:30Z', { type: 'session.ended', session: 'kv-3', outcome: 'finished' });

  // The failure is fixed, and the two checks a machine cannot make are made by people.
  k('2026-10-10T19:00:00Z', { type: 'session.started', session: 'kv-4', builder: 'claude-code', revision: 1 });
  k('2026-10-10T19:22:00Z', { type: 'file.changed', session: 'kv-4', path: 'boxout/keepers/surplus.py', added: 31, removed: 44 });
  k('2026-10-10T19:25:00Z', {
    type: 'criterion.checked',
    session: 'kv-4',
    criterion: 'loads-fast',
    revision: 1,
    passed: true,
    evidence: '1.12s for 14 teams',
    by: 'claude-code',
  });
  k('2026-10-10T19:26:00Z', { type: 'session.ended', session: 'kv-4', outcome: 'finished' });
  k('2026-10-10T21:40:00Z', {
    type: 'criterion.checked',
    session: 'kv-4',
    criterion: 'reads-on-phone',
    revision: 1,
    passed: true,
    evidence: 'Checked on my phone with the 2025 roster. Keep and cut read without scrolling.',
    by: 'patrick',
  });
  k('2026-10-10T22:05:00Z', {
    type: 'criterion.checked',
    session: 'kv-4',
    criterion: 'method-agrees',
    revision: 1,
    passed: true,
    evidence: 'Ten players compared against the draft board; all within one dollar.',
    by: 'codex',
  });

  // Two days later a change elsewhere breaks it. Done is taken away, and someone is on it now.
  k('2026-10-12T09:05:00Z', { type: 'session.started', session: 'kv-5', builder: 'claude-code', revision: 1 });
  k('2026-10-12T09:07:00Z', { type: 'test.run', session: 'kv-5', command: 'pytest tests/keepers', passed: 29, failed: 2 });
  k('2026-10-12T09:08:00Z', {
    type: 'criterion.checked',
    session: 'kv-5',
    criterion: 'surplus-matches',
    revision: 1,
    passed: false,
    evidence: '2 of 31 surplus values differ after the league-store change (traded keepers).',
    by: 'claude-code',
  });
  k('2026-10-12T09:10:00Z', { type: 'agent.message', session: 'kv-5', text: 'Traded keepers now carry two cost rows. Looking at costs.py.' });

  // And one feature that only says what done would mean: specified, not yet planned.
  add('2026-10-05T12:00:00Z', SLEEPER, { type: 'plan.written', plan: sleeperPlan, author: 'patrick', accepted: true });
  return out;
}
