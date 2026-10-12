import { describe, expect, it } from 'vitest';
import { deriveBuild, type BuildEvent, type BuildPlan } from './build';

const plan = (over: Partial<BuildPlan> = {}): BuildPlan => ({
  place: 'p',
  feature: 'auth',
  revision: 1,
  objective: 'People can sign in.',
  criteria: [
    { id: 'c1', statement: 'A valid login returns a session.', verification: { kind: 'command', how: 'npm test auth' } },
    { id: 'c2', statement: 'The sign-in page reads well.', verification: { kind: 'manual', how: 'Look at /login.' } },
  ],
  steps: [
    { id: 's1', title: 'Session store' },
    { id: 's2', title: 'Login route', after: ['s1'] },
  ],
  dependsOn: [],
  ...over,
});

let n = 0;
const base = () => ({ id: `e${n++}`, at: '2026-10-12T10:00:00Z', place: 'p', feature: 'auth' });
const written = (p: BuildPlan, accepted = true): BuildEvent => ({ ...base(), type: 'plan.written', plan: p, author: 'patrick', accepted });
const session = (): BuildEvent => ({ ...base(), type: 'session.started', session: 'x', builder: 'claude-code', revision: 1 });
const step = (id: string): BuildEvent => ({ ...base(), type: 'step.completed', session: 'x', step: id });
const check = (criterion: string, passed: boolean, revision = 1): BuildEvent => ({
  ...base(),
  type: 'criterion.checked',
  session: 'x',
  criterion,
  revision,
  passed,
  evidence: '',
  by: 'patrick',
});

const allDone = () => true;

describe('deriveBuild', () => {
  it('is an idea until it says what done means', () => {
    expect(deriveBuild([], allDone).stage).toBe('idea');
    expect(deriveBuild([written(plan({ criteria: [] }))], allDone).stage).toBe('idea');
    expect(deriveBuild([written(plan({ objective: ' ' }))], allDone).stage).toBe('idea');
  });

  it('is specified with criteria and no steps, and ready once it has steps and nothing in the way', () => {
    expect(deriveBuild([written(plan({ steps: [] }))], allDone).stage).toBe('specified');
    expect(deriveBuild([written(plan())], allDone).stage).toBe('ready');
  });

  it('stays planned while a dependency is outstanding or a blocker is open', () => {
    const waiting = deriveBuild([written(plan({ dependsOn: ['p/store'] }))], () => false);
    expect(waiting.stage).toBe('planned');
    expect(waiting.waitingOn).toEqual(['p/store']);

    const blocked: BuildEvent[] = [written(plan()), { ...base(), type: 'blocker.raised', blocker: 'b', reason: 'No API key.', by: 'patrick' }];
    expect(deriveBuild(blocked, allDone).stage).toBe('planned');
    expect(deriveBuild([...blocked, { ...base(), type: 'blocker.cleared', blocker: 'b' }], allDone).stage).toBe('ready');
  });

  it('is building from the first session until every step is finished', () => {
    const s = deriveBuild([written(plan()), session(), step('s1')], allDone);
    expect(s.stage).toBe('building');
    expect(s.progress).toBe(0.5);
    expect(s.activeSession?.builder).toBe('claude-code');
  });

  it('a builder saying it is finished does not make it done', () => {
    const events: BuildEvent[] = [written(plan()), session(), step('s1'), step('s2'), { ...base(), type: 'build.completed', session: 'x' }];
    expect(deriveBuild(events, allDone).stage).toBe('verifying');
  });

  it('is done only when every criterion has passed, and a failure holds it at verifying', () => {
    const built: BuildEvent[] = [written(plan()), session(), step('s1'), step('s2')];
    expect(deriveBuild([...built, check('c1', true)], allDone).stage).toBe('verifying');
    expect(deriveBuild([...built, check('c1', true), check('c2', false)], allDone).stage).toBe('verifying');
    expect(deriveBuild([...built, check('c1', true), check('c2', true)], allDone).stage).toBe('done');
    // The latest verdict wins: a regression takes done away again.
    expect(deriveBuild([...built, check('c1', true), check('c2', true), check('c1', false)], allDone).stage).toBe('verifying');
  });

  it('a revised plan voids verdicts given on the old one', () => {
    const events: BuildEvent[] = [written(plan()), session(), step('s1'), step('s2'), check('c1', true), check('c2', true)];
    expect(deriveBuild(events, allDone).stage).toBe('done');
    const revised = deriveBuild([...events, written(plan({ revision: 2 }))], allDone);
    expect(revised.stage).toBe('verifying');
    // A verdict recorded against the old revision afterwards still does not count.
    expect(deriveBuild([...events, written(plan({ revision: 2 })), check('c1', true, 1)], allDone).criteriaPassed).toEqual([]);
  });

  it('an unaccepted draft changes nothing', () => {
    const s = deriveBuild([written(plan()), written(plan({ revision: 2, steps: [] }), false)], allDone);
    expect(s.stage).toBe('ready');
    expect(s.draft?.revision).toBe(2);
  });

  it('manual work and agent work reach done the same way', () => {
    const by = (builder: 'manual' | 'codex'): BuildEvent[] => [
      written(plan()),
      { ...base(), type: 'session.started', session: 'x', builder, revision: 1 },
      step('s1'),
      step('s2'),
      check('c1', true),
      check('c2', true),
    ];
    expect(deriveBuild(by('manual'), allDone).stage).toBe('done');
    expect(deriveBuild(by('codex'), allDone).stage).toBe('done');
  });
});
