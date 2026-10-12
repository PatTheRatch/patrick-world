// Which further documents of a repository are worth reading beside its README.
//
// A README often says little about where the work stands and points at the files that do:
// `STATUS.md`, `ROADMAP.md`, `docs/plan.md`. `documentCandidates` picks those out, from the
// README's own links and from the names at the top of the repository. It is pure and reads
// no network; scripts/github-fetch.mjs asks GitHub for what it returns.
//
// This file has no imports on purpose: the fetch script loads it directly with Node.

export const DOCUMENT_LIMITS = {
  /** Documents read per repository, beside the README. */
  documents: 4,
  /** Characters kept of each. */
  chars: 16000,
  /** Of those, how many are taken from the end when a document is longer. */
  tail: 5000,
} as const;

/**
 * A document cut to length. A status or plan file tends to open with what the thing is and
 * close with what comes next, so a long one keeps both ends and says how much of the middle
 * was left out, on a line of its own.
 */
export function cutDocument(text: string): { text: string; truncated: boolean } {
  const { chars, tail } = DOCUMENT_LIMITS;
  if (text.length <= chars) return { text, truncated: false };
  // Cut at line ends where one is near, so that no line is read as something it is not.
  let headEnd = text.lastIndexOf('\n', chars - tail);
  if (headEnd < (chars - tail) * 0.8) headEnd = chars - tail;
  let tailStart = text.indexOf('\n', text.length - tail);
  if (tailStart < 0 || tailStart > text.length - tail * 0.8) tailStart = text.length - tail;
  const head = text.slice(0, headEnd);
  const end = text.slice(tailStart).replace(/^\n+/, '');
  return { text: `${head}\n\n[… ${text.length - head.length - end.length} characters left out here …]\n\n${end}`, truncated: true };
}

export interface DocumentCandidate {
  /** Path in the repository: `docs/ROADMAP.md`. */
  path: string;
  /** `readme`: the README links to it. `name`: it stands at the top of the repository under a telling name. */
  via: 'readme' | 'name';
}

/**
 * Names that say where a project stands or is going, most telling first. A document whose
 * name carries one of these is read before any other the README links to.
 */
const TELLING = ['status', 'handoff', 'roadmap', 'plan', 'todo', 'next', 'notes', 'product', 'spec', 'architecture', 'design', 'vision'];

/** Every repository has these and none of them says what the project is or where it stands. */
const BOILERPLATE = new Set(['license', 'licence', 'copying', 'contributing', 'security', 'changelog', 'authors', 'readme']);

const TEXT = /\.(md|markdown|mdx|txt|rst)$/i;

const stemOf = (path: string): string => (path.split('/').pop() ?? path).replace(TEXT, '').toLowerCase();

/** How many of TELLING say where the work stands. The rest say what the project is, and count only as a whole name. */
const STANDING = 6;

/**
 * `PROJECT_STATUS.md` and `roadmap-2026.md` both count; `planets.md` does not. A name that
 * only contains a weaker word (`resume_ai_product.md`) is some other kind of file.
 */
function tellingRank(path: string): number {
  const words = stemOf(path).split(/[^a-z0-9]+/).filter((w) => w !== '');
  let best = -1;
  for (const w of words) {
    const at = TELLING.indexOf(w);
    if (at < 0 || (at >= STANDING && words.length > 1)) continue;
    if (best < 0 || at < best) best = at;
  }
  return best;
}

function boilerplate(path: string): boolean {
  const stem = stemOf(path).replace(/[^a-z0-9]+/g, '');
  return BOILERPLATE.has(stem) || stem === 'codeofconduct';
}

/** A link target as a path from the top of the repository, or undefined when it leaves it or is not a file there. */
function resolve(target: string, from: string): string | undefined {
  let t = target.trim().replace(/^<|>$/g, '');
  // A title after the target: [text](path "title").
  t = t.split(/\s+["']/)[0] ?? t;
  if (t === '' || t.startsWith('#') || t.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(t)) return undefined;
  t = (t.split('#')[0] ?? t).split('?')[0] ?? t;
  try {
    t = decodeURIComponent(t);
  } catch {
    return undefined;
  }
  const base = t.startsWith('/') ? [] : from.split('/').slice(0, -1);
  const out = [...base];
  for (const part of t.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return undefined;
      out.pop();
    } else out.push(part);
  }
  return out.length === 0 ? undefined : out.join('/');
}

/**
 * The documents to read for one repository, most telling first, at most
 * `DOCUMENT_LIMITS.documents`. `rootFiles` are the file names at the top of the repository;
 * a linked path at the top that is not among them is a dead link and is left out.
 */
export function documentCandidates(
  readme: { path: string; text: string } | null | undefined,
  rootFiles: readonly string[],
): { candidates: DocumentCandidate[]; more: boolean } {
  const found: { path: string; via: 'readme' | 'name'; rank: number; order: number }[] = [];
  const seen = new Set<string>();
  const byLower = new Map(rootFiles.map((f) => [f.toLowerCase(), f]));
  const add = (path: string, via: 'readme' | 'name'): void => {
    let p = path;
    if (!p.includes('/')) {
      // Links are often written in another case than the file; GitHub's paths are exact.
      const real = byLower.get(p.toLowerCase());
      if (real === undefined) return;
      p = real;
    }
    const telling = tellingRank(p);
    if (!TEXT.test(p) && !(telling >= 0 && !p.includes('.'))) return;
    if (boilerplate(p) || seen.has(p.toLowerCase())) return;
    if (readme && p.toLowerCase() === readme.path.toLowerCase()) return;
    seen.add(p.toLowerCase());
    found.push({ path: p, via, rank: telling >= 0 ? telling : TELLING.length, order: found.length });
  };

  if (readme) {
    // Outside code fences only: a path in an example is not a pointer to a document.
    let fenced = false;
    for (const line of readme.text.split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      for (const m of line.matchAll(/\]\(([^)]+)\)|href=["']([^"']+)["']/g)) {
        const path = resolve(m[1] ?? m[2] ?? '', readme.path);
        if (path !== undefined) add(path, 'readme');
      }
    }
  }
  for (const file of rootFiles) if (tellingRank(file) >= 0) add(file, 'name');

  found.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return {
    candidates: found.slice(0, DOCUMENT_LIMITS.documents).map(({ path, via }) => ({ path, via })),
    more: found.length > DOCUMENT_LIMITS.documents,
  };
}
