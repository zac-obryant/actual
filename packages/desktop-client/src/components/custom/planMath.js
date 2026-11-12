// The money plan's math, shared by the Pi companion (companion/src/plan.js) and the budget app
// (actual/.../custom/planMath.js, a byte-for-byte copy: a plan.test.js test checks it). No imports,
// no Node or browser APIs, so it runs the same in both places.
//
// It walks every paycheck forward from today and says where each one goes: bills due before the
// next paycheck first, then food and everyday spending, then the rest. When a paycheck can't cover
// every bill, it pushes the bill with the most grace (usually the mortgage). Out of that walk fall
// the debt-free dates and the date each savings goal is reached.
export const DAY = 864e5;
const D = s => new Date(s + 'T00:00:00Z');
export const iso = d => d.toISOString().slice(0, 10);
// share of income given as tithe; budget-plan.json `titheRate` (0 = paused)
const titheOf = (plan, amount) => Math.round(amount * (plan.titheRate ?? 0.1));
export const addDays = (s, n) => iso(new Date(D(s).getTime() + n * DAY));
const daysBetween = (a, b) => Math.round((D(b) - D(a)) / DAY);
const clampDay = (y, m, day) => iso(new Date(Date.UTC(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()))));
const cents = d => Math.round(d * 100);
const MONTH_DAYS = 365.25 / 12;

/** Each month from `from`'s month through `to`, as [year, monthIndex]. */
function months(from, to) {
  const out = [];
  for (let d = D(from.slice(0, 7) + '-01'); iso(d) < to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))
    out.push([d.getUTCFullYear(), d.getUTCMonth()]);
  return out;
}

