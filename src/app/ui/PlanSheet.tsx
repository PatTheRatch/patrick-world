// The plan sheet: a building's own page of the atlas. What it is for, what done means, how
// to get there, who is building it, and what has been proven. Also where Patrick builds by
// hand: the same plan and the same events an agent would report.

import { signal, useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  BUILD_STAGES,
  type AcceptanceCriterion,
  type BuildEvent,
  type BuildPlan,
  type BuildStage,
  type BuildState,
  type BuilderId,
  type VerificationKind,
} from '../../world/build';
import type { FeatureState, PlaceState } from '../../world/types';
import {
  BUILDERS,
  BUILDER_NAME,
  checkCriterion,
  clearBlocker,
  completeStep,
  endSession,
  raiseBlocker,
  startSession,
  writePlan,
} from '../builds';
import { dayMonthYear } from '../dates';
import { buildEvents, isPresent, selectedFeature, selectedPlace } from '../store';

export const planOpen = signal(false);

export const STAGE_WORD: Record<BuildStage, string> = {
  idea: 'Idea',
  specified: 'Specified',
  planned: 'Planned',
  ready: 'Ready',
  building: 'Building',
  verifying: 'Verifying',
  done: 'Done',
};

const KIND_WORD: Record<VerificationKind, string> = { command: 'By command', review: 'By review', manual: 'By eye' };

/** The mark a criterion carries on the map and on the sheet: shape is how it is checked. */
export function CriterionMark({ kind, state }: { kind: VerificationKind; state: 'passed' | 'failed' | 'open' }) {
  const fill = state === 'passed' ? 'var(--ink)' : 'var(--slip)';
  const stroke = state === 'open' ? 'var(--graphite)' : 'var(--ink)';
  return (
    <svg class="mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {kind === 'command' && <rect x="3.5" y="3.5" width="9" height="9" fill={fill} stroke={stroke} stroke-width="1.3" />}
      {kind === 'review' && <path d="M8 2.2 13.8 8 8 13.8 2.2 8z" fill={fill} stroke={stroke} stroke-width="1.3" />}
      {kind === 'manual' && <circle cx="8" cy="8" r="4.8" fill={fill} stroke={stroke} stroke-width="1.3" />}
      {state === 'failed' && <path d="M2 14 14 2" stroke="var(--ink)" stroke-width="1.6" />}
    </svg>
  );
}

/** The latest verdict on each criterion of the current revision, with its evidence. */
export function verdicts(events: BuildEvent[], place: string, feature: string, revision: number) {
  const out = new Map<string, Extract<BuildEvent, { type: 'criterion.checked' }>>();
  for (const e of events) {
    if (e.place !== place || e.feature !== feature || e.type !== 'criterion.checked' || e.revision !== revision) continue;
    const held = out.get(e.criterion);
    if (!held || e.at >= held.at) out.set(e.criterion, e);
  }
  return out;
}

const clock = (iso: string) => `${dayMonthYear(iso.slice(0, 10))}, ${iso.slice(11, 16)}`;

function describe(e: BuildEvent, plan?: BuildPlan): string | null {
  const step = (id: string) => plan?.steps.find((s) => s.id === id)?.title ?? id;
  switch (e.type) {
    case 'plan.written':
      return e.accepted ? `Plan revision ${e.plan.revision} accepted.` : `${BUILDER_NAME[e.author] ?? e.author} drafted revision ${e.plan.revision}.`;
    case 'blocker.raised':
      return `Blocked: ${e.reason}`;
    case 'blocker.cleared':
      return `Unblocked${e.resolution ? `: ${e.resolution}` : '.'}`;
    case 'session.started':
      return `${BUILDER_NAME[e.builder] ?? e.builder} began a session.`;
    case 'session.ended':
      return `Session ${e.outcome}.`;
    case 'step.completed':
      return `Finished: ${step(e.step)}.`;
    case 'test.run':
      return `${e.command}: ${e.passed} passed, ${e.failed} failed.`;
    case 'criterion.checked':
      return `${e.passed ? 'Passed' : 'Failed'}: ${plan?.criteria.find((c) => c.id === e.criterion)?.statement ?? e.criterion}`;
    case 'build.completed':
      return 'The builder reported it finished. (A report, not a verdict.)';
    case 'agent.message':
      return `“${e.text}”`;
    case 'file.changed':
      return `${e.path} (+${e.added} −${e.removed})`;
    default:
      return null;
  }
}

