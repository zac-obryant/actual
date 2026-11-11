// Fork: the payday check-in. New transactions without a category, one card at
// a time: the category this payee had last time is picked already, so most
// cards are one tap. Skipped cards come back next time.
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';

import { useCategories } from '#hooks/useCategories';
import { useLocale } from '#hooks/useLocale';
import { useQuery } from '#hooks/useQuery';
import * as queries from '#queries';

import { usd } from './moneyPlan';

/** How far back the check-in looks; older stragglers belong to the register. */
const LOOKBACK_DAYS = 60;

type Waiting = {
  id: string;
  date: string;
  amount: number;
  payee: string | null;
  payeeName: string | null;
  imported_payee: string | null;
  accountName: string;
};

/** Uncategorized spending from the last couple of months, newest first. */
export function useWaiting() {
  const since = monthUtils.subDays(monthUtils.currentDay(), LOOKBACK_DAYS);
  const { data } = useQuery<Waiting>(
    () =>
      queries
        .uncategorizedTransactions()
        .filter({ date: { $gte: since }, is_parent: false })
        .options({ splits: 'inline' })
        .orderBy({ date: 'desc' })
        .select([
          'id',
          'date',
          'amount',
          'payee',
          { payeeName: 'payee.name' },
          'imported_payee',
          { accountName: 'account.name' },
        ]),
    [since],
  );
  return data ?? [];
}

export function CheckIn({
  waiting,
  quick,
  onDone,
}: {
  waiting: readonly Waiting[];
  /** Category names offered as one-tap chips after the suggestion. */
  quick: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: { grouped = [], list = [] } = {} } = useCategories();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [total] = useState(waiting.length);
  const [choice, setChoice] = useState<string | null>(null);
  const card = waiting.find(w => !skipped.includes(w.id));

  // what this payee was filed under last time
  const { data: last } = useQuery<{ category: string }>(
    () =>
      card?.payee
        ? q('transactions')
            .filter({ payee: card.payee, category: { $ne: null } })
            .orderBy({ date: 'desc' })
            .limit(1)
            .select(['category'])
        : null,
    [card?.payee],
  );
  // a query with no payee keeps its last answer; don't carry it to this card
  const suggested = card?.payee ? (last?.[0]?.category ?? null) : null;
  const picked = choice ?? suggested;
  const byName = new Map(list.map(c => [c.name, c.id]));
  const nameOf = (id: string | null) => list.find(c => c.id === id)?.name;
  const chips = [
    ...(suggested ? [suggested] : []),
    ...quick.map(n => byName.get(n)).filter((id): id is string => !!id),
  ]
    .filter((id, i, all) => all.indexOf(id) === i)
    .slice(0, 4);

  if (!card) {
    return (
      <View style={panel}>
        <Text
          style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.025em' }}
        >
          {skipped.length ? (
            <Trans>That's everything for now.</Trans>
          ) : (
            <Trans>Everything has a category.</Trans>
          )}
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: 14 }}>
          <Button variant="primary" onPress={onDone}>
            <Trans>Close</Trans>
          </Button>
        </View>
      </View>
    );
  }

  const done = total - waiting.length + skipped.length;
  const confirm = async () => {
    if (!picked) return;
    await send('transactions-batch-update', {
      updated: [{ id: card.id, category: picked }],
    });
    setChoice(null);
  };

  return (
    <View style={panel} aria-label={t('Check-in')}>
      <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
        {t('{{n}} of {{total}} · {{date}} · {{account}}', {
          n: Math.min(done + 1, total),
          total,
          date: monthUtils.format(card.date, 'MMM d', locale),
          account: card.accountName,
        })}
      </Text>
      <Text
        style={{
          ...styles.tnum,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          margin: '8px 0 4px',
        }}
      >
        {card.payeeName || card.imported_payee || t('Unknown payee')} ·{' '}
        <span style={{ color: card.amount > 0 ? theme.noticeText : undefined }}>
          {usd(card.amount / 100, true)}
        </span>
      </Text>
      <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
        {suggested
          ? t('Last time this was {{name}}', { name: nameOf(suggested) })
          : t('New payee, pick a category')}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          margin: '16px 0',
        }}
      >
        {chips.map(id => (
          <Button
            key={id}
            variant={id === picked ? 'primary' : 'normal'}
            onPress={() => setChoice(id)}
          >
            {nameOf(id)}
          </Button>
        ))}
        <Select
          aria-label={t('Another category')}
          value={picked && !chips.includes(picked) ? picked : ''}
          defaultLabel={t('Other…')}
          onChange={setChoice}
          options={grouped
            .filter(g => !g.hidden)
            .flatMap(g =>
              (g.categories ?? [])
                .filter(c => !c.hidden)
                .map(c => [c.id, c.name] as const),
            )}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Button
          variant="primary"
          isDisabled={!picked}
          onPress={() => void confirm()}
        >
          <Trans>Confirm</Trans>
        </Button>
        <Button
          variant="bare"
          onPress={() => {
            setChoice(null);
            setSkipped(s => [...s, card.id]);
          }}
        >
          <Trans>Skip</Trans>
        </Button>
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 14 }}>
        {Array.from({ length: Math.min(total, 24) }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i < done ? theme.pageText : theme.surfaceSunken,
            }}
          />
        ))}
      </View>
    </View>
  );
}

const panel = {
  backgroundColor: theme.cardBackground,
  borderRadius: 16,
  padding: 24,
  marginTop: 22,
  maxWidth: 520,
};
