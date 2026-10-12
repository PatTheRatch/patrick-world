// Hand-written understandings for five places in the specimen world.
//
// The specimen world is fiction (see src/world/fixtures/world.ts), and so is every word
// here: these exist so that the understanding and resume layers have something to show
// when the specimen is on the table. The text follows the fixture's own features, notes,
// releases and dates. Sources name things that exist in that world: a place note by its
// date, a feature by its name, a release.

import type { Claim, Confidence, ProjectUnderstanding } from './types';

const c = (value: string, confidence: Confidence, ...sources: string[]): Claim<string> => ({ value, confidence, sources });

const provenance: ProjectUnderstanding['provenance'] = {
  generator: 'fixture (fictional)',
  generatedAt: '2026-10-12T00:00:00Z',
  basedOn: {},
  advisory: true,
};

const boxout: ProjectUnderstanding = {
  place: 'boxout-fantasy',
  whatThisIs: c(
    'Boxout Fantasy is a fantasy-basketball analytics product focused on helping managers make better roster and player decisions. Its current architecture combines league data, player intelligence and decision-support tooling, with recent work focused on the UI redesign, the replacement finder and grading what the model says.',
    'high',
    'founding note',
    'feature: UI redesign',
    'feature: Replacement finder',
    'feature: Answer grader',
  ),
  audience: c('Managers in category fantasy leagues, starting with the owner\'s own league. Measured users reached 3,200 on 4 October 2026.', 'high', 'traction of 4 October 2026', 'founding note'),
  problem: c('Knowing a league well enough to decide who to start, pick up, trade for and bid on, without doing the arithmetic by hand.', 'medium', 'founding note', 'feature: Trade judge', 'feature: Waiver wire ranker'),
  capabilities: [
    c('League sync for ESPN and Yahoo, with every past season in one store', 'high', 'feature: ESPN league sync', 'feature: Yahoo league sync', 'feature: League history store'),
    c('Player Listener: box scores, minutes trends, beat writers, role change alerts and a schedule grid', 'high', 'ward: Player Listener'),
    c('Injury Intelligence: a report parser and a return date estimator', 'high', 'feature: Injury report parser', 'feature: Return date estimator'),
    c('A draft room: auction board, price model and what-if', 'high', 'ward: Draft Room', 'release: Private beta'),
    c('The league readable by a model through an MCP server, with a waiver ranker, trade judge and week report', 'high', 'ward: MCP', 'release: MCP connector', 'release: Trade judge'),
    c('Team dashboard, matchup page and league onboarding', 'high', 'ward: Front of House'),
  ],
  architecture: c(
    'Python for sync, statistics and the agent tooling; PostgreSQL for league history; a TypeScript and React front end; and a read-only MCP server that hands the league to a model.',
    'medium',
    'methods of its features',
    'feature: League MCP server',
  ),
  maturity: c('A major city: five releases since October 2024, a paid product with measured revenue, and still in daily work.', 'high', 'release: 1.0 for the season', 'traction of 4 October 2026', 'work log'),
  recentWork: c(
    'Since mid-August 2026 the work has gone into the UI redesign, the Replacement finder, the Answer grader and the Season report, all in building.',
    'high',
    'feature: UI redesign',
    'feature: Replacement finder',
    'feature: Answer grader',
    'feature: Season report',
  ),
  unfinished: [
    c('The UI redesign has been in building since 16 August 2026: "One layout, one type scale, every page."', 'high', 'feature: UI redesign'),
    c('The Replacement finder was designed in January 2026 and has been in building since 13 September 2026.', 'high', 'feature: Replacement finder'),
    c('The Keeper value sheet was designed on 19 July 2026 and has no work logged.', 'high', 'feature: Keeper value sheet'),
  ],
  openQuestions: [
    c('Sleeper league sync was proposed in February 2026 and has not moved, while Yahoo shipped in June. Is a third platform still wanted?', 'medium', 'feature: Sleeper league sync', 'release: Yahoo leagues'),
  ],
  nextSteps: [c('Take the Replacement finder to working, the last unbuilt piece of Injury Intelligence that has been started', 'medium', 'feature: Replacement finder', 'ward: Injury Intelligence')],
  pickUp: c('Carry the UI redesign through the remaining pages', 'high', 'place note of 17 May 2026', 'feature: UI redesign'),
  provenance,
};

