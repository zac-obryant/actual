// Fork: the tracking budget as "Bills and spending". Everyday money left is the
// answer; bills are a checklist by due date; everyday categories are cards that
// say what is left per week; savings goals and debts show a balance, a meter and
// the date the household's Money Plan projects for them.
//
// Planned and spent amounts are live from the budget's spreadsheet. Due days,
// which categories are bills or everyday, goal and debt balances and projected
// dates come from the companion's Money Plan (`/plan.json` on the receipts
// server, same box). Without it the bills and spending still show; the plan
// sections say why they are empty.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { css } from '@emotion/css';

import { useCategories } from '#hooks/useCategories';
import { useLocale } from '#hooks/useLocale';

import { cell, useCells } from './EnvelopeRowParts';
import { usePlan } from './moneyPlan';
import type { PlanSummary } from './moneyPlan';
import {
  Direction,
  HeroNumber,
  Meter,
  sectionLabel,
  StatusChip,
} from './primitives';
import type { Tone } from './primitives';

type Row = { id: string; name: string; planned: number; spent: number };

/** How many days ahead counts as "due soon". */
const SOON_DAYS = 4;

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const card = {
  backgroundColor: theme.cardBackground,
  borderRadius: 16,
};

const lanes = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)',
  gap: 20,
  alignItems: 'start',
  marginTop: 26,
  '@media (max-width: 760px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

const minis = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 12,
  marginTop: 12,
});

function LaneHeader({ title, note }: { title: ReactNode; note?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        marginBottom: 10,
      }}
    >
      <Text style={{ ...styles.displayText }}>{title}</Text>
      {note != null && <Small>{note}</Small>}
    </View>
  );
}

function Small({
  children,
  color = theme.pageTextSubdued,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <Text style={{ ...styles.tnum, fontSize: 13, color, whiteSpace: 'nowrap' }}>
      {children}
    </Text>
  );
}

function Pct({
  value,
  income,
  tight = false,
}: {
  value: number;
  income: number;
  tight?: boolean;
}) {
  if (!income) return null;
  return (
    <Text
      style={{
        ...styles.tnum,
        display: 'inline-block',
        minWidth: tight ? 0 : 44,
        textAlign: 'right',
        marginLeft: tight ? 5 : 8,
        fontSize: 12.5,
        fontWeight: 500,
        color: theme.pageTextSubdued,
      }}
    >
      {Math.round((value / income) * 1000) / 10}%
    </Text>
  );
}

