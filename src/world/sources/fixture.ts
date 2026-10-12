import { fixtureEvents } from '../fixtures/world';
import type { WorldEvent, WorldSource } from '../types';

/** The synthetic world. Generated in code, identical on every load. */
export class FixtureSource implements WorldSource {
  readonly id = 'fixture' as const;
  readonly label = 'Fixture world';

  load(): Promise<WorldEvent[]> {
    return Promise.resolve(fixtureEvents());
  }
}
