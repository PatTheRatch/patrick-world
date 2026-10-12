// Layer three: continuation suggestions. "Where did I leave off, and where could I go next?"
//
// Pure and deterministic: no network, no clock (the caller says what today is), no storage.
// It READS the derived world and, optionally, an advisory understanding. It never writes
// either. A suggestion is not state, is never recorded, and changes nothing on the map.
//
// The owner's rules, enforced here and in resume.test.ts:
//   - No productivity score. `strength` orders the list and is never shown.
//   - No count of what is undone. A suggestion names the next step or the last check; it
//     does not say how many are left.
//   - No guilt. The words in BANNED_WORDS never appear in a generated string. Say what is
//     true: "untouched since March".
//   - No generic advice. Every `because` is built only from that suggestion's own evidence
//     and names a feature, a date, a count of work done, a criterion or a source.
//   - Small is legitimate. A place with nothing unfinished gets an empty list, a dormant
//     place at most one gentle note, an abandoned place none, and an idea is observed,
//     never pushed.

import type { BuildPlan, BuildState, PlanStep } from '../world/build';
import { thresholds } from '../world/thresholds';
import { daysBetween, formatDay, formatMonthYear, isoDay, monthIndex, monthKeyFromIndex } from '../world/time';
import type { FeatureState, PlaceState, Rank, WorldState } from '../world/types';
import type { Claim, Confidence, ProjectUnderstanding } from './types';

// ───────────────────────── The rules, in one place ─────────────────────────

/** Every threshold behind a suggestion. Nothing else decides one. Meant to be argued with. */
export const RESUME_RULES = {
  caps: {
    /** Suggestions returned for one place. */
    perPlace: 4,
    /** Suggestions returned for the whole world. */
    world: 4,
    /** Pieces of evidence carried by one suggestion. */
    evidence: 3,
    /** Suggestions one place may take from an advisory understanding. */
    fromUnderstanding: 2,
  },
  /** A builder session is still open on the feature. */
  openSession: { strength: 0.95 },
  /** The plan has an open blocker. The suggestion says what is blocking. */
  openBlocker: { strength: 0.9 },
  /** A criterion failed its check on the current revision. */
  failingCriterion: { strength: 0.88 },
  /** Every step is finished and criteria are unchecked. With this many left it is a quick finish. */
  uncheckedCriteria: { strength: 0.8, quickWhenLeft: 1, quickStrength: 0.86 },
  /** A plan under way with steps unfinished. */
  unfinishedSteps: {
    strength: 0.72,
    /** One step left, or this share of steps finished: a quick finish. */
    quickWhenStepsLeft: 1,
    quickStrength: 0.84,
    /** Up to this many steps left is one sitting; more is a deeper session. */
    sessionWhenStepsLeft: 3,
  },
  /** A plan that is written, unblocked and not started: a ready lot. */
  readyPlan: { strength: 0.7 },
  /** A plan waiting on another feature. */
  waitingOn: { strength: 0.69 },
  /** `progress` at or above this, with no plan to say otherwise, reads as nearly done. */
  nearlyDone: { progress: 0.8, strength: 0.62 },
  /** A feature in `building` worked on within this many days. */
  buildingRecent: { withinDays: 21, strength: 0.55, deepBelowProgress: 0.35, progressAdd: 0.05 },
  /** A feature in `building` with no work for at least this many days: unfinished, and said so plainly. */
  leftInBuilding: { minSilenceDays: 21, minCommits: 5, strength: 0.45 },
  /**
   * Work that stopped abruptly: at least `minCommits` on one feature inside `maxSpanDays`,
   * the feature still in `building`, and nothing for `minSilenceDays`.
   */
  stoppedAbruptly: { minCommits: 8, maxSpanDays: 45, minSilenceDays: 21, strength: 0.54 },
  /**
   * "Where did I leave off": the feature with the most recent work. An unfinished one is
   * offered whenever the place is still awake; a finished one only within `withinDays`.
   */
  lastTouched: { withinDays: 70, strength: 0.4, unfinishedStrength: 0.5, recentDays: 21 },
  /** One feature holding at least `minShare` of the place's recency-weighted work. */
  concentratedWork: { minShare: 0.5, minRecentCommits: 5, minFeatures: 2, strength: 0.52 },
  /**
   * Claims taken from an advisory understanding. Low-confidence claims are never used, and
   * no claim outranks anything a build plan says (0.69 and up; the tests hold this). A
   * high-confidence claim comes just ahead of what is inferred from commits alone (0.62 and
   * down), because where there is no plan a reading of the README and commit messages is the
   * more specific of two inferences. A medium-confidence claim comes after recent work.
   */
  understanding: { high: 0.64, medium: 0.5 },
  /**
   * An idea with thought put into it and no work: a spark or a site with at least
   * `minThoughts` further notes or proposed features, or one added at least
   * `returnAfterDays` after it was founded (he came back to it).
   */
  promoteIdea: { ranks: ['spark', 'site'] as readonly Rank[], minThoughts: 2, returnAfterDays: 120, strength: 0.3, noteChars: 90 },
  /** A dormant or ruined place: one suggestion at most, and only about unfinished work. */
  dormant: {
    max: 1,
    strength: 0.25,
    /** With no plan, a feature needs at least this many commits to count as unfinished work worth a note. */
    minCommits: 5,
  },
  /** Work on the feature within this many days lifts a suggestion, most when it was today. */
  recency: { withinDays: 21, add: 0.04 },
  world: {
    /** Momentum: awake now, with sustained recent work. */
    momentum: { minRecentCommits: 10, months: 2, minActiveWeeks: 2 },
    /** Neglected (the question's name, never a word shown): substantial, standing, and quiet. */
    quiet: { minWorking: 2, minRank: 'settlement' as Rank, minSilenceDays: 70 },
    /** Near a milestone: the next rank needs one thing, and at most this much of it. */
    nearMilestone: {
      maxNeeds: 1,
      maxCount: 1,
      minRank: 'outpost' as Rank,
      /** When the thing needed is a working feature, some unfinished feature must be at least this far along. */
      minProgress: 0.4,
    },
    quickFinish: { minStrength: 0.6 },
  },
} as const;

