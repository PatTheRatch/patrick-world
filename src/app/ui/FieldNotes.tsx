// Field notes: what the survey suggests, and why. Advisory throughout. The reading of a
// project is generated and says so; the suggestions are rules over the record and cite it.

import { signal, useSignal } from '@preact/signals';
import type { ResumeEvidence, ResumePoint, WorldQuestion } from '../../understanding/resume';
import type { Claim, ProjectUnderstanding } from '../../understanding/types';
import { dayMonthYear } from '../dates';
import { isPresent, keyOpen, method, selection, world, worldNotes } from '../store';
import { inspect, visit } from '../view';
import { planOpen } from './PlanSheet';

const EFFORT: Record<ResumePoint['effort'], string> = {
  quick: 'A short sitting',
  session: 'A session',
  deep: 'A long session',
};

const QUESTION: Record<WorldQuestion, string> = {
  momentum: 'Has momentum',
  'quick-finish': 'Could be finished quickly',
  'near-milestone': 'Close to a milestone',
  neglected: 'Standing, and left a while',
  'promote-idea': 'An idea gathering weight',
};

/** Where each piece of evidence can be checked. */
function Sources({ evidence }: { evidence: ResumeEvidence[] }) {
  const all = [...new Set(evidence.flatMap((e) => e.source.split(/;\s*/)))];
  const sources = all.slice(0, 3);
  return (
    <p class="why-sources">
      From {sources.join(', ')}
      {all.length > 3 ? ` and ${all.length - 3} more` : ''}.
    </p>
  );
}

/** What a generated reading is, said plainly wherever one is shown. */
export function Provenance({ of, claim }: { of: ProjectUnderstanding; claim?: Claim<unknown> }) {
  const when = dayMonthYear(of.provenance.generatedAt.slice(0, 10));
  const from = claim?.sources.length ? ` from ${claim.sources.slice(0, 3).join(', ')}` : '';
  const sure = claim?.confidence === 'low' ? ' Largely inferred.' : '';
  return (
    <p class="provenance">
      A reading made {when}
      {from}. Advisory.{sure}
    </p>
  );
}

/** What a project is, in a sentence or two, with the rest a click away. */
export function WhatThisIs({ of }: { of: ProjectUnderstanding }) {
  const open = useSignal(false);
  const text = of.whatThisIs.value;
  // Split only where a sentence really ends: a stop, a space, then a capital. A dot inside
  // a web address or a version number is not an ending.
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
  const lead = sentences[0]!.trim();
  const long = sentences.length > 1;
  return (
    <>
      <p class="what-this-is">
        {open.value || !long ? text : lead}{' '}
        {long && (
          <button type="button" class="more" onClick={() => (open.value = !open.value)}>
            {open.value ? 'Less' : 'More'}
          </button>
        )}
      </p>
      <Provenance of={of} claim={of.whatThisIs} />
    </>
  );
}

/** In a place's note: where he left off, the suggested next move, and why. */
export function ResumeSection({ points }: { points: ResumePoint[] }) {
  const [first, ...rest] = points;
  if (!first) return null;
  const go = (p: ResumePoint) => (p.feature ? inspect(p.place, p.feature, true) : visit(p.place));
  return (
    <section class="resume">
      <h3>Where to pick up</h3>
      <button type="button" class="resume-lead" onClick={() => go(first)}>
        {first.title}
      </button>
      <p class="resume-because">{first.because}</p>
      <p class="resume-effort">{EFFORT[first.effort]}.</p>
      <Sources evidence={first.evidence} />
      {rest.length > 0 && (
        <ul class="note-list resume-rest">
          {rest.slice(0, 2).map((p) => (
            <li key={`${p.rule}-${p.feature ?? ''}-${p.title}`}>
              <button type="button" class="row" title={p.because} onClick={() => go(p)}>
                <span>{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const notesOpen = signal(true);

/** At the whole territory: a few places worth going, each with the reason. */
export function FieldNotes() {
  const notes = worldNotes.value;
  if (notes.length === 0 || selection.value || method.value || keyOpen.value || planOpen.value || !isPresent.value) return null;
  const names = new Map(world.value.places.map((p) => [p.id, p.name]));
  if (!notesOpen.value) {
    return (
      <aside class="field-notes slip is-shut">
        <button type="button" class="link" onClick={() => (notesOpen.value = true)}>
          Field notes
        </button>
      </aside>
    );
  }
  return (
    <aside class="field-notes slip" aria-label="Field notes">
      <header>
        <h2>Field notes</h2>
        <button type="button" class="link" onClick={() => (notesOpen.value = false)}>
          Put away
        </button>
      </header>
      <ol>
        {notes.map((n) => (
          <li key={n.question}>
            <button type="button" class="resume-lead" onClick={() => (n.feature ? inspect(n.place, n.feature, true) : visit(n.place))}>
              {n.title}
            </button>
            <p class="resume-because">{n.because}</p>
            <p class="why-sources">
              {QUESTION[n.question]}: {names.get(n.place) ?? n.place}. From{' '}
              {[...new Set(n.evidence.flatMap((e) => e.source.split(/;\s*/)))].slice(0, 3).join(', ')}.
            </p>
          </li>
        ))}
      </ol>
      <p class="provenance">Suggestions from the record, by fixed rules. Nothing here is a score.</p>
    </aside>
  );
}
