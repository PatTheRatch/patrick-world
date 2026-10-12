// The synthetic world: a fictional history from early 2023 to 2026-10-12.
//
// Authored as declarative data (places, their features with stage dates, and phases of
// activity) and expanded into weekly `work.logged` events with a seeded generator, so the
// output is identical on every call. Nothing here reads a clock or a random source.

import { addDays, weekday } from '../time';
import type {
  FeatureKind,
  FeatureProposed,
  FeatureStage,
  LinkFormed,
  LinkKind,
  ReleaseShipped,
  TractionMeasured,
  WorldEvent,
} from '../types';

/** The last day of the fixture history. */
export const FIXTURE_TODAY = '2026-10-12';

// ───────────────────────── Authoring vocabulary ─────────────────────────

interface FeatureSpec {
  /** Short id, unique within the place. The event id is `<place>.<id>`. */
  id: string;
  name: string;
  kind: FeatureKind;
  ward?: string;
  methods: string[];
  proposed: string;
  stages: { stage: FeatureStage; at: string }[];
  note?: string;
  /** Share of the place's weekly work it tends to attract. */
  weight: number;
}

interface Phase {
  /** First and last week-ending dates (snapped forward to a Sunday). */
  from: string;
  to: string;
  /** Typical commits per week. */
  rate: number;
  /** Chance a week is skipped altogether. */
  skip?: number;
}

interface PlaceSpec {
  id: string;
  name: string;
  region: string;
  at: [number, number];
  founded: string;
  note: string;
  notes?: [at: string, note: string][];
  features?: FeatureSpec[];
  phases?: Phase[];
  /** Hand-placed work, for days that do not fit the weekly grid. */
  work?: [at: string, feature: string | null, commits: number][];
  releases?: [at: string, name: string, feature?: string][];
  traction?: [at: string, users: number, revenue?: number][];
  abandoned?: [at: string, note: string];
}

const STAGE_CODES: Record<string, FeatureStage> = {
  p: 'planned',
  d: 'designed',
  b: 'building',
  w: 'working',
  m: 'mature',
};

/**
 * A feature. `timeline` is the proposal date followed by stage marks:
 * `'2024-06-16 b:2024-06-18 w:2024-07-21 m:2025-01-12'` (p, d, b, w, m).
 */
function f(
  id: string,
  name: string,
  kind: FeatureKind,
  ward: string,
  methods: string,
  timeline: string,
  note?: string,
  weight = 1,
): FeatureSpec {
  const tokens = timeline.split(' ');
  const stages: { stage: FeatureStage; at: string }[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    const stage = STAGE_CODES[token.charAt(0)];
    if (stage !== undefined) stages.push({ stage, at: token.slice(2) });
  }
  const spec: FeatureSpec = {
    id,
    name,
    kind,
    ward,
    methods: methods.split(' '),
    proposed: tokens[0]!,
    stages,
    weight,
  };
  if (note !== undefined) spec.note = note;
  return spec;
}

function ph(from: string, to: string, rate: number, skip?: number): Phase {
  return skip === undefined ? { from, to, rate } : { from, to, rate, skip };
}

// ───────────────────────── The cast ─────────────────────────