/** Words that never appear in a generated string. The owner's list, plus one spelling of it. */
export const BANNED_WORDS = ["you haven't", 'you have not', 'overdue', 'should', 'behind', 'neglecting'] as const;

const BANNED = new RegExp(`(^|[^a-z])(${BANNED_WORDS.map((w) => w.replace(/'/g, "['’]")).join('|')})([^a-z]|$)`, 'i');
const UNDONE_COUNT =
  /\b(\d+|one|two|three|four|five|several|many|some)\s+(more\s+)?(steps?|criteri(on|a)|checks?|issues?|todos?|tasks?|items?|features?)\s+(are\s+|is\s+)?(left|remaining|to go|undone|unfinished|outstanding|still|open)\b/i;

/**
 * What is wrong with a string's wording, if anything. Text inside double quotes is the
 * owner's own (a criterion he wrote, a blocker's reason) and is not judged; everything
 * around it is.
 */
export function wordingProblems(text: string): string[] {
  const out: string[] = [];
  if (text.includes('!')) out.push('exclamation mark');
  const own = text.replace(/"[^"]*"/g, '""');
  const banned = BANNED.exec(own);
  if (banned) out.push(`banned word: ${(banned[2] ?? '').toLowerCase()}`);
  if (UNDONE_COUNT.test(own)) out.push('a count of what is undone');
  return out;
}

// ───────────────────────── Shapes ─────────────────────────

export type ResumeKind = 'continue' | 'verify' | 'unblock' | 'finish-quickly' | 'deeper-session' | 'pick-back-up' | 'promote-idea';

export type ResumeRule =
  | 'open-session'
  | 'open-blocker'
  | 'failing-criterion'
  | 'unchecked-criteria'
  | 'unfinished-steps'
  | 'ready-plan'
  | 'waiting-on'
  | 'nearly-done'
  | 'building-recent'
  | 'stopped-abruptly'
  | 'left-in-building'
  | 'last-touched'
  | 'concentrated-work'
  | 'understanding-pick-up'
  | 'understanding-next-step'
  | 'understanding-unfinished'
  | 'promote-idea'
  | 'dormant-pick-back-up';

export interface ResumeEvidence {
  what: string;
  /** Where a person could check it: `build plan`, `work log`, `issue #12`. */
  source: string;
  /** ISO day or timestamp, where the evidence has one. */
  at?: string;
}

export interface ResumePoint {
  place: string;
  feature?: string;
  kind: ResumeKind;
  /** The named rule that produced it. For explaining and testing, not for show. */
  rule: ResumeRule;
  /** What to do, as an action: "Finish verifying Keeper value sheet". */
  title: string;
  /** One sentence beginning "Pick up here because", built only from `evidence`. */
  because: string;
  /** At least one. Never empty. */
  evidence: ResumeEvidence[];
  effort: 'quick' | 'session' | 'deep';
  /** 0–1, for ordering only. Never shown as a score. */
  strength: number;
}

export type WorldQuestion = 'momentum' | 'neglected' | 'near-milestone' | 'quick-finish' | 'promote-idea';

export interface WorldSuggestion {
  question: WorldQuestion;
  place: string;
  feature?: string;
  title: string;
  because: string;
  evidence: ResumeEvidence[];
}

// ───────────────────────── Words ─────────────────────────

const R = RESUME_RULES;
const LEAD = 'Pick up here because';

/** The owner's own words, quoted. Trimmed, one line, no closing full stop, no exclamation marks. */
function q(text: string, limit = 140): string {
  let t = text.replace(/\s+/g, ' ').replace(/!+/g, '').replace(/"/g, "'").trim().replace(/[.;:,]+$/, '');
  if (t.length > limit) {
    const cut = t.slice(0, limit);
    const space = cut.lastIndexOf(' ');
    t = `${cut.slice(0, space > limit * 0.6 ? space : limit)}…`;
  }
  return `"${t}"`;
}

/** Plain text taken from elsewhere and shown unquoted: one line, no exclamation marks, no closing stop. */
function plain(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/!+/g, '').trim().replace(/[.;:,]+$/, '');
}

const commitsWord = (n: number): string => `${n} ${n === 1 ? 'commit' : 'commits'}`;

/**
 * When work happened, as exactly as the world knows it. Work is logged by the week
 * (`work.logged` is dated at its week's end), so a day would claim more than is known.
 */
const week = (day: string): string => `the week to ${formatDay(day)}`;

function listSources(sources: readonly string[]): string {
  const s = sources.map((x) => x.trim()).filter((x) => x !== '');
  if (s.length === 0) return 'the project review';
  if (s.length === 1) return s[0]!;
  if (s.length === 2) return `${s[0]!} and ${s[1]!}`;
  return `${s[0]!}, ${s[1]!} and ${s.length - 2} more`;
}

const RANK_NAME: Record<Rank, string> = {
  spark: 'a spark',
  site: 'a site',
  outpost: 'an outpost',
  settlement: 'a settlement',
  town: 'a town',
  city: 'a city',
  major: 'a major city',
};
const RANK_ORDER: readonly Rank[] = ['spark', 'site', 'outpost', 'settlement', 'town', 'city', 'major'];
const rankAtLeast = (rank: Rank, min: Rank): boolean => RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf(min);

// ───────────────────────── Reading a feature ─────────────────────────

const WORK_LOG = 'work log';
const BUILD_PLAN = 'build plan';

function isWorking(f: FeatureState): boolean {
  if (f.build !== undefined && f.build.plan !== undefined) return f.build.stage === 'done';
  return f.stage === 'working' || f.stage === 'mature';
}

