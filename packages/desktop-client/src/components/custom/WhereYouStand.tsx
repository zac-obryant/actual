// Fork: the one answer to "where are we with money?" Cash in the bank today,
// less everything the plan pays before the next paycheck, is what's free.
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

export function WhereYouStand({ plan }: { plan: PlanSummary }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const s = plan.standing;
  if (!s) {
    return null;
  }
  const fmt = (d: string) => monthUtils.format(d, 'EEE, MMM d', locale);
  const short = s.free < 0;

  return (
    <View
      style={{
        backgroundColor: theme.cardBackground,
        borderRadius: 16,
        padding: 22,
        marginBottom: 24,
      }}
    >
      <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
        <Trans>Where you stand today</Trans>
      </Text>
      <HeroNumber color={short ? theme.errorText : theme.pageText}>
        {short
          ? t('{{amount}} short', { amount: usd(-s.free) })
          : t('{{amount}} free', { amount: usd(s.free) })}
      </HeroNumber>
      <Text
        style={{
          ...styles.tnum,
          fontSize: 15,
          color: theme.pageTextSubdued,
          marginTop: 6,
        }}
      >
        {t(
          '{{cash}} in the bank now, minus {{owed}} to pay before the {{date}} paycheck ({{name}} +{{amount}}).',
          {
            cash: usd(s.cash),
            owed: usd(s.owed),
            date: fmt(s.next.date),
            name: s.next.name,
            amount: usd(s.next.amount),
          },
        )}{' '}
        {s.nextShort > 0
          ? t(
              'That paycheck is also {{short}} short of its own bills, and that comes out of what you have now too.',
              { short: usd(s.nextShort) },
            )
          : null}{' '}
        {short
          ? t(
              'There is no money for food until then without cutting the family spending money on the {{date}} paycheck by {{amount}}.',
              { date: fmt(s.next.date), amount: usd(-s.free) },
            )
          : t('What is left is what food and everything else has until then.')}
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
