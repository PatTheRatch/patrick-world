// The key page of the atlas: how to read the drawing, and the Key of Methods.

import { useEffect, useRef } from 'preact/hooks';
import { KIND_MEANING, KIND_NAME } from '../../render/palette';
import { KINDS, STAGES, type MethodLevel, type MethodState } from '../../world/types';
import { monthYear } from '../dates';
import { asOf, keyOpen, method, selection, world } from '../store';
import { goHome } from '../view';
import { STAGE_MEANING, STAGE_NAME, StageSwatch, WashSwatch } from './Swatch';

const LEVEL_WORD: Record<MethodLevel, string> = {
  unknown: 'Not yet used',
  noted: 'Noted',
  practised: 'Practised',
  fluent: 'Fluent',
  mastered: 'Mastered',
};

const LEVEL_MEANING: [MethodLevel, string][] = [
  ['noted', 'Named on a proposal. No work yet.'],
  ['practised', 'Real work, in one place.'],
  ['fluent', 'Substantial work, or work in three places.'],
  ['mastered', 'Heavy work across several places, over years.'],
];

const NODE_W = 168;
const NODE_H = 44;
const COL_GAP = 54;
const ROW_GAP = 12;

function layout(methods: MethodState[]) {
  const byId = new Map(methods.map((m) => [m.id, m]));
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const m = byId.get(id);
    const d = m && m.requires.length ? 1 + Math.max(...m.requires.map((r) => depthOf(r, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  methods.forEach((m) => depthOf(m.id));
  const cols: MethodState[][] = [];
  for (const m of methods) (cols[depth.get(m.id)!] ??= []).push(m);

  const pos = new Map<string, { x: number; y: number }>();
  let height = 0;
  cols.forEach((col, c) => {
    // Sit each method near the methods it builds on, so lines stay short.
    const want = (m: MethodState) => {
      const ys = m.requires.map((r) => pos.get(r)?.y).filter((y): y is number => y !== undefined);
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity;
    };
    col.sort((a, b) => want(a) - want(b) || a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
    let y = 0;
    for (const m of col) {
      const ideal = want(m);
      if (ideal !== Infinity) y = Math.max(y, ideal);
      pos.set(m.id, { x: c * (NODE_W + COL_GAP), y });
      y += NODE_H + ROW_GAP;
    }
    height = Math.max(height, y);
  });
  return { pos, width: cols.length * (NODE_W + COL_GAP) - COL_GAP, height: height - ROW_GAP };
}

export function KeySheet() {
  const sheet = useRef<HTMLDivElement>(null);
  const open = keyOpen.value;
  useEffect(() => {
    if (open) sheet.current?.focus();
  }, [open]);
  if (!open) return null;

  const methods = world.value.methods;
  const { pos, width, height } = layout(methods);

  const choose = (id: string) => {
    method.value = id;
    selection.value = null;
    keyOpen.value = false;
    goHome();
  };

  return (
    <div class="key-backdrop" onClick={(e) => e.target === e.currentTarget && (keyOpen.value = false)}>
      <div class="key slip" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="key-title" tabIndex={-1}>
        <header class="key-head">
          <h2 id="key-title">Key</h2>
          <button type="button" class="link" onClick={() => (keyOpen.value = false)}>
            Back to the map <kbd>Esc</kbd>
          </button>
        </header>

        <div class="key-columns">
          <section>
            <h3>How a building is drawn says how far along it is</h3>
            <dl class="key-list">
              {STAGES.map((s) => (
                <div key={s}>
                  <dt>
                    <StageSwatch stage={s} kind="works" />
                    {STAGE_NAME[s]}
                  </dt>
                  <dd>{STAGE_MEANING[s]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3>Its wash says what it is</h3>
            <dl class="key-list">
              {KINDS.map((k) => (
                <div key={k}>
                  <dt>
                    <WashSwatch kind={k} />
                    {KIND_NAME[k]}
                  </dt>
                  <dd>{KIND_MEANING[k]}.</dd>
                </div>
              ))}
            </dl>
            <h3>The paper and ink say when</h3>
            <dl class="key-list key-age">
              <div>
                <dt>
                  <i class="age age-slip" />
                  Fresh slip
                </dt>
                <dd>Worked on in the last few weeks.</dd>
              </div>
              <div>
                <dt>
                  <i class="age age-ink" />
                  Black ink
                </dt>
                <dd>Standing and current.</dd>
              </div>
              <div>
                <dt>
                  <i class="age age-sepia" />
                  Browned ink
                </dt>
                <dd>Quiet, then dormant. Nobody has been back.</dd>
              </div>
              <div>
                <dt>
                  <i class="age age-ruin" />
                  Broken line
                </dt>
                <dd>Ruins. Abandoned, and kept on the sheet.</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3>Between places</h3>
            <dl class="key-list key-roads">
              <div>
                <dt>
                  <i class="road road-surveyed" />
                  Surveyed
                </dt>
                <dd>Related, on your word alone.</dd>
              </div>
              <div>
                <dt>
                  <i class="road road-track" />
                  Track
                </dt>
                <dd>They share a method.</dd>
              </div>
              <div>
                <dt>
                  <i class="road road-made" />
                  Road
                </dt>
                <dd>They share a great deal.</dd>
              </div>
              <div>
                <dt>
                  <i class="road road-main" />
                  Main
                </dt>
                <dd>Code or data really flows between them.</dd>
              </div>
            </dl>
            <h3>Around a place</h3>
            <dl class="key-list">
              <div>
                <dt>
                  <i class="age age-house" />
                  Dwellings
                </dt>
                <dd>People who use it, on a log scale.</dd>
              </div>
              <div>
                <dt>
                  <b class="key-numeral">4</b>
                  Numeral
                </dt>
                <dd>Storeys: the work invested in that building.</dd>
              </div>
            </dl>
          </section>
        </div>

        <section class="methods">
          <h3>Key of Methods</h3>
          <p class="methods-lead">
            What this world knows how to build with, as of {monthYear(asOf.value)}. Each method stands on the ones to its
            left. Choose one to see every place that used it.
          </p>
          <ul class="methods-levels">
            {LEVEL_MEANING.map(([level, meaning]) => (
              <li key={level}>
                <span class={`method-node is-${level} is-sample`}>{LEVEL_WORD[level]}</span>
                {meaning}
              </li>
            ))}
          </ul>
          <div class="methods-scroll">
            <div class="methods-tree" style={{ width: `${width}px`, height: `${height}px` }}>
              <svg width={width} height={height} aria-hidden="true">
                {methods.flatMap((m) =>
                  m.requires.map((r) => {
                    const a = pos.get(r);
                    const b = pos.get(m.id);
                    if (!a || !b) return null;
                    const x1 = a.x + NODE_W;
                    const y1 = a.y + NODE_H / 2;
                    const x2 = b.x;
                    const y2 = b.y + NODE_H / 2;
                    const mid = (x1 + x2) / 2;
                    const faint = m.level === 'unknown';
                    return (
                      <path
                        key={`${r}-${m.id}`}
                        d={`M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
                        class={faint ? 'is-faint' : ''}
                      />
                    );
                  }),
                )}
              </svg>
              {methods.map((m) => {
                const p = pos.get(m.id)!;
                return (
                  <button
                    key={m.id}
                    type="button"
                    class={`method-node is-${m.level}${method.value === m.id ? ' is-on' : ''}`}
                    style={{ left: `${p.x}px`, top: `${p.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px` }}
                    onClick={() => choose(m.id)}
                  >
                    <b>{m.name}</b>
                    <span>
                      {m.level === 'unknown'
                        ? 'Not yet used'
                        : m.level === 'noted'
                          ? 'Noted, no work yet'
                          : `${LEVEL_WORD[m.level]} · ${m.evidence.toLocaleString('en-US')} commits · ${m.places.length} ${m.places.length === 1 ? 'place' : 'places'}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** A slip naming the method being shown across the territory. */
export function MethodNote() {
  const id = method.value;
  if (!id || keyOpen.value) return null;
  const m = world.value.methods.find((x) => x.id === id);
  if (!m) return null;
  const names = new Map(world.value.places.map((p) => [p.id, p.name]));
  return (
    <aside class="method-note slip" aria-live="polite">
      <h2>{m.name}</h2>
      <p>
        {m.level === 'unknown'
          ? 'Not used anywhere yet.'
          : m.level === 'noted'
            ? 'Named on a proposal. No work yet.'
            : `${LEVEL_WORD[m.level]}. ${m.evidence.toLocaleString('en-US')} commits across ${m.places.length} ${m.places.length === 1 ? 'place' : 'places'}${m.firstUsedAt ? `, first in ${monthYear(m.firstUsedAt)}` : ''}.`}
      </p>
      {m.places.length > 0 && (
        <ol>
          {m.places.slice(0, 6).map((p) => (
            <li key={p.place}>
              <span>{names.get(p.place) ?? p.place}</span>
              <span>{p.commits.toLocaleString('en-US')}</span>
            </li>
          ))}
        </ol>
      )}
      <nav class="note-actions">
        <button type="button" class="link" onClick={() => (method.value = null)}>
          Clear <kbd>Esc</kbd>
        </button>
        <button type="button" class="link" onClick={() => (keyOpen.value = true)}>
          Key of Methods
        </button>
      </nav>
    </aside>
  );
}
