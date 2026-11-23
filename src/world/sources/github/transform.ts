// GitHub's record, turned into the world's events. Pure: no DOM, no fetch, no clock.
// "Today" is the raw file's `fetchedAt`; the same file always gives the same events
// with the same ids, so syncing again never counts anything twice.
//
// ───────────────────────── READ THIS: WHAT IS FACT AND WHAT IS INFERRED ─────────────────────────
//
// The product's rule is that nothing on the map is invented. Most of what this file emits is
// fact: a repository exists, was created on a day, had so many commits in a week, shipped a
// release, was archived.
//
// Two things are NOT fact. They are inferences, and the map says so in its cartouche
// ("Stages are inferred from commit history."):
//
//   1. FEATURES ARE DIRECTORIES. GitHub has no notion of a feature. A directory is the
//      nearest thing it can see, so a directory stands in for one. A feature that lives in
//      three directories is drawn as three buildings; three features sharing one directory
//      are drawn as one.
//
//   2. STAGES ARE INFERRED from the rhythm of commits, by the rules in `INFERENCE` below and
//      by no other rule. GitHub cannot see that something works. `working` here means only
//      "enough was done, and then a release went out, or the work stopped for three weeks,
//      or it simply went on long enough". The second is also exactly what an abandoned
//      half-built thing looks like, and the third is true of anything worked on for a month,
//      finished or not. `planned` and `designed` are never emitted: GitHub cannot see intent.
//
// A stage is dated at the day its evidence was complete (the 21st quiet day, not the last
// commit), so an earlier edition of the map never shows a stage that could not have been
// known on that day.
//
// What is deliberately absent: `traction.measured`, and any `link.formed` GitHub would have
// to guess. GitHub alone evidences neither a connection between two repositories nor a
// single user. Those come from other sources or from the owner's own hand.
//
// ───────────────────────── WHERE THE OWNER HAS SAID ─────────────────────────
//
// A repository may carry `patrick-world.json` (see ../../definition.ts). Where it does, both
// inferences above are set aside for that repository: its features are the ones the file
// names, each with the paths that hold its work, and each stage is the file's claim weighed
// against the commits by `settleStage`. The file also gives the city its name, its country
// and its links. Everything the file alone says is emitted with `source: 'declared'`; what
// the commits say (work, and the stages they date) stays `source: 'github'`.

import { addDays, dayNumber, daysBetween, isoDay, weekIndex, weekday } from '../../time';
import { STAGES } from '../../types';
import type { Catalogue, FeatureKind, Point, RegionDef, WorldEvent } from '../../types';
import { declaredStages, linkKey, readDeclared } from './declared';
import type { DeclaredCity, StageClaim } from './declared';
import type { GithubCommit, GithubRaw, GithubRepo, GithubTreeEntry } from './raw';

// ───────────────────────── The rules, in one place ─────────────────────────

/** Every number behind an inferred stage. Nothing else decides one. */
export const INFERENCE = {
  // `building` has no threshold: it is dated at the feature's first commit.
  working: {
    /** At least this many commits… */
    minCommits: 8,
    /**
     * …across at least this many distinct Monday-to-Sunday weeks, AND EITHER a release
     * shipped on or after the feature's first commit, OR…
     */
    minWeeks: 2,
    /** …this many days have since passed without a commit: finished and left standing. */
    quietDays: 21,
    /**
     * OR the work has simply been sustained: at least this many commits across at least this
     * many distinct weeks, all merged to the default branch. Without this route a project in
     * daily development, with no releases and no pauses, would show nothing standing at all,
     * which is the opposite of the truth. It is the weakest of the three inferences.
     */
    sustainedCommits: 20,
    sustainedWeeks: 3,
  },
  mature: {
    /** After reaching `working`, returned to in at least this many separate bursts… */
    minReturns: 3,
    /** …a burst being a run of weeks with work, ended by this many weeks or more without… */
    burstGapWeeks: 5,
    /** …and the feature's history by then spanning at least this many days. */
    minSpanDays: 180,
  },
} as const;

/** Which directories may stand for features. Kept in step with scripts/github-fetch.mjs. */
export const DIRECTORIES = {
  sourceRoots: ['src', 'app', 'apps', 'packages', 'lib', 'services', 'server', 'client'],
  excluded: [
    'node_modules', 'dist', 'build', 'public', 'assets', 'static', 'docs', 'test', 'tests',
    '__tests__', 'e2e', 'scripts', 'vendor', 'coverage', 'examples', 'fixtures',
    // Code-organisation folders: where things are kept, not things that were built.
    'constants', 'context', 'contexts', 'hooks', 'types', 'utils', 'util', 'helpers', 'output',
    'outputs', 'spikes', 'tmp', 'temp', 'styles', 'ci_scripts', 'ci-scripts',
  ],
  /** At most this many features per repository; the busiest are kept. */
  maxFeatures: 14,
} as const;

