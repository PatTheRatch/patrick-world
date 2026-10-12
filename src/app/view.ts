// Moving around the world. The one place that knows both the renderer and the store.

import { RANKS, type Point } from '../world/types';
import type { Renderer, Selection } from '../render/renderer';
import { dayNumber, isoFromDay } from './dates';
import {
  TODAY,
  asOf,
  capture,
  catalogue,
  draft,
  isPresent,
  keyOpen,
  method,
  plans,
  selection,
  surveyRoad,
  terrain,
  whereabouts,
  world,
} from './store';

let renderer: Renderer | null = null;

export const attach = (r: Renderer | null) => {
  renderer = r;
};
export const getRenderer = () => renderer;

const now = () => performance.now();

export function goHome() {
  if (!renderer) return;
  renderer.camera.flyTo(renderer.home(), now());
}

/** Select a place and bring it into view, without diving in. */
export function visit(id: string) {
  if (!renderer) return;
  selection.value = { type: 'place', id };
  const cam = renderer.camera;
  const plan = plans.value.get(id);
  if (!plan) return;
  const sizePx = plan.radius * cam.k;
  const c = cam.toScreen(plan.center);
  const inView = c.x > 160 && c.x < cam.width - 420 && c.y > 120 && c.y < cam.height - 180;
  if (plan.lots.length === 0) {
    // A mark on open ground: come closer, but leave the country around it visible.
    const k = Math.max(cam.k, renderer.fitK * 2.3);
    if (!inView || cam.k < k * 0.98) cam.flyTo({ x: plan.center.x + 150 / k, y: plan.center.y, k }, now());
    return;
  }
  if (inView && sizePx > 110 && sizePx < Math.min(cam.width, cam.height) * 0.6) return;
  const target = renderer.framePlace(id);
  if (target) cam.flyTo({ ...target, x: target.x + 150 / target.k }, now());
}

/** Go all the way in to read the buildings. */
export function enter(id: string) {
  if (!renderer) return;
  selection.value = { type: 'place', id };
  const target = renderer.framePlace(id, true);
  if (target) renderer.camera.flyTo({ ...target, x: target.x + 130 / target.k }, now());
}

export function inspect(place: string, feature: string, fly = false) {
  if (!renderer) return;
  selection.value = { type: 'feature', place, id: feature };
  if (!fly) return;
  const target = renderer.frameFeature(place, feature);
  if (target) renderer.camera.flyTo({ ...target, x: target.x + 150 / target.k }, now());
}

/** Step back out one scale. */
export function stepOut() {
  if (!renderer) return;
  if (capture.value) {
    capture.value = null;
    draft.value = null;
    return;
  }
  if (keyOpen.value) {
    keyOpen.value = false;
    return;
  }
  const s = selection.value;
  if (s?.type === 'feature') {
    selection.value = { type: 'place', id: s.place };
    const target = renderer.framePlace(s.place, true);
    if (target && renderer.camera.k > target.k * 1.3) renderer.camera.flyTo(target, now());
    return;
  }
  if (method.value) {
    method.value = null;
    return;
  }
  if (s) {
    selection.value = null;
    if (renderer.camera.k > renderer.fitK * 1.6) goHome();
    return;
  }
  goHome();
}

export function click(hit: Selection, screen: Point) {
  const c = capture.value;
  if (c?.type === 'road') {
    if (hit && (hit.type === 'place' ? hit.id : hit.place) !== c.from) {
      surveyRoad(c.from, hit.type === 'place' ? hit.id : hit.place);
      selection.value = { type: 'place', id: c.from };
    }
    capture.value = null;
    draft.value = null;
    return;
  }
  if (c?.type === 'site') {
    capture.value = null;
    draft.value = null;
  }
  void screen;
  if (!hit) {
    selection.value = null;
    return;
  }
  if (hit.type === 'place') visit(hit.id);
  else inspect(hit.place, hit.id);
}

