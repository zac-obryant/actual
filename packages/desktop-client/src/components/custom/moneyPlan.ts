// Fork: the household's Money Plan, as the companion publishes it at
// `/plan.json` on the receipts server (same box). Bills and spending, the
// accounts overview and the cash calendar all read it from here.
import { useEffect, useState } from 'react';

import { receiptsUrl } from './TopNav';

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
  billsAccount?: string | null;
  snowball?: string | null;
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
};
export type PaydayRoutine = {
  perWeek: number;
  billsMonthly: number;
  goalsMonthly: number;
  splits: PaydaySplit[];
  billsLow: { date: string; bal: number };
};

/** `undefined` while asking, `null` when the plan can't be reached. */
export function usePlan() {
  const [plan, setPlan] = useState<PlanSummary | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch(receiptsUrl('/plan.json'), { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(body => live && setPlan(body))
      .catch(() => live && setPlan(null));
    return () => {
      live = false;
    };
  }, []);
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