/** A language must be this share of a repository's bytes to count as a method used in it. */
const LANGUAGE_SHARE = 0.12;

const LANGUAGE_METHOD: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'typescript',
  python: 'python',
  sql: 'sql',
  plpgsql: 'sql',
  tsql: 'sql',
  swift: 'mobile-development',
  kotlin: 'mobile-development',
  dart: 'mobile-development',
  'objective-c': 'mobile-development',
  rust: 'rust',
};

/** A word in a directory's name that evidences a method. */
const NAME_METHOD: Record<string, string> = {
  mcp: 'mcp',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  supabase: 'postgresql',
  react: 'react',
  agent: 'ai-agents',
  eval: 'llm-evaluation',
  scrape: 'web-scraping',
  scraper: 'web-scraping',
  scraping: 'web-scraping',
  auth: 'auth-identity',
  prompt: 'prompt-design',
  stats: 'statistics',
  statistics: 'statistics',
};

/** First match wins, top to bottom; anything unmatched is `works`. */
const KIND_WORDS: readonly (readonly [FeatureKind, readonly string[]])[] = [
  ['frontage', ['ui', 'web', 'app', 'pages', 'components', 'views', 'screens', 'frontend', 'client', 'mobile', 'site']],
  [
    'reservoir',
    ['db', 'database', 'data', 'models', 'store', 'storage', 'schema', 'migrations', 'etl', 'pipeline', 'ingest', 'cache', 'supabase', 'sql'],
  ],
  [
    'observatory',
    ['ai', 'ml', 'llm', 'agent', 'agents', 'eval', 'evals', 'model', 'analysis', 'analytics', 'research', 'insights', 'intelligence', 'prompts'],
  ],
  ['utility', ['infra', 'config', 'deploy', 'ci', 'auth', 'utils', 'util', 'common', 'shared', 'core', 'lib', 'tools', 'mcp']],
];

/**
 * Region by keyword, most hits first; a tie goes to the earlier row. Words in the
 * repository's own name, description and topics count three times a directory name.
 */
const REGION_WORDS: readonly (readonly [string, readonly string[]])[] = [
  ['the-court', ['sport', 'fantasy', 'nba', 'basketball', 'league', 'draft', 'roster', 'player', 'trades', 'scoring', 'matchup']],
  ['mindworks', ['ai', 'llm', 'agent', 'mcp', 'eval', 'prompt', 'tool', 'os', 'memory']],
  ['ledger-reach', ['finance', 'invest', 'stock', 'portfolio', 'budget', 'ledger', 'tax', 'money', 'rent', 'mortgage', 'property']],
];
const DEFAULT_REGION = 'the-commons';

/** Where a place may stand. World units. */
const LAYOUT = {
  /** Clear distance from an earlier place, by the larger of the two feature counts. */
  spacing: [
    { features: 12, distance: 420 },
    { features: 5, distance: 300 },
    { features: 0, distance: 240 },
  ],
  edge: 260,
  landRing: 60,
  spiralStep: 34,
  /** Spiral samples tried inside the region, then (a wider turn) beyond it. */
  samples: 1400,
} as const;

const ACRONYMS = new Set(['os', 'mcp', 'ai', 'api', 'ui', 'ux', 'db', 'etl', 'ci', 'cd', 'llm', 'ml', 'sql', 'cli', 'sdk', 'nba', 'id', 'io']);

// ───────────────────────── Words ─────────────────────────

/** `boxout-fantasy` → [`boxout`, `fantasy`]; `EarnedKit` → [`Earned`, `Kit`]. */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0);
}

