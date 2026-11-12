// Fork: the household's Money Plan, worked out right here from the budget, so
// it's never behind. The math is planMath.js, the same file the Pi companion
// runs for the payday notices; its settings are the hidden note
// `fork-plan-config`, which the companion copies in from budget-plan.json.
// Bills and spending, the accounts overview and the cash calendar read it here.
import { useEffect, useState } from 'react';

import { listen, send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';

import { buildPlan } from './planMath';

export type PlanGoal = {
  name: string;
  target: number;
  by: string | null;
  current: number;
  monthly: number;
  date: string | null;
};
export type PlanDebt = {
  name: string;
  start: number;
  asOf: string;
  current: number;
  apr: number;
  monthly: number;
  date: string | null;
};
/** One day of projected cash, in dollars. Events are paychecks (+) and bills (−). */
export type PlanDay = {
  date: string;
  bal: number;
  events: { name: string; amount: number }[];
};
export type PlanSummary = {
  generated: string;
  due: Record<string, [number, number?]>;
  everyday: string[];
  bills: string[];
  goals: PlanGoal[];
  debts: PlanDebt[];
  cashAccounts?: string[];
  days?: PlanDay[];
  routine?: PaydayRoutine;
  payments?: PlanPayment[];
  billsAccount?: string | null;
  snowball?: string | null;
  /** Cash today less what the plan pays before the next paycheck. */
  standing?: {
    cash: number;
    owed: number;
    /** What the next paycheck is short of its own bills; it comes out of today's cash. */
    nextShort: number;
    free: number;
    bills: PlanPayment[];
    next: { date: string; name: string; amount: number };
  } | null;
  spending?: {
    categories: string[];
    monthly: number;
    perWeek: number;
    lastPayday: string | null;
    nextPayday: string | null;
  };
};
/** One payday's moves, in dollars. */
export type PaydaySplit = {
  date: string;
  name: string;
  amount: number;
  tithe: number;
  toBills: number;
  toSavings: number;
  spending: number;
  extraDebt: number;
  weeks: number;
  /** Left in checking as a cushion. */
  keep: number;
  /** Bills this paycheck can't cover, taken from what's already in checking. */
  fromChecking: number;
  bills: { name: string; amount: number; on: string; late: boolean }[];
  /** One-off planned spending (future-dated transactions), paid from checking. */
  planned?: { name: string; amount: number; on: string }[];
};
/** A bill the plan pays: the day it's paid, the day it was due, and whether that's past its grace. */
export type PlanPayment = {
  name: string;
  amount: number;
  on: string;
  due: string;
  late: boolean;
};
export type PaydayRoutine = {
  perWeek: number;
  goalsMonthly: number;
  splits: PaydaySplit[];
  billsLow: { date: string; bal: number };
};

const REFRESHED = 'fork-plan-refreshed';

// The same calls @actual-app/api makes on the Pi, so planMath reads the
// budget the same way in both places.
const api = {
  q,
  getPayees: () => send('api/payees-get'),
  getAccounts: () => send('api/accounts-get'),
  // the plain read, not the api/ one: that one queues behind every write
  // (a bank sync), and both return the same number
  getAccountBalance: (id: string, cutoff: Date = new Date()) =>
    send('account-balance', { id, cutoff }),
  getTransactions: (accountId: string, startDate: string, endDate: string) =>
    send('api/transactions-get', { accountId, startDate, endDate }),
  getBudgetMonth: (month: string) => send('api/budget-month', { month }),
  aqlQuery: (query: Query) => send('api/query', { query: query.serialize() }),
};

/** The plan for today, or `null` when its settings aren't in the budget yet. */
export async function computePlan(): Promise<PlanSummary | null> {
  const { data } = (await api.aqlQuery(
    q('notes').filter({ id: 'fork-plan-config' }).select(['note']),
  )) as { data: { note: string | null }[] };
  const config = data[0]?.note;
  if (!config) {
    return null;
  }
  const { summary } = await buildPlan(
    api,
    JSON.parse(config),
    monthUtils.currentDay(),
  );
  return summary as PlanSummary;
}

// One computation shared by every screen, redone after a change, on a new
// day, or after it failed. ponytail: one budget per tab; switching budgets
// without a reload shows the last one's plan until something changes.
let current: Promise<PlanSummary | null> | null = null;
let currentFor = '';
function sharedPlan() {
  const day = monthUtils.currentDay();
  if (!current || currentFor !== day) {
    currentFor = day;
    const p = computePlan();
    current = p;
    p.catch(() => {
      if (current === p) {
        current = null;
      }
    });
  }
  return current;
}

/** Work the plan out again now, and every open screen picks it up. */
export async function refreshPlan() {
  current = null;
  window.dispatchEvent(new Event(REFRESHED));
}

// Anything that changes what the plan reads (a transaction added, edited or
// synced in from the bank or another device, a budgeted amount, a pay-on
// date) reworks it half a second later. ponytail: one listener per tab.
const PLAN_TABLES = [
  'transactions',
  'accounts',
  'reflect_budgets',
  'zero_budgets',
  'notes',
  'categories',
  'payees',
];
let watching = false;
function watchForChanges() {
  if (watching) {
    return;
  }
  watching = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  listen('sync-event', event => {
    if (
      (event.type === 'applied' || event.type === 'success') &&
      event.tables.some(t => PLAN_TABLES.includes(t))
    ) {
      clearTimeout(timer);
      timer = setTimeout(() => void refreshPlan(), 500);
    }
  });
}

/** `undefined` while working it out, `null` when there's no plan to show. */
export function usePlan() {
  watchForChanges();
  const [plan, setPlan] = useState<PlanSummary | null | undefined>(undefined);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    // coming back to the app (a phone left open overnight) checks the day
    const back = () => document.visibilityState === 'visible' && bump();
    window.addEventListener(REFRESHED, bump);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', back);
    return () => {
      window.removeEventListener(REFRESHED, bump);
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', back);
    };
  }, []);
  useEffect(() => {
    let live = true;
    sharedPlan()
      .then(p => live && setPlan(p))
      .catch(() => live && setPlan(null));
    return () => {
      live = false;
    };
  }, [version]);
  return plan;
}

// ponytail: whole US dollars, the same as the top bar's net figure; the
// budget's own number format has no currency symbol set
const wholeUsd = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const centsUsd = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
});

/** Dollars as whole USD, or with cents. */
export function usd(dollars: number, withCents = false) {
  return (withCents ? centsUsd : wholeUsd).format(dollars);
}

/** The lowest day ahead, and the first paycheck after it. */
export function lowPoint(days: PlanDay[]) {
  if (!days.length) return null;
  const low = days.reduce((m, d) => (d.bal < m.bal ? d : m));
  const nextPay = days
    .filter(d => d.date > low.date)
    .flatMap(d =>
      d.events.filter(e => e.amount > 0).map(e => ({ ...e, date: d.date })),
    )[0];
  return { low, nextPay };
}
