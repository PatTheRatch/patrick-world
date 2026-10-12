// The build model: the structure underneath a building.
//
// Patrick's World owns canonical build state. A Build Plan says what "done" means for a
// feature; builders (Claude Code, Codex, Cursor, or Patrick's own hands) do the work and
// report what happened; the stage of a feature is then DERIVED from the plan and those
// reports. Nobody, human or agent, sets a stage directly.
//
// This file is contract and rule only. It imports nothing and executes nothing.

// ───────────────────────── Stages ─────────────────────────

/**
 * How far along a feature is. Each stage is a fact about its plan, never a label:
 *
 *   idea       it has been named, nothing more
 *   specified  it has an objective and at least one acceptance criterion
 *   planned    it has implementation steps
 *   ready      every dependency is done and no blocker is open
 *   building   work has started: a session is open or a step is under way or finished
 *   verifying  every step is finished; acceptance criteria are still being checked
 *   done       every acceptance criterion has passed its verification
 */
export type BuildStage = 'idea' | 'specified' | 'planned' | 'ready' | 'building' | 'verifying' | 'done';

export const BUILD_STAGES: readonly BuildStage[] = [
  'idea',
  'specified',
  'planned',
  'ready',
  'building',
  'verifying',
  'done',
];

// ───────────────────────── The plan ─────────────────────────

export type VerificationKind =
  /** A command whose exit status decides it: a test suite, a typecheck, a build. */
  | 'command'
  /** Patrick looked and judged. Recorded with his name on it. */
  | 'manual'
  /** A review by a person or an agent other than the one that built it. */
  | 'review';

export interface AcceptanceCriterion {
  id: string;
  /** What must be true, stated so that it can be checked. */
  statement: string;
  verification: {
    kind: VerificationKind;
    /** For `command`: what to run. For the others: what to look at. */
    how: string;
  };
}

export interface PlanStep {
  id: string;
  title: string;
  detail?: string;
  /** Step ids in this plan that must finish first. */
  after?: string[];
  /** Files or components this step is expected to touch, where known. A prediction, not a fence. */
  touches?: string[];
}

export interface BuildPlan {
  place: string;
  feature: string;
  /** Raised by every revision. Results are recorded against the revision they were run on. */
  revision: number;
  /** One or two sentences: what this is for. */
  objective: string;
  criteria: AcceptanceCriterion[];
  steps: PlanStep[];
  /** Features that must be done first, as `place/feature`. May cross places. */
  dependsOn: string[];
  /** Tests or checks the work must add or keep passing, beyond the acceptance criteria. */
  verification?: string[];
  notes?: string;
}

// ───────────────────────── What happened ─────────────────────────
// Plan state is a log too. These join the world's event log (see DATA_MODEL.md).

/** Who or what did something. `manual` is Patrick working by hand, and is a builder like any other. */
export type BuilderId = 'manual' | 'claude-code' | 'codex' | 'cursor' | (string & {});

interface BuildEventBase {
  id: string;
  /** ISO date-time. Build events need more than day precision. */
  at: string;
  place: string;
  feature: string;
}

/** The plan was written or revised. The whole plan is carried: plans are small, and history matters. */
export interface PlanWritten extends BuildEventBase {
  type: 'plan.written';
  plan: BuildPlan;
  /** Who wrote this revision. An agent may draft; only Patrick's acceptance makes it the plan. */
  author: BuilderId | 'patrick';
  accepted: boolean;
}

export interface BlockerRaised extends BuildEventBase {
  type: 'blocker.raised';
  blocker: string;
  reason: string;
  by: BuilderId | 'patrick';
}
export interface BlockerCleared extends BuildEventBase {
  type: 'blocker.cleared';
  blocker: string;
  resolution?: string;
}

/**
 * Reports from a builder. This is the vocabulary every adapter translates its tool's
 * output into. A builder reports; it never concludes that a feature is done.
 */
export type ExecutionEvent =
  | (BuildEventBase & { type: 'session.started'; session: string; builder: BuilderId; revision: number })
  | (BuildEventBase & { type: 'session.ended'; session: string; outcome: 'finished' | 'stopped' | 'failed' })
  | (BuildEventBase & { type: 'step.started'; session: string; step: string })
  | (BuildEventBase & { type: 'step.completed'; session: string; step: string })
  | (BuildEventBase & { type: 'file.changed'; session: string; path: string; added: number; removed: number })
  | (BuildEventBase & { type: 'test.run'; session: string; command: string; passed: number; failed: number })
  | (BuildEventBase & { type: 'agent.message'; session: string; text: string })
  | (BuildEventBase & { type: 'verification.started'; session: string })
  | (BuildEventBase & {
      type: 'criterion.checked';
      session: string;
      criterion: string;
      revision: number;
      passed: boolean;
      /** What was observed: command output tail, or what the reviewer saw. */
      evidence: string;
      /** Who checked. For `manual` and `review` criteria this must not be the builder that did the work. */
      by: BuilderId | 'patrick';
    })
  | (BuildEventBase & { type: 'build.completed'; session: string });

