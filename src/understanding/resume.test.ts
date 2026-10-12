import { describe, expect, it } from 'vitest';
import type { FeatureState, PlaceState, WorldState } from '../world/types';
import { fixtureUnderstanding } from './fixtures';
import {
  BANNED_WORDS,
  RESUME_RULES,
  resumePoints,
  wordingProblems,
  worldSuggestions,
  type ResumePoint,
  type WorldSuggestion,
} from './resume';
import { TODAY, build, building, feature, freeze, place, plan, privateJson, realWorld, specimen, strings, working, world } from './testkit';
import { isProjectUnderstanding, type Claim, type ProjectUnderstanding } from './types';

const LEAD = 'Pick up here because ';

function understanding(over: Partial<ProjectUnderstanding> = {}): ProjectUnderstanding {
  const claim = (value: string): Claim<string> => ({ value, confidence: 'high', sources: ['README.md'] });
  return {
    place: 'p',
    whatThisIs: claim('A test project.'),
    capabilities: [],
    maturity: claim('Early.'),
    recentWork: claim('Some.'),
    unfinished: [],
    openQuestions: [],
    nextSteps: [],
    provenance: { generator: 'test', generatedAt: '2026-10-12T08:00:00Z', basedOn: {}, advisory: true },
    ...over,
  };
}

const only = (points: ResumePoint[], rule: ResumePoint['rule']): ResumePoint => {
  const hit = points.find((p) => p.rule === rule);
  if (hit === undefined) throw new Error(`no ${rule} among ${points.map((p) => p.rule).join(', ') || 'nothing'}`);
  return hit;
};