export function PlanSheet() {
  const sheet = useRef<HTMLDivElement>(null);
  const editing = useSignal(false);
  const place = selectedPlace.value;
  const feature = selectedFeature.value;
  const open = planOpen.value && !!place && !!feature;
  useEffect(() => {
    if (open) sheet.current?.focus();
    else editing.value = false;
  }, [open]);
  if (!open || !place || !feature) return null;

  const build = feature.build;
  const plan = build?.plan;
  const log = buildEvents.value.filter((e) => e.place === place.id && e.feature === feature.id);
  const writing = editing.value || !plan;

  return (
    <div class="key-backdrop" onClick={(e) => e.target === e.currentTarget && (planOpen.value = false)}>
      <div class="key slip plan" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="plan-title" tabIndex={-1}>
        <header class="key-head">
          <h2 id="plan-title">{feature.name}</h2>
          <button type="button" class="link" onClick={() => (planOpen.value = false)}>
            Back to the map <kbd>Esc</kbd>
          </button>
        </header>
        <p class="plan-where">
          {place.name}
          {plan ? `. Plan, revision ${plan.revision}.` : '. No plan yet.'}
        </p>

        <ol class="plan-stages" aria-label="Stage">
          {BUILD_STAGES.map((s) => (
            <li key={s} class={s === (build?.stage ?? 'idea') ? 'is-here' : ''} aria-current={s === (build?.stage ?? 'idea') ? 'step' : undefined}>
              {STAGE_WORD[s]}
            </li>
          ))}
        </ol>
        <p class="plan-because">{build?.because ?? 'Nothing is written down beyond its name.'}</p>

        {writing ? (
          <PlanForm place={place} feature={feature} current={plan} onDone={() => (editing.value = false)} />
        ) : (
          <PlanView place={place} feature={feature} build={build!} plan={plan!} log={log} onRevise={() => (editing.value = true)} />
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Reading and building ─────────────────────────

function PlanView(props: { place: PlaceState; feature: FeatureState; build: BuildState; plan: BuildPlan; log: BuildEvent[]; onRevise: () => void }) {
  const { place, feature, build, plan, log } = props;
  const can = isPresent.value;
  const session = build.activeSession;
  const mine = session?.builder === 'manual';
  const checks = verdicts(log, place.id, feature.id, plan.revision);
  const blocker = useSignal('');
  const allStepsDone = build.stepsDone.length === plan.steps.length && plan.steps.length > 0;

  return (
    <div class="plan-columns">
      <section>
        <h3>Objective</h3>
        <p class="plan-objective">{plan.objective}</p>

        <h3>Steps</h3>
        {plan.steps.length === 0 ? (
          <p class="plan-none">None yet. It says what done means, but not how to get there.</p>
        ) : (
          <ol class="plan-steps">
            {plan.steps.map((s) => {
              const done = build.stepsDone.includes(s.id);
              const started = build.stepsStarted.includes(s.id);
              return (
                <li key={s.id} class={done ? 'is-done' : started ? 'is-started' : ''}>
                  <span class="step-box" aria-hidden="true" />
                  <span class="step-title">
                    {s.title}
                    {s.touches?.length ? <small>{s.touches.join(', ')}</small> : null}
                  </span>
                  {can && mine && !done && (
                    <button type="button" class="link" onClick={() => completeStep(place.id, feature.id, session!.session, s.id)}>
                      Finished
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <h3>Who is building it</h3>
        {session ? (
          <p class="plan-session">
            <b>{BUILDER_NAME[session.builder] ?? session.builder}</b> has a session open, since {clock(session.since)}.{' '}
            {can && mine && (
              <button type="button" class="link" onClick={() => endSession(place.id, feature.id, session.session, allStepsDone ? 'finished' : 'stopped')}>
                End the session
              </button>
            )}
          </p>
        ) : build.stage === 'done' ? (
          <p class="plan-session">Nobody. It is done.</p>
        ) : (
          <>
            <p class="plan-session">
              {build.waitingOn.length > 0
                ? 'Nobody yet. It is waiting on something else.'
                : build.openBlockers.length > 0
                  ? 'Nobody. It is blocked.'
                  : plan.steps.length === 0
                    ? 'Nobody yet. It needs steps before it can be begun.'
                    : 'Nobody at the moment.'}
            </p>
            {can && plan.steps.length > 0 && build.waitingOn.length === 0 && build.openBlockers.length === 0 && (
              <ul class="plan-builders">
                {BUILDERS.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      class="link"
                      disabled={!b.connected}
                      title={b.why}
                      onClick={() => startSession(place.id, feature.id, b.id as BuilderId, plan.revision)}
                    >
                      {b.label}
                    </button>
                    {!b.connected && <small>not connected yet</small>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <h3>In the way</h3>
        {build.waitingOn.length === 0 && build.openBlockers.length === 0 && <p class="plan-none">Nothing.</p>}
        {build.waitingOn.map((ref) => (
          <p key={ref} class="plan-blocker">
            Waiting on {ref.split('/')[1]?.split('.').pop()?.replace(/-/g, ' ') ?? ref}.
          </p>
        ))}
        {build.openBlockers.map((b) => (
          <p key={b.blocker} class="plan-blocker">
            {b.reason}{' '}
            {can && (
              <button type="button" class="link" onClick={() => clearBlocker(place.id, feature.id, b.blocker)}>
                Cleared
              </button>
            )}
          </p>
        ))}
        {can && build.stage !== 'done' && (
          <form
            class="plan-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (!blocker.value.trim()) return;
              raiseBlocker(place.id, feature.id, blocker.value.trim());
              blocker.value = '';
            }}
          >
            <label for="plan-blocker">Something is in the way</label>
            <input
              id="plan-blocker"
              type="text"
              autocomplete="off"
              placeholder="What is blocking it"
              value={blocker.value}
              onInput={(e) => (blocker.value = (e.target as HTMLInputElement).value)}
            />
            <button type="submit" class="link">
              Record it
            </button>
          </form>
        )}
      </section>

      <section>
        <h3>Done means</h3>
        <ul class="plan-criteria">
          {plan.criteria.map((c) => {
            const v = checks.get(c.id);
            const state = v ? (v.passed ? 'passed' : 'failed') : 'open';
            return (
              <li key={c.id} class={`is-${state}`}>
                <CriterionMark kind={c.verification.kind} state={state} />
                <div>
                  <p class="criterion-statement">{c.statement}</p>
                  <p class="criterion-how">
                    {KIND_WORD[c.verification.kind]}: {c.verification.how}
                  </p>
                  {v ? (
                    <p class="criterion-verdict">
                      <b>{v.passed ? 'Passed' : 'Failed'}</b>, {clock(v.at)}, checked by {BUILDER_NAME[v.by] ?? v.by}. <q>{v.evidence}</q>
                    </p>
                  ) : (
                    <p class="criterion-verdict">Not yet checked.</p>
                  )}
                  {can && <Verdict place={place.id} feature={feature.id} criterion={c} revision={plan.revision} session={session?.session ?? 'by-hand'} />}
                </div>
              </li>
            );
          })}
        </ul>
        {build.stage === 'done' && build.provenBy && (
          <p class="plan-proof">
            {build.provenBy === 'command'
              ? 'Every criterion passed by command.'
              : build.provenBy === 'review'
                ? 'Proven by command and by review.'
                : 'Done, resting in part on your own word.'}
          </p>
        )}
        {build.rewrites.length > 0 && (
          <p class="plan-proof">
            The plan has promised less {build.rewrites.length === 1 ? 'once' : `${build.rewrites.length} times`} since it was first accepted.
          </p>
        )}
        {plan.verification?.length ? (
          <>
            <h3>Also</h3>
            <ul class="plan-also">
              {plan.verification.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </>
        ) : null}

        <h3>What has happened</h3>
        <ol class="plan-log">
          {log
            .slice(-12)
            .reverse()
            .map((e) => {
              const text = describe(e, plan);
              return text ? (
                <li key={e.id}>
                  <time>{clock(e.at)}</time>
                  <span>{text}</span>
                </li>
              ) : null;
            })}
        </ol>

        {can && (
          <nav class="note-actions">
            <button type="button" class="link" onClick={props.onRevise}>
              Revise the plan
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}

/** Record a verdict on one criterion, with what was seen. Evidence is required. */
function Verdict(props: { place: string; feature: string; criterion: AcceptanceCriterion; revision: number; session: string }) {
  const open = useSignal(false);
  const evidence = useSignal('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open.value) input.current?.focus();
  }, [open.value]);
  if (!open.value) {
    return (
      <button type="button" class="link criterion-check" onClick={() => (open.value = true)}>
        Record a check
      </button>
    );
  }
  const submit = (passed: boolean) => {
    const seen = evidence.value.trim();
    if (!seen) return input.current?.focus();
    checkCriterion(props.place, props.feature, {
      session: props.session,
      criterion: props.criterion.id,
      revision: props.revision,
      passed,
      evidence: seen,
      by: 'patrick',
    });
    evidence.value = '';
    open.value = false;
  };
  return (
    <form class="plan-inline" onSubmit={(e) => e.preventDefault()}>
      <label for={`ev-${props.criterion.id}`}>
        {props.criterion.verification.kind === 'command' ? 'What did the command print?' : 'What did you see?'}
      </label>
      <input
        id={`ev-${props.criterion.id}`}
        ref={input}
        type="text"
        autocomplete="off"
        placeholder="The evidence, in a line"
        value={evidence.value}
        onInput={(e) => (evidence.value = (e.target as HTMLInputElement).value)}
      />
      <span class="plan-inline-actions">
        <button type="button" class="link" onClick={() => submit(true)}>
          It passed
        </button>
        <button type="button" class="link" onClick={() => submit(false)}>
          It failed
        </button>
        <button type="button" class="link" onClick={() => (open.value = false)}>
          Cancel
        </button>
      </span>
    </form>
  );
}

// ───────────────────────── Writing the plan ─────────────────────────

function PlanForm(props: { place: PlaceState; feature: FeatureState; current?: BuildPlan; onDone: () => void }) {
  const { current } = props;
  const objective = useSignal(current?.objective ?? '');
  const criteria = useSignal<{ statement: string; kind: VerificationKind; how: string }[]>(
    current?.criteria.map((c) => ({ statement: c.statement, kind: c.verification.kind, how: c.verification.how })) ?? [
      { statement: '', kind: 'command', how: '' },
    ],
  );
  const steps = useSignal<string[]>(current?.steps.length ? current.steps.map((s) => s.title) : ['']);
  const first = useRef<HTMLTextAreaElement>(null);
  useEffect(() => first.current?.focus(), []);

  const submit = (e: Event) => {
    e.preventDefault();
    const slug = (text: string, i: number) => `${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item'}-${i}`;
    const keptCriteria = criteria.value.filter((c) => c.statement.trim());
    const keptSteps = steps.value.filter((s) => s.trim());
    if (!objective.value.trim()) return first.current?.focus();
    const plan: BuildPlan = {
      place: props.place.id,
      feature: props.feature.id,
      revision: (current?.revision ?? 0) + 1,
      objective: objective.value.trim(),
      // A criterion kept from the last revision keeps its id, so the world can tell a
      // rewording from a dropped promise.
      criteria: keptCriteria.map((c, i) => ({
        id: current?.criteria.find((old) => old.statement === c.statement.trim())?.id ?? slug(c.statement, i),
        statement: c.statement.trim(),
        verification: { kind: c.kind, how: c.how.trim() || (c.kind === 'command' ? 'A command to be decided.' : 'Look at it.') },
      })),
      steps: keptSteps.map((title, i) => ({
        id: current?.steps.find((old) => old.title === title.trim())?.id ?? slug(title, i),
        title: title.trim(),
      })),
      dependsOn: current?.dependsOn ?? [],
      ...(current?.verification ? { verification: current.verification } : {}),
    };
    writePlan(plan);
    props.onDone();
  };

  return (
    <form class="plan-form" onSubmit={submit}>
      <label for="plan-objective">What is this for? One or two sentences.</label>
      <textarea
        id="plan-objective"
        ref={first}
        rows={2}
        value={objective.value}
        onInput={(e) => (objective.value = (e.target as HTMLTextAreaElement).value)}
      />

      <fieldset>
        <legend>Done means. Each must be something that can be checked.</legend>
        {criteria.value.map((c, i) => (
          <div class="plan-row" key={i}>
            <input
              type="text"
              autocomplete="off"
              aria-label={`Criterion ${i + 1}`}
              placeholder="What must be true"
              value={c.statement}
              onInput={(e) => (criteria.value = criteria.value.map((x, k) => (k === i ? { ...x, statement: (e.target as HTMLInputElement).value } : x)))}
            />
            <select
              aria-label={`How criterion ${i + 1} is checked`}
              value={c.kind}
              onChange={(e) => (criteria.value = criteria.value.map((x, k) => (k === i ? { ...x, kind: (e.target as HTMLSelectElement).value as VerificationKind } : x)))}
            >
              <option value="command">a command decides</option>
              <option value="manual">I look and judge</option>
              <option value="review">someone else reviews</option>
            </select>
            <input
              type="text"
              autocomplete="off"
              aria-label={`How to check criterion ${i + 1}`}
              placeholder={c.kind === 'command' ? 'npm test auth' : 'What to look at'}
              value={c.how}
              onInput={(e) => (criteria.value = criteria.value.map((x, k) => (k === i ? { ...x, how: (e.target as HTMLInputElement).value } : x)))}
            />
          </div>
        ))}
        <button type="button" class="link" onClick={() => (criteria.value = [...criteria.value, { statement: '', kind: 'command', how: '' }])}>
          Another criterion
        </button>
      </fieldset>

      <fieldset>
        <legend>Steps, in order. Leave empty to say only what done means for now.</legend>
        {steps.value.map((s, i) => (
          <div class="plan-row is-step" key={i}>
            <input
              type="text"
              autocomplete="off"
              aria-label={`Step ${i + 1}`}
              placeholder="A piece of the work"
              value={s}
              onInput={(e) => (steps.value = steps.value.map((x, k) => (k === i ? (e.target as HTMLInputElement).value : x)))}
            />
          </div>
        ))}
        <button type="button" class="link" onClick={() => (steps.value = [...steps.value, ''])}>
          Another step
        </button>
      </fieldset>

      <p class="plan-none">
        {current
          ? 'Accepting a new revision sets aside the checks made on the old one. Dropping a criterion is remembered.'
          : 'Accepting this makes it the plan. The building is drawn from it from then on.'}
      </p>
      <nav class="note-actions">
        <button type="submit" class="link">
          Accept this plan
        </button>
        {current && (
          <button type="button" class="link" onClick={props.onDone}>
            Cancel
          </button>
        )}
      </nav>
    </form>
  );
}
