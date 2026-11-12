// Fork: the one answer to "where are we with money?" Cash in the bank today,
// less the bills before the next paycheck, is what there is to spend until then.
// It moves with every purchase: spend $150 and it's $150 less.
import { Trans, useTranslation } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { useLocale } from '#hooks/useLocale';

import { usd } from './moneyPlan';
import type { PlanSummary } from './moneyPlan';
import { HeroNumber } from './primitives';

export function WhereYouStand({
  plan,
  compact = false,
}: {
  plan: PlanSummary;
  /** just the number and one line, for the calendar */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const s = plan.standing;
  if (!s) {
    return null;
  }
  const fmt = (d: string) => monthUtils.format(d, 'EEE, MMM d', locale);
  const short = s.free < 0;
  const nextSplit = plan.routine?.splits.find(sp => sp.date === s.next.date);
  const after = plan.routine?.splits.find(sp => sp.date > s.next.date);
  const hero = (
    <>
      <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
        {t('To spend until {{date}}', { date: fmt(s.next.date) })}
      </Text>
      <HeroNumber color={short ? theme.errorText : theme.pageText}>
        {short ? t('{{amount}} short', { amount: usd(-s.free) }) : usd(s.free)}
      </HeroNumber>
    </>
  );
  if (compact) {
    return (
      <View style={{ marginBottom: 28 }}>
        {hero}
        <Text
          style={{
            ...styles.tnum,
            fontSize: 15,
            color: theme.pageTextSubdued,
            marginTop: 6,
          }}
        >
          {t(
            'Money in the bank minus the bills before then. The calendar takes out bills only, so what you spend comes off when you spend it.',
          )}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: theme.cardBackground,
        borderRadius: 16,
        padding: 22,
        marginBottom: 24,
      }}
    >
      {hero}
      <Text
        style={{
          ...styles.tnum,
          fontSize: 15,
          color: theme.pageTextSubdued,
          marginTop: 6,
        }}
      >
        {t('{{cash}} in the bank now, minus {{owed}} of bills before then.', {
          cash: usd(s.cash),
          owed: usd(s.owed),
        })}{' '}
        {s.nextShort > 0
          ? t(
              'Also minus {{short}}: the bills that paycheck cannot cover by itself.',
              { short: usd(s.nextShort) },
            )
          : null}{' '}
        {short
          ? t(
              'Something has to wait or move until the paycheck. Tap a bill below to pay it on another day.',
            )
          : t(
              'Every purchase comes off this number. Whatever you do not spend carries into the next stretch.',
            )}
        {nextSplit && after && !short
          ? ` ${t('After the {{date}} paycheck pays its bills, it adds about {{amount}} to spend until {{until}}.', { date: fmt(s.next.date), amount: usd(nextSplit.spending), until: fmt(after.date) })}`
          : null}
      </Text>
      <View style={{ marginTop: 12 }}>
        {s.bills.map((b, i) => (
          <View
            key={b.name + b.on}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 12,
              padding: '8px 0',
              borderTop: i ? `1px solid ${theme.tableBorder}` : 'none',
            }}
          >
            <Text style={{ fontSize: 15 }}>
              {fmt(b.on)} · {b.name}
              {b.due < b.on && (
                <Text
                  style={{
                    fontSize: 13,
                    color: b.late ? theme.errorText : theme.warningText,
                  }}
                >
                  {' '}
                  {b.late
                    ? t('(was due {{due}}, late fee)', {
                        due: monthUtils.format(b.due, 'MMM d', locale),
                      })
                    : t('(was due {{due}})', {
                        due: monthUtils.format(b.due, 'MMM d', locale),
                      })}
                </Text>
              )}
            </Text>
            <Text style={{ ...styles.tnum, fontSize: 15, fontWeight: 600 }}>
              {usd(b.amount)}
            </Text>
          </View>
        ))}
      </View>
      <Text
        style={{ fontSize: 13, color: theme.pageTextSubdued, marginTop: 8 }}
      >
        <Trans>
          Something coming up that is not a monthly bill? Add it in the account
          with its future date and the plan works it in.
        </Trans>
      </Text>
    </View>
  );
}