/** The rules every suggestion must keep, whatever produced it. */
function expectHonest(s: ResumePoint | WorldSuggestion, features: readonly FeatureState[], placeName: string): void {
  expect(s.because.startsWith(LEAD), s.because).toBe(true);
  expect(s.because.endsWith('.'), s.because).toBe(true);
  expect(s.evidence.length, s.title).toBeGreaterThan(0);
  // A world suggestion may carry one further piece of evidence: what a reading of the project suggests.
  expect(s.evidence.length).toBeLessThanOrEqual(RESUME_RULES.caps.evidence + ('question' in s ? 1 : 0));
  for (const text of [s.title, s.because, ...s.evidence.map((e) => e.what)]) {
    expect(wordingProblems(text), text).toEqual([]);
    expect(text.trim()).not.toBe('');
    // No productivity score, percentage, streak or tally. His own names and quoted words are his.
    let generated = text.replace(/"[^"]*"/g, '');
    for (const name of [...features.map((f) => f.name), placeName]) generated = generated.split(name).join('');
    expect(generated, text).not.toMatch(/\bscore\b|%|\bpercent\b|\bstreak\b|\bproductiv/i);
  }
  for (const e of s.evidence) expect(e.source.trim(), s.title).not.toBe('');

  // No generic advice: the reason names something concrete that its own evidence also carries:
  // a feature, a quoted statement, a number (a date, a count of work done) or a source.
  const evidence = s.evidence.map((e) => `${e.what} ${e.source}`).join(' ');
  const concrete: string[] = [
    ...features.map((f) => f.name),
    placeName,
    ...(evidence.match(/"[^"]+"/g) ?? []),
    ...(evidence.match(/\d+/g) ?? []),
    ...s.evidence.map((e) => e.source),
  ].filter((t) => t.length > 0 && evidence.includes(t));
  expect(concrete.some((t) => s.because.includes(t)), `${s.because} <- ${evidence}`).toBe(true);
}

function expectPoint(p: ResumePoint, where: PlaceState): void {
  expectHonest(p, where.features, where.name);
  expect(p.place).toBe(where.id);
  expect(p.strength).toBeGreaterThan(0);
  expect(p.strength).toBeLessThanOrEqual(1);
  if (p.feature !== undefined) expect(where.features.some((f) => f.id === p.feature)).toBe(true);
}

// ───────────────────────── Build-plan rules ─────────────────────────

describe('build plan rules', () => {
  const withBuild = (b: Parameters<typeof build>[0], over: Partial<FeatureState> = {}): PlaceState =>
    place({ features: [feature({ id: 'f', name: 'Keeper value sheet', stage: 'building', build: build(b), ...over })] });

  it('open-session: says who has it open and since when', () => {
    const p = withBuild({ stage: 'building', stepsDone: ['s1'], progress: 1 / 3, activeSession: { session: 'sess-9', builder: 'claude-code', since: '2026-10-11T19:04:00Z' } });
    const point = only(resumePoints(p, TODAY), 'open-session');
    expect(point.kind).toBe('continue');
    expect(point.because).toBe('Pick up here because a claude-code session on Keeper value sheet has been open since 11 October 2026.');
    expect(point.evidence[0]).toMatchObject({ source: 'session sess-9', at: '2026-10-11T19:04:00Z' });
    expect(point.strength).toBe(RESUME_RULES.openSession.strength);
    expectPoint(point, p);
  });

  it('open-blocker: kind is unblock and it says what is blocking', () => {
    const p = withBuild({ stage: 'building', stepsDone: ['s1'], openBlockers: [{ blocker: 'b1', reason: 'ESPN changed the keeper endpoint.' }] });
    const point = only(resumePoints(p, TODAY), 'open-blocker');
    expect(point.kind).toBe('unblock');
    expect(point.title).toBe('Clear what is blocking Keeper value sheet');
    expect(point.because).toBe('Pick up here because Keeper value sheet is blocked: "ESPN changed the keeper endpoint".');
    expectPoint(point, p);
  });

  it('failing-criterion: names the check that failed', () => {
    const p = withBuild({ stage: 'verifying', stepsDone: ['s1', 's2', 's3'], progress: 1, criteriaFailed: ['c1'] });
    const points = resumePoints(p, TODAY);
    const point = only(points, 'failing-criterion');
    expect(point.kind).toBe('verify');
    expect(point.because).toContain('"Values match the 2025 auction within two dollars"');
    // A failure is not also reported as merely unchecked.
    expect(points.some((x) => x.rule === 'unchecked-criteria')).toBe(false);
    expectPoint(point, p);
  });

  it('unchecked-criteria: one check left is a quick finish, named and not counted', () => {
    const p = withBuild({ stage: 'verifying', stepsDone: ['s1', 's2', 's3'], progress: 1, criteriaPassed: ['c1'] });
    const point = only(resumePoints(p, TODAY), 'unchecked-criteria');
    expect(point).toMatchObject({ kind: 'finish-quickly', effort: 'quick', title: 'Finish verifying Keeper value sheet' });
    expect(point.because).toBe('Pick up here because every step of Keeper value sheet is finished and the last check is "The sheet opens on a phone".');
    expectPoint(point, p);
  });

  it('unchecked-criteria: several left is a verify session that names the next check', () => {
    const p = withBuild({ stage: 'verifying', stepsDone: ['s1', 's2', 's3'], progress: 1 });
    const point = only(resumePoints(p, TODAY), 'unchecked-criteria');
    expect(point).toMatchObject({ kind: 'verify', effort: 'session' });
    expect(point.because).toContain('the next check is "Values match the 2025 auction within two dollars"');
    expect(point.because).not.toMatch(/\b2 (criteria|checks)\b/);
    expectPoint(point, p);
  });

  it('unfinished-steps: continues with the next step whose prerequisites are finished', () => {
    const p = withBuild({ stage: 'building', stepsDone: ['s1'], progress: 1 / 3 });
    const point = only(resumePoints(p, TODAY), 'unfinished-steps');
    expect(point).toMatchObject({ kind: 'continue', effort: 'session', title: 'Continue Keeper value sheet: Fit the keeper discount' });
    expect(point.because).toBe('Pick up here because 1 of 3 steps of Keeper value sheet are finished and the next step is "Fit the keeper discount".');
    expectPoint(point, p);
  });

  it('unfinished-steps: prefers a step already started, and one step left is a quick finish', () => {
    const steps = [{ id: 'a', title: 'First' }, { id: 'b', title: 'Second' }, { id: 'c', title: 'Third' }];
    const started = withBuild({ stage: 'building', plan: plan({ steps }), stepsStarted: ['c'], progress: 0 });
    expect(only(resumePoints(started, TODAY), 'unfinished-steps').title).toBe('Continue Keeper value sheet: Third');

    const last = withBuild({ stage: 'building', stepsDone: ['s1', 's2'], progress: 2 / 3 });
    const point = only(resumePoints(last, TODAY), 'unfinished-steps');
    expect(point).toMatchObject({ kind: 'finish-quickly', effort: 'quick', title: 'Finish Keeper value sheet: Render the sheet' });
    expect(point.because).toContain('the last step is "Render the sheet"');
    expectPoint(point, last);
  });

  it('unfinished-steps: a long plan barely begun is a deeper session', () => {
    const steps = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((title, i) => ({ id: `s${i}`, title }));
    const p = withBuild({ stage: 'building', plan: plan({ steps }), stepsDone: ['s0'], progress: 1 / 6 });
    expect(only(resumePoints(p, TODAY), 'unfinished-steps')).toMatchObject({ kind: 'deeper-session', effort: 'deep' });
  });

  it('ready-plan: a written, unblocked, unstarted plan can be started', () => {
    const p = withBuild({ stage: 'ready' }, { stage: 'planned' });
    const point = only(resumePoints(p, TODAY), 'ready-plan');
    expect(point.title).toBe("Start Keeper value sheet: Load last season's auction prices");
    expect(point.kind).toBe('continue');
    expectPoint(point, p);
  });

  it('waiting-on: a planned feature names what it waits on', () => {
    const p = withBuild({ stage: 'planned', waitingOn: ['boxout/price-model'] }, { stage: 'planned' });
    const point = only(resumePoints(p, TODAY), 'waiting-on');
    expect(point.kind).toBe('unblock');
    expect(point.because).toBe('Pick up here because Keeper value sheet is planned and waits on "boxout/price-model".');
    expectPoint(point, p);
  });

  it('says nothing about a plan that is done, or one that is only an idea', () => {
    const done = withBuild({ stage: 'done', stepsDone: ['s1', 's2', 's3'], criteriaPassed: ['c1', 'c2'], progress: 1 }, { stage: 'working', lastWorkAt: '2026-01-04' });
    expect(resumePoints(done, TODAY)).toEqual([]);
    const idea = place({ features: [feature({ id: 'f', build: { ...build({ stage: 'idea' }), plan: undefined } })] });
    expect(resumePoints(idea, TODAY)).toEqual([]);
  });

  it('gives one suggestion per feature: the strongest speaks and the rest lend evidence', () => {
    const p = withBuild({
      stage: 'building',
      stepsDone: ['s1'],
      progress: 1 / 3,
      openBlockers: [{ blocker: 'b1', reason: 'No test league' }],
      activeSession: { session: 's', builder: 'codex', since: '2026-10-12T07:00:00Z' },
    });
    const points = resumePoints(p, TODAY);
    expect(points).toHaveLength(1);
    expect(points[0]!.rule).toBe('open-session');
    expect(points[0]!.evidence.map((e) => e.what).join(' ')).toContain('open blocker');
    expect(points[0]!.evidence.length).toBeLessThanOrEqual(RESUME_RULES.caps.evidence);
  });
});

// ───────────────────────── Rules that read work alone ─────────────────────────

describe('rules without a plan', () => {
  it('nearly-done: enough work logged reads as close, and asks him to look, not to finish', () => {
    const p = place({ features: [building('f', { name: 'OAuth helper', progress: 0.85, commits: 83, lastWorkAt: '2026-10-11' })] });
    const point = resumePoints(p, TODAY)[0]!;
    expect(point).toMatchObject({ rule: 'nearly-done', kind: 'finish-quickly', title: 'Check how close OAuth helper is to done' });
    // Without a plan nothing says how much is left, so it is not called quick.
    expect(point.effort).toBe('session');
    expect(point.because).toContain('83 commits');
    expectPoint(point, p);
    expect(resumePoints(place({ features: [building('f', { progress: RESUME_RULES.nearlyDone.progress - 0.01 })] }), TODAY).some((x) => x.rule === 'nearly-done')).toBe(false);
  });

  it('building-recent: a feature in building worked on lately is continued', () => {
    const p = place({ features: [building('f', { name: 'Season report', lastWorkAt: '2026-10-04', commits: 16 })] });
    const point = resumePoints(p, TODAY)[0]!;
    expect(point).toMatchObject({ rule: 'building-recent', kind: 'continue' });
    expect(point.because).toBe('Pick up here because Season report is in building and was last worked on in the week to 4 October 2026, with 16 commits so far.');
    expectPoint(point, p);
    // Three weeks on, it is no longer recent.
    const stale = place({ features: [building('f', { lastWorkAt: '2026-09-21' })] });
    expect(resumePoints(stale, TODAY).some((x) => x.rule === 'building-recent')).toBe(false);
  });

  it('stopped-abruptly: names the feature, the count and the dates', () => {
    const f = building('f', { name: 'Staples rhythm', commits: 17, lastWorkAt: '2026-06-14', stagedAt: { building: '2026-05-31' } });
    const p = place({ liveliness: 'quiet', features: [f] });
    const point = resumePoints(p, TODAY)[0]!;
    expect(point).toMatchObject({ rule: 'stopped-abruptly', kind: 'pick-back-up', title: 'Pick Staples rhythm back up' });
    expect(point.because).toBe('Pick up here because 17 commits went into Staples rhythm between 31 May 2026 and the week to 14 June 2026, and none since.');
    expectPoint(point, p);

    const S = RESUME_RULES.stoppedAbruptly;
    const few = place({ liveliness: 'quiet', features: [{ ...f, commits: S.minCommits - 1 }] });
    expect(resumePoints(few, TODAY).some((x) => x.rule === 'stopped-abruptly')).toBe(false);
    const slow = place({ liveliness: 'quiet', features: [{ ...f, stagedAt: { building: '2026-01-04' } }] });
    expect(resumePoints(slow, TODAY).some((x) => x.rule === 'stopped-abruptly')).toBe(false);
  });

  it('left-in-building: slower work that stopped is still unfinished, if there is enough of it', () => {
    const f = building('f', { name: 'Zone splits', commits: 9, lastWorkAt: '2026-07-12', stagedAt: { building: '2026-01-04' } });
    // A second, finished feature was touched later, so this one is not simply "where he left off".
    const later = working('w', { lastWorkAt: '2026-07-19' });
    const p = place({ liveliness: 'quiet', features: [f, later] });
    const point = only(resumePoints(p, TODAY), 'left-in-building');
    expect(point.kind).toBe('pick-back-up');
    expect(point.because).toContain('9 commits logged, the last in the week to 12 July 2026');
    expectPoint(point, p);
    const thin = place({ liveliness: 'quiet', features: [{ ...f, commits: RESUME_RULES.leftInBuilding.minCommits - 1 }, later] });
    expect(resumePoints(thin, TODAY)).toEqual([]);
  });

  it('last-touched: answers "where did I leave off" with the most recent work', () => {
    const p = place({
      liveliness: 'settled',
      features: [working('a', { name: 'Stdio transport', lastWorkAt: '2026-08-02' }), working('b', { name: 'Tool call recorder', lastWorkAt: '2026-09-06' })],
    });
    const points = resumePoints(p, TODAY);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ rule: 'last-touched', feature: 'b', kind: 'pick-back-up', title: 'Return to Tool call recorder' });
    expect(points[0]!.because).toBe('Pick up here because Tool call recorder is the last thing worked on in Testville, in the week to 6 September 2026.');
    expectPoint(points[0]!, p);
    // Within three weeks it is a continuation.
    const fresh = place({ features: [working('b', { lastWorkAt: '2026-10-04' })] });
    expect(resumePoints(fresh, TODAY)[0]).toMatchObject({ rule: 'last-touched', kind: 'continue' });
  });

  it('concentrated-work: recent commits gathered on one feature', () => {
    const p = place({
      features: [
        working('a', { name: 'Draft', heat: 0.9, lastWorkAt: '2026-10-11' }),
        working('b', { name: 'Scoring', heat: 0.2, lastWorkAt: '2026-10-04' }),
        working('c', { name: 'Mail', heat: 0.1, lastWorkAt: '2026-09-27' }),
      ],
    });
    const point = resumePoints(p, TODAY)[0]!;
    expect(point).toMatchObject({ rule: 'concentrated-work', feature: 'a', kind: 'continue' });
    expect(point.because).toBe('Pick up here because most of the recent work in Testville went into Draft, the last in the week to 11 October 2026.');
    expectPoint(point, p);

    const spread = place({ features: [working('a', { heat: 0.5, lastWorkAt: '2026-10-11' }), working('b', { heat: 0.5, lastWorkAt: '2026-10-11' }), working('c', { heat: 0.5, lastWorkAt: '2026-10-11' })] });
    expect(resumePoints(spread, TODAY).some((x) => x.rule === 'concentrated-work')).toBe(false);
    const alone = place({ features: [working('a', { heat: 0.9, lastWorkAt: '2026-10-11' })] });
    expect(resumePoints(alone, TODAY).some((x) => x.rule === 'concentrated-work')).toBe(false);
  });
});