/** Unfinished: a plan that is past an idea and not done, or, with no plan, a feature in `building`. */
function isUnfinished(f: FeatureState): boolean {
  const b = f.build;
  if (b !== undefined && b.plan !== undefined) return b.stage !== 'done' && b.stage !== 'idea' && b.stage !== 'specified';
  return f.stage === 'building';
}

/** The step to take next: one already started, else the first whose prerequisites are finished. */
function nextStep(plan: BuildPlan, b: BuildState): PlanStep | undefined {
  const done = new Set(b.stepsDone);
  const open = plan.steps.filter((s) => !done.has(s.id));
  return (
    open.find((s) => b.stepsStarted.includes(s.id)) ??
    open.find((s) => (s.after ?? []).every((id) => done.has(id))) ??
    open[0]
  );
}

function effortForSteps(left: number): ResumePoint['effort'] {
  if (left <= R.unfinishedSteps.quickWhenStepsLeft) return 'quick';
  return left <= R.unfinishedSteps.sessionWhenStepsLeft ? 'session' : 'deep';
}

type Draft = Omit<ResumePoint, 'place'>;

/** Every suggestion one feature's build plan evidences. */
function planPoints(f: FeatureState, b: BuildState, plan: BuildPlan): Draft[] {
  const out: Draft[] = [];
  const source = `${BUILD_PLAN}, revision ${plan.revision}`;
  const stepsLeft = plan.steps.length - b.stepsDone.length;
  const step = nextStep(plan, b);

  if (b.activeSession !== undefined) {
    const s = b.activeSession;
    const since = formatDay(isoDay(s.since));
    out.push({
      feature: f.id,
      kind: 'continue',
      rule: 'open-session',
      title: `Return to the open session on ${f.name}`,
      because: `${LEAD} a ${s.builder} session on ${f.name} has been open since ${since}.`,
      evidence: [{ what: `A ${s.builder} session on ${f.name} is open, started ${since}`, source: `session ${s.session}`, at: s.since }],
      effort: 'quick',
      strength: R.openSession.strength,
    });
  }

  const blocker = b.openBlockers[0];
  if (blocker !== undefined) {
    out.push({
      feature: f.id,
      kind: 'unblock',
      rule: 'open-blocker',
      title: `Clear what is blocking ${f.name}`,
      because: `${LEAD} ${f.name} is blocked: ${q(blocker.reason)}.`,
      evidence: [{ what: `${f.name} has an open blocker: ${q(blocker.reason)}`, source: `${BUILD_PLAN}, blocker ${blocker.blocker}` }],
      effort: 'session',
      strength: R.openBlocker.strength,
    });
  }

  const failed = plan.criteria.find((c) => b.criteriaFailed.includes(c.id));
  if (failed !== undefined) {
    out.push({
      feature: f.id,
      kind: 'verify',
      rule: 'failing-criterion',
      title: `Fix what failed verification on ${f.name}`,
      because: `${LEAD} ${f.name} failed this check: ${q(failed.statement)}.`,
      evidence: [{ what: `${f.name} failed the check ${q(failed.statement)}, verified by ${failed.verification.kind}`, source }],
      effort: 'session',
      strength: R.failingCriterion.strength,
    });
  }

  if (b.stage === 'verifying' && failed === undefined) {
    const unchecked = plan.criteria.filter((c) => !b.criteriaPassed.includes(c.id));
    const first = unchecked[0];
    if (first !== undefined) {
      const last = unchecked.length <= R.uncheckedCriteria.quickWhenLeft;
      out.push({
        feature: f.id,
        kind: last ? 'finish-quickly' : 'verify',
        rule: 'unchecked-criteria',
        title: `Finish verifying ${f.name}`,
        because: `${LEAD} every step of ${f.name} is finished and the ${last ? 'last' : 'next'} check is ${q(first.statement)}.`,
        evidence: [
          {
            what: `Every step of ${f.name} is finished; the ${last ? 'last' : 'next'} check is ${q(first.statement)}, verified by ${first.verification.kind}`,
            source,
          },
        ],
        effort: last ? 'quick' : 'session',
        strength: last ? R.uncheckedCriteria.quickStrength : R.uncheckedCriteria.strength,
      });
    }
  }

  if (b.stage === 'building' && step !== undefined) {
    const total = plan.steps.length;
    const done = b.stepsDone.length;
    const quick = stepsLeft <= R.unfinishedSteps.quickWhenStepsLeft || b.progress >= R.nearlyDone.progress;
    const effort = quick ? 'quick' : effortForSteps(stepsLeft);
    const which = stepsLeft === 1 ? 'last' : done === 0 ? 'first' : 'next';
    const state = done === 0 ? `Work on ${f.name} has started` : `${done} of ${total} steps of ${f.name} are finished`;
    out.push({
      feature: f.id,
      kind: quick ? 'finish-quickly' : effort === 'deep' ? 'deeper-session' : 'continue',
      rule: 'unfinished-steps',
      title: `${quick ? 'Finish' : 'Continue'} ${f.name}: ${plain(step.title)}`,
      because: `${LEAD} ${state.charAt(0).toLowerCase()}${state.slice(1)} and the ${which} step is ${q(step.title)}.`,
      evidence: [{ what: `${state}; the ${which} step is ${q(step.title)}`, source }],
      effort,
      strength: quick ? R.unfinishedSteps.quickStrength : R.unfinishedSteps.strength,
    });
  }

  if (b.stage === 'ready' && step !== undefined) {
    const effort = effortForSteps(stepsLeft);
    out.push({
      feature: f.id,
      kind: effort === 'deep' ? 'deeper-session' : 'continue',
      rule: 'ready-plan',
      title: `Start ${f.name}: ${plain(step.title)}`,
      because: `${LEAD} ${f.name} has a plan, nothing is blocking it and its first step is ${q(step.title)}.`,
      evidence: [{ what: `${f.name} is planned and unblocked; its first step is ${q(step.title)}`, source }],
      effort,
      strength: R.readyPlan.strength,
    });
  }

  const waiting = b.waitingOn[0];
  if (waiting !== undefined && b.stage === 'planned') {
    out.push({
      feature: f.id,
      kind: 'unblock',
      rule: 'waiting-on',
      title: `Finish ${waiting} so ${f.name} can start`,
      because: `${LEAD} ${f.name} is planned and waits on ${q(waiting)}.`,
      evidence: [{ what: `${f.name} depends on ${q(waiting)}, which is not done`, source }],
      effort: 'session',
      strength: R.waitingOn.strength,
    });
  }
  return out;
}

