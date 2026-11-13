import { describe, expect, it } from 'vitest';

import { portfolio } from './iraMath';
import type { Holdings } from './iraMath';

const h: Holdings = {
  balance: 1300,
  balanceDate: 0,
  fetchedAt: 0,
  holdings: [
    { symbol: 'VOO', name: 'Vanguard', shares: 2, avgCost: 400, value: 1000 },
    { symbol: 'NEW', name: 'Listed late', shares: 1, avgCost: 100, value: 150 },
    { symbol: 'SPAXX', name: 'Cash', shares: 100, avgCost: 0, value: 100 },
  ],
  prices: {
    VOO: {
      asOf: 1,
      days: [
        ['2026-10-01', 480],
        ['2026-11-10', 490],
        ['2026-11-12', 500],
      ],
    },
    NEW: { asOf: 1, days: [['2026-11-12', 150]] },
  },
};

describe('portfolio', () => {
  it('prices the current funds on each day, holding cash flat', () => {
    const p = portfolio(h, '1W', '2026-11-13');
    // starts at the close before the week, so the first step counts
    expect(p.points.map(x => x.date)).toEqual([
      '2026-10-01',
      '2026-11-10',
      '2026-11-12',
    ]);
    expect(p.points[0].value).toBe(100 + 2 * 480 + 150);
    expect(p.value).toBe(100 + 1000 + 150);
    expect(p.cost).toBe(800 + 100 + 100);
    expect(p.gain).toBe(250);
    const voo = p.funds.find(f => f.symbol === 'VOO')!;
    expect(voo.change).toBe(40);
    expect(p.funds.find(f => f.symbol === 'NEW')!.listed).toBe('2026-11-12');
    expect(p.funds[0].symbol).toBe('VOO');
  });
});