// ───────────────────────── Understanding ─────────────────────────

describe('suggestions from an understanding', () => {
  const quiet = (): PlaceState => place({ liveliness: 'settled', features: [working('a', { name: 'Draft room', note: 'app/draft/', lastWorkAt: '2026-06-07' })] });

  it('uses the pick-up, a next step and an unfinished item, each citing its sources', () => {
    const p = quiet();
    const u = understanding({
      pickUp: { value: 'Run the rehearsal end to end.', confidence: 'high', sources: ['commit 10a0a68', 'docs/draft_night.md'] },
      nextSteps: [{ value: 'Replace the mock calendar', confidence: 'medium', sources: ['README.md'] }],
      unfinished: [{ value: 'Issue #4 "Offline mode" is open, last updated 3 March 2026', confidence: 'high', sources: ['issue #4'] }],
    });
    const points = resumePoints(p, TODAY, u);
    // At most two from an understanding, however much it offers.
    expect(points.filter((x) => x.rule.startsWith('understanding'))).toHaveLength(RESUME_RULES.caps.fromUnderstanding);
    const pick = only(points, 'understanding-pick-up');
    expect(pick.title).toBe('Run the rehearsal end to end');
    expect(pick.because).toBe('Pick up here because commit 10a0a68 and docs/draft_night.md point to it, in a reading of the project made on 12 October 2026.');
    expect(pick.evidence[0]).toMatchObject({ source: 'commit 10a0a68; docs/draft_night.md', at: '2026-10-12T08:00:00Z' });
    expect(pick.kind).toBe('pick-back-up');
    for (const x of points) expectPoint(x, p);

    const open = only(resumePoints(p, TODAY, understanding({ unfinished: u.unfinished })), 'understanding-unfinished');
    expect(open.title).toBe('Return to what issue #4 leaves open');
    expect(open.because).toBe('Pick up here because issue #4 shows this, as read on 12 October 2026: Issue #4 "Offline mode" is open, last updated 3 March 2026.');
  });

  it('never uses a low-confidence claim or one with no source', () => {
    const u = understanding({
      pickUp: { value: 'Rewrite it in Rust', confidence: 'low', sources: ['README.md'] },
      nextSteps: [{ value: 'Add tests', confidence: 'high', sources: [] }],
      unfinished: [{ value: 'Probably unfinished', confidence: 'low', sources: ['README.md'] }],
    });
    expect(resumePoints(quiet(), TODAY, u).some((x) => x.rule.startsWith('understanding'))).toBe(false);
  });

  it('attaches a claim to the feature it names, by name or by directory', () => {
    const byName = understanding({ pickUp: { value: 'Finish the Draft room levers', confidence: 'high', sources: ['commit abc1234'] } });
    expect(only(resumePoints(quiet(), TODAY, byName), 'understanding-pick-up').feature).toBe('a');
    const byPath = understanding({ pickUp: { value: 'Continue the auction work', confidence: 'high', sources: ['app/draft/'] } });
    expect(only(resumePoints(quiet(), TODAY, byPath), 'understanding-pick-up').feature).toBe('a');
    const neither = understanding({ pickUp: { value: 'Write the release notes', confidence: 'high', sources: ['README.md'] } });
    expect(only(resumePoints(quiet(), TODAY, neither), 'understanding-pick-up').feature).toBeUndefined();
  });

  it('is advisory: it never outranks what a build plan says', () => {
    const p = place({ features: [feature({ id: 'f', name: 'Keeper value sheet', stage: 'building', build: build({ stage: 'building', stepsDone: ['s1'], progress: 1 / 3 }) })] });
    const u = understanding({ pickUp: { value: 'Do something else entirely', confidence: 'high', sources: ['README.md'] } });
    const points = resumePoints(p, TODAY, u);
    expect(points[0]!.rule).toBe('unfinished-steps');
    expect(points.at(-1)!.rule).toBe('understanding-pick-up');
    // By construction, not by luck: every rule that reads a plan is stronger than the strongest claim can be.
    const strongestClaim = Math.max(RESUME_RULES.understanding.high, RESUME_RULES.understanding.medium) + RESUME_RULES.recency.add;
    const R = RESUME_RULES;
    const planRules = [R.openSession, R.openBlocker, R.failingCriterion, R.uncheckedCriteria, R.unfinishedSteps, R.readyPlan, R.waitingOn];
    for (const rule of planRules) expect(rule.strength).toBeGreaterThan(strongestClaim);
    // And a high-confidence claim comes ahead of what commits alone suggest.
    expect(R.understanding.high).toBeGreaterThan(R.nearlyDone.strength);
    expect(R.nearlyDone.strength).toBeGreaterThan(R.buildingRecent.strength + R.buildingRecent.progressAdd);
  });

  it('may word a suggestion about a feature, but the world still says what kind of work it is', () => {
    const p = place({ features: [building('f', { name: 'OAuth helper', progress: 0.9, commits: 83, lastWorkAt: '2026-10-11' })] });
    const u = understanding({ pickUp: { value: 'Finish the OAuth helper, the reason this place was reopened', confidence: 'high', sources: ['place note of 30 August 2026'] } });
    const points = resumePoints(p, TODAY, u);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ rule: 'understanding-pick-up', feature: 'f', kind: 'finish-quickly', title: 'Finish the OAuth helper, the reason this place was reopened' });
    // The claim's own source first, then what the work log lends it.
    expect(points[0]!.evidence[0]!.source).toBe('place note of 30 August 2026');
    expect(points[0]!.evidence.slice(1).every((e) => e.source === 'work log')).toBe(true);
    expect(points[0]!.evidence.length).toBeGreaterThan(1);
  });

  it('drops a claim whose own wording breaks the rules, instead of repeating it', () => {
    const u = understanding({ pickUp: { value: 'You should fix the overdue login bug!', confidence: 'high', sources: ['README.md'] } });
    expect(resumePoints(quiet(), TODAY, u).some((x) => x.rule.startsWith('understanding'))).toBe(false);
  });

  it('does not offer the same action twice when the pick-up is also the first next step', () => {
    const same: Claim<string> = { value: 'Finish the OAuth helper', confidence: 'high', sources: ['place note'] };
    const points = resumePoints(quiet(), TODAY, understanding({ pickUp: same, nextSteps: [same] }));
    expect(points.filter((x) => x.title === 'Finish the OAuth helper')).toHaveLength(1);
  });
});

