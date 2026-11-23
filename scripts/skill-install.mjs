#!/usr/bin/env node
// Put the questionnaire skill where your coding agent looks for skills, so that it can be
// run in ANY repository on this machine. Run as `npm run install:skill`.
//
//   npm run install:skill                       every agent that is set up on this machine
//   npm run install:skill -- --tool copilot     one agent (claude, copilot, codex), set up or not
//   npm run install:skill -- --dir <folder>     some other skills folder
//   npm run install:skill -- --link             link to this checkout instead of copying,
//                                               so a `git pull` here updates the skill everywhere
//   npm run install:skill -- --remove           take it back out
//   npm run install:skill -- --dry-run          say what would happen and do nothing
//
// It writes one folder, `patrick-world-init`, into each skills folder it is pointed at, and
// touches nothing else there. A copy is the default because it keeps working if this
// checkout moves; run this again after pulling to refresh it.

import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'patrick-world-init';
const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills', NAME);
const home = homedir();

/**
 * Where each agent reads personal skills from, and the folder whose presence says the agent
 * is set up on this machine. `say` is how the skill is started there.
 *
 * As documented in November 2026: Claude Code reads ~/.claude/skills; GitHub Copilot (VS Code
 * agent mode, the CLI, the app) reads ~/.copilot/skills; Codex reads ~/.agents/skills.
 * Copilot's CLI also reads ~/.agents/skills, so with both installed it may list the skill twice.
 * Copilot in VS Code alone may leave no ~/.copilot behind: name it with --tool copilot.
 */
const AGENTS = {
  claude: { label: 'Claude Code', present: join(home, '.claude'), skills: join(home, '.claude', 'skills'), say: `/${NAME}` },
  copilot: { label: 'GitHub Copilot', present: join(home, '.copilot'), skills: join(home, '.copilot', 'skills'), say: `/${NAME}` },
  codex: { label: 'Codex', present: join(home, '.codex'), skills: join(home, '.agents', 'skills'), say: `$${NAME}` },
};

function parseArgs(argv) {
  const out = { tools: [], dirs: [], link: false, remove: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tool') out.tools.push(...String(argv[++i] ?? '').split(','));
    else if (a === '--dir') out.dirs.push(resolve(String(argv[++i] ?? '')));
    else if (a === '--link') out.link = true;
    else if (a === '--remove') out.remove = true;
    else if (a === '--dry-run') out.dryRun = true;
    else {
      console.error(`Unknown argument: ${a}\nusage: npm run install:skill -- [--tool claude|copilot|codex|all] [--dir <folder>] [--link] [--remove] [--dry-run]`);
      process.exit(2);
    }
  }
  if (out.tools.includes('all')) out.tools = Object.keys(AGENTS);
  for (const t of out.tools) {
    if (!(t in AGENTS)) {
      console.error(`Unknown tool "${t}". One of: ${Object.keys(AGENTS).join(', ')}, all.`);
      process.exit(2);
    }
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));

/** Each place to write: named agents, given folders, or (asked for neither) every agent that is set up. */
const targets = [];
for (const t of opts.tools) targets.push({ ...AGENTS[t], label: AGENTS[t].label });
for (const d of opts.dirs) targets.push({ label: d, skills: d, say: null });
if (opts.tools.length === 0 && opts.dirs.length === 0) {
  for (const agent of Object.values(AGENTS)) {
    if (existsSync(agent.present)) targets.push(agent);
    else console.log(`${agent.label}: not set up on this machine (no ${agent.present}). Skipped; name it with --tool to install anyway.`);
  }
}
if (targets.length === 0) {
  console.log('Nothing to do. Name an agent with --tool, or a folder with --dir.');
  process.exit(0);
}
if (!opts.remove && !existsSync(join(SOURCE, 'SKILL.md'))) {
  console.error(`The skill is not at ${SOURCE}.`);
  process.exit(1);
}

const would = opts.dryRun ? 'would be ' : '';
for (const target of targets) {
  const dest = join(target.skills, NAME);
  // lstat, not exists: a link whose checkout has moved still has to be cleared away.
  const there = lstatSync(dest, { throwIfNoEntry: false }) !== undefined;
  if (opts.remove) {
    if (there && !opts.dryRun) rmSync(dest, { recursive: true, force: true });
    console.log(`${target.label}: ${there ? `${would}removed from ${dest}` : 'was not installed'}`);
    continue;
  }
  if (!opts.dryRun) {
    mkdirSync(target.skills, { recursive: true });
    if (there) rmSync(dest, { recursive: true, force: true });
    if (opts.link) symlinkSync(SOURCE, dest, 'dir');
    else cpSync(SOURCE, dest, { recursive: true });
  }
  console.log(`${target.label}: ${would}${opts.link ? 'linked' : there ? 'updated' : 'installed'} at ${dest}`);
  if (target.say) console.log(`  In any repository, start it with ${target.say}, or ask: "set this repository up for Patrick's World".`);
}