export type BuildEvent = PlanWritten | BlockerRaised | BlockerCleared | ExecutionEvent;

// ───────────────────────── Derived build state ─────────────────────────

export interface BuildState {
  stage: BuildStage;
  /** The accepted plan, if there is one. */
  plan?: BuildPlan;
  /** A newer revision an agent has drafted and Patrick has not accepted. */
  draft?: BuildPlan;
  stepsDone: string[];
  stepsStarted: string[];
  criteriaPassed: string[];
  criteriaFailed: string[];
  openBlockers: { blocker: string; reason: string }[];
  /** Dependencies not yet done, as `place/feature`. */
  waitingOn: string[];
  /** The session currently open, if any: this is what makes a building visibly under construction. */
  activeSession?: { session: string; builder: BuilderId; since: string };
  /** 0–1: steps finished over steps planned. Drives how much of the footprint is washed. */
  progress: number;
  /** Why the stage is what it is, in plain words. Shown in the building's note. */
  because: string;
}

/**
 * The rule. Given everything recorded about one feature, where does it stand?
 *
 * `isDone` answers whether a dependency (as `place/feature`) is done; the caller supplies
 * it so that this function stays pure and local to one feature.
 */
export function deriveBuild(events: BuildEvent[], isDone: (ref: string) => boolean): BuildState {
  let plan: BuildPlan | undefined;
  let draft: BuildPlan | undefined;
  const started = new Set<string>();
  const done = new Set<string>();
  const verdict = new Map<string, boolean>();
  const blockers = new Map<string, string>();
  let active: BuildState['activeSession'];
  let anySession = false;

  for (const e of events) {
    switch (e.type) {
      case 'plan.written':
        if (e.accepted) {
          // A new accepted revision voids earlier verdicts: they were about a different promise.
          if (plan && e.plan.revision !== plan.revision) verdict.clear();
          plan = e.plan;
          draft = undefined;
        } else draft = e.plan;
        break;
      case 'blocker.raised':
        blockers.set(e.blocker, e.reason);
        break;
      case 'blocker.cleared':
        blockers.delete(e.blocker);
        break;
      case 'session.started':
        anySession = true;
        active = { session: e.session, builder: e.builder, since: e.at };
        break;
      case 'session.ended':
        if (active?.session === e.session) active = undefined;
        break;
      case 'step.started':
        started.add(e.step);
        break;
      case 'step.completed':
        started.add(e.step);
        done.add(e.step);
        break;
      case 'criterion.checked':
        // Only a verdict on the current revision counts; the latest verdict wins.
        if (plan && e.revision === plan.revision) verdict.set(e.criterion, e.passed);
        break;
      default:
        break;
    }
  }

  const steps = plan?.steps ?? [];
  const criteria = plan?.criteria ?? [];
  const stepsDone = steps.filter((s) => done.has(s.id)).map((s) => s.id);
  const stepsStarted = steps.filter((s) => started.has(s.id) && !done.has(s.id)).map((s) => s.id);
  const criteriaPassed = criteria.filter((c) => verdict.get(c.id) === true).map((c) => c.id);
  const criteriaFailed = criteria.filter((c) => verdict.get(c.id) === false).map((c) => c.id);
  const waitingOn = (plan?.dependsOn ?? []).filter((ref) => !isDone(ref));
  const openBlockers = [...blockers].map(([blocker, reason]) => ({ blocker, reason }));
  const progress = steps.length ? stepsDone.length / steps.length : 0;

  const base = {
    plan,
    draft,
    stepsDone,
    stepsStarted,
    criteriaPassed,
    criteriaFailed,
    openBlockers,
    waitingOn,
    activeSession: active,
    progress,
  };
  const at = (stage: BuildStage, because: string): BuildState => ({ ...base, stage, because });
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  if (!plan || !plan.objective.trim() || criteria.length === 0) {
    return at('idea', plan ? 'It has no acceptance criteria yet.' : 'Nothing is written down beyond its name.');
  }
  if (steps.length === 0) return at('specified', 'It says what done means, but not how to get there.');

  const working = anySession || started.size > 0 || done.size > 0;
  if (!working) {
    if (waitingOn.length > 0) return at('planned', `Waiting on ${count(waitingOn.length, 'dependency', 'dependencies')}.`);
    if (openBlockers.length > 0) return at('planned', `Blocked: ${openBlockers[0]!.reason}`);
    return at('ready', 'Planned, unblocked, and nothing it depends on is outstanding.');
  }

  if (stepsDone.length < steps.length) {
    const left = steps.length - stepsDone.length;
    return at('building', `${count(left, 'step', 'steps')} of ${steps.length} still to finish.`);
  }

  // Every step is finished. Done is earned only by every criterion passing on this revision.
  if (criteriaPassed.length === criteria.length) return at('done', 'Every acceptance criterion has passed.');
  if (criteriaFailed.length > 0) {
    return at('verifying', `${count(criteriaFailed.length, 'criterion', 'criteria')} failed verification.`);
  }
  const unchecked = criteria.length - criteriaPassed.length;
  return at('verifying', `${count(unchecked, 'criterion', 'criteria')} not yet checked.`);
}