const boxout: PlaceSpec = {
  id: 'boxout-fantasy',
  name: 'Boxout Fantasy',
  region: 'the-court',
  at: [1480, 1230],
  founded: '2024-06-16',
  note: 'Fantasy basketball intelligence. Knows my league better than I do.',
  notes: [
    ['2024-09-01', 'Auction draft is in six weeks. The draft room has to exist by then.'],
    ['2025-06-08', 'People keep asking it questions in chat. Give the model the league directly.'],
    ['2026-05-17', 'The front end grew one page at a time and looks like it. Redo it as one thing.'],
  ],
  features: [
    // League Integration
    f('espn-sync', 'ESPN league sync', 'works', 'League Integration', 'python data-engineering', '2024-06-16 b:2024-06-18 w:2024-07-21 m:2026-03-01', 'Rosters, matchups and transactions, pulled every fifteen minutes.', 10),
    f('league-store', 'League history store', 'reservoir', 'League Integration', 'postgresql sql data-engineering', '2024-06-16 b:2024-06-30 w:2024-08-04 m:2025-04-06', 'Every season the league has played, one schema.', 3),
    f('scoring-engine', 'Scoring settings engine', 'works', 'League Integration', 'python statistics', '2024-07-07 b:2024-07-21 w:2024-09-01 m:2025-06-01', 'Nine-cat, points, whatever the commissioner invented.', 1.5),
    f('account-linking', 'League account linking', 'utility', 'League Integration', 'typescript auth-identity', '2024-08-11 b:2024-09-15 w:2024-10-20', undefined, 0.8),
    f('yahoo-sync', 'Yahoo league sync', 'works', 'League Integration', 'python data-engineering', '2024-09-08 p:2025-03-02 d:2025-12-14 b:2026-03-08 w:2026-06-07', 'Second most asked-for thing after trades.', 1.4),
    f('sleeper-sync', 'Sleeper league sync', 'works', 'League Integration', 'python data-engineering', '2026-02-01'),

    // Player Listener
    f('box-score-ingest', 'Box score ingest', 'works', 'Player Listener', 'python data-engineering postgresql', '2024-06-23 b:2024-07-14 w:2024-08-25 m:2025-03-09', 'Every game, every line, by the next morning.', 3),
    f('minutes-watcher', 'Minutes trend watcher', 'observatory', 'Player Listener', 'python statistics', '2024-10-06 b:2024-11-03 w:2024-12-08 m:2025-11-02', 'Minutes move before the box score does.', 1.2),
    f('beat-feed', 'Beat writer feed', 'works', 'Player Listener', 'python web-scraping', '2025-01-12 b:2025-04-13 w:2025-05-25', undefined, 0.9),
    f('role-alerts', 'Role change alerts', 'observatory', 'Player Listener', 'python statistics ai-agents', '2025-05-04 p:2025-06-08 b:2025-09-07 w:2025-10-19', 'Tells me when a bench guy quietly became a starter.', 1.2),
    f('schedule-grid', 'Schedule density grid', 'observatory', 'Player Listener', 'typescript statistics', '2025-09-14 b:2025-10-05 w:2025-11-09', 'Who plays four times next week.', 0.6),

    // Injury Intelligence
    f('injury-parser', 'Injury report parser', 'works', 'Injury Intelligence', 'python web-scraping data-engineering', '2024-09-22 b:2024-10-13 w:2024-11-17 m:2025-12-07', 'The league report is a PDF. Of course it is.', 2),
    f('return-estimator', 'Return date estimator', 'observatory', 'Injury Intelligence', 'python statistics', '2025-04-06 b:2025-05-11 w:2025-06-22', undefined, 1),
    f('replacement-finder', 'Replacement finder', 'works', 'Injury Intelligence', 'python statistics ai-agents', '2025-10-12 p:2025-11-16 d:2026-01-18 b:2026-09-13', 'When he sits, who on the wire gets his minutes.', 0.8),
    f('load-flags', 'Load management flags', 'observatory', 'Injury Intelligence', 'python statistics', '2026-03-15 p:2026-05-03'),

    // Draft Room
    f('draft-board', 'Auction draft board', 'frontage', 'Draft Room', 'typescript react product-design', '2024-08-04 b:2024-08-18 w:2024-09-29 m:2025-10-05', 'The thing open on the laptop on draft night.', 3.5),
    f('price-model', 'Auction price model', 'observatory', 'Draft Room', 'python statistics', '2024-08-04 b:2024-08-25 w:2024-10-06 m:2025-10-12', 'What this room pays, not what the internet says.', 2),
    f('draft-what-if', 'Draft what-if', 'works', 'Draft Room', 'typescript python statistics', '2025-07-13 b:2025-08-24 w:2025-09-28', 'What happens to the rest of my budget if I buy him at 14.', 1.2),
    f('keeper-values', 'Keeper value sheet', 'observatory', 'Draft Room', 'python statistics', '2025-08-03 p:2026-04-12 d:2026-07-19'),
    f('mock-rooms', 'Mock draft rooms', 'frontage', 'Draft Room', 'typescript react', '2026-06-14', 'Practice against the league as it actually bids.'),

    // MCP
    f('mcp-server', 'League MCP server', 'utility', 'MCP', 'typescript mcp ai-agents', '2025-06-08 b:2025-08-31 w:2025-10-26', 'The league, readable by a model. Reads only, never writes.', 3),
    f('waiver-ranker', 'Waiver wire ranker', 'works', 'MCP', 'python statistics ai-agents', '2024-11-10 b:2024-12-01 w:2025-01-26 m:2026-02-08', 'Who to pick up, for my roster, this week.', 2.5),
    f('trade-judge', 'Trade judge', 'works', 'MCP', 'python ai-agents prompt-design statistics', '2025-09-21 b:2025-11-09 w:2026-01-11', 'Scores a trade from both sides and shows its working.', 2.2),
    f('week-report', 'Week report writer', 'works', 'MCP', 'python ai-agents prompt-design', '2025-11-23 b:2026-01-04 w:2026-02-22', undefined, 1.2),
    f('oauth-connector', 'Connector sign-in', 'utility', 'MCP', 'typescript auth-identity mcp', '2026-01-25 b:2026-04-19 w:2026-05-31', undefined, 0.9),
    f('answer-grader', 'Answer grader', 'observatory', 'MCP', 'python llm-evaluation', '2026-02-15 p:2026-03-22 b:2026-09-06', 'Catches the model inventing a stat before a user does.', 0.8),

    // Front of House
    f('team-dashboard', 'Team dashboard', 'frontage', 'Front of House', 'typescript react product-design', '2024-07-28 b:2024-11-24 w:2025-02-02', undefined, 2),
    f('matchup-page', 'Matchup page', 'frontage', 'Front of House', 'typescript react', '2024-09-29 b:2024-10-27 w:2024-12-15 m:2026-01-04', 'This week, category by category.', 2),
    f('onboarding', 'League onboarding flow', 'frontage', 'Front of House', 'typescript react product-design auth-identity', '2025-03-02 b:2026-01-18 w:2026-03-15', 'From sign-up to a synced league in under two minutes.', 1.2),
    f('season-report', 'Season report', 'frontage', 'Front of House', 'typescript react ai-agents', '2026-04-26 p:2026-07-05 b:2026-09-20', undefined, 1),
    f('ui-redesign', 'UI redesign', 'frontage', 'Front of House', 'typescript react product-design', '2026-05-17 p:2026-06-21 d:2026-07-26 b:2026-08-16', 'One layout, one type scale, every page.', 1.3),
    f('lineup-card', 'Phone lineup card', 'frontage', 'Front of House', 'typescript mobile-development', '2026-08-02', 'Set tonight in one thumb.'),
  ],
  phases: [
    ph('2024-06-16', '2024-08-25', 22),
    ph('2024-09-01', '2024-12-15', 38, 0.05),
    ph('2025-01-05', '2025-02-09', 30),
    ph('2025-02-16', '2025-03-30', 7, 0.35),
    ph('2025-04-06', '2025-06-29', 28),
    ph('2025-07-06', '2025-08-17', 11, 0.3),
    ph('2025-08-24', '2025-11-30', 48, 0.04),
    ph('2025-12-07', '2026-03-29', 34),
    ph('2026-04-05', '2026-06-28', 26),
    ph('2026-07-05', '2026-08-09', 13, 0.25),
    ph('2026-08-16', '2026-10-11', 50, 0),
  ],
  releases: [
    ['2024-10-20', 'Private beta', 'draft-board'],
    ['2025-10-19', '1.0 for the season'],
    ['2025-10-26', 'MCP connector', 'mcp-server'],
    ['2026-01-18', 'Trade judge', 'trade-judge'],
    ['2026-06-14', 'Yahoo leagues', 'yahoo-sync'],
  ],
  traction: [
    ['2024-11-03', 14],
    ['2025-01-19', 46],
    ['2025-04-13', 61],
    ['2025-10-26', 240, 0],
    ['2025-12-14', 610, 180],
    ['2026-02-22', 980, 420],
    ['2026-04-19', 1150, 510],
    ['2026-09-13', 1900, 880],
    ['2026-10-04', 3200, 1640],
  ],
};

