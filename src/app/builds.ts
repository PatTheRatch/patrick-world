// Building from inside the world. Everything here appends build events and nothing else:
// the stage of a feature is whatever `deriveBuild` makes of them.
//
// This is also the manual builder. Patrick working by hand reports the same events an agent
// would, through the same functions, against the same plan.

import { signal } from '@preact/signals';
import type { BuildEvent, BuildPlan, BuilderId } from '../world/build';

const KEY = (sheet: string) => `patricks-world/build-events/${sheet}/v1`;

/** Build events from fixtures (the specimen's scripted build). */
export const fixtureBuilds = signal<BuildEvent[]>([]);
/** Build events recorded here, by hand or by a builder. */
export const recordedBuilds = signal<BuildEvent[]>([]);

let sheet = 'specimen';
let today = () => new Date().toISOString().slice(0, 10);
let writable = () => true;

/** Point the build log at a sheet. Each sheet keeps its own, like manual marks. */
export function openBuildLog(kind: string, presentDay: () => string, canWrite: () => boolean) {
  sheet = kind;
  today = presentDay;
  writable = canWrite;
  try {
    const raw = localStorage.getItem(KEY(sheet));
    recordedBuilds.value = raw ? (JSON.parse(raw) as BuildEvent[]) : [];
  } catch {
    recordedBuilds.value = [];
  }
}

let serial = 0;
/** Append events. Dated on the sheet's present day, at the real time of day. */
function report(place: string, feature: string, parts: Record<string, unknown>[]) {
  if (!writable()) return;
  const clock = new Date().toISOString().slice(10);
  const stamped = parts.map(
    (p, i) =>
      ({
        id: `rec-${Date.now().toString(36)}-${(serial++).toString(36)}`,
        // Keep events from one action in order.
        at: `${today()}${clock.slice(0, -5)}.${String(i).padStart(3, '0')}Z`,
        place,
        feature,
        ...p,
      }) as BuildEvent,
  );
  recordedBuilds.value = [...recordedBuilds.value, ...stamped];
  try {
    localStorage.setItem(KEY(sheet), JSON.stringify(recordedBuilds.value));
  } catch {
    // Storage unavailable: the log lives for this session only.
  }
}

export function clearRecordedBuilds() {
  if (!writable()) return;
  recordedBuilds.value = [];
  try {
    localStorage.removeItem(KEY(sheet));
  } catch {
    // Nothing to remove.
  }
}

// ───────────────────────── The plan ─────────────────────────

/** Write a revision of the plan. Written by Patrick, it is accepted; a builder's is a draft. */
export function writePlan(plan: BuildPlan, author: BuilderId | 'patrick' = 'patrick') {
  report(plan.place, plan.feature, [{ type: 'plan.written', plan, author, accepted: author === 'patrick' }]);
}

export function raiseBlocker(place: string, feature: string, reason: string) {
  report(place, feature, [{ type: 'blocker.raised', blocker: `b-${Date.now().toString(36)}`, reason, by: 'patrick' }]);
}

export function clearBlocker(place: string, feature: string, blocker: string, resolution?: string) {
  report(place, feature, [{ type: 'blocker.cleared', blocker, ...(resolution ? { resolution } : {}) }]);
}

// ───────────────────────── Building ─────────────────────────

export function startSession(place: string, feature: string, builder: BuilderId, revision: number): string {
  const session = `s-${Date.now().toString(36)}`;
  report(place, feature, [{ type: 'session.started', session, builder, revision }]);
  return session;
}

export function endSession(place: string, feature: string, session: string, outcome: 'finished' | 'stopped' = 'stopped') {
  report(place, feature, [{ type: 'session.ended', session, outcome }]);
}

export function completeStep(place: string, feature: string, session: string, step: string) {
  report(place, feature, [{ type: 'step.completed', session, step }]);
}

/** Record a verdict on one criterion. The only thing that can make a feature done, or undo it. */
export function checkCriterion(
  place: string,
  feature: string,
  o: { session: string; criterion: string; revision: number; passed: boolean; evidence: string; by: BuilderId | 'patrick' },
) {
  report(place, feature, [{ type: 'criterion.checked', ...o }]);
}

/** Builders the world knows how to hand work to. Only one is connected today. */
export const BUILDERS: { id: BuilderId; label: string; connected: boolean; why?: string }[] = [
  { id: 'manual', label: 'Build manually', connected: true },
  { id: 'claude-code', label: 'Claude Code', connected: false, why: 'Needs the local companion, which is not built yet.' },
  { id: 'codex', label: 'Codex', connected: false, why: 'Needs the local companion, which is not built yet.' },
  { id: 'cursor', label: 'Cursor', connected: false, why: 'Needs the local companion, which is not built yet.' },
];

export const BUILDER_NAME: Record<string, string> = {
  manual: 'Patrick, by hand',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  patrick: 'Patrick',
};