// ───────────────────────── Ideas, sleep and silence ─────────────────────────

describe('promote-idea', () => {
  const idea = (over: Partial<PlaceState>): PlaceState => place({ rank: 'site', liveliness: 'quiet', commits: 0, activeWeeks: 0, foundedAt: '2025-02-23', ...over });

  it('observes an idea that has been returned to several times', () => {
    const p = idea({
      notes: [{ at: '2025-03-02', note: 'Every receipt in one drawer.' }],
      features: [feature({ id: 'scan', name: 'Receipt scanner', proposedAt: '2025-03-09' })],
    });
    const points = resumePoints(p, TODAY);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ rule: 'promote-idea', kind: 'promote-idea', effort: 'quick', title: 'Give Testville a second look' });
    expect(points[0]!.because).toBe('Pick up here because Testville has no work logged and it has been returned to 2 times since it was founded, most recently on 9 March 2025.');
    expect(points[0]!.feature).toBeUndefined();
    expectPoint(points[0]!, p);
  });

  it('observes an idea he came back to long after founding it', () => {
    const p = idea({ notes: [{ at: '2026-04-12', note: 'Did it out of a shoebox again this year!' }] });
    const point = resumePoints(p, TODAY)[0]!;
    expect(point.because).toBe('Pick up here because Testville has no work logged and a note was added on 12 April 2026, 14 months after it was founded.');
    // His own words are quoted, without the exclamation mark.
    expect(point.evidence[0]!.what).toBe('A note was added to Testville: "Did it out of a shoebox again this year"');
    expectPoint(point, p);
  });

  it('leaves a spark alone: one early thought, or none, is not a reason', () => {
    expect(resumePoints(idea({ rank: 'spark' }), TODAY)).toEqual([]);
    expect(resumePoints(idea({ notes: [{ at: '2025-03-02', note: 'One more thought.' }] }), TODAY)).toEqual([]);
    expect(resumePoints(idea({ features: [feature({ id: 'x', proposedAt: '2025-03-02' })] }), TODAY)).toEqual([]);
  });

  it('is not for places with work, or abandoned ones', () => {
    const notes = [{ at: '2025-03-02', note: 'a' }, { at: '2025-04-06', note: 'b' }];
    expect(resumePoints(idea({ notes, commits: 3, rank: 'outpost' }), TODAY).some((x) => x.kind === 'promote-idea')).toBe(false);
    expect(resumePoints(idea({ notes, abandonedAt: '2025-06-01', liveliness: 'ruins' }), TODAY)).toEqual([]);
  });
});