const patrickOs: PlaceSpec = {
  id: 'patrick-os',
  name: 'Patrick OS',
  region: 'mindworks',
  at: [3080, 1080],
  founded: '2023-08-06',
  note: 'Personal memory and intelligence. One place that knows what I know.',
  notes: [
    ['2024-08-04', 'It remembers everything and tells me nothing. Needs to speak first.'],
    ['2026-02-01', 'If every project can read from here, this is the hub, not another app.'],
  ],
  features: [
    // Memory
    f('entity-store', 'Entity store', 'reservoir', 'Memory', 'postgresql sql python', '2023-08-06 b:2023-08-13 w:2023-10-01 m:2024-09-01', 'People, projects, ideas. One row each, everything else hangs off them.', 3),
    f('event-log', 'Event log', 'reservoir', 'Memory', 'postgresql data-engineering', '2023-08-20 b:2023-10-08 w:2023-12-03 m:2025-03-02', 'Append only. What happened, when, and who said so.', 2),
    f('memory-compactor', 'Memory compactor', 'works', 'Memory', 'python ai-agents prompt-design', '2024-08-11 b:2025-02-16 w:2025-04-20', 'Turns a week of noise into the five things worth keeping.', 1.4),
    f('forgetting-rules', 'Forgetting rules', 'utility', 'Memory', 'python', '2026-03-01 p:2026-05-10', 'Some things should expire.'),

    // Capture
    f('quick-capture', 'Quick capture inbox', 'frontage', 'Capture', 'typescript react', '2023-09-10 b:2023-11-05 w:2024-01-14 m:2025-05-04', 'One box, no fields, sorted later.', 1.6),
    f('voice-notes', 'Voice note transcriber', 'works', 'Capture', 'python data-engineering', '2023-12-10 b:2024-01-21 w:2024-03-10', undefined, 1),
    f('mail-digest', 'Mail digest reader', 'works', 'Capture', 'python ai-agents', '2024-04-07 b:2024-08-04 w:2024-10-13', undefined, 1.1),
    f('calendar-sync', 'Calendar sync', 'works', 'Capture', 'python data-engineering', '2025-03-09 b:2025-04-27 w:2025-06-15', undefined, 0.8),
    f('screenshot-reader', 'Screenshot reader', 'works', 'Capture', 'python ai-agents', '2026-04-05', 'Half of what I save is a screenshot I never look at again.'),

    // Recall
    f('ask-anything', 'Ask-anything search', 'frontage', 'Recall', 'typescript python postgresql', '2023-11-12 b:2023-12-10 w:2024-02-18 m:2025-08-03', 'Ask in a sentence, get the note and where it came from.', 2.4),
    f('morning-brief', 'Morning brief', 'frontage', 'Recall', 'python ai-agents prompt-design', '2024-09-15 b:2025-03-02 w:2025-05-11', 'What today needs, before I ask.', 1.6),
    f('timeline-view', 'Timeline view', 'frontage', 'Recall', 'typescript react product-design', '2025-06-01 p:2025-09-14 b:2026-02-08 w:2026-04-26', undefined, 1.2),
    f('recall-grader', 'Recall grader', 'observatory', 'Recall', 'python llm-evaluation', '2026-01-11 b:2026-03-01 w:2026-05-17', 'Did it find the right note, or just a plausible one.', 0.9),

    // Agents
    f('memory-mcp', 'Memory MCP server', 'utility', 'Agents', 'typescript mcp ai-agents', '2025-12-07 b:2026-02-01 w:2026-03-29', 'Any model, any project, same memory.', 2),
    f('research-runner', 'Research runner', 'works', 'Agents', 'python ai-agents prompt-design', '2026-02-22 d:2026-06-07 b:2026-09-06', 'Give it a question at night, read the answer at breakfast.', 2),
    f('weekly-review', 'Weekly review writer', 'works', 'Agents', 'python ai-agents', '2026-05-24 p:2026-08-09'),
    f('world-feed', 'World event feed', 'utility', 'Agents', 'typescript data-engineering', '2026-10-12', 'Emit what happened here as events the atlas can draw.'),
  ],
  phases: [
    ph('2023-08-06', '2023-10-29', 10),
    ph('2023-11-05', '2024-02-25', 16),
    ph('2024-03-03', '2024-05-26', 5, 0.3),
    ph('2024-08-04', '2024-10-27', 7, 0.2),
    ph('2024-11-10', '2025-01-26', 3, 0.5),
    ph('2025-02-16', '2025-05-25', 14),
    ph('2025-06-01', '2025-09-28', 5, 0.35),
    ph('2025-10-12', '2026-01-25', 4, 0.45),
    ph('2026-02-01', '2026-05-31', 18),
    ph('2026-06-07', '2026-08-30', 7, 0.3),
    ph('2026-09-06', '2026-10-11', 15, 0),
  ],
  releases: [
    ['2024-02-25', 'Ask anything', 'ask-anything'],
    ['2025-05-18', 'Morning brief', 'morning-brief'],
    ['2026-04-05', 'Memory over MCP', 'memory-mcp'],
  ],
};

