// Fork: the household's Money Plan, as the companion publishes it at
// `/plan.json` on the receipts server (same box). Bills and spending, the
// accounts overview and the cash calendar all read it from here.
import { useEffect, useState } from 'react';

import { send } from '@actual-app/core/platform/client/connection';

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

/** `undefined` while asking, `null` when the plan can't be reached. */
const REFRESHED = 'fork-plan-refreshed';

/** Rerun the Money Plan now (after a change it reads), then every open screen refetches it. */
export async function refreshPlan() {
  await send('sync'); // the companion reads the server copy, so get the change there first
  await fetch(receiptsUrl('/plan/refresh'), {
    method: 'POST',
    credentials: 'include',
  }).catch(() => null);
  window.dispatchEvent(new Event(REFRESHED));
}

/** Let this signed-in device read the Money Plan: the companion checks the
 *  budget login and remembers the device. True when it worked. */
export async function connectDevice() {
  const token = await send('fork-user-token');
  if (!token) {
    return false;
  }
  return fetch(receiptsUrl('/connect'), {
    method: 'POST',
    credentials: 'include',
    body: token,
  })
    .then(r => r.ok)
    .catch(() => false);
}

/** Connect this device, then every open screen refetches the plan. */
export async function connectAndReload() {
  const ok = await connectDevice();
  window.dispatchEvent(new Event(REFRESHED));
  return ok;
}

export function usePlan() {
  const [plan, setPlan] = useState<PlanSummary | null | undefined>(undefined);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener(REFRESHED, bump);
    return () => window.removeEventListener(REFRESHED, bump);
  }, []);
  useEffect(() => {
    let live = true;
    const get = () =>
      fetch(receiptsUrl('/plan.json'), { credentials: 'include' });
    // a device that was never connected connects itself once, then asks again
    get()
      .then(async r =>
        r.status === 401 && (await connectDevice()) ? get() : r,
      )
      .then(r => (r.ok ? r.json() : null))
      .then(body => live && setPlan(body))
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