describe('dormant, ruined and abandoned places', () => {
  const sleeping = (features: FeatureState[], over: Partial<PlaceState> = {}): PlaceState => place({ liveliness: 'dormant', rank: 'town', features, ...over });

  it('gives a dormant place one gentle pick-back-up, about its most advanced unfinished feature', () => {
    const p = sleeping([
      working('a', { lastWorkAt: '2025-08-10' }),
      building('b', { name: 'Zone splits', commits: 6, progress: 0.07, lastWorkAt: '2026-01-11', stagedAt: { building: '2025-12-21' } }),
      building('c', { name: 'Cloud backup', commits: 30, progress: 0.4, lastWorkAt: '2025-11-02', stagedAt: { building: '2025-06-01' } }),
    ]);
    const points = resumePoints(p, TODAY);
    expect(points).toHaveLength(RESUME_RULES.dormant.max);
    expect(points[0]).toMatchObject({ rule: 'dormant-pick-back-up', kind: 'pick-back-up', feature: 'c', title: 'Pick Cloud backup back up', strength: RESUME_RULES.dormant.strength });
    expect(points[0]!.because).toBe('Pick up here because Cloud backup in Testville was left in building with 30 commits logged, untouched since January 2026.');
    expectPoint(points[0]!, p);
  });

  it('says how far a plan had got', () => {
    const f = feature({ id: 'f', name: 'Keeper value sheet', stage: 'building', lastWorkAt: '2026-02-01', commits: 2, build: build({ stage: 'building', stepsDone: ['s1', 's2'], progress: 2 / 3 }) });
    const point = resumePoints(sleeping([f]), TODAY)[0]!;
    expect(point.because).toBe('Pick up here because Keeper value sheet in Testville was left with 2 of 3 steps finished, untouched since February 2026.');
  });

  it('gives a dormant place nothing when nothing is unfinished, or the unfinished work is slight', () => {
    expect(resumePoints(sleeping([working('a', { lastWorkAt: '2026-01-11' })]), TODAY)).toEqual([]);
    const slight = building('b', { commits: RESUME_RULES.dormant.minCommits - 1, lastWorkAt: '2026-01-11' });
    expect(resumePoints(sleeping([slight]), TODAY)).toEqual([]);
  });

  it('does not let a claim about a feature hide what the world knows about it', () => {
    const f = building('b', { name: 'Zone splits', commits: 6, progress: 0.07, lastWorkAt: '2026-01-11', stagedAt: { building: '2025-12-21' } });
    const u = understanding({
      unfinished: [{ value: 'Zone splits has been in building since 21 December 2025', confidence: 'high', sources: ['feature: Zone splits'] }],
      pickUp: { value: 'Pick Zone splits back up where it stopped', confidence: 'medium', sources: ['place note'] },
    });
    const points = resumePoints(sleeping([f]), TODAY, u);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ feature: 'b', title: 'Pick Zone splits back up' });
    expect(points[0]!.because).toBe('Pick up here because Zone splits in Testville was left in building with 6 commits logged, untouched since January 2026.');
  });

  it('lets an understanding stir a dormant place only through its explicit pick-up', () => {
    const p = sleeping([working('a', { lastWorkAt: '2026-01-11' })]);
    const loose = understanding({ unfinished: [{ value: 'The README is still a template', confidence: 'high', sources: ['README.md'] }], nextSteps: [{ value: 'Write the README', confidence: 'high', sources: ['README.md'] }] });
    expect(resumePoints(p, TODAY, loose)).toEqual([]);
    const pick = understanding({ pickUp: { value: 'Run the hardware diagnostic on the Pi', confidence: 'medium', sources: ['commit 7a07368'] } });
    const points = resumePoints(p, TODAY, pick);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ rule: 'dormant-pick-back-up', kind: 'pick-back-up' });
    expect(points[0]!.because).toContain('Testville has been untouched since January 2026.');
    expectPoint(points[0]!, p);
  });

  it('treats a place ruined by long silence like a dormant one', () => {
    const p = sleeping([building('b', { commits: 25, lastWorkAt: '2024-03-31', stagedAt: { building: '2024-03-03' } })], { liveliness: 'ruins' });
    expect(resumePoints(p, TODAY)).toHaveLength(1);
  });

  it('gives an abandoned place nothing at all', () => {
    const f = building('b', { commits: 55, progress: 0.9, lastWorkAt: '2024-03-31' });
    const p = sleeping([f], { liveliness: 'ruins', abandonedAt: '2024-06-09', abandonedNote: 'Too broad.' });
    const u = understanding({ pickUp: { value: 'Revive it', confidence: 'high', sources: ['README.md'] } });
    expect(resumePoints(p, TODAY, u)).toEqual([]);
    expect(worldSuggestions(world([p]), TODAY)).toEqual([]);
  });
});

describe('a place with nothing unfinished', () => {
  it('returns an empty list, which is a legitimate answer', () => {
    const p = place({ liveliness: 'quiet', rank: 'town', features: [working('a', { lastWorkAt: '2026-05-03' }), working('b', { lastWorkAt: '2026-04-05' }), feature({ id: 'c', stage: 'planned' })] });
    expect(resumePoints(p, TODAY)).toEqual([]);
    expect(resumePoints(place(), TODAY)).toEqual([]);
  });
});

