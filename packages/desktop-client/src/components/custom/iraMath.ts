// Fork: the Retirement page's arithmetic. Pure, so it can be checked on its own.
//
// Fidelity (through SimpleFIN) says what is owned and what it cost; daily
// closes say what it was worth. The curve prices *today's* funds on each past
// day: it shows how what you hold has moved, not a record of past trades.

export type Holding = {
  symbol: string;
  name: string;
  shares: number;
  /** average price paid per share */
  avgCost: number;
  /** Fidelity's value at its last sync */
  value: number;
};

export type Holdings = {
  balance: number;
  balanceDate: number;
  fetchedAt: number;
  holdings: Holding[];
  prices: Record<
    string,
    { days: Array<[string, number]>; asOf: number | null }
  >;
};

/** The off-budget, bank-linked account that holds the IRA. */
export function isIra(a: {
  name: string;
  offbudget?: boolean | number;
  account_id?: string | null;
}) {
  return Boolean(a.offbudget && a.account_id && /\bira\b/i.test(a.name));
}

export type Range = '1W' | '1M' | '3M' | 'YTD' | '1Y';

export type Fund = Holding & {
  price: number;
  now: number;
  cost: number;
  gain: number;
  /** the fund's own closes over the shown range, oldest first */
  closes: number[];
  /** what it gained or lost over the shown range */
  change: number;
  share: number;
  /** first date this fund has a price, if it is later than the curve's start */
  listed?: string;
};

export type Portfolio = {
  points: Array<{ date: string; value: number }>;
  funds: Fund[];
  cash: number;
  value: number;
  cost: number;
  gain: number;
  asOf: number | null;
};

export function rangeStart(range: Range, today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  if (range === 'YTD') return `${today.slice(0, 4)}-01-01`;
  const days = { '1W': 7, '1M': 30, '3M': 91, '1Y': 366 }[range];
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The close on `date`, or the last one before it; the first close before the fund listed. */
function closeOn(days: Array<[string, number]>, date: string): number {
  let c = days[0][1];
  for (const [d, v] of days) {
    if (d > date) break;
    c = v;
  }
  return c;
}

export function portfolio(h: Holdings, range: Range, today: string): Portfolio {
  const start = rangeStart(range, today);
  const priced = h.holdings.filter(f => h.prices[f.symbol]?.days.length);
  // a fund with no prices (cash, or a lookup that failed) holds Fidelity's value
  const flat = h.holdings
    .filter(f => !priced.includes(f))
    .reduce((s, f) => s + f.value, 0);

  const dates = [
    ...new Set(priced.flatMap(f => h.prices[f.symbol].days.map(([d]) => d))),
  ]
    .sort()
    .filter(d => d >= start);
  // the curve starts at the last close before the range, so its first step counts
  const before = priced
    .flatMap(f => h.prices[f.symbol].days.map(([d]) => d))
    .filter(d => d < start)
    .sort()
    .pop();
  if (before) dates.unshift(before);

  const points = dates.map(date => ({
    date,
    value:
      flat +
      priced.reduce(
        (s, f) => s + f.shares * closeOn(h.prices[f.symbol].days, date),
        0,
      ),
  }));

  const total = points.length
    ? points[points.length - 1].value
    : h.holdings.reduce((s, f) => s + f.value, 0) || h.balance;

  const funds = h.holdings
    .map(f => {
      const days = h.prices[f.symbol]?.days;
      const closes = days?.length ? dates.map(d => closeOn(days, d)) : [];
      const price = closes.length
        ? closes[closes.length - 1]
        : f.value / (f.shares || 1);
      const now = closes.length ? f.shares * price : f.value;
      const cost = f.avgCost > 0 ? f.shares * f.avgCost : now;
      const listed =
        days?.length && dates.length && days[0][0] > dates[0]
          ? days[0][0]
          : undefined;
      return {
        ...f,
        price,
        now,
        cost,
        gain: now - cost,
        closes,
        change: closes.length ? f.shares * (price - closes[0]) : 0,
        share: total ? now / total : 0,
        listed,
      };
    })
    .sort((a, b) => b.now - a.now);

  const cost = funds.reduce((s, f) => s + f.cost, 0);
  const asOf =
    Math.max(0, ...priced.map(f => h.prices[f.symbol].asOf ?? 0)) || null;
  return {
    points,
    funds,
    cash: flat,
    value: total,
    cost,
    gain: total - cost,
    asOf,
  };
}
