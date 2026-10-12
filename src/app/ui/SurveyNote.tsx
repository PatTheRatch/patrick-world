// The survey note: a slip pasted on the sheet beside whatever is selected.
// It describes; it has no fields to fill in except when staking a lot.

import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { KIND_MEANING, KIND_NAME } from '../../render/palette';
import type { ScreenRect } from '../../render/renderer';
import { KINDS, RANKS, STAGES, type FeatureKind, type FeatureState, type PlaceState, type Rank } from '../../world/types';
import { anchorListeners } from '../World';
import { dayNumber, monthYear, span, yearOf } from '../dates';
import {
  asOf,
  capture,
  catalogue,
  isPresent,
  method,
  recordStage,
  selectedFeature,
  selectedPlace,
  selection,
  stakeLot,
  world,
} from '../store';
import { enter, inspect, stepOut } from '../view';
import { RANK_NAME, RankGlyph, STAGE_NAME, StageSwatch, WashSwatch } from './Swatch';

const RANK_NOUN: Record<Rank, string> = {
  spark: 'A spark',
  site: 'A staked site',
  outpost: 'An outpost',
  settlement: 'A settlement',
  town: 'A town',
  city: 'A city',
  major: 'A major city',
};

const RANK_GOAL: Record<Rank, string> = {
  spark: 'a spark',
  site: 'a staked site',
  outpost: 'an outpost',
  settlement: 'a settlement',
  town: 'a town',
  city: 'a city',
  major: 'a major city',
};

const NOTE_WIDTH = 304;