/** Suggestions for a feature with no plan, from its stage and its work alone. */
function inferredPoints(f: FeatureState, today: string): Draft[] {
  const out: Draft[] = [];
  if (f.stage !== 'building' || f.lastWorkAt === undefined) return out;
  const last = f.lastWorkAt;
  const silence = daysBetween(last, today);
  const worked = `${commitsWord(f.commits)} logged against ${f.name}, the last in ${week(last)}`;

  if (f.progress >= R.nearlyDone.progress) {
    out.push({
      feature: f.id,
      kind: 'finish-quickly',
      rule: 'nearly-done',
      // No plan says what done means here, so the action is to look, not to finish.
      title: `Check how close ${f.name} is to done`,
      because: `${LEAD} ${f.name} is in building with ${commitsWord(f.commits)} logged, about what a feature of its kind usually takes to stand.`,
      evidence: [{ what: worked, source: WORK_LOG, at: last }],
      // No plan says how much is left, so this is not called quick.
      effort: 'session',
      strength: R.nearlyDone.strength,
    });
  }

  if (silence < R.buildingRecent.withinDays) {
    out.push({
      feature: f.id,
      kind: 'continue',
      rule: 'building-recent',
      title: `Continue ${f.name}`,
      because: `${LEAD} ${f.name} is in building and was last worked on in ${week(last)}, with ${commitsWord(f.commits)} so far.`,
      evidence: [{ what: worked, source: WORK_LOG, at: last }],
      effort: f.progress < R.buildingRecent.deepBelowProgress ? 'deep' : 'session',
      strength: R.buildingRecent.strength + f.progress * R.buildingRecent.progressAdd,
    });
  }

  const S = R.stoppedAbruptly;
  const began = f.stagedAt.building ?? f.proposedAt;
  if (f.commits >= S.minCommits && silence >= S.minSilenceDays && daysBetween(began, last) <= S.maxSpanDays) {
    const span = began === last ? `in ${week(last)}` : `between ${formatDay(began)} and ${week(last)}`;
    out.push({
      feature: f.id,
      kind: 'pick-back-up',
      rule: 'stopped-abruptly',
      title: `Pick ${f.name} back up`,
      because: `${LEAD} ${commitsWord(f.commits)} went into ${f.name} ${span}, and none since.`,
      evidence: [{ what: `${commitsWord(f.commits)} on ${f.name} ${span}; none since, and it is still in building`, source: WORK_LOG, at: last }],
      effort: f.progress < R.buildingRecent.deepBelowProgress ? 'deep' : 'session',
      strength: S.strength,
    });
  } else if (silence >= R.leftInBuilding.minSilenceDays && f.commits >= R.leftInBuilding.minCommits) {
    out.push({
      feature: f.id,
      kind: 'pick-back-up',
      rule: 'left-in-building',
      title: `Pick ${f.name} back up`,
      because: `${LEAD} ${f.name} is in building with ${commitsWord(f.commits)} logged, the last in ${week(last)}.`,
      evidence: [{ what: `${worked}; it is still in building`, source: WORK_LOG, at: last }],
      effort: f.progress < R.buildingRecent.deepBelowProgress ? 'deep' : 'session',
      strength: R.leftInBuilding.strength,
    });
  }
  return out;
}

/** Recency-weighted commits behind a 0–1 heat: the inverse of the derivation's squash. */
function warmth(heat: number): number {
  return heat <= 0 ? 0 : -Math.log(1 - Math.min(heat, 0.999999)) * thresholds.heat.squash;
}

// ───────────────────────── Understanding (advisory) ─────────────────────────

const usable = (c: Claim<string> | undefined): c is Claim<string> =>
  c !== undefined && c.confidence !== 'low' && c.value.trim() !== '' && c.sources.length > 0;

const claimStrength = (c: Confidence): number => (c === 'high' ? R.understanding.high : R.understanding.medium);

/** The feature a claim is about, if it names one of the place's features or its directory. */
function featureNamed(place: PlaceState, claim: Claim<string>): FeatureState | undefined {
  const text = `${claim.value} ${claim.sources.join(' ')}`.toLowerCase();
  let best: FeatureState | undefined;
  let bestLength = 0;
  for (const f of place.features) {
    const names = [f.name.toLowerCase()];
    // A GitHub-derived feature's note is its directory: `app/draft/`.
    if (f.note !== undefined && /^[\w./-]+\/$/.test(f.note)) names.push(f.note.toLowerCase());
    for (const name of names) {
      if (name.length < 5 || name.length <= bestLength) continue;
      const at = text.indexOf(name);
      if (at === -1) continue;
      const before = at === 0 ? ' ' : text.charAt(at - 1);
      const after = text.charAt(at + name.length);
      if (/[a-z0-9]/.test(before) || (/[a-z0-9]/.test(after) && !name.endsWith('/'))) continue;
      best = f;
      bestLength = name.length;
    }
  }
  return best;
}