function Check({ done }: { done: boolean }) {
  return (
    <View
      aria-hidden
      style={{
        width: 20,
        height: 20,
        flexShrink: 0,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: done ? theme.reportsChartFill : 'transparent',
        boxShadow: done ? 'none' : `inset 0 0 0 1.5px ${theme.tableBorder}`,
      }}
    >
      {done && (
        <svg width="11" height="11" viewBox="0 0 12 12">
          <path
            d="M2.5 6.2 5 8.6 9.6 3.6"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </View>
  );
}

/** Sets a category's planned amount for `month` and every later budget month. */
async function savePlanned(month: string, category: string, amount: number) {
  const { end } = await send('get-budget-bounds');
  for (const m of monthUtils.range(month, end)) {
    await send('budget/budget-amount', { month: m, category, amount });
  }
}

/**
 * A planned amount that turns into a field when clicked. Enter or clicking away
 * saves it for this month onward; Escape cancels.
 */
function PlannedAmount({
  month,
  row,
  children,
}: {
  month: string;
  row: Row;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <Input
        autoFocus
        aria-label={t('Planned for {{name}}', { name: row.name })}
        inputMode="decimal"
        defaultValue={String(row.planned / 100)}
        onFocus={e => e.currentTarget.select()}
        onEnter={(_, e) => e.currentTarget.blur()}
        onEscape={() => setEditing(false)}
        onUpdate={value => {
          setEditing(false);
          const dollars = parseFloat(value.replace(/[^0-9.]/g, ''));
          const cents = Number.isFinite(dollars)
            ? Math.round(dollars * 100)
            : 0;
          if (cents !== row.planned) void savePlanned(month, row.id, cents);
        }}
        style={{ ...styles.tnum, width: 96, textAlign: 'right' }}
      />
    );
  }
  return (
    <Button
      variant="bare"
      aria-label={t('Change planned amount for {{name}}', { name: row.name })}
      onPress={() => setEditing(true)}
      style={{
        ...styles.tnum,
        padding: '2px 6px',
        margin: '-2px -6px',
        borderRadius: 6,
        textDecoration: 'underline dotted',
        textUnderlineOffset: 4,
        textDecorationColor: theme.pageTextSubdued,
        color: 'inherit',
        fontSize: 'inherit',
        fontWeight: 'inherit',
      }}
    >
      {children}
    </Button>
  );
}

/** Spent against planned, coloured by how close it is to the line. */
function spendFill(row: Row) {
  if (row.spent > row.planned) return theme.errorBorder;
  if (row.planned && row.spent / row.planned > 0.85) return theme.warningBorder;
  return theme.reportsChartFill;
}

export function BillsAndSpending({ month }: { month: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const plan = usePlan();
  const { data: { grouped = [] } = {} } = useCategories();

  const expense = useMemo(
    () =>
      grouped
        .filter(g => !g.is_income && !g.hidden)
        .flatMap(g => (g.categories ?? []).filter(c => !c.hidden)),
    [grouped],
  );
  const names = useMemo(
    () => [
      cell(month, 'total-budget-income'),
      ...expense.flatMap(c => [
        cell(month, `budget-${c.id}`),
        cell(month, `sum-amount-${c.id}`),
      ]),
    ],
    [expense, month],
  );
  const cells = useCells(names);

  const rows: Row[] = expense
    .map(c => ({
      id: c.id,
      name: c.name,
      planned: cells[cell(month, `budget-${c.id}`)] ?? 0,
      spent: -(cells[cell(month, `sum-amount-${c.id}`)] ?? 0),
    }))
    .filter(r => r.planned || r.spent);
  const income = cells[cell(month, 'total-budget-income')] ?? 0;

  const everydayNames = new Set(plan?.everyday ?? []);
  const goalNames = new Set((plan?.goals ?? []).map(g => g.name));
  // null = plan unreachable: everything that isn't a goal reads as a bill;
  // undefined = still loading: nothing is sorted yet, so nothing jumps lanes
  const billNames =
    plan === undefined ? new Set<string>() : plan ? new Set(plan.bills) : null;
  const everyday = (plan?.everyday ?? [])
    .map(n => rows.find(r => r.name === n))
    .filter((r): r is Row => !!r);
  const bills = rows.filter(r =>
    billNames
      ? billNames.has(r.name)
      : !everydayNames.has(r.name) && !goalNames.has(r.name),
  );

  // Due status needs a "today": inside the month it's the real date, a past
  // month is over, a future month hasn't started.
  const thisMonth = monthUtils.currentMonth();
  const daysInMonth = monthUtils.getDay(monthUtils.getMonthEnd(`${month}-01`));
  const today =
    month === thisMonth
      ? monthUtils.getDay(monthUtils.currentDay())
      : month < thisMonth
        ? daysInMonth + 1
        : 0;
  const isPaid = (r: Row) => r.spent > 50; // ponytail: half a dollar of spend counts as paid
  const dueDay = (r: Row) => plan?.due[r.name]?.[0];
  const billStatus = (r: Row): { tone: Tone; label: string } => {
    if (isPaid(r)) return { tone: 'positive', label: t('Paid') };
    const d = dueDay(r);
    if (d == null) return { tone: 'neutral', label: t('Monthly') };
    if (d < today) {
      return {
        tone: 'negative',
        label: t('Was due {{day}}', { day: ordinal(d) }),
      };
    }
    if (d - today <= SOON_DAYS) {
      return { tone: 'warning', label: t('Due {{day}}', { day: ordinal(d) }) };
    }
    return { tone: 'neutral', label: t('Due {{day}}', { day: ordinal(d) }) };
  };
  const sortedBills = [...bills].sort(
    (a, b) =>
      Number(isPaid(a)) - Number(isPaid(b)) ||
      (dueDay(a) ?? 40) - (dueDay(b) ?? 40),
  );

  const evPlanned = everyday.reduce((s, r) => s + r.planned, 0);
  const evSpent = everyday.reduce((s, r) => s + r.spent, 0);
  const evLeft = evPlanned - evSpent;
  const daysLeft = Math.max(0, daysInMonth - Math.max(today, 1) + 1);
  const weeksLeft = Math.max(1, daysLeft) / 7;
  const billsPlanned = bills.reduce((s, r) => s + r.planned, 0);
  const billsLeft = bills
    .filter(r => !isPaid(r))
    .reduce((s, r) => s + r.planned, 0);

  // ponytail: whole US dollars, the same as the top bar's net figure; the
  // budget's own number format has no currency symbol set
  const money = (cents: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  const dollars = (d: number) => money(Math.round(d * 100));
  const monthYear = (iso: string | null) =>
    iso ? monthUtils.format(iso.slice(0, 7), 'MMM yyyy', locale) : null;
  const shortDate = (iso: string) => monthUtils.format(iso, 'MMM d', locale);
  const monthName = monthUtils.format(month, 'MMMM', locale);

  const leftText = (r: Row) =>
    r.spent > r.planned ? (
      <Text
        style={{
          color: theme.errorText,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.2em',
        }}
      >
        <Direction up color={theme.errorText} />
        {t('{{amount}} over', { amount: money(r.spent - r.planned) })}
      </Text>
    ) : (
      t('{{amount}} left', { amount: money(r.planned - r.spent) })
    );

  const big = everyday.slice(0, 4);
  const rest = everyday.slice(4);

  return (
    <View style={{ flexShrink: 0 }}>
      <HeroNumber color={evLeft < 0 ? theme.errorText : theme.pageText}>
        {evLeft < 0
          ? t('{{amount}} over', { amount: money(-evLeft) })
          : t('{{amount}} left', { amount: money(evLeft) })}
      </HeroNumber>
      <Text
        style={{ fontSize: 15, color: theme.pageTextSubdued, marginTop: 4 }}
      >
        {t(
          'to spend on everyday things in {{month}}. Bills are already set aside. Percentages are of {{income}} planned income. Click any underlined amount to change it from {{month}} on.',
          { month: monthName, income: money(income) },
        )}
      </Text>
      {evLeft > 0 && daysLeft > 0 && (
        <Text
          style={{
            ...styles.tnum,
            fontSize: 17,
            fontWeight: 600,
            marginTop: 10,
          }}
        >
          {t('About {{day}} a day, or {{week}} a week, until {{month}} ends.', {
            day: money(evLeft / daysLeft),
            week: money(Math.min(evLeft, (evLeft / daysLeft) * 7)),
            month: monthName,
          })}
        </Text>
      )}

      <div className={lanes}>
        <View>
          <LaneHeader
            title=<Trans>Bills</Trans>
            note={
              <>
                {t('{{paid}} of {{count}} paid', {
                  paid: bills.filter(isPaid).length,
                  count: bills.length,
                })}
                <Pct value={billsPlanned} income={income} />
              </>
            }
          />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 10,
            }}
          >
            <StatusChip tone="positive">
              <Trans>Paid</Trans>
            </StatusChip>
            <StatusChip tone="negative">
              <Trans>Past due</Trans>
            </StatusChip>
            <StatusChip tone="warning">
              {t('Due in {{days}} days', { days: SOON_DAYS })}
            </StatusChip>
            <StatusChip>
              <Trans>Later</Trans>
            </StatusChip>
          </View>
          <View style={{ ...card, padding: '4px 20px' }}>
            {sortedBills.map((r, i) => {
              const s = billStatus(r);
              return (
                <View
                  key={r.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderTop: i ? `1px solid ${theme.tableBorder}` : 'none',
                  }}
                >
                  <Check done={isPaid(r)} />
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      alignItems: 'flex-start',
                      gap: 3,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: 500 }}>
                      {r.name}
                    </Text>
                    <StatusChip tone={s.tone}>{s.label}</StatusChip>
                  </View>
                  <Text
                    style={{
                      ...styles.tnum,
                      fontSize: 15,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isPaid(r) ? (
                      money(r.spent)
                    ) : (
                      <PlannedAmount month={month} row={r}>
                        {money(r.planned)}
                      </PlannedAmount>
                    )}
                    <Pct value={r.planned} income={income} />
                  </Text>
                </View>
              );
            })}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderTop: `1px solid ${theme.tableBorder}`,
              }}
            >
              <Text style={{ fontWeight: 600 }}>
                <Trans>Still to go out</Trans>
              </Text>
              <Text style={{ ...styles.tnum, fontWeight: 600 }}>
                {money(billsLeft)}
                <Pct value={billsLeft} income={income} />
              </Text>
            </View>
          </View>
        </View>

        <View>
          <LaneHeader
            title=<Trans>Everyday spending</Trans>
            note={
              <>
                {t('{{days}} days left', { days: daysLeft })}
                <Pct value={evPlanned} income={income} />
              </>
            }
          />
          {everyday.length === 0 && (
            <Text style={{ color: theme.pageTextSubdued }}>
              {plan === null ? (
                <Trans>
                  The Money Plan isn't reachable, so everyday categories can't
                  be picked out yet.
                </Trans>
              ) : (
                <Trans>
                  None of the Money Plan's everyday categories have money
                  planned or spent this month.
                </Trans>
              )}
            </Text>
          )}
          <View style={{ gap: 12 }}>
            {big.map(r => {
              const over = r.spent > r.planned;
              return (
                <View key={r.id} style={{ ...card, padding: '16px 18px' }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: 500 }}>
                      {r.name}
                    </Text>
                    <Small>
                      {t('{{spent}} of', { spent: money(r.spent) })}{' '}
                      <PlannedAmount month={month} row={r}>
                        {money(r.planned)}
                      </PlannedAmount>
                      {r.planned ? (
                        <Pct value={r.planned} income={income} />
                      ) : (
                        ` · ${t('not planned')}`
                      )}
                    </Small>
                  </View>
                  <Text
                    style={{
                      ...styles.balanceNumber,
                      color: over ? theme.errorText : theme.pageText,
                      margin: '6px 0 10px',
                    }}
                  >
                    {leftText(r)}
                  </Text>
                  <Meter
                    percent={
                      r.planned
                        ? (r.spent / r.planned) * 100
                        : r.spent
                          ? 100
                          : 0
                    }
                    color={spendFill(r)}
                    height={8}
                    style={{ flex: 'none' }}
                  />
                  <Text
                    style={{
                      fontSize: 14,
                      color: theme.pageTextSubdued,
                      marginTop: 8,
                    }}
                  >
                    {over
                      ? r.planned
                        ? t('Over plan. Hold off until the next paycheck.')
                        : t('Nothing was planned for this.')
                      : t('About {{amount}} a week until month end.', {
                          amount: money((r.planned - r.spent) / weeksLeft),
                        })}
                  </Text>
                </View>
              );
            })}
          </View>
          {rest.length > 0 && (
            <div className={minis}>
              {rest.map(r => (
                <View
                  key={r.id}
                  style={{ ...card, borderRadius: 10, padding: '12px 14px' }}
                >
                  <Small>{r.name}</Small>
                  <Text
                    style={{
                      ...styles.tnum,
                      fontSize: 19,
                      fontWeight: 600,
                      letterSpacing: '-0.02em',
                      marginTop: 2,
                    }}
                  >
                    {leftText(r)}
                  </Text>
                  <Small>
                    <Trans>of</Trans>{' '}
                    <PlannedAmount month={month} row={r}>
                      {money(r.planned)}
                    </PlannedAmount>
                    <Pct value={r.planned} income={income} />
                  </Small>
                </View>
              ))}
            </div>
          )}
        </View>
      </div>

      <div className={lanes} style={{ marginTop: 36 }}>
        <View>
          <LaneHeader
            title=<Trans>Savings goals</Trans>
            note={
              plan &&
              t('{{amount}} saved', {
                amount: dollars(plan.goals.reduce((s, g) => s + g.current, 0)),
              })
            }
          />
          <PlanCard plan={plan}>
            {plan?.goals.map((g, i) => {
              const late = !!g.by && (!g.date || g.date > g.by);
              return (
                <Progress
                  key={g.name}
                  first={i === 0}
                  name={g.name}
                  balance={dollars(g.current)}
                  percent={(g.current / g.target) * 100}
                  fill={late ? theme.warningBorder : theme.reportsChartFill}
                  detail={
                    <>
                      {t('{{have}} of {{target}}', {
                        have: dollars(g.current),
                        target: dollars(g.target),
                      })}
                      {' · '}
                      {g.monthly
                        ? t('{{amount}}/mo', { amount: dollars(g.monthly) })
                        : t('from leftover')}
                      {g.monthly ? (
                        <Pct value={g.monthly * 100} income={income} tight />
                      ) : null}
                    </>
                  }
                  outcome={
                    g.current >= g.target
                      ? t('Reached')
                      : g.date
                        ? t('Reaches {{date}}', { date: monthYear(g.date) })
                        : t('Not in the next 4 years')
                  }
                  outcomeNote={
                    late && g.by
                      ? t('needed {{date}}', { date: shortDate(g.by) })
                      : undefined
                  }
                  tone={late ? 'warning' : 'positive'}
                />
              );
            })}
          </PlanCard>
        </View>
        <View>
          <LaneHeader
            title=<Trans>Debt</Trans>
            note={
              plan &&
              t('{{amount}} owed · estimated', {
                amount: dollars(plan.debts.reduce((s, d) => s + d.current, 0)),
              })
            }
          />
          <PlanCard plan={plan}>
            {plan?.debts.map((d, i) => (
              <Progress
                key={d.name}
                first={i === 0}
                name={d.name}
                balance={dollars(d.current)}
                percent={((d.start - d.current) / d.start) * 100}
                fill={theme.reportsChartFill}
                detail={
                  <>
                    {t('{{amount}} paid down since {{date}}', {
                      amount: dollars(d.start - d.current),
                      date: shortDate(d.asOf),
                    })}
                    {` · ${d.apr}% · `}
                    {t('{{amount}}/mo', { amount: dollars(d.monthly) })}
                    <Pct value={d.monthly * 100} income={income} tight />
                  </>
                }
                outcome={
                  d.date
                    ? t('Paid off {{date}}', { date: monthYear(d.date) })
                    : t('Not in the next 4 years')
                }
                tone={d.date ? 'positive' : 'neutral'}
              />
            ))}
          </PlanCard>
          {plan && (
            <Text
              style={{
                fontSize: 14,
                color: theme.pageTextSubdued,
                marginTop: 8,
              }}
            >
              <Trans>
                Spare money goes to the top debt first. Balances are estimated
                from the last statement entered in the plan.
              </Trans>
            </Text>
          )}
        </View>
      </div>
    </View>
  );
}