/** "boxout-fantasy" → "Boxout Fantasy"; "patrick-os" → "Patrick OS". */
export function humanise(name: string): string {
  const out = words(name).map((w) => {
    if (ACRONYMS.has(w.toLowerCase())) return w.toUpperCase();
    // Already written in capitals by its owner: leave it.
    if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
    // A short word with no vowel in it is initials, not a word: fcp → FCP.
    if (w.length >= 2 && w.length <= 4 && /^[a-z]+$/i.test(w) && !/[aeiouy]/i.test(w)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
  return out.length > 0 ? out.join(' ') : name;
}

function kebab(s: string): string {
  return (
    s
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}

const tokens = (s: string): string[] => words(s).map((w) => w.toLowerCase());

function hits(tokenList: readonly string[], keywords: readonly string[]): number {
  let n = 0;
  for (const t of tokenList) {
    for (const k of keywords) {
      // Exact, plural, or (for words long enough not to collide) a longer form: invest → investing.
      if (t === k || (k.length > 2 && t === `${k}s`) || (k.length >= 5 && t.startsWith(k))) {
        n++;
        break;
      }
    }
  }
  return n;
}

/** `PatTheRatch/Relationship-Saver` → `gh-pattheratch-relationship-saver`. */
export function placeId(repo: Pick<GithubRepo, 'owner' | 'name'>): string {
  const lower = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  return `gh-${lower(repo.owner)}-${lower(repo.name)}`;
}

// ───────────────────────── Time ─────────────────────────

/** The Sunday that ends the Monday-to-Sunday week `day` falls in. */
export function weekEnding(day: string): string {
  return addDays(day, (7 - weekday(day)) % 7);
}

// ───────────────────────── Whose work ─────────────────────────

/**
 * Whose commits count as the owner's work: those linked to one of the owner's accounts;
 * those linked to NO account whose written author name is one of the owner's (a commit made
 * under an e-mail GitHub does not know; very common from a second machine); and those made by
 * a coding agent in a repository the owner owns. An agent building at the owner's direction
 * is the owner's project being built, and Patrick's World treats agents as builders. Other
 * people's commits and deploy bots are kept out.
 */
export const AGENT_AUTHORS = /^(claude|aisha|codex|cursor|copilot|devin|openai-codex|github-copilot)([-_ \[]|$)/i;

export function ownerTest(raw: Pick<GithubRaw, 'accounts' | 'profileNames'>): (c: GithubCommit) => boolean {
  const logins = new Set(raw.accounts.map((a) => a.toLowerCase()));
  const names = new Set([...raw.accounts, ...(raw.profileNames ?? [])].map((a) => a.toLowerCase()));
  return (c) => {
    if (AGENT_AUTHORS.test(c.author ?? '') || AGENT_AUTHORS.test(c.authorName ?? '')) return true;
    if (c.author !== null && c.author !== undefined) return logins.has(c.author.toLowerCase());
    return typeof c.authorName === 'string' && names.has(c.authorName.toLowerCase());
  };
}

// ───────────────────────── Directories ─────────────────────────

function usableDir(name: string): boolean {
  if (name.startsWith('.')) return false;
  if ((DIRECTORIES.excluded as readonly string[]).includes(name.toLowerCase())) return false;
  // Editor bundles and test targets are not features.
  if (/\.(xcodeproj|xcworkspace|xcassets)$/i.test(name)) return false;
  if (/(^|[-_.])tests?$/i.test(name) || /[a-z0-9]Tests?$/.test(name)) return false;
  return true;
}

const dirsOf = (tree: readonly GithubTreeEntry[] | undefined): string[] =>
  (tree ?? []).filter((e) => e.type === 'tree').map((e) => e.path);

export interface Candidate {
  /** Path from the repository root: `apps/web`. */
  path: string;
  /** The source root it was found inside, if any: `apps`. */
  root?: string;
}

/**
 * Directories that may stand for features. A conventional source root is opened and its
 * directories stand for it; every other top-level directory stands for itself. A root
 * holding exactly one directory (`src/<package>/…`) is opened one level further, so that a
 * whole project is not drawn as one building.
 */
export function candidateDirectories(tree: GithubRepo['tree']): Candidate[] {
  const out: Candidate[] = [];
  const roots = DIRECTORIES.sourceRoots as readonly string[];
  for (const name of dirsOf(tree.root)) {
    if (!usableDir(name)) continue;
    if (!roots.includes(name)) {
      out.push({ path: name });
      continue;
    }
    const children = dirsOf(tree.inside[name]).filter(usableDir);
    const only = children.length === 1 ? `${name}/${children[0]!}` : '';
    if (only !== '') {
      const deeper = dirsOf(tree.inside[only]).filter(usableDir);
      if (deeper.length > 1) for (const d of deeper) out.push({ path: `${only}/${d}`, root: name });
      else out.push({ path: only, root: name });
    } else if (children.length > 1) {
      for (const child of children) out.push({ path: `${name}/${child}`, root: name });
    } else {
      out.push({ path: name });
    }
  }
  return out;
}

function kindOf(name: string): FeatureKind {
  const t = tokens(name);
  for (const [kind, list] of KIND_WORDS) {
    if (t.some((w) => list.includes(w))) return kind;
  }
  return 'works';
}

// ───────────────────────── Stages ─────────────────────────

export interface InferredStages {
  building: string;
  working?: string;
  mature?: string;
}

/**
 * The stages a run of commit days evidences, by `INFERENCE` and nothing else.
 * `days` are ISO days, one per commit, in any order; `releases` ISO days; `today` the
 * day of the sync, which bounds the last quiet spell.
 */
export function inferStages(days: readonly string[], releases: readonly string[], today: string): InferredStages | null {
  if (days.length === 0) return null;
  const sorted = days.slice().sort();
  const first = sorted[0]!;
  const out: InferredStages = { building: first };
  const W = INFERENCE.working;

  // The day the volume of work was enough: the commit that completes both counts.
  let enoughAt = -1;
  const weeks = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    weeks.add(weekIndex(dayNumber(sorted[i]!)));
    if (i + 1 >= W.minCommits && weeks.size >= W.minWeeks) {
      enoughAt = i;
      break;
    }
  }
  if (enoughAt === -1) return out;
  const enoughDay = sorted[enoughAt]!;

  let working: string | undefined;
  // (a) A release on or after the first commit; it counts from the later of the two days.
  for (const r of releases.slice().sort()) {
    if (r < first) continue;
    working = r > enoughDay ? r : enoughDay;
    break;
  }
  // (b) The first quiet spell after there was enough: dated the day the quiet was complete.
  for (let i = enoughAt; i < sorted.length; i++) {
    // After the last commit the quiet runs up to the day of the sync.
    const until = sorted[i + 1] ?? today;
    if (daysBetween(sorted[i]!, until) >= W.quietDays) {
      const at = addDays(sorted[i]!, W.quietDays);
      if (working === undefined || at < working) working = at;
      break;
    }
  }
  // (c) Sustained work: enough commits over enough weeks, dated at the commit that completes both.
  {
    const span = new Set<number>();
    for (let i = 0; i < sorted.length; i++) {
      span.add(weekIndex(dayNumber(sorted[i]!)));
      if (i + 1 >= W.sustainedCommits && span.size >= W.sustainedWeeks) {
        if (working === undefined || sorted[i]! < working) working = sorted[i]!;
        break;
      }
    }
  }
  if (working === undefined || working > today) return out;
  out.working = working;

  // Mature: come back to, after it worked, in enough separate bursts over a long enough span.
  const M = INFERENCE.mature;
  let returns = 0;
  let prevWeek = Number.NEGATIVE_INFINITY;
  for (const day of sorted) {
    const week = weekIndex(dayNumber(day));
    const startsBurst = week - prevWeek >= M.burstGapWeeks;
    prevWeek = week;
    if (day <= working) continue;
    if (startsBurst) returns++;
    if (returns >= M.minReturns && daysBetween(first, day) >= M.minSpanDays) {
      out.mature = day;
      break;
    }
  }
  return out;
}

// ───────────────────────── Position ─────────────────────────

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h ^ (h >>> 16)) >>> 0;
}

function spacingFor(features: number): number {
  for (const s of LAYOUT.spacing) if (features >= s.features) return s.distance;
  return 240;
}

interface Placed {
  position: Point;
  features: number;
}

/**
 * The best free spot for one place, given only the places founded before it: the first
 * point on a spiral out from the region's centre (turned by a seed from the repository's
 * name) that is on land, clear of the edge and clear of its elders. Nothing founded later
 * is consulted, so nothing founded later can move it.
 */
function findSpot(
  seed: string,
  region: RegionDef,
  features: number,
  earlier: readonly Placed[],
  catalogue: Catalogue,
  isLand: (p: Point) => boolean,
): Point {
  const { width, height } = catalogue.size;
  const turn = (hash(seed) / 4294967296) * Math.PI * 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const mine = spacingFor(features);

  const acceptable = (p: Point, strict: boolean): boolean => {
    if (p.x < LAYOUT.edge || p.y < LAYOUT.edge || p.x > width - LAYOUT.edge || p.y > height - LAYOUT.edge) return false;
    if (!isLand(p)) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (!isLand({ x: p.x + Math.cos(a) * LAYOUT.landRing, y: p.y + Math.sin(a) * LAYOUT.landRing })) return false;
    }
    if (!strict) return true;
    for (const e of earlier) {
      // The larger of the two decides, so a city founded late still keeps its distance.
      const need = Math.max(mine, spacingFor(e.features));
      if (Math.hypot(p.x - e.position.x, p.y - e.position.y) < need) return false;
    }
    return true;
  };

  const scan = (strict: boolean): Point | null => {
    // Start a little off the centre: the region's name is lettered there.
    for (let i = 4; i < LAYOUT.samples; i++) {
      const r = LAYOUT.spiralStep * Math.sqrt(i);
      const a = turn + i * golden;
      const p = { x: Math.round(region.center.x + Math.cos(a) * r), y: Math.round(region.center.y + Math.sin(a) * r) };
      if (acceptable(p, strict)) return p;
    }
    return null;
  };
  // If the country is full: any land at all, rather than the sea.
  return scan(true) ?? scan(false) ?? { x: Math.round(region.center.x), y: Math.round(region.center.y) };
}

// ───────────────────────── One repository ─────────────────────────

interface FeaturePlan {
  id: string;
  /** What its event ids are keyed by: its directory, or `@id` for a declared feature. */
  path: string;
  /** The paths whose histories are its work. */
  paths: string[];
  name: string;
  kind: FeatureKind;
  ward?: string;
  methods: string[];
  /** One ISO day per commit that touched it: what stage inference reads. */
  days: string[];
  /** One ISO day per commit logged as work here. Each commit is logged against one feature only. */
  work?: string[];
  /** Declared features only: what the file has claimed for it over time. */
  claims?: StageClaim[];
  /** Declared features only: the day it was first known, by the file or by its first commit. */
  since?: string;
  note?: string;
}

interface RepoPlan {
  repo: GithubRepo;
  place: string;
  name: string;
  note: string;
  foundedAt: string;
  region: string;
  /** The repository's own definition, where it carries one that reads. */
  city: DeclaredCity | null;
  /** Things the owner would want to know about the definition, in plain words. */
  notes: string[];
  features: FeaturePlan[];
  /** Attributed commits touching no feature directory: one ISO day each. */
  remainder: string[];
  releases: { key: string; name: string; at: string }[];
}

/** A tag that reads as a version (`v1.2.0`, `2.0`) is a release even without a GitHub release. */
const VERSION_TAG = /^v?\d+(\.\d+)+([-+.].*)?$|^v\d+$/i;

function dayOf(c: GithubCommit): string | null {
  return typeof c.date === 'string' && c.date.length >= 10 ? isoDay(c.date) : null;
}

function regionFor(repo: GithubRepo, featurePaths: readonly string[], catalogue: Catalogue): string {
  const fallback = catalogue.regions[0]?.id ?? DEFAULT_REGION;
  const has = (id: string) => catalogue.regions.some((r) => r.id === id);
  const strong = tokens([repo.name, repo.description ?? '', ...repo.topics].join(' '));
  const weak = tokens(featurePaths.join(' '));
  let best = '';
  // One stray directory name (`tools/`) is not enough to say what a repository is about.
  let bestScore = 1;
  for (const [region, list] of REGION_WORDS) {
    const score = hits(strong, list) * 3 + hits(weak, list);
    if (score > bestScore) {
      best = region;
      bestScore = score;
    }
  }
  const chosen = best === '' ? DEFAULT_REGION : best;
  return has(chosen) ? chosen : fallback;
}

function planRepo(repo: GithubRepo, raw: GithubRaw, catalogue: Catalogue, today: string): RepoPlan {
  const mine = ownerTest(raw);
  const known = new Set(catalogue.methods.map((m) => m.id));

  // Methods the whole repository evidences, from its languages.
  let bytes = 0;
  for (const n of Object.values(repo.languages)) bytes += n;
  const repoMethods: string[] = [];
  for (const [language, n] of Object.entries(repo.languages)) {
    const method = LANGUAGE_METHOD[language.toLowerCase()];
    if (method === undefined || bytes === 0 || n / bytes < LANGUAGE_SHARE) continue;
    if (known.has(method) && !repoMethods.includes(method)) repoMethods.push(method);
  }
  const methodsFor = (name: string): string[] => {
    const out = repoMethods.slice();
    for (const t of tokens(name)) {
      const method = NAME_METHOD[t] ?? NAME_METHOD[t.replace(/s$/, '')];
      if (method !== undefined && known.has(method) && !out.includes(method)) out.push(method);
    }
    return out;
  };

  const ownCommits = repo.commits.filter(mine);
  const allDays = repo.commits.map(dayOf).filter((d): d is string => d !== null);
  const created = isoDay(repo.created_at);
  // Created on GitHub, or first committed to, whichever came first (history can predate the push).
  const foundedAt = allDays.reduce((a, b) => (b < a ? b : a), created);

  /** Every commit that touched any of these paths, once each. */
  const historyOf = (paths: readonly string[]): GithubCommit[] => {
    if (paths.length === 1) return repo.paths[paths[0]!]?.commits ?? [];
    const seen = new Set<string>();
    const out: GithubCommit[] = [];
    for (const path of paths) {
      for (const c of repo.paths[path]?.commits ?? []) {
        if (seen.has(c.sha7)) continue;
        seen.add(c.sha7);
        out.push(c);
      }
    }
    return out;
  };

  const read = readDeclared(repo.definition, today);
  const city = read.city;
  const notes: string[] = [];
  if (read.problem !== undefined) notes.push(read.problem);
  // A definition that lists no features gives the city its name, country and links, and
  // leaves its features to be guessed from directories as before.
  const described = city !== null && city.definition.features.length > 0;

  let features: FeaturePlan[] = [];
  if (city !== null && described) {
    // Features: the ones the owner named. No cap; the owner decides how many there are.
    for (const d of city.definition.features) {
      const paths = d.paths ?? [];
      const days = historyOf(paths)
        .filter(mine)
        .map(dayOf)
        .filter((x): x is string => x !== null);
      const strangers = (d.methods ?? []).filter((m) => !known.has(m));
      if (strangers.length > 0) notes.push(`"${d.id}" names what the Key of Methods does not have: ${strangers.join(', ')}.`);
      const unread = paths.filter((path) => repo.paths[path] === undefined);
      if (unread.length > 0) notes.push(`"${d.id}": no history was read for ${unread.join(', ')}. Run the sync again.`);
      else if (paths.length > 0 && days.length === 0 && STAGES.indexOf(d.stage) >= STAGES.indexOf('building')) {
        notes.push(`"${d.id}" is declared ${d.stage}, and no commit of yours touches ${paths.join(', ')}. Are its paths right?`);
      }
      const named = city.knownAt.get(d.id) ?? today;
      const firstCommit = days.reduce((a, b) => (b < a ? b : a), named);
      const feature: FeaturePlan = {
        id: d.id,
        path: `@${d.id}`,
        paths,
        name: d.name,
        kind: d.kind,
        methods: d.methods !== undefined ? d.methods.filter((m) => known.has(m)) : methodsFor(d.name),
        days,
        claims: city.claims.get(d.id) ?? [{ at: named, stage: d.stage }],
        since: firstCommit,
      };
      if (d.ward !== undefined) feature.ward = d.ward;
      const note = d.note ?? (paths.length > 0 ? paths.join(', ') : undefined);
      if (note !== undefined) feature.note = note;
      features.push(feature);
    }
  } else {
    // Features: candidate directories with at least one of the owner's commits.
    const candidates = candidateDirectories(repo.tree);
    const expandedRoots = new Set(candidates.map((c) => c.root).filter((r): r is string => r !== undefined));
    const usedIds = new Set<string>();
    for (const c of candidates) {
      const history = repo.paths[c.path];
      if (history === undefined) continue;
      const days = history.commits
        .filter(mine)
        .map(dayOf)
        .filter((d): d is string => d !== null);
      if (days.length === 0) continue;
      const base = c.path.split('/').pop() ?? c.path;
      let id = kebab(c.path);
      while (usedIds.has(id)) id = `${id}-x`;
      usedIds.add(id);
      const feature: FeaturePlan = { id, path: c.path, paths: [c.path], name: humanise(base), kind: kindOf(base), methods: methodsFor(base), days };
      // A ward only where there is more than one root to tell apart.
      if (c.root !== undefined && expandedRoots.size > 1) feature.ward = humanise(c.root);
      features.push(feature);
    }
    if (features.length > DIRECTORIES.maxFeatures) {
      features = features
        .slice()
        .sort((a, b) => b.days.length - a.days.length || (a.path < b.path ? -1 : 1))
        .slice(0, DIRECTORIES.maxFeatures);
    }
  }

  // Work is counted once. A commit that touched several feature directories is evidence for
  // each of them (so `days`, which stage inference reads, keeps it for all), but it is logged
  // as work against only one: the most specific, meaning the one with the fewest commits.
  {
    const size = new Map(features.map((f) => [f.path, f.days.length]));
    const home = new Map<string, string>();
    for (const f of features) {
      for (const c of historyOf(f.paths)) {
        if (!mine(c) || dayOf(c) === null) continue;
        const held = home.get(c.sha7);
        if (held === undefined || size.get(f.path)! < size.get(held)! || (size.get(f.path) === size.get(held) && f.path < held)) {
          home.set(c.sha7, f.path);
        }
      }
    }
    for (const f of features) {
      f.work = historyOf(f.paths)
        .filter((c) => mine(c) && home.get(c.sha7) === f.path)
        .map(dayOf)
        .filter((d): d is string => d !== null);
    }
  }

  // What is left for the place itself: the owner's commits that touched none of the kept
  // feature directories. Counted commit by commit, so it can never go negative.
  //
  let remainder: string[];
  if (features.length === 0) {
    const days = ownCommits.map(dayOf).filter((d): d is string => d !== null);
    if (days.length > 0) {
      // No usable directories: the repository is its own single feature.
      features = [
        { id: kebab(repo.name), path: '.', paths: [], name: humanise(repo.name), kind: kindOf(repo.name), methods: methodsFor(repo.name), days },
      ];
    }
    remainder = [];
  } else {
    const touched = new Set<string>();
    for (const f of features) for (const c of historyOf(f.paths)) touched.add(c.sha7);
    remainder = ownCommits
      .filter((c) => !touched.has(c.sha7))
      .map(dayOf)
      .filter((d): d is string => d !== null);
  }

  // Proposal order is the order the lots are drawn in: by first commit, then by path.
  const firstDay = (f: FeaturePlan) => f.since ?? f.days.reduce((a, b) => (b < a ? b : a));
  features.sort((a, b) => {
    const x = firstDay(a);
    const y = firstDay(b);
    return x < y ? -1 : x > y ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  // Releases: GitHub releases, and tags that read as versions and have no release.
  const releases: RepoPlan['releases'] = [];
  const releasedTags = new Set<string>();
  for (const r of repo.releases) {
    releasedTags.add(r.tag);
    const at = r.published_at ?? r.created_at ?? null;
    if (r.draft === true || at === null) continue;
    releases.push({ key: r.tag, name: r.name !== null && r.name.trim() !== '' ? r.name : r.tag, at: isoDay(at) });
  }
  for (const t of repo.tags) {
    if (releasedTags.has(t.name) || t.date === null || !VERSION_TAG.test(t.name)) continue;
    releases.push({ key: t.name, name: t.name, at: isoDay(t.date) });
  }

  // The country: the one the owner named, if the map has it; the keyword guess otherwise.
  let region = regionFor(repo, features.flatMap((f) => f.paths), catalogue);
  const wanted = city?.definition.region;
  if (wanted !== undefined) {
    if (catalogue.regions.some((r) => r.id === wanted)) region = wanted;
    else notes.push(`The map has no region "${wanted}"; one of ${catalogue.regions.map((r) => r.id).join(', ')}.`);
  }
  const description = repo.description?.trim() ?? '';

  return {
    repo,
    place: placeId(repo),
    name: city?.definition.name ?? humanise(repo.name),
    note: city?.definition.what ?? (description !== '' ? description : 'No description.'),
    foundedAt: foundedAt <= today ? foundedAt : today,
    region,
    city,
    notes,
    features,
    remainder,
    releases: releases.filter((r) => r.at <= today),
  };
}

// ───────────────────────── The whole record ─────────────────────────

function tally(days: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of days) {
    const week = weekEnding(d);
    out.set(week, (out.get(week) ?? 0) + 1);
  }
  return out;
}

export interface Survey {
  events: WorldEvent[];
  /** How many places are drawn from their own definition and not from guesses. */
  described: number;
  /** What the owner would want to know about the definitions, each led by its repository's name. */
  notes: string[];
}

/** Every event GitHub's record evidences. See `surveyGithub` for what else the record says. */
export function githubEvents(raw: GithubRaw, catalogue: Catalogue, isLand: (p: Point) => boolean): WorldEvent[] {
  return surveyGithub(raw, catalogue, isLand).events;
}

/**
 * Every event GitHub's record evidences, and how the definitions in it read. `isLand`
 * answers for the terrain the map is drawn on, so that no place is founded in the sea.
 */
export function surveyGithub(raw: GithubRaw, catalogue: Catalogue, isLand: (p: Point) => boolean): Survey {
  const today = isoDay(raw.fetchedAt);
  const plans = raw.repos.map((repo) => planRepo(repo, raw, catalogue, today));

  // Founding order decides who chooses ground first.
  const order = plans
    .slice()
    .sort((a, b) =>
      a.foundedAt < b.foundedAt ? -1 : a.foundedAt > b.foundedAt ? 1 : a.repo.full_name < b.repo.full_name ? -1 : 1,
    );
  const fallbackRegion: RegionDef = catalogue.regions[0] ?? {
    id: DEFAULT_REGION,
    name: '',
    center: { x: catalogue.size.width / 2, y: catalogue.size.height / 2 },
    radius: Math.min(catalogue.size.width, catalogue.size.height) / 4,
    note: '',
  };
  const placed: Placed[] = [];
  const positions = new Map<string, Point>();
  for (const plan of order) {
    const region = catalogue.regions.find((r) => r.id === plan.region) ?? fallbackRegion;
    const position = findSpot(plan.repo.full_name, region, plan.features.length, placed, catalogue, isLand);
    placed.push({ position, features: plan.features.length });
    positions.set(plan.place, position);
  }

  const events: WorldEvent[] = [];
  const seen = new Set<string>();
  const emit = (e: WorldEvent) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    events.push(e);
  };

  // What a link may call a city: the id in its own definition, and failing that its
  // repository's name, so that a city can be linked to before it has a file of its own.
  // An elder city keeps an id two definitions claim.
  const handles = new Map<string, string>();
  const founded = new Map<string, string>();
  for (const plan of order) {
    founded.set(plan.place, plan.foundedAt);
    if (plan.city === null) continue;
    const id = plan.city.definition.id;
    if (handles.has(id)) plan.notes.push(`Its id "${id}" already belongs to an older city; links to it go there.`);
    else handles.set(id, plan.place);
  }
  for (const plan of order) {
    const name = kebab(plan.repo.name);
    if (!handles.has(name)) handles.set(name, plan.place);
  }

  for (const plan of order) {
    const { repo, place } = plan;
    const key = `gh:${repo.full_name}`;

    emit({
      id: `${key}:founded`,
      at: plan.foundedAt,
      source: 'github',
      type: 'place.founded',
      place,
      name: plan.name,
      region: plan.region,
      position: positions.get(place) ?? fallbackRegion.center,
      note: plan.note,
    });

    const releaseDays = plan.releases.map((r) => r.at);
    for (const f of plan.features) {
      const stages = inferStages(f.days, releaseDays, today);
      if (f.claims !== undefined) {
        // DECLARED: the owner named this feature, so it stands whether or not it has commits.
        const proposed: WorldEvent = {
          id: `${key}:feature:${f.path}:proposed`,
          at: f.since ?? today,
          source: 'declared',
          type: 'feature.proposed',
          place,
          feature: f.id,
          name: f.name,
          kind: f.kind,
          methods: f.methods,
        };
        if (f.note !== undefined) proposed.note = f.note;
        if (f.ward !== undefined) proposed.ward = f.ward;
        emit(proposed);
        for (const s of declaredStages(f.claims, stages, today)) {
          // A claim may be made, withdrawn and made again, so its day is part of its id.
          const id = s.source === 'declared' ? `${key}:feature:${f.path}:claim:${s.stage}:${s.at}` : `${key}:feature:${f.path}:stage:${s.stage}`;
          emit({ id, at: s.at, source: s.source, type: 'feature.staged', place, feature: f.id, stage: s.stage });
        }
      } else {
        if (stages === null) continue;
        const proposed: WorldEvent = {
          id: `${key}:feature:${f.path}:proposed`,
          at: stages.building,
          source: 'github',
          type: 'feature.proposed',
          place,
          feature: f.id,
          name: f.name,
          kind: f.kind,
          methods: f.methods,
          note: f.path === '.' ? 'The whole repository.' : `${f.path}/`,
        };
        if (f.ward !== undefined) proposed.ward = f.ward;
        emit(proposed);
        // INFERRED, not observed. See the header of this file.
        for (const stage of ['building', 'working', 'mature'] as const) {
          const at = stages[stage];
          if (at === undefined) continue;
          emit({ id: `${key}:feature:${f.path}:stage:${stage}`, at, source: 'github', type: 'feature.staged', place, feature: f.id, stage });
        }
      }
      for (const [week, commits] of tally(f.work ?? f.days)) {
        // The week still in progress is logged on the day of the sync: nothing is dated ahead of today.
        emit({
          id: `${key}:work:${f.path}:${week}`,
          at: week <= today ? week : today,
          source: 'github',
          type: 'work.logged',
          place,
          feature: f.id,
          commits,
        });
      }
    }

    for (const [week, commits] of tally(plan.remainder)) {
      emit({ id: `${key}:work:_place:${week}`, at: week <= today ? week : today, source: 'github', type: 'work.logged', place, commits });
    }

    for (const r of plan.releases) {
      // Attached to no feature: a release is the repository's, and GitHub does not say whose work it was.
      emit({ id: `${key}:release:${r.key}`, at: r.at, source: 'github', type: 'release.shipped', place, name: r.name });
    }

    if (repo.archived) {
      // `pushed_at`, but never before the week the last work is logged in: work is dated
      // at its week's end, and work dated after an abandonment would read as a revival.
      let at = repo.pushed_at !== null ? isoDay(repo.pushed_at) : plan.foundedAt;
      for (const f of plan.features) for (const d of f.days) if (weekEnding(d) > at) at = weekEnding(d);
      for (const d of plan.remainder) if (weekEnding(d) > at) at = weekEnding(d);
      if (at < plan.foundedAt) at = plan.foundedAt;
      if (at > today) at = today;
      emit({ id: `${key}:abandoned`, at, source: 'github', type: 'place.abandoned', place, note: 'Archived on GitHub.' });
    }

    // Links: only ever the owner's word. Dated the day the file first drew the link, and
    // never before both of its ends stood.
    for (const link of plan.city?.definition.links ?? []) {
      const other = handles.get(link.to);
      if (other === undefined) {
        plan.notes.push(`It links to "${link.to}", which no repository answers to yet.`);
        continue;
      }
      if (other === place) continue;
      let at = plan.city?.linkedAt.get(linkKey(link)) ?? today;
      if (at < plan.foundedAt) at = plan.foundedAt;
      const otherFounded = founded.get(other);
      if (otherFounded !== undefined && at < otherFounded) at = otherFounded;
      const formed: WorldEvent = { id: `${key}:link:${linkKey(link)}`, at, source: 'declared', type: 'link.formed', a: place, b: other, kind: link.kind };
      if (link.carries !== undefined) formed.carries = link.carries;
      emit(formed);
    }
  }

  const notes: string[] = [];
  for (const plan of plans) for (const note of plan.notes) notes.push(`${plan.repo.full_name}: ${note}`);
  return { events, described: plans.filter((p) => p.city !== null).length, notes };
}

/** How much of the record was attributed, for the sync report and the source's status. */
export function attribution(raw: GithubRaw): { repos: number; commits: number; attributed: number; dropped: number } {
  const mine = ownerTest(raw);
  let commits = 0;
  let attributed = 0;
  for (const repo of raw.repos) {
    for (const c of repo.commits) {
      commits++;
      if (mine(c)) attributed++;
    }
  }
  return { repos: raw.repos.length, commits, attributed, dropped: commits - attributed };
}