export function beginSite(screen: Point) {
  if (!renderer || !isPresent.value) return;
  const at = renderer.camera.toWorld(screen);
  const { width, height } = catalogue.size;
  if (at.x < 0 || at.y < 0 || at.x > width || at.y > height || !terrain.isLand(at)) return;
  selection.value = null;
  draft.value = { type: 'site', at };
  capture.value = { type: 'site', at, screen };
}

/** Move the selection to the nearest place in a compass direction. */
export function nudgeSelection(dx: number, dy: number) {
  const places = world.value.places;
  const s = selection.value;
  const current = places.find((p) => p.id === (s?.type === 'place' ? s.id : s?.place));
  if (!current) {
    const biggest = [...places].sort((a, b) => RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank) || b.commits - a.commits)[0];
    if (biggest) visit(biggest.id);
    return;
  }
  let best: { id: string; score: number } | null = null;
  for (const p of places) {
    if (p.id === current.id) continue;
    const vx = p.position.x - current.position.x;
    const vy = p.position.y - current.position.y;
    const along = vx * dx + vy * dy;
    if (along <= 0) continue;
    const across = Math.abs(vx * dy - vy * dx);
    const score = along + across * 2.2;
    if (!best || score < best.score) best = { id: p.id, score };
  }
  if (best) visit(best.id);
}

/** Work out where the camera is, in words. */
export function locate(k: number) {
  if (!renderer) return;
  const cam = renderer.camera;
  let place: string | undefined;
  let region: string | undefined;
  if (k > renderer.fitK * 2.2) {
    let best = Infinity;
    for (const p of world.value.places) {
      const plan = plans.value.get(p.id);
      const d = Math.hypot(p.position.x - cam.x, p.position.y - cam.y);
      const reach = Math.max(plan?.radius ?? 0, 60) * 1.25;
      if (d < reach && d < best && (plan?.radius ?? 0) * k > 120) {
        best = d;
        place = p.name;
      }
    }
  }
  if (k > renderer.fitK * 1.55) {
    let best = Infinity;
    for (const r of catalogue.regions) {
      const d = Math.hypot(r.center.x - cam.x, r.center.y - cam.y) / r.radius;
      if (d < 1.15 && d < best) {
        best = d;
        region = r.name;
      }
    }
  }
  const w = whereabouts.value;
  if (w.place !== place || w.region !== region) whereabouts.value = { place, region };
}

// ───────────────────────── Editions ─────────────────────────

let playing = 0;

export function stopPlaying() {
  cancelAnimationFrame(playing);
  playing = 0;
}

export const isPlaying = () => playing !== 0;

/** Run the edition forward from where the dial sits (or from the start) to the present. */
export function play(durationMs = 9000, onDone?: () => void) {
  stopPlaying();
  const end = dayNumber(TODAY);
  const begin = dayNumber(world.value.beginsAt);
  let from = dayNumber(asOf.value);
  if (from >= end - 7) from = begin;
  const scaled = durationMs * Math.max(0.25, (end - from) / Math.max(1, end - begin));
  const start = now();
  const step = (t: number) => {
    const raw = Math.min(1, (t - start) / scaled);
    // Linger at the end: the present is where the detail is.
    const eased = 1 - Math.pow(1 - raw, 1.6);
    asOf.value = isoFromDay(Math.round(from + (end - from) * eased));
    if (raw < 1) playing = requestAnimationFrame(step);
    else {
      playing = 0;
      asOf.value = TODAY;
      onDone?.();
    }
  };
  playing = requestAnimationFrame(step);
}

export function stepEdition(months: number) {
  stopPlaying();
  const begin = dayNumber(world.value.beginsAt);
  const end = dayNumber(TODAY);
  const next = Math.max(begin, Math.min(end, dayNumber(asOf.value) + Math.round(months * 30.44)));
  asOf.value = isoFromDay(next);
}
