// Fork: everyday spending since the last paycheck, beside the payday routine
// for the next one. Bills come first; spending money is what they leave, so
// nothing here is "over" — it's what went out, and the weekly budget is the
// goal the plan works toward.
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

import { usd } from './moneyPlan';
import type { PlanSummary } from './moneyPlan';

const split = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 20,
  alignItems: 'start',
  '@media (max-width: 760px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

const card = {
  backgroundColor: theme.cardBackground,
  borderRadius: 16,
  padding: 22,
};

export function SpendingMoney({ plan }: { plan: PlanSummary }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: { list = [] } = {} } = useCategories();
  const spending = plan.spending;
  const routine = plan.routine;
  const today = monthUtils.currentDay();
  const fmt = (d: string, f: string) => monthUtils.format(d, f, locale);

  const cats = (spending?.categories ?? [])
    .map(n => list.find(c => c.name === n))
    .filter(c => !!c);
  const idKey = cats.map(c => c.id).join();
  const since = spending?.lastPayday ?? monthUtils.firstDayOfMonth(today);

  const { data: rows } = useQuery<{ category: string; amount: number }>(
    () =>
      idKey
        ? q('transactions')
            .filter({
              category: { $oneof: idKey.split(',') },
              date: { $gte: since, $lte: today },
            })
            .options({ splits: 'inline' })
            .groupBy('category')
            .select(['category', { amount: { $sum: '$amount' } }])
        : null,
    [idKey, since, today],
  );
  const spentBy = new Map((rows ?? []).map(r => [r.category, -r.amount / 100]));
  const spent = [...spentBy.values()].reduce((s, v) => s + v, 0);
  const perWeek = routine?.perWeek ?? spending?.perWeek ?? 0;
  const next = routine?.splits.find(s => s.date > today);
  const after = routine?.splits.find(s => next && s.date > next.date);

  return (
    <div className={split}>
      <View style={card}>
        <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
          {t('Everyday spending since {{date}}', {
            date: fmt(since, 'EEEE, MMM d'),
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
          {usd(spent)}
        </Text>
        {cats
          .filter(c => (spentBy.get(c.id) ?? 0) !== 0)
          .sort((a, b) => (spentBy.get(b.id) ?? 0) - (spentBy.get(a.id) ?? 0))
          .map((c, i) => (
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
              <Text style={{ ...styles.tnum, fontSize: 15 }}>
                {usd(spentBy.get(c.id) ?? 0)}
              </Text>
            </View>
          ))}
        <Text
          style={{ fontSize: 13, color: theme.pageTextSubdued, marginTop: 10 }}
        >
          {t(
            'The goal to work toward: {{week}} a week for groceries, gas, homeschool, sports and the rest, once the bills are caught up.',
            { week: usd(perWeek) },
          )}
        </Text>
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
                t('Bills it cannot cover, from what is in checking'),
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
              [
                after
                  ? t('Spending money until {{date}}', {
                      date: fmt(after.date, 'MMM d'),
                    })
                  : t('Spending money'),
                next.spending,
                t(
                  'What the bills leave, plus whatever you do not spend before then',
                ),
              ],
              [t('Move to savings for goals'), next.toSavings, null],
              [
                t('Extra to {{debt}}', { debt: plan.snowball ?? t('debt') }),
                next.extraDebt,
                null,
              ],
              [t('Leave in checking'), next.keep, null],
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
              Bills come first. Your phone gets these moves the evening before
              each payday.
            </Trans>
          </Text>
        </View>
      )}
    </div>
  );
}