const ledgerline: PlaceSpec = {
  id: 'ledgerline',
  name: 'Ledgerline',
  region: 'ledger-reach',
  at: [1880, 2280],
  founded: '2024-01-14',
  note: 'Investment analytics for one portfolio. What I own, what it did, and why.',
  notes: [
    ['2025-02-09', 'Tax season. The lots have to be right this year, not roughly right.'],
    ['2025-11-09', 'Two friends want in. It needs accounts before it needs anything else.'],
  ],
  features: [
    // Holdings
    f('statement-import', 'Brokerage statement import', 'works', 'Holdings', 'python data-engineering', '2024-01-14 b:2024-01-21 w:2024-03-03 m:2025-04-06', 'Three brokers, three CSV dialects.', 3),
    f('positions-ledger', 'Positions ledger', 'reservoir', 'Holdings', 'postgresql sql', '2024-01-14 b:2024-02-04 w:2024-03-24 m:2025-04-13', 'Double entry. Every share accounted for.', 2),
    f('lot-tracker', 'Tax lot tracker', 'works', 'Holdings', 'python sql investment-analytics', '2024-11-17 b:2025-02-09 w:2025-03-23', undefined, 1.5),
    f('account-sign-in', 'Account sign-in', 'utility', 'Holdings', 'typescript auth-identity', '2025-11-09 b:2025-12-07 w:2026-01-18', undefined, 0.8),

    // Market Data
    f('price-history', 'Price history store', 'reservoir', 'Market Data', 'postgresql data-engineering python', '2024-02-11 b:2024-03-10 w:2024-04-21 m:2025-12-14', 'Daily closes back to 2005, adjusted for splits.', 2),
    f('dividend-feed', 'Dividend calendar feed', 'works', 'Market Data', 'python web-scraping', '2024-04-14 b:2024-10-06 w:2024-11-24', undefined, 1),
    f('currency-converter', 'Currency converter', 'utility', 'Market Data', 'python', '2025-03-02 b:2025-04-06 w:2025-04-27', undefined, 0.5),
    f('filings-reader', 'Filings reader', 'works', 'Market Data', 'python web-scraping ai-agents', '2026-03-08 p:2026-06-14', 'Read the 10-K so I do not have to. Tell me what changed.'),

    // Analysis
    f('returns-calc', 'Time-weighted returns', 'observatory', 'Analysis', 'python investment-analytics statistics', '2024-03-03 b:2024-04-07 w:2024-05-26 m:2026-01-11', 'The honest number, deposits taken out.', 2),
    f('allocation-drift', 'Allocation drift monitor', 'observatory', 'Analysis', 'python investment-analytics', '2024-12-01 b:2025-03-02 w:2025-04-20', undefined, 1),
    f('benchmark-compare', 'Benchmark comparison', 'observatory', 'Analysis', 'python investment-analytics statistics', '2025-08-10 b:2025-11-16 w:2026-01-04', 'Did any of this beat just buying the index.', 1),
    f('drawdown-bands', 'Drawdown bands', 'observatory', 'Analysis', 'python statistics investment-analytics', '2026-01-25 b:2026-03-01 w:2026-04-12', undefined, 0.9),
    f('rebalance-what-if', 'Rebalance what-if', 'works', 'Analysis', 'python investment-analytics', '2026-04-26 d:2026-07-12 b:2026-08-30', 'Show the trades and the tax before I make them.', 1.4),

    // Reports
    f('portfolio-page', 'Portfolio page', 'frontage', 'Reports', 'typescript react', '2024-03-17 b:2024-04-14 w:2024-06-02', undefined, 1.8),
    f('quarterly-letter', 'Quarterly letter', 'frontage', 'Reports', 'python ai-agents prompt-design', '2025-04-13 p:2025-12-21 b:2026-03-15 w:2026-04-19', 'A page I would actually read, written from the numbers.', 1.2),
    f('tax-pack', 'Year-end tax pack', 'frontage', 'Reports', 'python investment-analytics', '2026-02-01'),
  ],
  phases: [
    ph('2024-01-14', '2024-04-28', 14),
    ph('2024-05-05', '2024-06-09', 6, 0.2),
    ph('2024-10-06', '2024-12-15', 5, 0.25),
    ph('2025-02-09', '2025-04-27', 18, 0.05),
    ph('2025-05-18', '2025-08-31', 3, 0.55),
    ph('2025-11-09', '2026-01-25', 9),
    ph('2026-03-01', '2026-04-19', 14, 0.05),
    ph('2026-05-10', '2026-07-26', 4, 0.5),
    ph('2026-08-30', '2026-09-13', 7, 0),
  ],
  releases: [
    ['2025-04-27', 'First full year', 'returns-calc'],
    ['2026-04-19', 'Quarterly letter', 'quarterly-letter'],
  ],
  traction: [
    ['2025-05-04', 3],
    ['2026-01-25', 12],
    ['2026-04-26', 31],
    ['2026-09-13', 44],
  ],
};

const evalyard: PlaceSpec = {
  id: 'evalyard',
  name: 'Evalyard',
  region: 'mindworks',
  at: [3520, 1400],
  founded: '2025-03-16',
  note: 'A harness for grading what models say. Same cases, every model, every week.',
  notes: [['2026-02-08', 'Rubrics drift. Two answers side by side is easier to judge than one.']],
  features: [
    f('suite-runner', 'Suite runner', 'works', 'Suites', 'python llm-evaluation', '2025-03-16 b:2025-03-23 w:2025-04-27 m:2026-04-05', 'Run a few hundred cases overnight, keep every transcript.', 3),
    f('case-library', 'Case library', 'reservoir', 'Suites', 'postgresql python', '2025-03-30 b:2025-04-13 w:2025-06-22', undefined, 1.4),
    f('rubric-grader', 'Rubric grader', 'observatory', 'Graders', 'python llm-evaluation prompt-design', '2025-04-06 b:2025-06-08 w:2025-07-20', 'A model marking a model, against a rubric a person wrote.', 2),
    f('regression-board', 'Regression board', 'frontage', 'Reports', 'typescript react', '2025-07-06 b:2026-02-22 w:2026-04-19', 'What got worse since last week.', 1.4),
    f('pairwise-judge', 'Pairwise judge', 'observatory', 'Graders', 'python llm-evaluation statistics', '2025-11-02 b:2026-02-08 w:2026-03-22', undefined, 1.4),
    f('agent-traces', 'Agent trace replay', 'works', 'Graders', 'python ai-agents llm-evaluation', '2026-03-29 p:2026-06-14 b:2026-08-23', 'Grade the route it took, not only where it ended up.', 2),
    f('score-drift', 'Score drift alarm', 'observatory', 'Reports', 'python statistics', '2026-04-12 p:2026-07-05'),
    f('tool-call-checks', 'MCP tool-call checks', 'utility', 'Suites', 'typescript mcp llm-evaluation', '2026-06-21 d:2026-08-02 b:2026-09-13', 'Did it call the right tool with the right arguments.', 1.3),
    f('tune-bench', 'Fine-tune comparison bench', 'observatory', 'Suites', 'python fine-tuning llm-evaluation', '2026-09-06', 'Is a tuned small model actually better than a prompted big one.'),
  ],
  phases: [
    ph('2025-03-16', '2025-05-04', 10),
    ph('2025-06-08', '2025-07-27', 6, 0.2),
    ph('2025-11-02', '2025-12-14', 4, 0.3),
    ph('2026-02-08', '2026-04-26', 12),
    ph('2026-06-07', '2026-07-12', 4, 0.3),
    ph('2026-08-23', '2026-10-11', 14, 0),
  ],
  releases: [['2026-04-26', 'First public suite', 'suite-runner']],
  traction: [
    ['2026-05-03', 8],
    ['2026-09-20', 22],
  ],
};