// ───────────────────────── Builders ─────────────────────────

/** What a builder is handed. Everything it needs, and nothing that lets it decide the outcome. */
export interface BuildBrief {
  plan: BuildPlan;
  /** Where the code lives, when known. */
  workspace?: { repository?: string; path?: string; branch?: string };
  /** Steps to attempt in this session. Omitted means "whatever is next". */
  steps?: string[];
  /** Context a builder may read: the place's note, neighbouring features, earlier sessions. */
  context: string;
}

export interface BuildSession {
  readonly id: string;
  readonly builder: BuilderId;
  /** Ask the builder to stop. It should report `session.ended` with `stopped`. */
  stop(): Promise<void>;
}

/**
 * An execution provider: Claude Code, Codex, Cursor, or the hand-built "manual" provider.
 * The contract is deliberately small. A provider starts work and reports events; Patrick's
 * World records them and derives the state. Providers never write state.
 */
export interface BuilderAdapter {
  readonly id: BuilderId;
  readonly label: string;
  /** Whether this builder can be used here and now (installed, signed in, reachable). */
  available(): Promise<{ ok: boolean; why?: string }>;
  /** Begin a session. Every report arrives through `report`, in order. */
  start(brief: BuildBrief, report: (event: ExecutionEvent) => void): Promise<BuildSession>;
  /** Pick up a session that was running when the app closed, if the builder supports it. */
  resume?(session: string, report: (event: ExecutionEvent) => void): Promise<BuildSession | null>;
}

// ───────────────────────── Ideas ─────────────────────────

/** Where an idea came from. Recorded so that suggested and self-originated ideas stay distinguishable. */
export type IdeaOrigin = 'patrick' | 'claude' | 'chatgpt' | 'patrick-os' | (string & {});

/**
 * What a spark can be worked up into before anything is built. Every field is optional:
 * a scaffold is filled in as the idea is thought about, and an idea is never required to have one.
 */
export interface IdeaScaffold {
  place: string;
  revision: number;
  problem?: string;
  hypothesis?: string;
  targetUser?: string;
  capabilities?: string[];
  /** The smallest version worth building. Each entry becomes a staked lot if the idea is pursued. */
  mvp?: string[];
  risks?: string[];
  openQuestions?: string[];
  technicalPossibilities?: string[];
  firstExperiment?: string;
}

export interface ScaffoldWritten {
  id: string;
  at: string;
  type: 'scaffold.written';
  place: string;
  scaffold: IdeaScaffold;
  /** An AI may draft a scaffold. It is a suggestion until Patrick accepts it. */
  author: IdeaOrigin;
  accepted: boolean;
}

/** Patrick's decision to pursue an idea. This, not the scaffold, is what stakes lots on the map. */
export interface IdeaPursued {
  id: string;
  at: string;
  type: 'idea.pursued';
  place: string;
  /** Which MVP entries to stake as features, by index into the accepted scaffold's `mvp`. */
  stake: number[];
}

/** Drafts a scaffold from a raw idea. Like a builder, it proposes and never decides. */
export interface ScaffoldProvider {
  readonly id: IdeaOrigin;
  readonly label: string;
  draft(idea: { name: string; note: string; context?: string }): Promise<Omit<IdeaScaffold, 'place' | 'revision'>>;
}

// ───────────────────────── Observers ─────────────────────────

/**
 * Something outside that wants to know what happened here: Patrick OS, first of all.
 * An observer is told after the fact. It cannot veto, alter or delay an event, and the
 * world behaves identically with no observers at all.
 */
export interface WorldObserver {
  readonly id: string;
  readonly label: string;
  /** Which events it wants. Keep it narrow: most of the log is noise to an outsider. */
  wants(event: { type: string }): boolean;
  /** Called with events already recorded, in order. Failures are logged and never retried inline. */
  observe(events: readonly { id: string; at: string; type: string }[]): void | Promise<void>;
}