// ───────────────────────── Ordering, caps, determinism ─────────────────────────

describe('ordering and caps', () => {
  const busy = (): PlaceState =>
    place({
      features: [
        building('a', { name: 'Alpha', lastWorkAt: '2026-10-11', progress: 0.2 }),
        building('b', { name: 'Bravo', lastWorkAt: '2026-10-04', progress: 0.9, commits: 90 }),
        building('c', { name: 'Charlie', lastWorkAt: '2026-10-11', progress: 0.5 }),
        building('d', { name: 'Delta', lastWorkAt: '2026-09-27', progress: 0.3 }),
        building('e', { name: 'Echo', lastWorkAt: '2026-10-11', progress: 0.1 }),
        feature({ id: 'f', name: 'Foxtrot', stage: 'building', build: build({ stage: 'verifying', stepsDone: ['s1', 's2', 's3'], progress: 1, criteriaPassed: ['c1'] }) }),
        feature({ id: 'g', name: 'Golf', stage: 'building', build: build({ stage: 'building', stepsDone: ['s1'], openBlockers: [{ blocker: 'x', reason: 'Waiting for an API key' }] }) }),
      ],
    });

  it('returns at most four, best first, one per feature', () => {
    const points = resumePoints(busy(), TODAY);
    expect(points).toHaveLength(RESUME_RULES.caps.perPlace);
    for (let i = 1; i < points.length; i++) expect(points[i - 1]!.strength).toBeGreaterThanOrEqual(points[i]!.strength);
    expect(new Set(points.map((p) => p.feature)).size).toBe(points.length);
    // What a plan says comes before what commits suggest.
    expect(points.map((p) => p.rule).slice(0, 2)).toEqual(['open-blocker', 'unchecked-criteria']);
    expect(points[2]).toMatchObject({ rule: 'nearly-done', feature: 'b' });
  });

  it('between equals, the more recently worked on comes first', () => {
    const p = place({ features: [building('a', { lastWorkAt: '2026-09-27', progress: 0.3 }), building('b', { lastWorkAt: '2026-10-11', progress: 0.3 })] });
    expect(resumePoints(p, TODAY).map((x) => x.feature)).toEqual(['b', 'a']);
  });

  it('is deterministic, does not depend on feature order, and never mutates what it reads', () => {
    const p = freeze(busy());
    const first = resumePoints(p, TODAY);
    expect(resumePoints(p, TODAY)).toEqual(first);
    const reversed = freeze({ ...busy(), features: busy().features.reverse() });
    expect(resumePoints(reversed, TODAY)).toEqual(first);
    const u = freeze(understanding({ pickUp: { value: 'Tidy Alpha', confidence: 'high', sources: ['commit abc1234'] } }));
    expect(resumePoints(p, TODAY, u)).toEqual(resumePoints(p, TODAY, u));
  });

  it('reads `today`, not a clock: the same place on a later day gives a different answer', () => {
    const p = place({ features: [building('a', { lastWorkAt: '2026-10-04', commits: 12, stagedAt: { building: '2026-09-20' } })] });
    expect(resumePoints(p, '2026-10-12')[0]!.rule).toBe('building-recent');
    expect(resumePoints({ ...p, liveliness: 'settled' }, '2026-11-30')[0]!.rule).toBe('stopped-abruptly');
    expect(resumePoints(p, '2026-10-12T23:59:00Z')).toEqual(resumePoints(p, '2026-10-12'));
  });
});

// ───────────────────────── World level ─────────────────────────