const patricksWorld: PlaceSpec = {
  id: 'patricks-world',
  name: "Patrick's World",
  region: 'the-commons',
  at: [3300, 2180],
  founded: FIXTURE_TODAY,
  note: 'My projects as a world I can explore.',
  features: [
    f('world-model', 'World model', 'works', 'Survey Office', 'typescript', `${FIXTURE_TODAY} b:${FIXTURE_TODAY}`, 'Events in, a world out. Nothing stored but what happened.'),
    f('atlas-renderer', 'Atlas renderer', 'frontage', 'Drawing Room', 'typescript canvas-graphics product-design', `${FIXTURE_TODAY} p:${FIXTURE_TODAY}`, 'Ink, wash and paper. It should look surveyed, not rendered.'),
    f('city-plans', 'City plan generator', 'works', 'Drawing Room', 'typescript canvas-graphics', `${FIXTURE_TODAY} p:${FIXTURE_TODAY}`, 'Streets, blocks and lots that never move once drawn.'),
    f('edition-dial', 'Edition dial', 'frontage', 'Drawing Room', 'typescript product-design', FIXTURE_TODAY, 'Turn it back and watch the map un-draw itself.'),
    f('source-adapters', 'Source adapters', 'utility', 'Survey Office', 'typescript data-engineering', FIXTURE_TODAY, 'GitHub and Patrick OS, reporting facts.'),
  ],
  work: [
    [FIXTURE_TODAY, 'world-model', 34],
    [FIXTURE_TODAY, null, 9],
  ],
};

const wirefeed: PlaceSpec = {
  id: 'wirefeed',
  name: 'Wirefeed',
  region: 'mindworks',
  at: [2600, 1330],
  founded: '2024-12-01',
  note: 'An MCP toolkit. Write the tools once, plug them into anything.',
  notes: [
    ['2025-07-06', 'Works well enough for me. Parking it until something needs more.'],
    ['2026-08-30', 'Three projects now ship MCP servers and each one hand-rolls sign-in. Back to this.'],
  ],
  features: [
    f('tool-schema', 'Tool schema builder', 'utility', 'Server Kit', 'typescript mcp', '2024-12-01 b:2024-12-08 w:2025-01-19', 'Types in, tool definitions out.', 2),
    f('stdio-transport', 'Stdio transport', 'utility', 'Transport', 'typescript mcp', '2024-12-01 b:2024-12-15 w:2025-02-02', undefined, 1.3),
    f('http-transport', 'Streamable HTTP transport', 'utility', 'Transport', 'typescript mcp', '2025-01-26 b:2025-04-20 w:2025-06-08', undefined, 1.3),
    f('call-recorder', 'Tool call recorder', 'observatory', 'Testing', 'typescript mcp llm-evaluation', '2025-02-16 b:2025-05-18 w:2025-06-29', 'Every call and result, replayable.', 1),
    f('oauth-helper', 'OAuth helper', 'utility', 'Server Kit', 'typescript mcp auth-identity', '2025-06-15 p:2025-07-06 b:2026-08-30', 'The part everyone gets wrong, done once.', 2),
    f('contract-tests', 'Contract test kit', 'works', 'Testing', 'typescript mcp', '2026-09-06 b:2026-09-20', undefined, 1.2),
    f('python-bridge', 'Python bridge', 'utility', 'Transport', 'python mcp', '2026-09-27', 'So the Python projects stop copying the schema by hand.'),
  ],
  phases: [
    ph('2024-12-01', '2025-03-02', 10),
    ph('2025-04-20', '2025-07-06', 6, 0.2),
    ph('2026-08-30', '2026-10-11', 16, 0),
  ],
  releases: [['2025-02-09', '0.1 on npm', 'stdio-transport']],
};

const shotchart: PlaceSpec = {
  id: 'shotchart',
  name: 'Shotchart',
  region: 'the-court',
  at: [1850, 1560],
  founded: '2025-05-18',
  note: 'Tap where you shot from. See where you actually make them.',
  notes: [['2026-01-11', 'Season is on and I am not shooting. Back to this in the summer, maybe.']],
  features: [
    f('tap-recorder', 'Court tap recorder', 'frontage', 'Courtside', 'typescript mobile-development react', '2025-05-18 b:2025-05-25 w:2025-06-29', 'Make or miss in one tap, sweaty thumbs allowed.', 2),
    f('session-store', 'Offline session store', 'reservoir', 'Courtside', 'typescript mobile-development', '2025-05-25 b:2025-06-15 w:2025-07-20', 'No signal in the gym.', 1.2),
    f('heat-map', 'Shot heat map', 'frontage', 'Review', 'typescript canvas-graphics', '2025-06-08 b:2025-07-06 w:2025-08-10', undefined, 1.5),
    f('zone-splits', 'Zone splits', 'observatory', 'Review', 'typescript statistics', '2025-07-13 b:2025-12-21', 'Corner three versus above the break, by month.', 1.2),
    f('shot-detection', 'Shot detection from video', 'observatory', 'Courtside', 'python computer-vision', '2025-07-27', 'Prop the phone on a bag and let it count.'),
    f('cloud-backup', 'Cloud backup', 'utility', 'Review', 'typescript postgresql auth-identity', '2025-08-03 p:2025-12-28'),
    f('share-card', 'Session share card', 'frontage', 'Review', 'typescript mobile-development product-design', '2026-01-04'),
  ],
  phases: [
    ph('2025-05-18', '2025-08-10', 9, 0.1),
    ph('2025-12-21', '2026-01-11', 6, 0),
  ],
  releases: [['2025-08-17', 'TestFlight build']],
  traction: [['2025-09-07', 6]],
};

