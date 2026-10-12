// The canvas and everything a hand can do to it.

import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { Renderer, type ScreenRect } from '../render/renderer';
import {
  capture,
  catalogue,
  draft,
  hover,
  isPresent,
  keyOpen,
  method,
  plans,
  roads,
  selection,
  terrain,
  world,
} from './store';
import { attach, beginSite, click, enter, goHome, locate, nudgeSelection, stepEdition, stepOut } from './view';

/** Where the selected thing is on screen, for the survey note to sit beside. */
export const anchorListeners = new Set<(rect: ScreenRect | null) => void>();

const sameHit = (a: typeof hover.value, b: typeof hover.value) =>
  a === b || (!!a && !!b && a.type === b.type && a.id === b.id);

export function World() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new Renderer(canvas);
    attach(renderer);
    renderer.onAnchor = (rect) => anchorListeners.forEach((fn) => fn(rect));
    let lastLocate = 0;
    renderer.onView = (k) => {
      const t = performance.now();
      if (t - lastLocate > 180) {
        lastLocate = t;
        locate(k);
      }
      // The last frame of a move must be located too, or the cartouche goes stale.
      clearTimeout(trailing);
      trailing = window.setTimeout(() => locate(renderer.camera.k), 200);
    };

    const stop = effect(() => {
      renderer.setScene({
        world: world.value,
        terrain,
        catalogue,
        plans: plans.value,
        roads: roads.value,
        selection: selection.value,
        hover: hover.value,
        method: method.value,
        draft: draft.value,
      });
    });

    const cam = renderer.camera;
    const point = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    let down: { x: number; y: number; t: number } | null = null;
    let dragging = false;
    let lastMove = { x: 0, y: 0, t: 0 };
    let velocity = { x: 0, y: 0 };
    let lastClick = 0;
    let lastHit: typeof hover.value = null;
    let trailing = 0;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      cam.stop();
      const p = point(e);
      down = { ...p, t: e.timeStamp };
      lastMove = { ...p, t: e.timeStamp };
      velocity = { x: 0, y: 0 };
      dragging = false;
    };

    const onMove = (e: PointerEvent) => {
      const p = point(e);
      if (down) {
        if (!dragging && Math.hypot(p.x - down.x, p.y - down.y) > 4) {
          dragging = true;
          canvas.classList.add('is-dragging');
          if (hover.value) hover.value = null;
        }
        if (dragging) {
          const dt = Math.max(1, e.timeStamp - lastMove.t);
          const dx = p.x - lastMove.x;
          const dy = p.y - lastMove.y;
          cam.panBy(dx, dy);
          cam.constrain(catalogue.size, 86);
          velocity = { x: velocity.x * 0.6 + (dx / dt) * 0.4, y: velocity.y * 0.6 + (dy / dt) * 0.4 };
          lastMove = { ...p, t: e.timeStamp };
          renderer.invalidate();
        }
        return;
      }
      const c = capture.value;
      if (c?.type === 'road') draft.value = { type: 'road', from: c.from, to: cam.toWorld(p) };
      const hit = renderer.hitTest(p);
      if (!sameHit(hit, hover.value)) hover.value = hit;
      canvas.classList.toggle('is-pointing', !!hit);
    };

    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const p = point(e);
      const wasDragging = dragging;
      down = null;
      dragging = false;
      canvas.classList.remove('is-dragging');
      if (wasDragging) {
        if (e.timeStamp - lastMove.t < 60) cam.fling(velocity.x, velocity.y);
        return;
      }
      const hit = renderer.hitTest(p);
      const double = e.timeStamp - lastClick < 320;
      lastClick = e.timeStamp;
      if (double) {
        // The first click may already have moved the camera, so the second lands somewhere
        // else. What was double-clicked is whatever the first click hit.
        const first = lastHit;
        if (first?.type === 'place') return enter(first.id);
        if (first || hit) return;
        return beginSite(p);
      }
      lastHit = hit;
      click(hit, p);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scale = e.ctrlKey ? 0.012 : e.deltaMode === 1 ? 0.05 : 0.0018;
      cam.zoomAt(point(e), Math.exp(-e.deltaY * scale));
      cam.constrain(catalogue.size, 86);
      renderer.invalidate();
      // The map moved under a still pointer: what is under it has changed.
      const hit = renderer.hitTest(point(e));
      if (!sameHit(hit, hover.value)) hover.value = hit;
      canvas.classList.toggle('is-pointing', !!hit);
    };

    const onLeave = () => {
      lastPointer = null;
      if (hover.value) hover.value = null;
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        if (typing) (target as HTMLElement).blur();
        stepOut();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      // While the Key is open the map behind it is not listening.
      if (keyOpen.value && e.key.toLowerCase() !== 'k') return;
      switch (e.key) {
        case '0':
          selection.value = null;
          goHome();
          break;
        case 'k':
        case 'K':
          keyOpen.value = !keyOpen.value;
          break;
        case 'n':
        case 'N':
          if (isPresent.value && !keyOpen.value) {
            e.preventDefault();
            const at = lastPointer ?? { x: cam.width / 2, y: cam.height / 2 };
            if (!renderer.hitTest(at)) beginSite(at);
          }
          break;
        case '[':
          stepEdition(-1);
          break;
        case ']':
          stepEdition(1);
          break;
        case 'Enter': {
          if (target && target.tagName === 'BUTTON') return;
          const s = selection.value;
          if (s?.type === 'place') enter(s.id);
          break;
        }
        case 'ArrowLeft':
          e.preventDefault();
          nudgeSelection(-1, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          nudgeSelection(1, 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          nudgeSelection(0, -1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          nudgeSelection(0, 1);
          break;
      }
    };

    let lastPointer: { x: number; y: number } | null = null;
    const track = (e: PointerEvent) => (lastPointer = point(e));

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointermove', track);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    void document.fonts.ready.then(() => renderer.invalidate());

    return () => {
      stop();
      window.removeEventListener('keydown', onKey);
      renderer.destroy();
      attach(null);
    };
  }, []);

  return <canvas ref={ref} class="world" aria-label="Map of Patrick's World. Use the list of places to navigate by keyboard." />;
}