function PlanCard({
  plan,
  children,
}: {
  plan: PlanSummary | null | undefined;
  children: ReactNode;
}) {
  return (
    <View style={{ ...card, padding: '4px 20px' }}>
      {plan ? (
        children
      ) : (
        <Text style={{ padding: '14px 0', color: theme.pageTextSubdued }}>
          {plan === undefined ? (
            <Trans>Loading the Money Plan…</Trans>
          ) : (
            <Trans>
              The Money Plan isn't reachable. It comes from the companion
              service; open the receipts link once on this device, or check that
              the companion is running.
            </Trans>
          )}
        </Text>
      )}
    </View>
  );
}

function Progress({
  first,
  name,
  balance,
  percent,
  fill,
  detail,
  outcome,
  outcomeNote,
  tone,
}: {
  first: boolean;
  name: string;
  balance: string;
  percent: number;
  fill: string;
  detail: ReactNode;
  outcome: string;
  outcomeNote?: string;
  tone: Tone;
}) {
  const ink =
    tone === 'warning'
      ? theme.warningText
      : tone === 'positive'
        ? theme.noticeText
        : theme.pageTextSubdued;
  return (
    <View
      style={{
        padding: '14px 0',
        borderTop: first ? 'none' : `1px solid ${theme.tableBorder}`,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: 500 }}>{name}</Text>
        <Text
          style={{
            ...sectionLabel,
            ...styles.tnum,
            fontSize: 19,
            color: theme.pageText,
          }}
        >
          {balance}
        </Text>
      </View>
      <Meter
        percent={Math.max(percent, percent > 0 ? 2 : 0)}
        color={fill}
        height={10}
        style={{ margin: '8px 0 6px', flex: 'none' }}
      />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '2px 12px',
        }}
      >
        <Text
          style={{ ...styles.tnum, fontSize: 13, color: theme.pageTextSubdued }}
        >
          {detail}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          {outcome}
          {outcomeNote ? ` · ${outcomeNote}` : ''}
        </Text>
      </View>
    </View>
  );
}