const patrickOs: ProjectUnderstanding = {
  place: 'patrick-os',
  whatThisIs: c(
    'Patrick OS is a personal memory and intelligence system: one place that holds people, projects, ideas and what happened, and can be asked about them. It captures from an inbox, voice notes, mail and the calendar, recalls through search, a morning brief and a timeline, and now serves that memory to other projects and agents over MCP.',
    'high',
    'founding note',
    'ward: Capture',
    'ward: Recall',
    'release: Memory over MCP',
  ),
  audience: c('Its owner, and since 2026 his other projects, which read from it.', 'high', 'place note of 1 February 2026'),
  problem: c('"It remembers everything and tells me nothing. Needs to speak first."', 'high', 'place note of 4 August 2024'),
  capabilities: [
    c('An entity store and an append-only event log, with a compactor that keeps what is worth keeping', 'high', 'ward: Memory'),
    c('Capture from a quick inbox, voice notes, a mail digest and the calendar', 'high', 'ward: Capture'),
    c('Ask-anything search, a morning brief and a timeline view, with a grader for recall', 'high', 'ward: Recall', 'release: Ask anything', 'release: Morning brief'),
    c('A memory MCP server for any model or project', 'high', 'feature: Memory MCP server', 'release: Memory over MCP'),
  ],
  architecture: c('PostgreSQL underneath; Python for capture, compaction and agents; TypeScript for the inbox, search and timeline; an MCP server as the way in for everything else.', 'medium', 'methods of its features'),
  maturity: c('A city with three releases, in use since 2023 and back in steady work since September 2026. No users are measured, which is what its next rank waits on.', 'high', 'work log', 'rank rule'),
  recentWork: c('Since 6 September 2026 the work has been the Research runner, in building: "Give it a question at night, read the answer at breakfast."', 'high', 'feature: Research runner'),
  unfinished: [
    c('The Research runner has been in building since 6 September 2026.', 'high', 'feature: Research runner'),
    c('The Weekly review writer was planned on 9 August 2026 and has no work logged.', 'high', 'feature: Weekly review writer'),
  ],
  openQuestions: [
    c('A World event feed was proposed on 12 October 2026 so that the atlas can draw what happens here. Does it wait on the Research runner, or come first?', 'medium', 'feature: World event feed', 'feature: Research runner'),
  ],
  nextSteps: [c('Stake the World event feed, proposed on 12 October 2026, so that this place can report to the atlas', 'medium', 'feature: World event feed', 'place note of 1 February 2026')],
  pickUp: c('Continue the Research runner', 'high', 'feature: Research runner', 'work log'),
  provenance,
};

const ledgerline: ProjectUnderstanding = {
  place: 'ledgerline',
  whatThisIs: c(
    'Ledgerline is investment analytics for one portfolio: what is owned, what it did, and why. It imports brokerage statements into a double-entry positions ledger, keeps price and dividend history, and reports time-weighted returns, allocation drift, benchmark comparison and drawdowns, with a quarterly letter written from the numbers.',
    'high',
    'founding note',
    'ward: Holdings',
    'ward: Analysis',
    'release: Quarterly letter',
  ),
  audience: c('Its owner first; two friends asked to use it in November 2025, which is why it has sign-in. 44 users were measured in September 2026.', 'high', 'place note of 9 November 2025', 'traction of 13 September 2026'),
  problem: c('Knowing "the honest number, deposits taken out", and having the tax lots right and not roughly right.', 'high', 'feature: Time-weighted returns', 'place note of 9 February 2025'),
  capabilities: [
    c('Statement import for three brokers, a positions ledger and a tax lot tracker', 'high', 'ward: Holdings'),
    c('Price history back to 2005, a dividend calendar and currency conversion', 'high', 'ward: Market Data'),
    c('Time-weighted returns, allocation drift, benchmark comparison and drawdown bands', 'high', 'ward: Analysis', 'release: First full year'),
    c('A portfolio page and a quarterly letter', 'high', 'ward: Reports', 'release: Quarterly letter'),
  ],
  architecture: c('Python for import and analysis over PostgreSQL, with a TypeScript and React front end and account sign-in.', 'medium', 'methods of its features'),
  maturity: c('A city with two releases and a small number of real users. Work comes in bursts around tax season and has been light since April 2026.', 'high', 'work log', 'release: Quarterly letter'),
  recentWork: c('Three weeks of work from 30 August to 13 September 2026 on the Rebalance what-if, and nothing since.', 'high', 'feature: Rebalance what-if', 'work log'),
  unfinished: [
    c('The Rebalance what-if has been in building since 30 August 2026: "Show the trades and the tax before I make them."', 'high', 'feature: Rebalance what-if'),
    c('The Year-end tax pack was proposed on 1 February 2026 and has not moved.', 'high', 'feature: Year-end tax pack'),
  ],
  openQuestions: [
    c('Tax season drove the work in 2025 and 2026. Is the Year-end tax pack wanted before the next one?', 'medium', 'place note of 9 February 2025', 'feature: Year-end tax pack'),
  ],
  nextSteps: [],
  pickUp: c('Return to the Rebalance what-if, three weeks in', 'high', 'feature: Rebalance what-if', 'work log'),
  provenance,
};