function understandingPoints(place: PlaceState, u: ProjectUnderstanding, today: string): Draft[] {
  const out: Draft[] = [];
  const read = formatDay(isoDay(u.provenance.generatedAt));
  const awake = place.lastWorkAt !== undefined && daysBetween(place.lastWorkAt, today) < R.lastTouched.recentDays;
  const kind: ResumeKind = awake ? 'continue' : 'pick-back-up';
  const add = (rule: ResumeRule, claim: Claim<string>, title: string, because: string, what: string): void => {
    if (out.length >= R.caps.fromUnderstanding) return;
    const draft: Draft = {
      kind,
      rule,
      title,
      because,
      evidence: [{ what, source: claim.sources.join('; '), at: u.provenance.generatedAt }],
      effort: 'session',
      strength: claimStrength(claim.confidence),
    };
    const f = featureNamed(place, claim);
    if (f !== undefined) draft.feature = f.id;
    out.push(draft);
  };

  const action = (rule: ResumeRule, claim: Claim<string>): void => {
    const sources = listSources(claim.sources);
    add(
      rule,
      claim,
      plain(claim.value),
      `${LEAD} ${sources} ${claim.sources.length === 1 ? 'points' : 'point'} to it, in a reading of the project made on ${read}.`,
      `A reading of the project on ${read} suggests: ${plain(claim.value)}`,
    );
  };

  if (usable(u.pickUp)) action('understanding-pick-up', u.pickUp);
  const step = u.nextSteps.find(usable);
  if (step !== undefined && step.value !== u.pickUp?.value) action('understanding-next-step', step);
  const open = u.unfinished.find(usable);
  if (open !== undefined) {
    const sources = listSources(open.sources);
    add(
      'understanding-unfinished',
      open,
      `Return to what ${sources} ${open.sources.length === 1 ? 'leaves' : 'leave'} open`,
      `${LEAD} ${sources} ${open.sources.length === 1 ? 'shows' : 'show'} this, as read on ${read}: ${plain(open.value)}.`,
      plain(open.value),
    );
  }
  return out;
}

// ───────────────────────── One place ─────────────────────────

function order(a: ResumePoint, b: ResumePoint): number {
  if (a.strength !== b.strength) return b.strength - a.strength;
  if (a.place !== b.place) return a.place < b.place ? -1 : 1;
  const fa = a.feature ?? '';
  const fb = b.feature ?? '';
  if (fa !== fb) return fa < fb ? -1 : 1;
  return a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0;
}

/**
 * One suggestion per feature: the strongest speaks, and the others lend it their evidence.
 * When the one speaking is an advisory claim, the world's own strongest signal about that
 * feature still decides what kind of work it is and how much: advice may word a suggestion,
 * it does not reclassify it.
 */
function merge(points: ResumePoint[]): ResumePoint[] {
  const sorted = points.slice().sort(order);
  const byFeature = new Map<string, ResumePoint>();
  const classified = new Set<string>();
  const out: ResumePoint[] = [];
  for (const p of sorted) {
    const held = p.feature === undefined ? undefined : byFeature.get(p.feature);
    if (held === undefined) {
      const copy = { ...p, evidence: p.evidence.slice(0, R.caps.evidence) };
      if (p.feature !== undefined) byFeature.set(p.feature, copy);
      out.push(copy);
      continue;
    }
    if (held.rule.startsWith('understanding') && !p.rule.startsWith('understanding') && p.feature !== undefined && !classified.has(p.feature)) {
      classified.add(p.feature);
      held.kind = p.kind;
      held.effort = p.effort;
    }
    for (const e of p.evidence) {
      if (held.evidence.length >= R.caps.evidence) break;
      if (!held.evidence.some((x) => x.what === e.what)) held.evidence.push(e);
    }
  }
  return out;
}

const clean = (p: ResumePoint): boolean =>
  p.evidence.length > 0 &&
  [p.title, p.because, ...p.evidence.map((e) => e.what)].every((s) => wordingProblems(s).length === 0);

