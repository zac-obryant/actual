// Fork: family spending money. The everyday categories' plan as one weekly
// number, with weeks that start on payday, tracked live against what's been
// spent; and beside it the payday routine for the next paycheck — the moves to
// make when it lands, the same every time.
import { Trans, useTranslation } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import { css } from '@emotion/css';

import { useCategories } from '#hooks/useCategories';
import { useLocale } from '#hooks/useLocale';
import { useQuery } from '#hooks/useQuery';

import { cell, useCells } from './EnvelopeRowParts';
import { usd } from './moneyPlan';
import type { PlanSummary } from './moneyPlan';
import { HeroNumber, Meter } from './primitives';

const split = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
  gap: 20,
  alignItems: 'start',
  '@media (max-width: 760px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

const card = {
  backgroundColor: theme.cardBackground,
  borderRadius: 16,
  padding: 22,
};

export function SpendingMoney({
  plan,
  compact = false,
}: {
  plan: PlanSummary;
  /** just the week's number and meter, for the calendar */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: { list = [] } = {} } = useCategories();
  const spending = plan.spending;
  const routine = plan.routine;
  const today = monthUtils.currentDay();
  const month = monthUtils.currentMonth();

  const cats = (spending?.categories ?? [])
    .map(n => list.find(c => c.name === n))
    .filter(c => !!c);
  const ids = cats.map(c => c.id);
  const idKey = ids.join();

  // weeks start on payday: Nov 4, 11, 18…
  const anchor = spending?.lastPayday ?? today;
  const weekStart = monthUtils.addDays(
    anchor,
    Math.floor(monthUtils.differenceInCalendarDays(today, anchor) / 7) * 7,
  );
  const weekEnd = monthUtils.addDays(weekStart, 6);

  const { data: rows } = useQuery<{ category: string; amount: number }>(
    () =>
      idKey
        ? q('transactions')
            .filter({
              category: { $oneof: idKey.split(',') },
              date: { $gte: weekStart, $lte: weekEnd },
            })
            .options({ splits: 'inline' })
            .groupBy('category')
            .select(['category', { amount: { $sum: '$amount' } }])
        : null,
    [idKey, weekStart, weekEnd],
  );
  const spentBy = new Map((rows ?? []).map(r => [r.category, -r.amount / 100]));
  const spent = [...spentBy.values()].reduce((s, v) => s + v, 0);

  // each category's weekly share, from this month's planned amount
  const cells = useCells(ids.map(id => cell(month, `budget-${id}`)));
  const weekly = (id: string) =>
    ((cells[cell(month, `budget-${id}`)] ?? 0) / 100) * (12 / 52);

  // a week the bank can't fund only gets what's actually free until the next paycheck
  const standing = plan.standing;
  const planned = routine?.perWeek ?? spending?.perWeek ?? 0;
  const perWeek =
    standing && weekStart < standing.next.date
      ? Math.min(planned, spent + Math.max(0, standing.free))
      : planned;
  const left = perWeek - spent;
  const fmt = (d: string, f: string) => monthUtils.format(d, f, locale);
  const next = routine?.splits.find(s => s.date > today);
  const startsOn = fmt(monthUtils.addDays(weekEnd, 1), 'EEEE');
  const covers =
    cats
      .slice(0, 5)
      .map(c => c.name)
      .join(', ') + (cats.length > 5 ? '…' : '');

  const week = (
    <View>
      <HeroNumber color={left < 0 ? theme.errorText : theme.pageText}>
        {left < 0
          ? t('{{amount}} over', { amount: usd(-left) })
          : t('{{amount}} left', { amount: usd(left) })}
      </HeroNumber>
      <Text
        style={{
          ...styles.tnum,
          fontSize: 15,
          color: theme.pageTextSubdued,
          marginTop: 6,
        }}
      >
        {t('This week, {{from}} – {{to}}', {
          from: fmt(weekStart, 'MMM d'),
          to: fmt(weekEnd, 'MMM d'),
        })}
        {': '}
        {perWeek < planned
          ? t(
              '{{week}} for {{covers}}. The usual {{planned}} a week is not in the bank until the paycheck.',
              { week: usd(perWeek), covers, planned: usd(planned) },
            )
          : t('{{week}} for {{covers}}. A fresh {{week}} starts {{day}}.', {
              week: usd(perWeek),
              covers,
              day: startsOn,
            })}
      </Text>
      <Meter
        percent={perWeek ? (spent / perWeek) * 100 : 0}
        color={
          left < 0
            ? theme.errorBorder
            : spent / (perWeek || 1) > 0.85
              ? theme.warningBorder
              : theme.reportsChartFill
        }
        height={10}
        style={{ flex: 'none', margin: '14px 0 16px' }}
      />
    </View>
  );
  if (compact) {
    return week;
  }

  return (
    <div className={split}>
      <View>
        {week}
        <View style={{ ...card, padding: '6px 20px' }}>
          {cats.map((c, i) => {
            const share = weekly(c.id);
            const used = spentBy.get(c.id) ?? 0;
            return (
              <View
                key={c.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '9px 0',
                  borderTop: i ? `1px solid ${theme.tableBorder}` : 'none',
                }}
              >
                <Text style={{ fontSize: 15 }}>{c.name}</Text>
                <Text
                  style={{
                    ...styles.tnum,
                    fontSize: 14,
                    color:
                      used > share && share > 0
                        ? theme.errorText
                        : theme.pageTextSubdued,
                  }}
                >
                  {t('{{spent}} of {{share}}', {
                    spent: usd(used),
                    share: usd(share),
                  })}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {next && (
        <View style={card}>
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
            {t('When the {{date}} paycheck lands', {
              date: fmt(next.date, 'EEEE, MMM d'),
            })}
          </Text>
          <Text
            style={{
              ...styles.tnum,
              fontSize: 30,
              fontWeight: 560,
              letterSpacing: '-0.032em',
              margin: '4px 0 12px',
            }}
          >
            {next.name}{' '}
            <span style={{ color: theme.noticeText }}>+{usd(next.amount)}</span>
          </Text>
          {(
            [
              [t('Tithe'), next.tithe, null],
              [
                t('Family spending, {{weeks}} weeks', { weeks: next.weeks }),
                next.spending,
                null,
              ],
              [
                t('Move to {{account}}', {
                  account: plan.billsAccount ?? t('the bills account'),
                }),
                next.toBills,
                next.bills
                  .map(b =>
                    b.late ? t('{{name}} (late)', { name: b.name }) : b.name,
                  )
                  .join(', '),
              ],
              [
                t('Of that, from what is already in checking'),
                next.fromChecking,
                null,
              ],
              ...(next.planned ?? []).map(
                b =>
                  [
                    b.name,
                    b.amount,
                    t('Paid from checking on {{date}}', {
                      date: fmt(b.on, 'MMM d'),
                    }),
                  ] as [string, number, string | null],
              ),
              [t('Move to savings for goals'), next.toSavings, null],
              [
                t('Extra to {{debt}}', { debt: plan.snowball ?? t('debt') }),
                next.extraDebt,
                null,
              ],
              [t('Leave in checking as a cushion'), next.keep, null],
            ] as [string, number, string | null][]
          )
            .filter(([, v]) => v > 0)
            .map(([name, v, note], i) => (
              <View
                key={name}
                style={{
                  padding: '9px 0',
                  borderTop: i ? `1px solid ${theme.tableBorder}` : 'none',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{name}</Text>
                  <Text
                    style={{ ...styles.tnum, fontSize: 15, fontWeight: 600 }}
                  >
                    {usd(v)}
                  </Text>
                </View>
                {note && (
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.pageTextSubdued,
                      marginTop: 2,
                    }}
                  >
                    {note}
                  </Text>
                )}
              </View>
            ))}
          {routine && routine.billsLow.bal < 0 && (
            <Text
              style={{ fontSize: 13, color: theme.errorText, marginTop: 10 }}
            >
              {t(
                '{{account}} runs {{amount}} short on {{date}}. Move that much from checking before then.',
                {
                  account: plan.billsAccount ?? t('the bills account'),
                  amount: usd(-routine.billsLow.bal),
                  date: fmt(routine.billsLow.date, 'MMM d'),
                },
              )}
            </Text>
          )}
          <Text
            style={{ fontSize: 13, color: theme.pageTextSubdued, marginTop: 6 }}
          >
            <Trans>
              The bills account gets just what the bills before the next payday
              need. Your phone gets these moves the evening before each payday.
            </Trans>
          </Text>
        </View>
      )}
    </div>
  );
}