describe('worldSuggestions', () => {
  const series = [{ month: '2026-08', commits: 4 }, { month: '2026-09', commits: 30 }, { month: '2026-10', commits: 22 }];
  const lively = (): PlaceState =>
    place({
      id: 'lively',
      name: 'Lively',
      rank: 'town',
      heat: 0.9,
      series,
      features: [working('l1', { place: 'lively', name: 'Engine', heat: 0.8, lastWorkAt: '2026-10-11' }), working('l2', { place: 'lively', name: 'Shell', heat: 0.3, lastWorkAt: '2026-10-04' })],
    });
  const quiet = (): PlaceState =>
    place({
      id: 'quiet',
      name: 'Stillwater',
      rank: 'town',
      liveliness: 'quiet',
      heat: 0,
      users: 6,
      features: [working('q1', { place: 'quiet', lastWorkAt: '2026-03-15' }), working('q2', { place: 'quiet', lastWorkAt: '2026-02-01' }), working('q3', { place: 'quiet', lastWorkAt: '2026-01-04' })],
    });
  const nearly = (): PlaceState =>
    place({
      id: 'nearly',
      name: 'Nearly',
      rank: 'settlement',
      liveliness: 'settled',
      heat: 0.2,
      nextRank: { rank: 'town', needs: ['1 more working feature'] },
      features: [
        working('n1', { place: 'nearly', lastWorkAt: '2026-06-07' }),
        working('n2', { place: 'nearly', lastWorkAt: '2026-06-07' }),
        building('n3', { place: 'nearly', name: 'Third wing', progress: 0.6, commits: 40, lastWorkAt: '2026-09-06', stagedAt: { building: '2026-03-01' } }),
      ],
    });
  const quick = (): PlaceState =>
    place({
      id: 'quick',
      name: 'Quickbrook',
      rank: 'outpost',
      liveliness: 'settled',
      heat: 0.1,
      features: [feature({ id: 'k1', place: 'quick', name: 'Keeper value sheet', stage: 'building', build: build({ stage: 'building', stepsDone: ['s1', 's2'], progress: 2 / 3 }) })],
    });
  const idea = (): PlaceState =>
    place({ id: 'idea', name: 'Tax Drawer', rank: 'site', liveliness: 'dormant', commits: 0, activeWeeks: 0, foundedAt: '2025-02-23', notes: [{ at: '2026-04-12', note: 'Shoebox again.' }] });

  it('answers each question from its own evidence', () => {
    const w = world([lively(), quiet(), nearly(), quick(), idea()]);
    const byQuestion = (q: WorldSuggestion['question'], places: PlaceState[]): WorldSuggestion | undefined => worldSuggestions(world(places), TODAY).find((s) => s.question === q);

    const momentum = byQuestion('momentum', w.places)!;
    expect(momentum).toMatchObject({ place: 'lively', feature: 'l1', title: 'Keep going on Lively' });
    expect(momentum.because).toBe('Pick up here because Lively has 52 commits since the start of September 2026, the latest in the week to 11 October 2026.');

    const quietOne = byQuestion('neglected', [quiet()])!;
    expect(quietOne).toMatchObject({ place: 'quiet', title: 'Look in on Stillwater' });
    expect(quietOne.because).toBe('Pick up here because Stillwater has 3 features standing and 6 measured users and has been untouched since March 2026.');

    const milestone = byQuestion('near-milestone', [nearly()])!;
    expect(milestone).toMatchObject({ place: 'nearly', feature: 'n3', title: 'Take Nearly from settlement to town' });
    expect(milestone.because).toBe('Pick up here because one more working feature would make Nearly a town.');

    const finish = byQuestion('quick-finish', [quick()])!;
    expect(finish).toMatchObject({ place: 'quick', feature: 'k1', title: 'Finish Keeper value sheet: Render the sheet' });

    const promote = byQuestion('promote-idea', [idea()])!;
    expect(promote).toMatchObject({ place: 'idea', title: 'Give Tax Drawer a second look' });

    for (const s of [momentum, quietOne, milestone, finish, promote]) {
      const where = w.places.find((p) => p.id === s.place)!;
      expectHonest(s, where.features, where.name);
    }
  });

  it('gives at most one answer per question and at most four in all', () => {
    const w = world([lively(), { ...lively(), id: 'lively2', name: 'Lively Two', heat: 0.7 }, quiet(), nearly(), quick(), idea()]);
    const out = worldSuggestions(w, TODAY);
    expect(out).toHaveLength(RESUME_RULES.caps.world);
    expect(new Set(out.map((s) => s.question)).size).toBe(out.length);
    // With all five answerable, the idea is the one left out: it is never pushed ahead of real work.
    expect(out.map((s) => s.question)).toEqual(['momentum', 'quick-finish', 'near-milestone', 'neglected']);
    expect(out[0]!.place).toBe('lively');
  });

  it('answers nothing where the evidence is thin', () => {
    expect(worldSuggestions(world([]), TODAY)).toEqual([]);
    // Momentum wants sustained work: one busy day is not it, nor is a place that has stopped.
    const oneDay = { ...lively(), activeWeeks: 1 };
    const stopped = { ...lively(), liveliness: 'settled' as const };
    const slight = { ...lively(), series: [{ month: '2026-10', commits: RESUME_RULES.world.momentum.minRecentCommits - 1 }] };
    for (const p of [oneDay, stopped, slight]) expect(worldSuggestions(world([p]), TODAY).some((s) => s.question === 'momentum')).toBe(false);
    // A quiet place with little standing is not "useful and quiet"; nor is one that only just went quiet.
    const small = { ...quiet(), features: quiet().features.slice(0, 1) };
    const recent = { ...quiet(), features: quiet().features.map((f) => ({ ...f, lastWorkAt: '2026-09-06' })), lastWorkAt: '2026-09-06' };
    for (const p of [small, recent]) expect(worldSuggestions(world([p]), TODAY).some((s) => s.question === 'neglected')).toBe(false);
    // A milestone that needs several things, or a lot of one, is not near.
    const far = [
      { ...nearly(), nextRank: { rank: 'town' as const, needs: ['3 more working features'] } },
      { ...nearly(), nextRank: { rank: 'town' as const, needs: ['1 more working feature', 'a release'] } },
      { ...nearly(), nextRank: { rank: 'major' as const, needs: ['measured users'] } },
      { ...nearly(), features: nearly().features.map((f) => (f.id === 'n3' ? { ...f, progress: 0.1 } : f)) },
    ];
    for (const p of far) expect(worldSuggestions(world([p]), TODAY).some((s) => s.question === 'near-milestone')).toBe(false);
  });

  it('counts a plan one check from done as a milestone, and does not name the same feature twice', () => {
    const f = feature({ id: 'k1', place: 'quick', name: 'Keeper value sheet', stage: 'building', build: build({ stage: 'verifying', stepsDone: ['s1', 's2', 's3'], progress: 1, criteriaPassed: ['c1'] }) });
    const out = worldSuggestions(world([{ ...quick(), features: [f] }]), TODAY);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ feature: 'k1', title: 'Finish verifying Keeper value sheet' });
  });

  it('answers from the world alone: an understanding adds evidence and changes no answer', () => {
    const places = [lively(), quiet(), nearly(), quick(), idea()];
    const u = new Map(
      places.map((p) => [p.id, { ...understanding({ pickUp: { value: `Tidy up ${p.name}`, confidence: 'high', sources: ['README.md'] } }), place: p.id }]),
    );
    const bare = worldSuggestions(world(places), TODAY);
    const advised = worldSuggestions(world(places), TODAY, u);
    const answer = (s: WorldSuggestion) => ({ question: s.question, place: s.place, feature: s.feature, title: s.title, because: s.because });
    expect(advised.map(answer)).toEqual(bare.map(answer));
    const momentum = advised.find((s) => s.question === 'momentum')!;
    expect(momentum.evidence.at(-1)).toMatchObject({ what: 'A reading of the project on 12 October 2026 suggests: Tidy up Lively', source: 'README.md' });
    expect(bare.find((s) => s.question === 'momentum')!.evidence.some((e) => e.what.includes('A reading'))).toBe(false);
  });

  it('is deterministic and independent of the order places arrive in', () => {
    const places = [lively(), quiet(), nearly(), quick(), idea()];
    const a = worldSuggestions(freeze(world(places)), TODAY);
    const b = worldSuggestions(freeze(world(places.slice().reverse())), TODAY);
    expect(b).toEqual(a);
    expect(worldSuggestions(world(places), TODAY)).toEqual(a);
  });
});

// ───────────────────────── Wording ─────────────────────────