function ideaPoint(place: PlaceState): Draft | undefined {
  const P = R.promoteIdea;
  if (!P.ranks.includes(place.rank) || place.commits > 0 || place.abandonedAt !== undefined) return undefined;
  const thoughts: (ResumeEvidence & { at: string; is: string })[] = [
    ...place.notes.map((n) => ({ what: `A note was added to ${place.name}: ${q(n.note, P.noteChars)}`, source: 'place notes', at: n.at, is: 'a note was added' })),
    ...place.features.map((f) => ({
      what: `${f.name} was proposed for ${place.name}`,
      source: 'proposed features',
      at: f.proposedAt,
      is: `${f.name} was proposed`,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.what < b.what ? -1 : 1));
  const latest = thoughts[0];
  if (latest === undefined) return undefined;
  const gap = daysBetween(place.foundedAt, latest.at);
  const several = thoughts.length >= P.minThoughts;
  if (!several && gap < P.returnAfterDays) return undefined;
  const months = Math.round(gap / 30.44);
  const observed = several
    ? `it has been returned to ${thoughts.length} times since it was founded, most recently on ${formatDay(latest.at)}`
    : `${latest.is} on ${formatDay(latest.at)}, ${months} months after it was founded`;
  return {
    kind: 'promote-idea',
    rule: 'promote-idea',
    title: `Give ${place.name} a second look`,
    because: `${LEAD} ${place.name} has no work logged and ${observed}.`,
    evidence: thoughts.slice(0, R.caps.evidence).map((t) => ({ what: t.what, source: t.source, at: t.at })),
    effort: 'quick',
    strength: P.strength + (thoughts.length > P.minThoughts ? 0.05 : 0),
  };
}

function candidates(place: PlaceState, today: string, understanding?: ProjectUnderstanding): ResumePoint[] {
  const drafts: Draft[] = [];
  for (const f of place.features) {
    const b = f.build;
    if (b !== undefined && b.plan !== undefined) drafts.push(...planPoints(f, b, b.plan));
    else drafts.push(...inferredPoints(f, today));
  }

  // Where he left off: the feature most recently worked on.
  let last: FeatureState | undefined;
  for (const f of place.features) {
    if (f.lastWorkAt === undefined) continue;
    if (last === undefined || f.lastWorkAt > last.lastWorkAt! || (f.lastWorkAt === last.lastWorkAt && f.heat > last.heat)) last = f;
  }
  if (last !== undefined && last.lastWorkAt !== undefined) {
    const L = R.lastTouched;
    const silence = daysBetween(last.lastWorkAt, today);
    const unfinished = isUnfinished(last);
    // Recent work is always where he left off. Older than that, an unfinished feature needs
    // a plan or some substance to it, and a finished one is only offered while the place is fresh.
    const substantial = last.build?.plan !== undefined || last.commits >= R.leftInBuilding.minCommits;
    if (silence < L.recentDays || (unfinished ? substantial : silence < L.withinDays)) {
      const on = week(last.lastWorkAt);
      drafts.push({
        feature: last.id,
        kind: silence < L.recentDays ? 'continue' : 'pick-back-up',
        rule: 'last-touched',
        title: `Return to ${last.name}`,
        because: `${LEAD} ${last.name} is the last thing worked on in ${place.name}, in ${on}.`,
        evidence: [{ what: `${last.name} is the most recently worked-on feature in ${place.name}: ${on}`, source: WORK_LOG, at: last.lastWorkAt }],
        effort: 'session',
        strength: unfinished ? L.unfinishedStrength : L.strength,
      });
    }
  }

  // Recent commits concentrated on one feature.
  {
    const C = R.concentratedWork;
    const worked = place.features.filter((f) => f.commits > 0);
    let sum = 0;
    let top: FeatureState | undefined;
    for (const f of worked) {
      sum += warmth(f.heat);
      if (top === undefined || f.heat > top.heat || (f.heat === top.heat && f.id < top.id)) top = f;
    }
    if (top !== undefined && top.lastWorkAt !== undefined && worked.length >= C.minFeatures) {
      const mine = warmth(top.heat);
      if (mine >= C.minRecentCommits && sum > 0 && mine / sum >= C.minShare) {
        const on = week(top.lastWorkAt);
        drafts.push({
          feature: top.id,
          kind: 'continue',
          rule: 'concentrated-work',
          title: `Continue ${top.name}`,
          because: `${LEAD} most of the recent work in ${place.name} went into ${top.name}, the last in ${on}.`,
          evidence: [{ what: `${top.name} holds most of the recent work in ${place.name}; last worked on in ${on}`, source: WORK_LOG, at: top.lastWorkAt }],
          effort: 'session',
          strength: C.strength,
        });
      }
    }
  }

  if (understanding !== undefined) drafts.push(...understandingPoints(place, understanding, today));
  const idea = ideaPoint(place);
  if (idea !== undefined) drafts.push(idea);

  const byId = new Map(place.features.map((f) => [f.id, f]));
  return drafts.map((d) => {
    const f = d.feature === undefined ? undefined : byId.get(d.feature);
    const silence = f?.lastWorkAt === undefined ? R.recency.withinDays : Math.max(0, daysBetween(f.lastWorkAt, today));
    const lift = silence < R.recency.withinDays ? R.recency.add * (1 - silence / R.recency.withinDays) : 0;
    return { ...d, place: place.id, strength: Math.min(1, d.strength + lift) };
  });
}

const UNFINISHED_RULES: readonly ResumeRule[] = [
  'open-session',
  'open-blocker',
  'failing-criterion',
  'unchecked-criteria',
  'unfinished-steps',
  'nearly-done',
  'building-recent',
  'stopped-abruptly',
  'left-in-building',
  'last-touched',
  // From an understanding, only its explicit "where to pick back up". A loose end it lists is not enough to stir a sleeping place.
  'understanding-pick-up',
];

/**
 * A dormant or ruined place: one gentle note about its most advanced unfinished thing, or
 * nothing. Chosen from the unmerged candidates, so that an advisory claim about a feature
 * never hides what the world itself knows about it.
 */
function dormantPoint(place: PlaceState, all: ResumePoint[]): ResumePoint[] {
  const byId = new Map(place.features.map((f) => [f.id, f]));
  const advisory = (p: ResumePoint): boolean => p.rule.startsWith('understanding');
  const about = all
    .filter((p) => UNFINISHED_RULES.includes(p.rule))
    .filter((p) => {
      if (advisory(p)) return true;
      const f = p.feature === undefined ? undefined : byId.get(p.feature);
      if (f === undefined || !isUnfinished(f)) return false;
      return f.build?.plan !== undefined || f.commits >= R.dormant.minCommits;
    });
  // The world's own state first; within it the feature furthest along, then the usual order.
  const progress = (p: ResumePoint): number => (p.feature === undefined ? -1 : (byId.get(p.feature)?.progress ?? -1));
  about.sort((a, b) => (advisory(a) ? 1 : 0) - (advisory(b) ? 1 : 0) || progress(b) - progress(a) || order(a, b));
  const best = about[0];
  if (best === undefined || place.lastWorkAt === undefined) return [];
  const since = formatMonthYear(place.lastWorkAt);
  const f = best.feature === undefined ? undefined : byId.get(best.feature);
  const quiet: ResumeEvidence = {
    what: `${place.name} has had no work since ${week(place.lastWorkAt)}`,
    source: WORK_LOG,
    at: place.lastWorkAt,
  };
  let title = best.title;
  let because: string;
  if (advisory(best) || f === undefined) {
    because = `${best.because.replace(/\.$/, '')}; ${place.name} has been untouched since ${since}.`;
  } else {
    title = `Pick ${f.name} back up`;
    const b = f.build;
    const state =
      b !== undefined && b.plan !== undefined
        ? b.stage === 'verifying'
          ? 'with every step finished and its checks still to run'
          : `with ${b.stepsDone.length} of ${b.plan.steps.length} steps finished`
        : `in building with ${commitsWord(f.commits)} logged`;
    because = `${LEAD} ${f.name} in ${place.name} was left ${state}, untouched since ${since}.`;
  }
  // Evidence: this suggestion's own, anything else the world knows about the same feature, and the silence.
  const evidence = best.evidence.slice();
  for (const p of about) {
    if (p === best || advisory(p) || p.feature !== best.feature) continue;
    for (const e of p.evidence) if (!evidence.some((x) => x.what === e.what)) evidence.push(e);
  }
  const point: ResumePoint = {
    ...best,
    kind: 'pick-back-up',
    rule: 'dormant-pick-back-up',
    title,
    because,
    evidence: [...evidence.slice(0, R.caps.evidence - 1), quiet],
    strength: R.dormant.strength,
  };
  return [point].slice(0, R.dormant.max);
}

/**
 * Where he could pick up in one place: best first, at most four. An empty list is a
 * legitimate answer and means nothing there is unfinished.
 */
export function resumePoints(place: PlaceState, today: string, understanding?: ProjectUnderstanding): ResumePoint[] {
  const day = isoDay(today);
  // Abandoned is a decision he made. It is not reopened by a suggestion.
  if (place.abandonedAt !== undefined && place.liveliness === 'ruins') return [];
  const all = candidates(place, day, understanding).filter(clean);
  const asleep = (place.liveliness === 'dormant' || place.liveliness === 'ruins') && place.lastWorkAt !== undefined;
  if (asleep) return dormantPoint(place, all.slice().sort(order)).filter(clean);
  return merge(all).slice(0, R.caps.perPlace);
}

// ───────────────────────── The whole world ─────────────────────────

function recentCommits(place: PlaceState, today: string, months: number): { commits: number; since: string } {
  const end = monthIndex(today);
  const first = monthKeyFromIndex(end - (months - 1));
  let commits = 0;
  for (const s of place.series) if (s.month >= first) commits += s.commits;
  return { commits, since: first };
}

function warmest(place: PlaceState): FeatureState | undefined {
  let top: FeatureState | undefined;
  for (const f of place.features) {
    if (f.lastWorkAt === undefined) continue;
    if (top === undefined || f.heat > top.heat || (f.heat === top.heat && f.lastWorkAt > top.lastWorkAt!)) top = f;
  }
  return top;
}

type Ranked = WorldSuggestion & { rank: number[]; firm?: boolean };

/** Higher first, element by element; then place id, so the order never depends on input order. */
function byRank(a: Ranked, b: Ranked): number {
  for (let i = 0; i < Math.max(a.rank.length, b.rank.length); i++) {
    const d = (b.rank[i] ?? 0) - (a.rank[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.place < b.place ? -1 : a.place > b.place ? 1 : 0;
}

/** `1 more working feature` → `one more working feature`; anything asking for more than `maxCount` is refused. */
function milestoneNeed(need: string): string | undefined {
  if (/users|note|logged work/.test(need)) return undefined;
  const n = /^(\d+)\s+(.*)$/.exec(need);
  if (n === null) return need;
  return Number(n[1]) <= R.world.nearMilestone.maxCount ? `one ${n[2] ?? ''}` : undefined;
}

/**
 * Five questions about the whole world, answered only where the evidence is not thin:
 * at most one answer each, at most four in all. An empty list is a legitimate answer.
 */
export function worldSuggestions(world: WorldState, today: string, understanding?: Map<string, ProjectUnderstanding>): WorldSuggestion[] {
  const day = isoDay(today);
  const W = R.world;
  const pools: Record<WorldQuestion, Ranked[]> = { momentum: [], neglected: [], 'near-milestone': [], 'quick-finish': [], 'promote-idea': [] };

  for (const place of world.places) {
    if (place.abandonedAt !== undefined && place.liveliness === 'ruins') continue;
    // Every question here is answered from the world's own state. An understanding may add
    // one piece of evidence (where a reading suggests picking up); it never decides an answer.
    const points = resumePoints(place, day);
    const u = understanding?.get(place.id);
    const advice: ResumeEvidence[] =
      u !== undefined && usable(u.pickUp)
        ? [{ what: `A reading of the project on ${formatDay(isoDay(u.provenance.generatedAt))} suggests: ${plain(u.pickUp.value)}`, source: u.pickUp.sources.join('; '), at: u.provenance.generatedAt }]
        : [];
    const working = place.features.filter(isWorking).length;
    const asleep = place.liveliness === 'dormant' || place.liveliness === 'ruins';

    // Which project has momentum: awake now, with sustained recent work.
    if (place.liveliness === 'building' && place.lastWorkAt !== undefined && place.activeWeeks >= W.momentum.minActiveWeeks) {
      const recent = recentCommits(place, day, W.momentum.months);
      if (recent.commits >= W.momentum.minRecentCommits) {
        const f = warmest(place);
        const since = formatMonthYear(`${recent.since}-01`);
        const s: Ranked = {
          question: 'momentum',
          place: place.id,
          title: `Keep going on ${place.name}`,
          because: `${LEAD} ${place.name} has ${commitsWord(recent.commits)} since the start of ${since}, the latest in ${week(place.lastWorkAt)}.`,
          evidence: [
            { what: `${commitsWord(recent.commits)} in ${place.name} since the start of ${since}; the latest in ${week(place.lastWorkAt)}`, source: WORK_LOG, at: place.lastWorkAt },
          ],
          rank: [place.heat, recent.commits],
        };
        if (f !== undefined && f.lastWorkAt !== undefined) {
          s.feature = f.id;
          s.evidence.push({
            what: `${f.name} has had more recent work than any other feature in ${place.name}, the last in ${week(f.lastWorkAt)}`,
            source: WORK_LOG,
            at: f.lastWorkAt,
          });
        }
        s.evidence.push(...advice);
        pools.momentum.push(s);
      }
    }

    // Which useful project has gone quiet: substantial, things standing, untouched for a while.
    if (
      place.lastWorkAt !== undefined &&
      rankAtLeast(place.rank, W.quiet.minRank) &&
      working >= W.quiet.minWorking &&
      daysBetween(place.lastWorkAt, day) >= W.quiet.minSilenceDays
    ) {
      const since = formatMonthYear(place.lastWorkAt);
      const standing = `${working} features standing`;
      const used = place.users > 0 ? ` and ${place.users} measured ${place.users === 1 ? 'user' : 'users'}` : '';
      const s: Ranked = {
        question: 'neglected',
        place: place.id,
        title: `Look in on ${place.name}`,
        because: `${LEAD} ${place.name} has ${standing}${used} and has been untouched since ${since}.`,
        evidence: [
          { what: `${place.name} has ${standing}${used}`, source: 'stage record' },
          { what: `${place.name} has had no work since ${week(place.lastWorkAt)}`, source: WORK_LOG, at: place.lastWorkAt },
        ],
        rank: [place.users > 0 ? 1 : 0, working, place.commits],
      };
      const point = points[0];
      if (point !== undefined && point.feature !== undefined) s.feature = point.feature;
      s.evidence.push(...advice);
      pools.neglected.push(s);
    }

    // Which is closest to a meaningful milestone: a plan one check from done, or one thing from the next rank.
    for (const p of points) {
      if (p.rule !== 'unchecked-criteria' || p.kind !== 'finish-quickly' || asleep) continue;
      const s: Ranked = { question: 'near-milestone', place: place.id, title: p.title, because: p.because, evidence: p.evidence, rank: [2, 1, place.heat], firm: true };
      if (p.feature !== undefined) s.feature = p.feature;
      pools['near-milestone'].push(s);
    }
    const next = place.nextRank;
    if (next !== undefined && !asleep && next.needs.length <= W.nearMilestone.maxNeeds && rankAtLeast(place.rank, W.nearMilestone.minRank)) {
      const need = next.needs[0] === undefined ? undefined : milestoneNeed(next.needs[0]);
      if (need !== undefined) {
        const s: Ranked = {
          question: 'near-milestone',
          place: place.id,
          title: `Take ${place.name} from ${RANK_NAME[place.rank].replace(/^an? /, '')} to ${RANK_NAME[next.rank].replace(/^an? /, '')}`,
          because: `${LEAD} ${need} would make ${place.name} ${RANK_NAME[next.rank]}.`,
          evidence: [{ what: `${place.name} is ${RANK_NAME[place.rank]}; ${RANK_NAME[next.rank]} needs ${need}`, source: 'rank rule' }],
          rank: [1, 1, place.heat],
        };
        // If the thing needed is a working feature, it is only near when one is well along: point at it.
        let near = true;
        if (/working feature/.test(need)) {
          const closest = place.features.filter(isUnfinished).sort((a, b) => b.progress - a.progress || (a.id < b.id ? -1 : 1))[0];
          near = closest !== undefined && closest.progress >= W.nearMilestone.minProgress;
          if (closest !== undefined && near) {
            s.feature = closest.id;
            s.rank = [1, closest.progress, place.heat];
            const worked = closest.lastWorkAt === undefined ? '' : `, last worked on in ${week(closest.lastWorkAt)}`;
            const e: ResumeEvidence = { what: `${closest.name} is the unfinished feature furthest along in ${place.name}${worked}`, source: WORK_LOG };
            if (closest.lastWorkAt !== undefined) e.at = closest.lastWorkAt;
            s.evidence.push(e);
          }
        }
        if (near) pools['near-milestone'].push(s);
      }
    }

    // Unfinished work he can complete quickly.
    for (const p of points) {
      if (p.kind !== 'finish-quickly' || asleep || p.strength < W.quickFinish.minStrength) continue;
      // Firm when a plan says how little is left; otherwise it is a reading of commit counts.
      const firm = p.effort === 'quick';
      const s: Ranked = { question: 'quick-finish', place: place.id, title: p.title, because: p.because, evidence: p.evidence, rank: [firm ? 1 : 0, p.strength, place.heat], firm };
      if (p.feature !== undefined) s.feature = p.feature;
      pools['quick-finish'].push(s);
    }

    // Which idea is starting to deserve promotion.
    for (const p of points) {
      if (p.kind !== 'promote-idea') continue;
      const latest = p.evidence[0]?.at ?? '';
      pools['promote-idea'].push({
        question: 'promote-idea',
        place: place.id,
        title: p.title,
        because: p.because,
        evidence: p.evidence,
        // Most thought first, then most recently thought about.
        rank: [place.notes.length + place.features.length, latest === '' ? 0 : monthIndex(latest) * 31 + Number(latest.slice(8, 10))],
      });
    }
  }

  // One answer per question, in this order of precedence; the last present is the one dropped at the cap.
  const precedence: readonly WorldQuestion[] = ['momentum', 'quick-finish', 'near-milestone', 'neglected', 'promote-idea'];
  const out: WorldSuggestion[] = [];
  const usedPlaces = new Set<string>();
  const usedTargets = new Set<string>();
  for (const question of precedence) {
    if (out.length >= R.caps.world) break;
    const pool = pools[question].slice().sort(byRank);
    // Never the same feature twice; prefer a place not already named.
    const fresh = pool.filter((s) => !usedTargets.has(`${s.place}/${s.feature ?? ''}`) || s.feature === undefined);
    // A second answer about a place already named is allowed only for a firm, plan-backed finish.
    const pick = fresh.find((s) => !usedPlaces.has(s.place)) ?? fresh.find((s) => s.feature !== undefined && s.firm === true);
    if (pick === undefined) continue;
    const { rank: _rank, firm: _firm, ...suggestion } = pick;
    void _rank;
    void _firm;
    if ([suggestion.title, suggestion.because, ...suggestion.evidence.map((e) => e.what)].some((t) => wordingProblems(t).length > 0)) continue;
    usedPlaces.add(suggestion.place);
    usedTargets.add(`${suggestion.place}/${suggestion.feature ?? ''}`);
    out.push(suggestion);
  }
  return out;
}