const pantryLoop: PlaceSpec = {
  id: 'pantry-loop',
  name: 'Pantry Loop',
  region: 'the-commons',
  at: [3680, 2420],
  founded: '2026-03-22',
  note: 'Household groceries. One list we both trust.',
  features: [
    f('shared-list', 'Shared grocery list', 'frontage', 'Kitchen', 'typescript react', '2026-03-22 b:2026-03-29 w:2026-04-26', 'Two phones, one list, no duplicates.', 2),
    f('staples-rhythm', 'Staples rhythm', 'observatory', 'Kitchen', 'typescript statistics', '2026-04-05 b:2026-05-31', 'Learns how often we run out of milk.', 1.2),
    f('receipt-scanner', 'Receipt scanner', 'works', 'Kitchen', 'python ai-agents', '2026-04-19 p:2026-06-07'),
    f('week-of-dinners', 'Week of dinners', 'frontage', 'Table', 'typescript product-design', '2026-06-14', 'Seven dinners from what is already in the house.'),
  ],
  phases: [
    ph('2026-03-22', '2026-04-26', 7, 0),
    ph('2026-05-31', '2026-06-14', 5, 0),
  ],
};

const hooplytics: PlaceSpec = {
  id: 'hooplytics',
  name: 'Hooplytics',
  region: 'the-court',
  at: [1050, 1020],
  founded: '2023-02-12',
  note: 'Every basketball stat I ever wanted, in one explorer.',
  notes: [['2023-10-15', 'The fantasy table gets more visits than everything else combined.']],
  features: [
    f('stats-puller', 'NBA stats puller', 'works', 'Data', 'python web-scraping data-engineering', '2023-02-12 b:2023-02-19 w:2023-04-02', 'Nightly, politely, with backoff.', 2),
    f('player-warehouse', 'Player warehouse', 'reservoir', 'Data', 'postgresql sql', '2023-02-26 b:2023-03-19 w:2023-05-14', undefined, 1.4),
    f('lineup-explorer', 'Lineup explorer', 'frontage', 'Explorer', 'typescript react', '2023-04-09 b:2023-05-07 w:2023-10-08', 'Any five players, every minute they shared.', 2),
    f('shot-quality', 'Shot quality model', 'observatory', 'Explorer', 'python statistics', '2023-05-21 b:2023-09-17 w:2023-12-03', undefined, 1.4),
    f('team-pages', 'Team pages', 'frontage', 'Explorer', 'typescript react', '2023-06-04 p:2023-10-01'),
    f('fantasy-values', 'Fantasy value table', 'observatory', 'Explorer', 'python statistics', '2023-10-15 b:2023-11-19', 'The only page anyone opened.', 1.6),
    f('betting-lines', 'Betting line tracker', 'works', 'Data', 'python web-scraping', '2023-11-05'),
    f('play-types', 'Play type breakdowns', 'observatory', 'Explorer', 'python statistics', '2024-01-07'),
  ],
  phases: [
    ph('2023-02-12', '2023-06-11', 9),
    ph('2023-07-09', '2023-08-13', 3, 0.4),
    ph('2023-09-17', '2024-01-21', 11),
    ph('2024-02-11', '2024-03-31', 3, 0.4),
  ],
  abandoned: ['2024-06-09', 'Too broad. The fantasy slice is the real product.'],
};

// ───────────────────────── Ideas ─────────────────────────

const ideas: PlaceSpec[] = [
  {
    id: 'rimrun',
    name: 'Rimrun',
    region: 'the-court',
    at: [1240, 1650],
    founded: '2023-06-18',
    note: "Find a pickup run near me tonight. Who's in, which court, how many.",
    notes: [['2024-05-05', 'Could just be a group text with a map. Start there.']],
  },
  {
    id: 'tipoff-trivia',
    name: 'Tipoff Trivia',
    region: 'the-court',
    at: [1840, 840],
    founded: '2026-09-20',
    note: 'Five hoops questions a day. Share your score, no spoilers.',
  },
  {
    id: 'sixth-man',
    name: 'Sixth Man',
    region: 'the-court',
    at: [960, 1500],
    founded: '2025-06-22',
    note: 'Ask out loud who to start tonight and get a straight answer.',
    features: [
      f('question-parser', 'Lineup question parser', 'works', 'Bench', 'python ai-agents prompt-design', '2025-06-29 b:2025-07-06', 'Start him or sit him, in whatever words I use.'),
      f('spoken-reply', 'Spoken reply', 'frontage', 'Bench', 'typescript', '2025-07-13'),
    ],
    phases: [ph('2025-07-06', '2025-07-27', 6, 0)],
  },
  {
    id: 'promptsmith',
    name: 'Promptsmith',
    region: 'mindworks',
    at: [3460, 740],
    founded: '2025-09-28',
    note: 'Version control for prompts. Change a line, see which answers moved.',
    features: [
      f('prompt-diff', 'Prompt diff view', 'frontage', 'Bench', 'typescript prompt-design', '2025-10-05', 'Two prompts left and right, outputs underneath.'),
    ],
  },
  {
    id: 'nightshift',
    name: 'Nightshift',
    region: 'mindworks',
    at: [2680, 700],
    founded: '2026-05-10',
    note: 'Agents that work the backlog while I sleep and leave a note on the desk.',
    features: [
      f('backlog-picker', 'Backlog picker', 'works', 'Floor', 'python ai-agents', '2026-05-17 b:2026-05-31', 'Only takes tickets it can finish without me.'),
      f('desk-note', 'Desk note', 'frontage', 'Floor', 'python prompt-design', '2026-06-07', 'What got done, what got stuck, what it needs from me.'),
    ],
    phases: [ph('2026-05-31', '2026-06-21', 8, 0)],
  },
  {
    id: 'paperweight',
    name: 'Paperweight',
    region: 'mindworks',
    at: [3080, 1570],
    founded: '2025-08-17',
    note: 'Drop a PDF in, get the three things that matter out.',
  },
  {
    id: 'second-opinion',
    name: 'Second Opinion',
    region: 'mindworks',
    at: [4100, 1000],
    founded: '2026-10-03',
    note: 'Ask two models the same thing. Only show me where they disagree.',
  },
  {
    id: 'dividend-diary',
    name: 'Dividend Diary',
    region: 'ledger-reach',
    at: [1500, 2540],
    founded: '2024-07-21',
    note: 'A plain log of every dividend that lands and what it adds up to in a year.',
    notes: [['2025-01-05', 'Ledgerline already knows the payouts. This might just be a page there.']],
  },
  {
    id: 'rentroll',
    name: 'Rentroll',
    region: 'ledger-reach',
    at: [2280, 2580],
    founded: '2023-10-22',
    note: 'Would this house actually pay for itself. One screen, honest numbers.',
  },
  {
    id: 'tax-drawer',
    name: 'Tax Drawer',
    region: 'ledger-reach',
    at: [2290, 1960],
    founded: '2025-02-23',
    note: 'Every receipt and form in one drawer before April, not during.',
    notes: [['2026-04-12', 'Did it out of a shoebox again this year.']],
  },
  {
    id: 'fairshare',
    name: 'Fairshare',
    region: 'the-commons',
    at: [3030, 2520],
    founded: '2026-07-12',
    note: "Split a trip's costs without the spreadsheet argument.",
    features: [
      f('trip-ledger', 'Trip ledger', 'reservoir', 'Counter', 'typescript postgresql', '2026-07-19 b:2026-08-02', 'Who paid for what, entered once at the table.'),
      f('settle-up', 'Settle-up calculator', 'works', 'Counter', 'typescript', '2026-08-09', 'Fewest transfers that make everyone square.'),
    ],
    phases: [ph('2026-08-02', '2026-08-23', 5, 0)],
  },
  {
    id: 'trailhead',
    name: 'Trailhead',
    region: 'the-commons',
    at: [3570, 1960],
    founded: '2025-05-11',
    note: "Hikes within an hour of home, ranked by how muddy they'll be on Saturday.",
  },
  {
    id: 'giftwise',
    name: 'Giftwise',
    region: 'the-commons',
    at: [3960, 2080],
    founded: '2024-10-27',
    note: 'Remember what people said they wanted, months before I need it.',
    features: [
      f('hint-catcher', 'Hint catcher', 'works', 'Shelf', 'python ai-agents', '2024-11-03', 'She mentioned the blue kettle in March.'),
    ],
  },
  {
    id: 'porchlight',
    name: 'Porchlight',
    region: 'the-commons',
    at: [3360, 2680],
    founded: '2026-09-28',
    note: 'A noticeboard for one street. Lost cat, free couch, who owns a ladder.',
  },
];