export function SurveyNote() {
  const box = useRef<HTMLElement>(null);
  const leader = useRef<SVGLineElement>(null);

  useEffect(() => {
    const place = (rect: ScreenRect | null) => {
      const el = box.current;
      const line = leader.current;
      if (!el || !line) return;
      if (!rect) {
        el.style.visibility = 'hidden';
        line.style.visibility = 'hidden';
        return;
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const h = el.offsetHeight;
      if (vw <= 640) {
        // No room beside anything: the note sits above the cartouche as a sheet.
        const floor = document.querySelector('.cartouche')?.getBoundingClientRect().top ?? vh - 190;
        el.style.transform = `translate(10px, ${Math.max(10, floor - h - 8)}px)`;
        el.style.visibility = 'visible';
        line.style.visibility = 'hidden';
        return;
      }
      const gap = 30;
      const floor = vh - 104;
      let x = rect.x + rect.w + gap;
      let side: 'right' | 'left' | 'pinned' = 'right';
      if (x + NOTE_WIDTH > vw - 16) {
        x = rect.x - gap - NOTE_WIDTH;
        side = 'left';
      }
      if (x < 16) {
        x = vw - NOTE_WIDTH - 20;
        side = 'pinned';
      }
      let y = rect.y + rect.h / 2 - Math.min(h * 0.3, 90);
      if (side === 'pinned') y = 20;
      y = Math.max(16, Math.min(y, floor - h));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.style.visibility = 'visible';

      if (side === 'pinned') {
        line.style.visibility = 'hidden';
        return;
      }
      const ax = side === 'right' ? rect.x + rect.w + 9 : rect.x - 9;
      const ay = Math.max(rect.y, Math.min(rect.y + rect.h, y + 26));
      const bx = side === 'right' ? x : x + NOTE_WIDTH;
      line.setAttribute('x1', String(ax));
      line.setAttribute('y1', String(ay));
      line.setAttribute('x2', String(bx));
      line.setAttribute('y2', String(y + 26));
      line.style.visibility = 'visible';
    };
    anchorListeners.add(place);
    return () => void anchorListeners.delete(place);
  }, []);

  const p = selectedPlace.value;
  const f = selectedFeature.value;

  return (
    <>
      <svg class="leader" aria-hidden="true">
        <line ref={leader} style={{ visibility: 'hidden' }} />
      </svg>
      <aside ref={box} class="note slip" style={{ visibility: 'hidden' }} aria-live="polite" aria-label="Survey note">
        {p && f ? <FeatureNote place={p} feature={f} /> : p ? <PlaceNote place={p} /> : null}
      </aside>
    </>
  );
}

// ───────────────────────── A place ─────────────────────────

function standing(place: PlaceState): string {
  const working = place.features.filter((f) => f.stage === 'working' || f.stage === 'mature').length;
  const noun = RANK_NOUN[place.rank];
  const today = dayNumber(asOf.value);
  const parts: string[] = [];

  if (place.features.length === 0) parts.push(`${noun}: one thought, written down.`);
  else if (working === 0) parts.push(`${noun}. Nothing standing yet.`);
  else parts.push(`${noun} of ${working} working ${working === 1 ? 'building' : 'buildings'}.`);

  const silent = place.lastWorkAt ? today - dayNumber(place.lastWorkAt) : null;
  switch (place.liveliness) {
    case 'building':
      parts.push(place.revived ? 'Under construction again after a long silence.' : 'Under construction now.');
      break;
    case 'settled':
      if (place.lastWorkAt) parts.push(`Last worked on ${span(silent!)} ago.`);
      break;
    case 'quiet':
      parts.push(place.lastWorkAt ? `Quiet for ${span(silent!)}.` : 'Untouched since it was written down.');
      break;
    case 'dormant':
      parts.push(place.lastWorkAt ? `Dormant. No work for ${span(silent!)}.` : 'An old pencil mark, never taken up.');
      break;
    case 'ruins':
      parts.push(place.abandonedAt ? `Abandoned ${monthYear(place.abandonedAt)}.` : `In ruins. No work for ${span(silent ?? 0)}.`);
      break;
  }
  if (place.users > 0) parts.push(`${place.users.toLocaleString('en-US')} people use it.`);
  parts.push(`Founded ${monthYear(place.foundedAt)}.`);
  return parts.join(' ');
}

function PlaceNote({ place }: { place: PlaceState }) {
  const building = place.features.filter((f) => f.stage === 'building');
  const staked = place.features.filter((f) => f.stage === 'concept' || f.stage === 'planned' || f.stage === 'designed');
  const region = catalogue.regions.find((r) => r.id === place.region);
  const editable = isPresent.value;
  const staking = capture.value?.type === 'lot' && capture.value.place === place.id;
  const routing = capture.value?.type === 'road' && capture.value.from === place.id;
  const small = RANKS.indexOf(place.rank) <= 3;
  const links = world.value.links.filter((l) => l.a === place.id || l.b === place.id);
  const methods = [...new Set(place.features.flatMap((x) => x.methods))];

  return (
    <article>
      <h2>{place.name}</h2>
      <p class="note-words">{place.note}</p>
      {place.abandonedNote && <p class="note-words">“{place.abandonedNote}”</p>}
      <p class="note-standing">
        {standing(place)} {region ? `In ${region.name}.` : ''}
      </p>

      {place.series.length > 1 && <Strip series={place.series} />}

      {building.length > 0 && (
        <section>
          <h3>{place.liveliness === 'building' || place.liveliness === 'settled' ? 'Being built now' : 'Left unfinished'}</h3>
          <ul class="note-list">
            {building.map((f) => (
              <li key={f.id}>
                <button type="button" class="row" onClick={() => inspect(place.id, f.id, true)}>
                  <span>{f.name}</span>
                  <span class="row-aside">{raised(f.progress)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {staked.length > 0 && (
        <section>
          <h3>Staked for later</h3>
          <ul class="note-list">
            {staked.slice(0, 5).map((f) => (
              <li key={f.id}>
                <button type="button" class="row" onClick={() => inspect(place.id, f.id, true)}>
                  <span>{f.name}</span>
                  <span class="row-aside">{STAGE_NAME[f.stage].toLowerCase()}</span>
                </button>
              </li>
            ))}
          </ul>
          {staked.length > 5 && <p class="note-more">and {staked.length - 5} more</p>}
        </section>
      )}

      {small && place.nextRank && place.liveliness !== 'ruins' && (
        <section>
          <h3>How this could grow</h3>
          <ol class="ladder ladder-ranks" aria-label="Rank">
            {RANKS.map((r, i) => {
              const here = RANKS.indexOf(place.rank);
              return (
                <li key={r} class={i === here ? 'is-here' : i < here ? 'is-past' : 'is-ahead'} aria-current={i === here ? 'step' : undefined}>
                  <RankGlyph rank={r} />
                  <span class={i === here || i === here + 1 ? '' : 'is-silent'}>{RANK_NAME[r]}</span>
                </li>
              );
            })}
          </ol>
          <p class="note-grow">
            To become {RANK_GOAL[place.nextRank.rank]}: {list(place.nextRank.needs)}.
          </p>
        </section>
      )}

      {links.length > 0 && (
        <p class="note-links">
          {links.some((l) => l.grade !== 'surveyed') ? 'Roads to ' : 'Surveyed toward '}
          {list(
            links.map((l) => {
              const other = world.value.places.find((x) => x.id === (l.a === place.id ? l.b : l.a));
              return other?.name ?? '';
            }).filter(Boolean),
          )}
          .
        </p>
      )}

      {methods.length > 0 && <Methods ids={methods} />}

      {staking ? (
        <StakeForm place={place.id} />
      ) : (
        <nav class="note-actions" aria-label={place.name}>
          {place.features.length > 0 && (
            <button type="button" class="link" onClick={() => enter(place.id)}>
              Enter
            </button>
          )}
          {editable && (
            <button type="button" class="link" onClick={() => (capture.value = { type: 'lot', place: place.id })}>
              Stake a lot
            </button>
          )}
          {editable && (
            <button
              type="button"
              class={`link${routing ? ' is-on' : ''}`}
              onClick={() => (capture.value = routing ? null : { type: 'road', from: place.id })}
            >
              {routing ? 'Click another place…' : 'Survey a road'}
            </button>
          )}
        </nav>
      )}
    </article>
  );
}

const raised = (progress: number) => {
  if (progress < 0.2) return 'just begun';
  if (progress < 0.45) return 'a third raised';
  if (progress < 0.7) return 'half raised';
  if (progress < 0.9) return 'mostly raised';
  return 'nearly done';
};

const list = (items: string[]) => {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

/** Work per month since founding. Gaps show as gaps. */
function Strip({ series }: { series: { month: string; commits: number }[] }) {
  const w = NOTE_WIDTH - 36;
  const h = 30;
  const n = series.length;
  const step = w / n;
  const max = Math.max(1, ...series.map((m) => m.commits));
  const first = series[0]!;
  const last = series[n - 1]!;
  const total = series.reduce((s, m) => s + m.commits, 0);
  return (
    <figure class="strip">
      <svg width={w} height={h + 5} viewBox={`0 0 ${w} ${h + 5}`} role="img" aria-label={`Work each month, ${monthYear(`${first.month}-01`)} to ${monthYear(`${last.month}-01`)}`}>
        <line x1="0" y1={h + 0.5} x2={w} y2={h + 0.5} class="strip-base" />
        {series.map((m, i) => {
          const bar = m.commits > 0 ? Math.max(2, Math.sqrt(m.commits / max) * h) : 0;
          const january = m.month.endsWith('-01') && i > 0;
          return (
            <g key={m.month}>
              {january && <line x1={i * step} y1={h} x2={i * step} y2={h + 5} class="strip-year" />}
              {bar > 0 && <rect x={i * step + step * 0.14} y={h - bar} width={Math.max(1, step * 0.72)} height={bar} class="strip-bar" />}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span>{yearOf(`${first.month}-01`)}</span>
        <span>
          {total.toLocaleString('en-US')} commits over {span(Math.round(n * 30.4))}
        </span>
        <span>{yearOf(`${last.month}-01`)}</span>
      </figcaption>
    </figure>
  );
}

function Methods({ ids }: { ids: string[] }) {
  const names = new Map(catalogue.methods.map((m) => [m.id, m.name]));
  return (
    <p class="note-methods">
      <span class="note-methods-lead">Built with</span>
      {ids.slice(0, 8).map((id) => (
        <button
          key={id}
          type="button"
          class={`chip${method.value === id ? ' is-on' : ''}`}
          title="Show where else this method is used"
          onClick={() => (method.value = method.value === id ? null : id)}
        >
          {names.get(id) ?? id}
        </button>
      ))}
    </p>
  );
}

function StakeForm({ place }: { place: string }) {
  const name = useSignal('');
  const kind = useSignal<FeatureKind>('works');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = (e: Event) => {
    e.preventDefault();
    const n = name.value.trim();
    if (!n) return input.current?.focus();
    const id = stakeLot(place, n, kind.value);
    capture.value = null;
    inspect(place, id, true);
  };
  return (
    <form class="stake" onSubmit={submit}>
      <label for="stake-name">What should this have?</label>
      <input
        id="stake-name"
        ref={input}
        type="text"
        autocomplete="off"
        placeholder="Authentication"
        value={name.value}
        onInput={(e) => (name.value = (e.target as HTMLInputElement).value)}
      />
      <fieldset>
        <legend>What kind of thing is it?</legend>
        {KINDS.map((k) => (
          <label key={k} class={`kind${kind.value === k ? ' is-on' : ''}`}>
            <input type="radio" name="kind" value={k} checked={kind.value === k} onChange={() => (kind.value = k)} />
            <WashSwatch kind={k} />
            <span>
              <b>{KIND_NAME[k]}</b> {KIND_MEANING[k].toLowerCase()}
            </span>
          </label>
        ))}
      </fieldset>
      <div class="note-actions">
        <button type="submit" class="link">
          Stake it
        </button>
        <button type="button" class="link" onClick={() => (capture.value = null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ───────────────────────── A building ─────────────────────────

function FeatureNote({ place, feature }: { place: PlaceState; feature: FeatureState }) {
  const at = STAGES.indexOf(feature.stage);
  const next = STAGES[at + 1];
  const done = feature.stage === 'working' || feature.stage === 'mature';
  const today = dayNumber(asOf.value);

  return (
    <article>
      <h2>{feature.name}</h2>
      <p class="note-kind">
        <WashSwatch kind={feature.kind} />
        <span>
          {KIND_NAME[feature.kind]}
          {feature.ward ? `, ${feature.ward} ward` : ''}, {place.name}
        </span>
      </p>
      {feature.note && <p class="note-words">{feature.note}</p>}

      <ol class="ladder" aria-label="Stage">
        {STAGES.map((s, i) => (
          <li key={s} class={i === at ? 'is-here' : i < at ? 'is-past' : 'is-ahead'} aria-current={i === at ? 'step' : undefined}>
            <StageSwatch stage={s} kind={feature.kind} />
            <span>{STAGE_NAME[s]}</span>
          </li>
        ))}
      </ol>

      <p class="note-standing">
        {done
          ? `Stands ${feature.storeys} ${feature.storeys === 1 ? 'storey' : 'storeys'}: ${feature.commits.toLocaleString('en-US')} commits of work.`
          : feature.commits > 0
            ? `${feature.commits.toLocaleString('en-US')} commits so far.`
            : 'No work logged yet.'}{' '}
        {feature.builtOrder ? `The ${ordinal(feature.builtOrder)} building to stand here. ` : ''}
        {feature.lastWorkAt
          ? `Last worked on ${span(today - dayNumber(feature.lastWorkAt))} ago.`
          : `Proposed ${monthYear(feature.proposedAt)}.`}
        {feature.landmark ? ' Shipped in a named release.' : ''}
      </p>

      {feature.methods.length > 0 && <Methods ids={feature.methods} />}

      <nav class="note-actions" aria-label={feature.name}>
        <button type="button" class="link" onClick={stepOut}>
          Back to {place.name}
        </button>
        {isPresent.value && next && (
          <button
            type="button"
            class="link"
            title="Logged as your own claim, not as observed evidence"
            onClick={() => {
              recordStage(place.id, feature.id, next);
              selection.value = { type: 'feature', place: place.id, id: feature.id };
            }}
          >
            Record as {STAGE_NAME[next].toLowerCase()}
          </button>
        )}
      </nav>
    </article>
  );
}

const ordinal = (n: number) => {
  const words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  if (n <= words.length) return words[n - 1]!;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
