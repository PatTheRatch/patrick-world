// The edition dial: a rule along the bottom of the sheet, lettered with years.
// The marks above the rule are the work done across the whole world each month.

import { useComputed, useSignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { dayNumber, isoFromDay, monthYear, yearOf } from '../dates';
import { TODAY, asOf, isPresent, present } from '../store';
import { isPlaying, play, stepEdition, stopPlaying } from '../view';

export function EditionDial() {
  const rule = useRef<HTMLDivElement>(null);
  const playing = useSignal(false);
  const begin = dayNumber(present.value.beginsAt);
  const end = dayNumber(TODAY);
  const total = Math.max(1, end - begin);
  const at = (dayNumber(asOf.value) - begin) / total;

  const months = useComputed(() => {
    const sums = new Map<string, number>();
    for (const p of present.value.places)
      for (const m of p.series) sums.set(m.month, (sums.get(m.month) ?? 0) + m.commits);
    const list = [...sums.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const max = Math.max(1, ...list.map((m) => m[1]));
    return list.map(([month, commits]) => ({
      month,
      x: (dayNumber(`${month}-15`) - begin) / total,
      h: Math.sqrt(commits / max),
    }));
  });

  const years: { year: number; x: number }[] = [];
  for (let y = yearOf(present.value.beginsAt) + 1; y <= yearOf(TODAY); y++) {
    years.push({ year: y, x: (dayNumber(`${y}-01-01`) - begin) / total });
  }

  const setFromPointer = (clientX: number) => {
    const r = rule.current!.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    // Snap to the present near the end, so "now" is easy to return to.
    asOf.value = t > 0.992 ? TODAY : isoFromDay(Math.round(begin + t * total));
  };

  const onDown = (e: PointerEvent) => {
    stopPlaying();
    playing.value = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setFromPointer(e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) setFromPointer(e.clientX);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') stepEdition(-1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') stepEdition(1);
    else if (e.key === 'Home') asOf.value = present.value.beginsAt;
    else if (e.key === 'End') asOf.value = TODAY;
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const toggle = () => {
    if (isPlaying()) {
      stopPlaying();
      playing.value = false;
    } else {
      playing.value = true;
      play(11000, () => (playing.value = false));
    }
  };

  return (
    <section class="dial slip" aria-label="Edition">
      <button type="button" class="dial-play" onClick={toggle} aria-label={playing.value ? 'Pause' : 'Play the editions forward'}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          {playing.value ? <path d="M3 2h3v10H3zM8 2h3v10H8z" /> : <path d="M3 1.5l9 5.5-9 5.5z" />}
        </svg>
      </button>
      <div
        class="dial-rule"
        ref={rule}
        role="slider"
        tabIndex={0}
        aria-label="Edition date"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.round(at * total)}
        aria-valuetext={monthYear(asOf.value)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onKeyDown={onKey}
      >
        <svg class="dial-work" viewBox="0 0 1000 26" preserveAspectRatio="none" aria-hidden="true">
          {months.value.map((m) => (
            <rect key={m.month} x={m.x * 1000 - 3} y={26 - m.h * 24} width="6" height={m.h * 24} class={m.x > at ? 'is-ahead' : ''} />
          ))}
        </svg>
        <div class="dial-line" />
        {years.map((y) => (
          <span key={y.year} class="dial-year" style={{ left: `${y.x * 100}%` }}>
            {y.year}
          </span>
        ))}
        <span class="dial-index" style={{ left: `${at * 100}%` }} />
        {!isPresent.value && (
          <span class="dial-date" style={at > 0.8 ? { right: `${(1 - at) * 100}%`, marginRight: '6px' } : { left: `${at * 100}%`, marginLeft: '6px' }}>
            {monthYear(asOf.value)}
          </span>
        )}
      </div>
      <button
        type="button"
        class="link dial-now"
        disabled={isPresent.value}
        onClick={() => {
          stopPlaying();
          playing.value = false;
          asOf.value = TODAY;
        }}
      >
        Present
      </button>
    </section>
  );
}