describe('wordingProblems', () => {
  it('finds every banned word, whole words only', () => {
    for (const w of BANNED_WORDS) expect(wordingProblems(`Well, ${w} seen this.`), w).toContain(`banned word: ${w}`);
    expect(wordingProblems("You haven't touched it")).not.toEqual([]);
    expect(wordingProblems('This is overdue.')).not.toEqual([]);
    expect(wordingProblems('The shoulder of the road')).toEqual([]);
    expect(wordingProblems('Untouched since March')).toEqual([]);
  });

  it('refuses exclamation marks and counts of what is undone', () => {
    expect(wordingProblems('Nearly there!')).toContain('exclamation mark');
    for (const text of ['3 steps left', 'There are 2 criteria remaining', 'one check is left', '12 issues open', 'several tasks still to do']) {
      expect(wordingProblems(text), text).toContain('a count of what is undone');
    }
    // What is done may be counted.
    expect(wordingProblems('2 of 5 steps of Draft are finished and the next step is "Seed the room"')).toEqual([]);
    expect(wordingProblems('3 features standing')).toEqual([]);
  });

  it('does not judge his own words when they are quoted', () => {
    expect(wordingProblems('Draft failed this check: "Search should return in 200ms".')).toEqual([]);
    expect(wordingProblems('Search should return in 200ms')).not.toEqual([]);
  });
});

// ───────────────────────── Whole worlds ─────────────────────────

function expectWorldHonest(w: WorldState, today: string, u?: ReadonlyMap<string, ProjectUnderstanding>): number {
  const map = u === undefined ? undefined : new Map(u);
  let produced = 0;
  for (const p of w.places) {
    const points = resumePoints(p, today, map?.get(p.id));
    expect(points.length).toBeLessThanOrEqual(RESUME_RULES.caps.perPlace);
    if (p.abandonedAt !== undefined && p.liveliness === 'ruins') expect(points).toEqual([]);
    if ((p.liveliness === 'dormant' || p.liveliness === 'ruins') && p.lastWorkAt !== undefined) expect(points.length).toBeLessThanOrEqual(1);
    for (const point of points) {
      expectPoint(point, p);
      produced++;
    }
    expect(resumePoints(p, today, map?.get(p.id))).toEqual(points);
  }
  const suggestions = worldSuggestions(w, today, map);
  expect(suggestions.length).toBeLessThanOrEqual(RESUME_RULES.caps.world);
  expect(new Set(suggestions.map((s) => s.question)).size).toBe(suggestions.length);
  for (const s of suggestions) {
    const where = w.places.find((p) => p.id === s.place)!;
    expect(where).toBeDefined();
    expectHonest(s, where.features, where.name);
    for (const text of strings(s)) expect(text).not.toContain('!');
    produced++;
  }
  expect(worldSuggestions(w, today, map)).toEqual(suggestions);
  return produced;
}

describe('the specimen world', () => {
  it('keeps every rule in every string, with and without understandings', () => {
    const w = specimen();
    expect(expectWorldHonest(w, TODAY)).toBeGreaterThan(10);
    expect(expectWorldHonest(w, TODAY, fixtureUnderstanding)).toBeGreaterThan(10);
  });

  it('answers the way the fiction reads', () => {
    const w = specimen();
    const at = (id: string): ResumePoint[] => resumePoints(w.places.find((p) => p.id === id)!, TODAY);
    // Abandoned: nothing. Dormant with something half-built: one gentle note. A bare spark: nothing.
    expect(at('hooplytics')).toEqual([]);
    expect(at('sixth-man').map((p) => p.rule)).toEqual(['dormant-pick-back-up']);
    expect(at('shotchart').map((p) => p.feature)).toEqual(['shotchart.zone-splits']);
    expect(at('paperweight')).toEqual([]);
    // Work that stopped in a burst is named with its count and dates.
    expect(at('pantry-loop')[0]).toMatchObject({ rule: 'stopped-abruptly', feature: 'pantry-loop.staples-rhythm' });
    // An idea he came back to a year later is observed.
    expect(at('tax-drawer')[0]).toMatchObject({ kind: 'promote-idea' });

    const suggestions = worldSuggestions(w, TODAY);
    expect(suggestions.find((s) => s.question === 'momentum')?.place).toBe('boxout-fantasy');
    expect(suggestions.find((s) => s.question === 'neglected')?.place).toBe('shotchart');
  });

  it('has fixture understandings that are valid, advisory, clean and about real specimen places', () => {
    const w = specimen();
    expect([...fixtureUnderstanding.keys()].sort()).toEqual(['boxout-fantasy', 'ledgerline', 'patrick-os', 'shotchart', 'wirefeed']);
    for (const [id, u] of fixtureUnderstanding) {
      expect(isProjectUnderstanding(u)).toBe(true);
      expect(u.place).toBe(id);
      expect(u.provenance).toMatchObject({ generator: 'fixture (fictional)', advisory: true });
      expect(w.places.some((p) => p.id === id)).toBe(true);
      expect(u.whatThisIs.value.split(/(?<=[.?])\s+/).length).toBeLessThanOrEqual(3);
      const claims = [u.whatThisIs, u.maturity, u.recentWork, ...u.capabilities, ...u.unfinished, ...u.openQuestions, ...u.nextSteps];
      for (const c of claims) {
        expect(wordingProblems(c.value), c.value).toEqual([]);
        expect(c.sources.length, c.value).toBeGreaterThan(0);
      }
    }
  });
});

describe('the real world, when its private record is here', () => {
  it('keeps every rule in every string', async () => {
    const real = await realWorld();
    // public/data is private and git-ignored. Without it there is nothing to check.
    if (real === undefined) return;
    expect(real.world.places.length).toBe(real.raw.repos.length);
    expectWorldHonest(real.world, real.today);

    const file = (await privateJson('understanding.json')) as Record<string, unknown> | undefined;
    if (file === undefined) return;
    const u = new Map<string, ProjectUnderstanding>();
    for (const [id, value] of Object.entries(file)) {
      expect(isProjectUnderstanding(value), id).toBe(true);
      const understood = value as ProjectUnderstanding;
      expect(understood.provenance.advisory).toBe(true);
      const claims = [understood.whatThisIs, understood.maturity, understood.recentWork, ...understood.capabilities, ...understood.unfinished, ...understood.openQuestions, ...understood.nextSteps];
      if (understood.pickUp !== undefined) claims.push(understood.pickUp);
      for (const c of claims) {
        expect(wordingProblems(c.value), `${id}: ${c.value}`).toEqual([]);
        expect(c.sources.length, `${id}: ${c.value}`).toBeGreaterThan(0);
      }
      u.set(id, understood);
    }
    expectWorldHonest(real.world, real.today, u);
  });
});