const PLACES: PlaceSpec[] = [
  hooplytics,
  patrickOs,
  ledgerline,
  boxout,
  wirefeed,
  evalyard,
  shotchart,
  pantryLoop,
  patricksWorld,
  ...ideas,
];

const LINKS: [at: string, a: string, b: string, kind: LinkKind, carries?: string][] = [
  ['2024-06-16', 'boxout-fantasy', 'hooplytics', 'split-from'],
  ['2025-08-31', 'wirefeed', 'boxout-fantasy', 'feeds', 'MCP'],
  ['2026-02-01', 'wirefeed', 'patrick-os', 'feeds', 'MCP'],
  ['2026-09-13', 'wirefeed', 'evalyard', 'feeds', 'MCP'],
  ['2025-05-18', 'ledgerline', 'patrick-os', 'shares', 'price history'],
  ['2026-03-01', 'evalyard', 'patrick-os', 'shares', 'graded transcripts'],
  ['2026-09-06', 'evalyard', 'boxout-fantasy', 'related'],
  ['2025-05-18', 'shotchart', 'boxout-fantasy', 'related'],
  ['2025-07-13', 'shotchart', 'hooplytics', 'related'],
  ['2025-06-22', 'sixth-man', 'boxout-fantasy', 'related'],
  ['2025-06-01', 'rimrun', 'shotchart', 'related'],
  ['2025-09-28', 'promptsmith', 'evalyard', 'related'],
  ['2026-10-03', 'second-opinion', 'evalyard', 'related'],
  ['2026-05-10', 'nightshift', 'patrick-os', 'related'],
  ['2025-08-17', 'paperweight', 'patrick-os', 'related'],
  ['2024-07-21', 'dividend-diary', 'ledgerline', 'related'],
  ['2025-02-23', 'tax-drawer', 'ledgerline', 'related'],
  [FIXTURE_TODAY, 'patricks-world', 'patrick-os', 'related'],
];

// ───────────────────────── Expansion ─────────────────────────

/** A tiny seeded generator: the same seed always yields the same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The first Sunday on or after a date. */
function sundayOnOrAfter(iso: string): string {
  const wd = weekday(iso);
  return wd === 0 ? iso : addDays(iso, 7 - wd);
}

/** The last days of December and the first of January: mostly not at a keyboard. */
function isHoliday(iso: string): boolean {
  const md = iso.slice(5);
  return md >= '12-23' || md <= '01-02';
}

/** How strongly a feature pulls work at each stage. Nothing before building. */
const STAGE_PULL: Record<FeatureStage, number> = {
  concept: 0,
  planned: 0,
  designed: 0,
  building: 1,
  working: 0.22,
  mature: 0.07,
};

function stageOn(spec: FeatureSpec, at: string): FeatureStage | undefined {
  if (at < spec.proposed) return undefined;
  let stage: FeatureStage = 'concept';
  for (const s of spec.stages) if (s.at <= at) stage = s.stage;
  return stage;
}

