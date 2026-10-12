# Patrick's World

Projects and ideas as a world you can explore, drawn as a survey atlas that is still being
made. Projects are towns, features are buildings, skills are the atlas's Key of Methods, and
the past is an earlier edition of the same sheet.

Everything on the map is derived from an append-only log of things that happened. Nothing has
a status field.

## Run it

```sh
npm install
npm run dev        # http://localhost:5199
npm run check      # typecheck, tests, production build
npm run sync:github  # read your repositories (via the gh CLI) into public/data/github.json
```

With a GitHub record present the app shows your real repositories. `?world=specimen` shows the
fictional specimen world instead. The record is private, git-ignored, and left out of builds.

## Getting around

| | |
|---|---|
| Drag, scroll | Pan, zoom |
| Click a place | Select it; its survey note appears |
| Double-click a place, or `Enter` | Go in |
| Click a building | Its note: stage, storeys, methods |
| `Esc` | Step back out one scale |
| `0` | The whole sheet |
| `K` | The Key, and the Key of Methods |
| Drag the dial, `[` `]` | Turn the edition back and forward |
| `N`, or double-click open ground | Mark a new site |
| Arrow keys | Move between places |

Useful links while developing: `?still` (no motion), `?perf` (frame and derive timings),
`?at=2025-03-01` (open on an edition), `?go=boxout-fantasy&close`,
`?go=boxout-fantasy/boxout-fantasy.espn-sync`, `?key`, `?method=typescript`.

## Read next

- [HANDOFF.md](HANDOFF.md): what exists, what is mocked, what to do next.
- [PRODUCT.md](PRODUCT.md), [GAME_METAPHOR.md](GAME_METAPHOR.md),
  [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md): what it is and why it looks like this.
- [WORLD_MODEL.md](WORLD_MODEL.md), [DATA_MODEL.md](DATA_MODEL.md),
  [ARCHITECTURE.md](ARCHITECTURE.md), [INTERACTION_MODEL.md](INTERACTION_MODEL.md): how it works.

The specimen world is fictional. The GitHub world is yours, with stages inferred from commit
history until features have build plans.