/** Income deposits in [from, to). Each plan.income row: [name, dollars, firstDate, everyNDays | "monthly" | "once", lastDate?]. */
export function incomeEvents(plan, from, to) {
  const out = [];
  for (const [name, dollars, anchor, every, until] of plan.income) {
    const stop = until && addDays(until, 1) < to ? addDays(until, 1) : to;
    const amount = cents(dollars);
    if (every === 'once') { if (anchor >= from && anchor < stop) out.push({ date: anchor, name, amount }); continue; }
    if (every === 'monthly') {
      for (const [y, m] of months(from, stop)) {
        const date = clampDay(y, m, D(anchor).getUTCDate());
        if (date >= from && date < stop && date >= anchor) out.push({ date, name, amount });
      }
      continue;
    }
    let date = anchor;
    while (date < from) date = addDays(date, every);
    for (; date < stop; date = addDays(date, every)) out.push({ date, name, amount });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Simulate paycheck by paycheck. cash = dollars on hand today across the spending accounts.
 *  Two passes: the first walk spends nothing extra, so it shows how low the bank gets later; the second
 *  only sends money to savings/debt if it isn't needed for bills in the next LOOKAHEAD paychecks. */
const LOOKAHEAD = 7; // ~3 months of paychecks
export function simulate(plan, opts) {
  const dry = walk(plan, opts, null).periods.map(p => p.left - p.pushed.reduce((s, b) => s + b.amount, 0));
  return walk(plan, opts, dry);
}

function walk(plan, { today, cash, months: horizon = 48, paid = new Set() }, lowAhead) {
  let spentExtra = 0; // extra already sent to savings/debt; every later balance is that much lower
  const end = iso(new Date(Date.UTC(D(today).getUTCFullYear(), D(today).getUTCMonth() + horizon, 1)));
  const env = new Map(plan.envelopes.map(([n, a]) => [n, cents(a)]));
  const goals = plan.goals.map(([name, target, by, have = 0]) =>
    ({ name, target: cents(target), by, have: cents(have), monthly: env.get(name) ?? 0, reached: have >= target ? today : null }));
  const goalNames = new Set(goals.map(g => g.name));
  const debts = plan.debts.map(([name, balance, apr, asOf]) => ({ name, start: cents(balance), bal: cents(balance), apr, asOf, min: env.get(name), paidOff: null }));
  const debtByName = new Map(debts.map(d => [d.name, d]));
  const essentials = plan.essentials;
  const living = [...env.keys()].filter(n => !plan.due[n] && !goalNames.has(n) && !essentials.includes(n));

  // Every bill date from the month of the oldest debt balance to the end; interest accrues once a month at the payment.
  const firstMonth = [today, ...debts.map(d => d.asOf)].sort()[0];
  const bills = months(firstMonth, end).flatMap(([y, m]) =>
    Object.entries(plan.due).map(([name, [day, grace = 0, fee]]) => ({
      // a month planned differently on the budget screen (`byMonth`) uses its own amount
      name, date: clampDay(y, m, day), grace, amount: plan.byMonth?.[name]?.[`${y}-${String(m + 1).padStart(2, '0')}`] ?? env.get(name),
      // what paying late costs; an estimate unless budget-plan.json says (third number in `due`)
      fee: cents(fee ?? (plan.debts.some(d => d[0] === name) ? 30 : 15)),
    })))
    // one-off planned spending (future-dated transactions in Actual): paid on its date, pushed only as a last resort
    .concat((plan.planned ?? []).map(([name, amount, date]) => ({ name, date, grace: 0, amount: cents(amount), fee: cents(1000) })))
    // a bill you chose to pay on another day (budget-plan.json `payOn`: [name, date]) is paid then; still late past its grace
    .map(b => { const o = (plan.payOn ?? []).find(([n, d]) => n === b.name && d.slice(0, 7) === b.date.slice(0, 7)); return o ? { ...b, due: b.date, date: o[1] } : b; })
    .sort((a, b) => a.date.localeCompare(b.date));
  // This month's bills whose date has passed but that haven't been paid stay owed.
  const overdue = bills.filter(b => b.date <= today && b.date.slice(0, 7) === today.slice(0, 7) && !paid.has(b.name));
  const payBill = (b, date) => {
    const debt = debtByName.get(b.name);
    if (!debt) return b.amount;
    if (debt.bal <= 0) return 0;
    debt.bal += Math.round(debt.bal * debt.apr / 1200);
    const amt = Math.min(b.amount, debt.bal);
    debt.bal -= amt;
    if (debt.bal <= 0) debt.paidOff = date;
    return amt;
  };
  // ponytail: debt balances are "as of" a statement date; roll them forward with minimum payments to today.
  for (const b of bills) if (b.date <= today && !overdue.includes(b)) { const d = debtByName.get(b.name); if (d && b.date > d.asOf) payBill(b, b.date); }
  for (const d of debts) d.now = d.bal; // estimated balance today, before this plan pays anything extra

  const paydays = incomeEvents(plan, addDays(today, 1), end);
  const starts = [{ date: today, name: 'Cash on hand now', amount: 0 }, ...paydays];
  const periods = [];
  let money = cents(cash), carried = overdue; // bills pushed from the previous paycheck (at first: overdue ones)

  starts.forEach((start, i) => {
    const next = starts[i + 1]?.date ?? end;
    const frac = daysBetween(start.date, next) / MONTH_DAYS;
    const lines = [];
    const pay = (name, amount, kind, planned = amount, more = {}) => { if (amount || planned) lines.push({ name, amount, kind, planned, ...more }); money -= amount; };
    const graceEnd = b => addDays(b.due ?? b.date, b.grace);
    // the day a bill gets paid: its due date, or for one already past due, the last fee-free day
    // still ahead (else today), or the payday it was pushed to
    const payOn = b => b.date >= start.date ? b.date
      : i === 0 ? [today, [graceEnd(b), addDays(next, -1)].sort()[0]].sort().at(-1) : start.date;
    const payLine = b => { const on = payOn(b); pay(b.name, payBill(b, start.date), b.date < start.date ? 'late bill' : 'bill', undefined, { on, due: b.due ?? b.date, late: on > graceEnd(b) }); };
    money += start.amount;

    pay('Tithe', titheOf(plan, start.amount), 'tithe');

    const due = [...carried, ...bills.filter(b => b.date > today && b.date >= start.date && b.date < next)]
      .filter(b => !debtByName.get(b.name) || debtByName.get(b.name).bal > 0);
    // Not enough for every bill: push to the next paycheck the bills that cost least to delay —
    // free while the next payday is inside their grace, else their late fee — most grace first.
    const cost = b => (next > graceEnd(b) ? b.fee : 0);
    let short = due.reduce((s, b) => s + b.amount, 0) - Math.max(0, money);
    const pushed = [];
    for (const b of [...due].sort((a, b) => cost(a) - cost(b) || graceEnd(b).localeCompare(graceEnd(a)))) {
      if (short <= 0) break;
      pushed.push(b); short -= b.amount;
    }
    for (const b of due) if (!pushed.includes(b)) payLine(b);
    // Pushing whole bills overshoots: pay back any pushed bill that still fits, costliest delay first.
    for (const b of [...pushed].sort((a, b) => cost(b) - cost(a) || a.amount - b.amount)) if (b.amount <= money) { pushed.splice(pushed.indexOf(b), 1); payLine(b); }
    carried = pushed.map(b => ({ ...b, late: next > graceEnd(b) }));

    // bills are locked in and come first; food and everyday spending get what they leave
    let foodShort = 0;
    for (const n of essentials) {
      const want = Math.round(env.get(n) * frac);
      const got = Math.max(0, Math.min(want, money));
      foodShort += want - got;
      pay(n, got, 'food', want);
    }

    for (const n of living) { const want = Math.round(env.get(n) * frac); pay(n, Math.max(0, Math.min(want, money)), 'living', want); }

    for (const g of goals.filter(g => !g.reached && g.monthly)) {
      const amt = Math.max(0, Math.min(Math.round(g.monthly * frac), g.target - g.have, money));
      g.have += amt; pay(`Save: ${g.name}`, amt, 'goal');
      if (g.have >= g.target) g.reached = start.date;
    }

    // Spare money (above the cushion, not needed for bills in the next few paychecks, nothing pushed):
    // top up fill-from-leftover goals (Emergency Fund), then the snowball.
    const low = lowAhead ? Math.min(...lowAhead.slice(i, i + LOOKAHEAD + 1)) - spentExtra : 0;
    let extra = carried.length ? 0 : Math.max(0, Math.min(money, low) - cents(plan.cushion));
    spentExtra += extra;
    for (const g of goals.filter(g => !g.reached && !g.monthly)) {
      const amt = Math.min(extra, g.target - g.have);
      g.have += amt; extra -= amt; pay(`Save: ${g.name}`, amt, 'goal');
      if (g.have >= g.target) g.reached = start.date;
    }
    for (const d of debts) {
      if (extra <= 0 || d.bal <= 0) continue;
      const amt = Math.min(extra, d.bal);
      d.bal -= amt; extra -= amt; pay(`Extra to ${d.name}`, amt, 'snowball');
      if (d.bal <= 0) d.paidOff = start.date;
    }
    spentExtra -= extra; // every debt paid off: the rest just stays in the bank

    periods.push({ ...start, next, lines, pushed: carried, foodShort, left: money });
  });

  return { periods, debts, goals, gap: monthlyGap(plan) };
}

/** Average month: income after tithe minus everything the plan spends. Negative = the plan costs more than you earn. */
export function monthlyGap(plan) {
  const perMonth = ([, dollars, , every]) =>
    every === 'once' ? 0 : every === 'monthly' ? cents(dollars) : Math.round(cents(dollars) * 365.25 / every / 12);
  const income = plan.income.filter(r => !r[4]).reduce((s, r) => s + perMonth(r), 0); // rows with an end date are the old rate
  const spend = plan.envelopes.reduce((s, [, a]) => s + cents(a), 0);
  return { income, tithe: titheOf(plan, income), spend, gap: income - titheOf(plan, income) - spend };
}

/** One push-notification's worth: the next paycheck that can't cover food or bills, if any. */
export function alertFor({ periods }, lookahead = 3) {
  const bad = periods.slice(0, lookahead + 1).find(p => p.foodShort || p.pushed.length);
  if (!bad) return null;
  const parts = [];
  if (bad.foodShort) parts.push(`food is ${usd(bad.foodShort)} short`);
  if (bad.pushed.length) parts.push(`push ${bad.pushed.map(b => `${b.name} ${usd(b.amount)} (due ${short(b.date)}${b.late ? ', LATE FEE likely' : `, no late fee until ${short(addDays(b.date, b.grace))}`})`).join('; ')} to the ${short(bad.next)} paycheck`);
  return { title: `Paycheck ${short(bad.date)}: feed the family first`, message: `Buy groceries first. Then ${parts.join(', and ')}.` };
}

export const usd = c => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const short = s => D(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const long = s => s ? D(s).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'not in the next 4 years';
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

export function renderHtml(result, { today, cash, paychecks = 6 }) {
  const { periods, debts, goals, gap } = result;
  const alert = alertFor(result);
  const card = p => `
    <section class="card">
      <h3>${p.amount ? `${esc(p.name)} · ${short(p.date)} · ${usd(p.amount)}` : `Right now · ${usd(cents(cash))} in the bank`}</h3>
      <p class="sub">Has to last until ${short(p.next)}</p>
      ${p.foodShort ? `<p class="bad">Food is ${usd(p.foodShort)} short this stretch.</p>` : ''}
      ${p.pushed.map(b => `<p class="warn">Push <b>${esc(b.name)}</b> ${usd(b.amount)} (due ${short(b.date)}) to the ${short(p.next)} paycheck${b.late ? ' — expect a late fee' : ` — no late fee until ${short(addDays(b.date, b.grace))}`}.</p>`).join('')}
      <table>${p.lines.filter(l => l.amount || l.planned).map(l => `
        <tr class="${l.kind}"><td>${esc(l.name)}${l.kind === 'late bill' ? ' (pushed from last check)' : ''}</td>
        <td class="num">${usd(l.amount)}${l.amount < l.planned ? ` <span class="cut">of ${usd(l.planned)}</span>` : ''}</td></tr>`).join('')}
        <tr class="total"><td>Left in the bank</td><td class="num">${usd(p.left)}</td></tr>
      </table>
    </section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Our Money Plan</title><style>
:root{--bg:#fafaf7;--fg:#1d1d1b;--mute:#6b6b66;--line:#e4e2dc;--card:#fff;--good:#1f7a4d;--bad:#b3261e;--warn:#8a5a00;--warnbg:#fff4dc;--badbg:#fdecea}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--mute:#9a998f;--line:#2e2d2a;--card:#1d1c1a;--good:#6fcf97;--bad:#ff8a80;--warn:#ffcc66;--warnbg:#2e2510;--badbg:#341a18}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:20px;margin:36px 0 8px}h3{font-size:17px;margin:0}
.sub{color:var(--mute);margin:2px 0 10px;font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
table{width:100%;border-collapse:collapse}td{padding:5px 0;border-top:1px solid var(--line)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.total td{font-weight:600}.cut{color:var(--mute);font-size:13px}
.food td{font-weight:600}.snowball td{color:var(--good);font-weight:600}.goal td:first-child{color:var(--mute)}
.warn{background:var(--warnbg);color:var(--warn);padding:8px 10px;border-radius:8px;margin:6px 0}
.bad{background:var(--badbg);color:var(--bad);padding:8px 10px;border-radius:8px;margin:6px 0}
.big{font-size:22px;font-weight:700}.ok{color:var(--good)}.no{color:var(--bad)}
</style></head><body><main>
<h1>Our Money Plan</h1><p class="sub">Made ${short(today)} from the bank balances and budget-plan.json. Re-run after each paycheck.</p>

<section class="card">
  <p class="big ${gap.gap < 0 ? 'no' : 'ok'}">${gap.gap < 0 ? `The plan costs ${usd(-gap.gap)}/month more than you earn` : `The plan fits, with ${usd(gap.gap)}/month to spare`}</p>
  <p class="sub">Average month: ${usd(gap.income)} in, ${usd(gap.tithe)} tithe, ${usd(gap.spend)} planned. ${gap.gap < 0 ? 'Cash in the bank, 3rd paychecks and the bonus cover that for now, but it is a slow leak. Trim a line in budget-plan.json until this turns green.' : ''}</p>
  ${alert ? `<p class="warn"><b>${esc(alert.title)}.</b> ${esc(alert.message)}</p>` : '<p class="ok">The next few paychecks cover food and every bill.</p>'}
</section>

<h2>Debt-free dates</h2>
<p class="sub">Snowball order: pay minimums on all, every spare dollar to the top one. When it's gone, its payment rolls to the next.</p>
<section class="card"><table>${debts.map(d => `<tr><td>${esc(d.name)}</td><td class="num">${usd(d.start)} as of ${short(d.asOf)}</td><td class="num"><b>${long(d.paidOff)}</b></td></tr>`).join('')}</table></section>

<h2>Savings goals</h2>
<section class="card"><table>${goals.map(g => {
  const late = g.by && (!g.reached || g.reached > g.by);
  return `<tr><td>${esc(g.name)}</td><td class="num">${usd(g.target)}${g.by ? ` by ${short(g.by)}` : ''}</td><td class="num ${late ? 'no' : 'ok'}"><b>${g.reached ? long(g.reached) : 'not yet in sight'}</b>${late ? ' — late' : ''}</td></tr>`;
}).join('')}</table></section>

<h2>Where each paycheck goes</h2>
${periods.slice(0, paychecks + 1).map(card).join('')}
</main></body></html>`;
}

/** Cash day by day for the calendar and the accounts line: paychecks (less the tithe) and bills on
 *  their dates, and the small monthly subscriptions on the 1st. Family spending is not taken out: it's
 *  whatever this line leaves, so the balance only drops when money is really spent. Spare money the
 *  plan would send to debt is left in, so the line is "before extra payments". */
export function dailyCash(plan, result, { today, cash, days = 56 }) {
  const end = addDays(today, days);
  const goals = new Set(plan.goals.map(g => g[0]));
  const everyday = new Set(plan.everyday ?? []);
  const events = new Map();
  const add = (date, name, amount) => { if (amount) (events.get(date) ?? events.set(date, []).get(date)).push({ name, amount }); };
  for (const e of incomeEvents(plan, addDays(today, 1), end)) {
    add(e.date, e.name, e.amount);
    add(e.date, 'Tithe', -titheOf(plan, e.amount));
  }
  // bills land on the day the plan pays them (late ones on the payday they were pushed to)
  for (const p of billPayments(result)) if (p.on < end) add(p.on, p.name + (p.late ? ' (late)' : ''), -p.amount);
  const other = plan.envelopes.filter(([n]) => !plan.due[n] && !goals.has(n) && !everyday.has(n));
  for (let d = `${addDays(today, 1).slice(0, 7)}-01`; d < end; d = `${addDays(d, 32).slice(0, 7)}-01`)
    if (d > today) for (const [n, a] of other) add(d, n, -cents(a));
  let bal = cents(cash);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    const ev = events.get(date) ?? [];
    bal += ev.reduce((s, e) => s + e.amount, 0);
    return { date, bal: Math.round(bal) / 100, events: ev.map(e => ({ name: e.name, amount: e.amount / 100 })) };
  });
}

/** Every bill the plan pays, in cents, with the day it's paid, its due date and whether that's late. */
export function billPayments(result) {
  return result.periods.flatMap(p => p.lines.filter(l => (l.kind === 'bill' || l.kind === 'late bill') && l.amount > 0)
    .map(l => ({ name: l.name, amount: l.amount, on: l.on, due: l.due, late: !!l.late })));
}

/** The payday moves. On each payday: tithe, then move to the bills account exactly what the bills
 *  the plan pays before the next payday need (less what's already there), with family spending money
 *  until the next regular paycheck taken out first, then savings goals; extra goes to the snowball debt only when the
 *  plan has room for it, and anything else stays in checking as a cushion. The bills account is
 *  walked day by day from its real balance, so a shortfall before the first payday shows up too. */
export function paydayRoutine(plan, result, today, { billsBalance = 0, count = 8 } = {}) {
  const env = new Map(plan.envelopes);
  // a round weekly figure is what gets said out loud; spending money is built from it
  const perWeek = Math.round((plan.everyday ?? []).reduce((s, n) => s + (env.get(n) ?? 0), 0) * 12 / 52);
  const goalsMonthly = plan.goals.reduce((s, [n]) => s + (env.get(n) ?? 0), 0);
  const regular = plan.income.find(r => typeof r[3] === 'number');
  // monthly bills go through the bills account; one-off planned spending is paid from checking
  const all = billPayments(result).map(p => ({ ...p, amount: p.amount / 100 }));
  const payments = all.filter(p => plan.due[p.name]);
  const oneOffs = all.filter(p => !plan.due[p.name]);
  const paydays = result.periods.filter(p => p.amount > 0).slice(0, count);
  const snowball = d => result.periods.find(p => p.date === d)?.lines.filter(l => l.kind === 'snowball').reduce((s, l) => s + l.amount, 0) / 100 || 0;
  const r2 = n => Math.round(n * 100) / 100;

  let bal = billsBalance, low = { date: today, bal };
  const spend = (from, to) => {
    for (const p of payments.filter(p => p.on >= from && p.on < to).sort((a, b) => a.on.localeCompare(b.on))) {
      bal -= p.amount;
      if (bal < low.bal) low = { date: p.on, bal };
    }
  };
  spend(today, paydays[0]?.date ?? today);
  const splits = paydays.map((pd, i) => {
    const next = paydays[i + 1]?.date ?? pd.next;
    const amount = pd.amount / 100, tithe = titheOf(plan, pd.amount) / 100;
    const bills = payments.filter(p => p.on >= pd.date && p.on < next);
    const need = bills.reduce((s, b) => s + b.amount, 0);
    const toBills = r2(Math.max(0, need - Math.max(0, bal)));
    bal += toBills;
    spend(pd.date, next);
    const isRegular = regular && pd.name === regular[0];
    const isOnce = plan.income.find(r => r[0] === pd.name)?.[3] === 'once';
    const nextRegular = isRegular ? (paydays.slice(i + 1).find(p => p.name === pd.name)?.date ?? addDays(pd.date, regular[3])) : pd.date;
    const weeks = isRegular ? Math.round(daysBetween(pd.date, nextRegular) / 7) : 0;
    // bills come first; spending money is what's left, up to the weekly budget. Bills the paycheck
    // can't cover come from what earlier paychecks left in checking (`fromChecking`)
    // (counted against the paycheck's own bills, not the move: what already sits in the bills account
    // is part of today's cash, which "where you stand" already counts)
    const planned = oneOffs.filter(p => p.on >= pd.date && p.on < next);
    const own = amount - tithe - need - planned.reduce((s, p) => s + p.amount, 0);
    const spending = r2(Math.max(0, Math.min(perWeek * weeks, own)));
    let rem = own - spending;
    const goalShare = isRegular && !isOnce ? goalsMonthly * daysBetween(pd.date, nextRegular) / MONTH_DAYS : 0;
    const toSavings = r2(Math.min(goalShare, Math.max(0, rem))); rem -= toSavings;
    const extraDebt = r2(Math.min(snowball(pd.date), Math.max(0, rem))); rem -= extraDebt;
    return {
      date: pd.date, name: pd.name, amount, tithe, toBills, toSavings, spending, extraDebt, weeks,
      keep: r2(Math.max(0, rem)), fromChecking: r2(Math.max(0, -rem)),
      bills: bills.map(b => ({ name: b.name, amount: b.amount, on: b.on, late: b.late })),
      planned: planned.map(b => ({ name: b.name, amount: b.amount, on: b.on })),
    };
  });
  return { perWeek, goalsMonthly, splits, billsLow: { date: low.date, bal: r2(low.bal) } };
}

/** Family spending money: the everyday categories' monthly plan as a weekly allowance, and the paydays
 *  around today so weeks can line up with them. */
export function spendingMoney(plan, today) {
  const env = new Map(plan.envelopes);
  const monthly = (plan.everyday ?? []).reduce((s, n) => s + (env.get(n) ?? 0), 0);
  // weeks line up with the regular every-N-days paycheck, not monthly or one-off income
  const regular = { income: plan.income.filter(r => typeof r[3] === 'number') };
  const pays = incomeEvents(regular, addDays(today, -45), addDays(today, 45));
  return {
    categories: plan.everyday ?? [],
    monthly,
    perWeek: Math.round((monthly * 12) / 52),
    lastPayday: pays.filter(e => e.date <= today).at(-1)?.date ?? null,
    nextPayday: pays.find(e => e.date > today)?.date ?? null,
  };
}

/** Where you stand today: cash now, what the plan pays before the next paycheck, and what's free. */
export function standing(result, today, cash, routine) {
  const next = result.periods.find(p => p.amount > 0 && p.date > today);
  if (cash == null || !next) return null;
  const bills = billPayments(result).filter(p => p.on < next.date).sort((a, b) => a.on.localeCompare(b.on)).map(p => ({ name: p.name, amount: p.amount / 100, on: p.on, due: p.due, late: p.late }));
  const owed = bills.reduce((s, b) => s + b.amount, 0);
  // the next paycheck's own bills it can't cover come out of what's in the bank now
  // (all of them, whichever account the money sits in today); spending is never held back for later
  const sp = routine?.splits.find(s => s.date === next.date);
  const need = sp ? [...sp.bills, ...(sp.planned ?? [])].reduce((t, b) => t + b.amount, 0) : 0;
  const nextShort = sp ? Math.round(Math.max(0, need - (sp.amount - sp.tithe)) * 100) / 100 : 0;
  return { cash, bills, owed: Math.round(owed * 100) / 100, nextShort, free: Math.round((cash - owed - nextShort) * 100) / 100, next: { date: next.date, name: next.name, amount: next.amount / 100 } };
}

/** What the budget screen needs from the plan: which categories are bills or everyday, due days,
 *  and each goal and debt with its balance today and projected date. */
export function planSummary(plan, result, today, cash = null, paid, billsBalance = 0) {
  const goals = new Set(plan.goals.map(g => g[0]));
  const skip = new Set([plan.tithe, ...plan.everyday, ...goals]);
  const env = new Map(plan.envelopes);
  const routine = paydayRoutine(plan, result, today, { billsBalance });
  return {
    generated: today,
    due: plan.due,
    everyday: plan.everyday,
    bills: plan.envelopes.map(e => e[0]).filter(n => !skip.has(n)),
    goals: result.goals.map(g => ({ name: g.name, target: g.target / 100, by: g.by, current: plan.goals.find(x => x[0] === g.name)[3] ?? 0, monthly: env.get(g.name) ?? 0, date: g.reached })),
    debts: result.debts.map(d => ({ name: d.name, start: d.start / 100, asOf: d.asOf, current: Math.round(d.now) / 100, apr: d.apr, monthly: env.get(d.name) ?? 0, date: d.paidOff })),
    cashAccounts: plan.cashAccounts,
    routine,
    payments: billPayments(result).filter(p => p.on < addDays(today, 45)).map(p => ({ ...p, amount: p.amount / 100 })),
    billsAccount: plan.billsAccount ?? null,
    snowball: plan.snowball ?? null,
    spending: spendingMoney(plan, today),
    days: cash == null ? [] : dailyCash(plan, result, { today, cash }),
    standing: standing(result, today, cash, routine),
  };
}

/** Everything the plan reads from the budget, then the plan itself. `api` is @actual-app/api on the
 *  Pi and a thin shim over the same `api/*` handlers in the app, so both compute the same thing.
 *  `config` is budget-plan.json (copied, not changed). `todayIso` is the local date, YYYY-MM-DD. */
export async function buildPlan(api, config, todayIso) {
  const plan = JSON.parse(JSON.stringify(config));
  plan.planned = [];
  const paid = new Set();
  let billsBalance = 0;
  const cash = await (async () => {
    const payeeName = new Map((await api.getPayees()).map(p => [p.id, p.name]));
    let sum = 0;
    for (const a of await api.getAccounts()) {
      if (a.closed) continue;
      // balances as of today; a transaction dated later is planned spending, paid on its date
      const now = await api.getAccountBalance(a.id, new Date(`${todayIso}T23:59:59`));
      if (plan.cashAccounts.includes(a.name)) {
        sum += now;
        for (const t of await api.getTransactions(a.id, addDays(todayIso, 1), '2100-01-01')) {
          if (t.transfer_id || t.amount >= 0) continue; // ponytail: future moves between accounts and future income are ignored
          plan.planned.push([payeeName.get(t.payee) ?? t.notes ?? 'Planned', -t.amount / 100, t.date]);
        }
      }
      if (a.name === plan.billsAccount) billsBalance = now / 100;
      // a goal with its own account (Emergency Fund) starts from that account's real balance
      const goal = plan.goals.find(g => g[0] === a.name);
      if (goal) goal[3] = (await api.getAccountBalance(a.id)) / 100;
    }
    // The budget screen is where amounts get changed: this month's planned amounts
    // in Actual win over budget-plan.json, and newly planned categories join at the end.
    const month = todayIso.slice(0, 7);
    const cats = m => api.getBudgetMonth(m).then(b => b.categoryGroups.filter(g => !g.is_income).flatMap(g => g.categories ?? []).filter(c => c.name !== plan.tithe));
    const planned = await cats(month);
    // the next few months as planned on the budget screen, for bills whose amount changes month to month
    plan.byMonth = {};
    for (let i = 1; i <= 3; i++) {
      const m = addDays(`${month}-15`, 31 * i).slice(0, 7);
      for (const c of await cats(m).catch(() => [])) if (plan.due[c.name]) (plan.byMonth[c.name] ??= {})[m] = cents(c.budgeted / 100);
    }
    // pay-on dates picked on the budget screen: hidden notes `fork-payon:<category id>:<YYYY-MM>` holding a date
    const catName = new Map(planned.map(c => [c.id, c.name]));
    const { data: notes = [] } = await api.aqlQuery(api.q('notes').select(['id', 'note']));
    plan.payOn = [...(plan.payOn ?? []), ...notes.filter(n => n.id.startsWith('fork-payon:') && /^\d{4}-\d{2}-\d{2}$/.test(n.note ?? ''))
      .map(n => [catName.get(n.id.split(':')[1]), n.note]).filter(([name]) => name)];
    for (const c of planned) if (c.spent <= -50 && plan.due[c.name]) paid.add(c.name); // ponytail: 50¢ of spend = paid, as on the budget screen
    for (const c of planned) {
      const env = plan.envelopes.find(e => e[0] === c.name);
      if (env) env[1] = c.budgeted / 100;
      else if (c.budgeted > 0) plan.envelopes.push([c.name, c.budgeted / 100]);
    }
    plan.envelopes = plan.envelopes.filter(e => e[1] > 0);
    return sum / 100;
  })();
  const today = todayIso;
  const result = simulate(plan, { today, cash, paid });
  return { plan, result, today, cash, paid, billsBalance, summary: planSummary(plan, result, today, cash, paid, billsBalance) };
}