const wirefeed: ProjectUnderstanding = {
  place: 'wirefeed',
  whatThisIs: c(
    'Wirefeed is an MCP toolkit: write the tools once and plug them into anything. It has a tool schema builder, stdio and streamable HTTP transports and a tool call recorder, and feeds three other projects. After a year parked it is being worked on again, on the OAuth helper.',
    'high',
    'founding note',
    'ward: Server Kit',
    'ward: Transport',
    'place note of 30 August 2026',
  ),
  audience: c('The owner\'s own projects that ship MCP servers: Boxout Fantasy, Patrick OS and Evalyard.', 'high', 'roads: feeds MCP', 'place note of 30 August 2026'),
  problem: c('"Three projects now ship MCP servers and each one hand-rolls sign-in."', 'high', 'place note of 30 August 2026'),
  capabilities: [
    c('Tool definitions generated from types', 'high', 'feature: Tool schema builder'),
    c('Stdio and streamable HTTP transports', 'high', 'ward: Transport', 'release: 0.1 on npm'),
    c('A recorder that makes every tool call replayable', 'high', 'feature: Tool call recorder'),
  ],
  architecture: c('A TypeScript library in three parts: a server kit, transports and testing tools.', 'medium', 'methods of its features', 'wards'),
  maturity: c('A town with one release, from February 2025. Parked in July 2025 as good enough for one person, and revived on 30 August 2026.', 'high', 'place note of 6 July 2025', 'place note of 30 August 2026', 'release: 0.1 on npm'),
  recentWork: c('Since 30 August 2026: the OAuth helper, and from 20 September a Contract test kit.', 'high', 'feature: OAuth helper', 'feature: Contract test kit'),
  unfinished: [
    c('The OAuth helper was planned in July 2025 and has been in building since 30 August 2026: "The part everyone gets wrong, done once."', 'high', 'feature: OAuth helper'),
    c('The Contract test kit has been in building since 20 September 2026.', 'high', 'feature: Contract test kit'),
  ],
  openQuestions: [
    c('A Python bridge was proposed on 27 September 2026 "so the Python projects stop copying the schema by hand". Does it come before or after sign-in is done?', 'medium', 'feature: Python bridge', 'feature: OAuth helper'),
  ],
  nextSteps: [c('Finish the OAuth helper, the reason this place was reopened', 'high', 'place note of 30 August 2026', 'feature: OAuth helper')],
  pickUp: c('Finish the OAuth helper, the reason this place was reopened', 'high', 'place note of 30 August 2026', 'feature: OAuth helper'),
  provenance,
};

const shotchart: ProjectUnderstanding = {
  place: 'shotchart',
  whatThisIs: c(
    'Shotchart is a phone app for recording basketball shots: tap where you shot from, and see where you actually make them. It records makes and misses with one tap, works without a signal, and draws a heat map of a session. It has been set down since January 2026.',
    'high',
    'founding note',
    'ward: Courtside',
    'feature: Shot heat map',
    'place note of 11 January 2026',
  ),
  audience: c('Its owner and a handful of testers: 6 users were measured after the TestFlight build.', 'high', 'release: TestFlight build', 'traction of 7 September 2025'),
  capabilities: [
    c('A court tap recorder built for one-handed use', 'high', 'feature: Court tap recorder'),
    c('An offline session store', 'high', 'feature: Offline session store'),
    c('A shot heat map', 'high', 'feature: Shot heat map'),
  ],
  architecture: c('TypeScript with a mobile framework and a canvas-drawn heat map; sessions are stored on the device.', 'medium', 'methods of its features'),
  maturity: c('A town with three features standing and one TestFlight build, from August 2025. Untouched since January 2026.', 'high', 'release: TestFlight build', 'work log'),
  recentWork: c('Four weeks from 21 December 2025 to 11 January 2026 on Zone splits, then a note: "Season is on and I am not shooting. Back to this in the summer, maybe."', 'high', 'feature: Zone splits', 'place note of 11 January 2026'),
  unfinished: [
    c('Zone splits has been in building since 21 December 2025: "Corner three versus above the break, by month."', 'high', 'feature: Zone splits'),
    c('Cloud backup was planned on 28 December 2025 and has no work logged.', 'high', 'feature: Cloud backup'),
  ],
  openQuestions: [c('The note of January 2026 said "back to this in the summer, maybe". Is it still wanted?', 'medium', 'place note of 11 January 2026')],
  nextSteps: [],
  pickUp: c('Pick Zone splits back up where it stopped in January', 'medium', 'feature: Zone splits', 'place note of 11 January 2026'),
  provenance,
};

/** Place id to understanding, for the fictional specimen world only. */
export const fixtureUnderstanding: ReadonlyMap<string, ProjectUnderstanding> = new Map(
  [boxout, patrickOs, ledgerline, wirefeed, shotchart].map((u) => [u.place, u]),
);