function expandWork(place: PlaceSpec, out: WorldEvent[]): void {
  const rng = mulberry32(hash(place.id));
  const features = place.features ?? [];

  const log = (at: string, feature: string | null, commits: number): void => {
    if (commits <= 0) return;
    const hours = Math.max(0.5, Math.round(commits * (0.45 + rng() * 0.5) * 2) / 2);
    if (feature === null) {
      out.push({
        id: `fx:${place.id}:work:${at}`,
        at,
        source: 'fixture',
        type: 'work.logged',
        place: place.id,
        commits,
        hours,
      });
    } else {
      out.push({
        id: `fx:${place.id}.${feature}:work:${at}`,
        at,
        source: 'fixture',
        type: 'work.logged',
        place: place.id,
        feature: `${place.id}.${feature}`,
        commits,
        hours,
      });
    }
  };

  for (const phase of place.phases ?? []) {
    const first = sundayOnOrAfter(phase.from);
    const skip = phase.skip ?? 0.12;
    for (let at = first; at <= phase.to; at = addDays(at, 7)) {
      const edge = at === first || addDays(at, 7) > phase.to;
      // Always draw the same number of values per week so one edit does not reshuffle the rest.
      const rSkip = rng();
      const rSize = rng();
      const rSpike = rng();
      const rSpikeSize = rng();
      const rAlone = rng();
      const rAloneShare = rng();

      const holiday = isHoliday(at);
      if (!edge && rSkip < (holiday ? 0.7 : skip)) continue;

      let total = phase.rate * (0.45 + rSize * 1.1);
      if (rSpike < 0.09) total *= 2 + rSpikeSize * 1.2; // a weekend that got away
      if (holiday) total *= 0.35;
      let commits = Math.max(1, Math.round(total));

      // Which features were being worked on this week.
      const pulls: { id: string; pull: number }[] = [];
      for (const spec of features) {
        const stage = stageOn(spec, at);
        if (stage === undefined) continue;
        const pull = spec.weight * STAGE_PULL[stage];
        if (pull > 0) pulls.push({ id: spec.id, pull });
      }

      if (pulls.length === 0) {
        log(at, null, commits);
        continue;
      }

      // Some of the week goes to the place as a whole: config, deploys, chores.
      if (commits >= 4 && rAlone < 0.3) {
        const alone = Math.max(1, Math.round(commits * (0.08 + rAloneShare * 0.18)));
        log(at, null, alone);
        commits -= alone;
      }

      // Pick a handful of features, weighted, and split the week between them.
      const count = Math.min(pulls.length, 1 + Math.floor(commits / 8), 4);
      const chosen: { id: string; share: number }[] = [];
      for (let k = 0; k < count; k++) {
        let sum = 0;
        for (const p of pulls) sum += p.pull;
        let roll = rng() * sum;
        let index = pulls.length - 1;
        for (let j = 0; j < pulls.length; j++) {
          roll -= pulls[j]!.pull;
          if (roll <= 0) {
            index = j;
            break;
          }
        }
        const picked = pulls.splice(index, 1)[0]!;
        chosen.push({ id: picked.id, share: picked.pull * (0.5 + rng()) });
      }
      let shareSum = 0;
      for (const c of chosen) shareSum += c.share;
      let left = commits;
      chosen.sort((x, y) => y.share - x.share);
      for (let k = chosen.length - 1; k >= 0; k--) {
        const c = chosen[k]!;
        const amount = k === 0 ? left : Math.min(left, Math.round((commits * c.share) / shareSum));
        left -= amount;
        log(at, c.id, amount);
      }
    }
  }

  for (const [at, feature, commits] of place.work ?? []) log(at, feature, commits);
}

function expandPlace(place: PlaceSpec, out: WorldEvent[]): void {
  const id = place.id;
  out.push({
    id: `fx:${id}:founded`,
    at: place.founded,
    source: 'fixture',
    type: 'place.founded',
    place: id,
    name: place.name,
    region: place.region,
    position: { x: place.at[0], y: place.at[1] },
    note: place.note,
  });
  for (const [at, note] of place.notes ?? []) {
    out.push({ id: `fx:${id}:note:${at}`, at, source: 'fixture', type: 'place.noted', place: id, note });
  }
  for (const spec of place.features ?? []) {
    const feature = `${id}.${spec.id}`;
    const proposed: FeatureProposed = {
      id: `fx:${feature}:proposed`,
      at: spec.proposed,
      source: 'fixture',
      type: 'feature.proposed',
      place: id,
      feature,
      name: spec.name,
      kind: spec.kind,
      methods: spec.methods.slice(),
    };
    if (spec.ward !== undefined) proposed.ward = spec.ward;
    if (spec.note !== undefined) proposed.note = spec.note;
    out.push(proposed);
    for (const s of spec.stages) {
      out.push({
        id: `fx:${feature}:stage:${s.stage}`,
        at: s.at,
        source: 'fixture',
        type: 'feature.staged',
        place: id,
        feature,
        stage: s.stage,
      });
    }
  }
  expandWork(place, out);
  for (const [at, name, feature] of place.releases ?? []) {
    const release: ReleaseShipped = {
      id: `fx:${id}:release:${at}`,
      at,
      source: 'fixture',
      type: 'release.shipped',
      place: id,
      name,
    };
    if (feature !== undefined) release.feature = `${id}.${feature}`;
    out.push(release);
  }
  for (const [at, users, revenue] of place.traction ?? []) {
    const traction: TractionMeasured = {
      id: `fx:${id}:traction:${at}`,
      at,
      source: 'fixture',
      type: 'traction.measured',
      place: id,
      users,
    };
    if (revenue !== undefined) traction.revenue = revenue;
    out.push(traction);
  }
  if (place.abandoned !== undefined) {
    out.push({
      id: `fx:${id}:abandoned`,
      at: place.abandoned[0],
      source: 'fixture',
      type: 'place.abandoned',
      place: id,
      note: place.abandoned[1],
    });
  }
}

/**
 * The whole fixture history, in date order. Every call builds a fresh, identical array:
 * same events, same ids, same order.
 */
export function fixtureEvents(): WorldEvent[] {
  const out: WorldEvent[] = [];
  for (const place of PLACES) expandPlace(place, out);
  for (const [at, a, b, kind, carries] of LINKS) {
    const link: LinkFormed = {
      id: `fx:link:${a}:${b}:${kind}`,
      at,
      source: 'fixture',
      type: 'link.formed',
      a,
      b,
      kind,
    };
    if (carries !== undefined) link.carries = carries;
    out.push(link);
  }
  // Date, then id: the same order `mergeEvents` produces, so the world derives identically
  // whether or not the log has been through a merge.
  return out.sort((x, y) =>
    x.at < y.at ? -1 : x.at > y.at ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0,
  );
}
