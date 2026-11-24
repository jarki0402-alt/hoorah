import { lookOfFruit } from '@hoorah/protocol';
import { it } from 'vitest';
import { SACK_ID, TaliMatch, TIMING } from './logic';

it('dbg', () => {
  const m = new TaliMatch({
    climbers: [{ id: 1, name: 'a', fruit: 'jeruk', look: lookOfFruit('jeruk'), color: '#2F8CFF' }],
    route: 'senja',
    sections: 1,
    seed: 11,
  });
  const run = (s: number, f?: () => void) => {
    for (let i = 0; i < s * 60; i++) {
      f?.();
      m.tick(1 / 60);
      m.drainEvents();
    }
  };
  run(TIMING.intro + TIMING.count + 0.1);
  m.sim.place(1, { x: -3.5, y: 0.02, z: 0.4 }, 0);
  m.sim.place(SACK_ID, { x: -3.5, y: 0.02, z: 3.7 }, 0);
  for (let i = 0; i < 300; i++) {
    if (i === 90) m.hold(1, true);
    m.tick(1 / 60);
    m.drainEvents();
    const b = m.sim.body(1)!,
      s = m.sim.body(SACK_ID)!;
    if (i % 15 === 0)
      console.log(
        i,
        m.phase,
        b.pos.z.toFixed(2),
        b.pos.y.toFixed(2),
        b.ground,
        '| sack',
        s.pos.z.toFixed(2),
        s.pos.y.toFixed(2),
        s.ground,
        s.frozenLeft,
        s.active,
        m.rope.tension[0]!.toFixed(1),
        m.rope.restOf(0).toFixed(2),
      );
  }
});
