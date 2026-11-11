// Fork: the top of All accounts. Cash on hand is the figure, the Money Plan's
// projection is the line under it, and each account is a tile with its last
// few transactions. Bank sync status and the payday check-in sit by the figure.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type { AccountEntity } from '@actual-app/core/types/models';
import { css } from '@emotion/css';

import { PrivacyFilter } from '#components/PrivacyFilter';
import { useAccounts } from '#hooks/useAccounts';
import { useLocale } from '#hooks/useLocale';
import { useNavigate } from '#hooks/useNavigate';
import { useQuery } from '#hooks/useQuery';
import { useSheetValue } from '#hooks/useSheetValue';
import * as bindings from '#spreadsheet/bindings';

import { CashLine } from './CashLine';
import { CheckIn, useWaiting } from './CheckIn';
import { lowPoint, usd, usePlan } from './moneyPlan';
import { HeroNumber } from './primitives';

const tiles = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 12,
  marginTop: 22,
});

export function AccountsOverview({ action }: { action?: ReactNode }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const plan = usePlan();
  const { data: accounts = [] } = useAccounts();
  const waiting = useWaiting();
  const [checkingIn, setCheckingIn] = useState(false);

  const open = accounts.filter(a => !a.closed);
  const named = plan?.cashAccounts;
  const cashNames =
    named && open.some(a => named.includes(a.name)) ? named : undefined;
  // without the plan, every on-budget account counts as cash
  const isCash = (a: AccountEntity) =>
    cashNames ? cashNames.includes(a.name) : !a.offbudget;
  const cashIds = open.filter(isCash).map(a => a.id);
  const cashKey = cashIds.join();

  const { data: sumRows } = useQuery<{ amount: number | null }>(
    () =>
      cashKey
        ? q('transactions')
            .filter({ account: { $oneof: cashKey.split(',') } })
            .options({ splits: 'none' })
            .select([{ amount: { $sum: '$amount' } }])
        : null,
    [cashKey],
  );
  const cash = (sumRows?.[0]?.amount ?? 0) / 100;

  const lastSync = open
    .filter(isCash)
    .map(a => Number(a.last_sync) || 0)
    .reduce((m, v) => Math.max(m, v), 0);

  const days = plan?.days ?? [];
  const lp = lowPoint(days);
  const short = (d: string) => monthUtils.format(d, 'MMM d', locale);

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <View style={{ gap: 6, minWidth: 0 }}>
          <PrivacyFilter>
            <HeroNumber color={cash < 0 ? theme.errorText : theme.pageText}>
              {usd(cash, true)}
            </HeroNumber>
          </PrivacyFilter>
          <Text
            style={{
              ...styles.tnum,
              fontSize: 15,
              color: theme.pageTextSubdued,
            }}
          >
            {lp ? (
              <>
                {t('cash on hand · lowest')}{' '}
                <b style={{ color: theme.warningText }}>{usd(lp.low.bal)}</b>{' '}
                {t('on {{date}}', { date: short(lp.low.date) })}
                {lp.nextPay && (
                  <>
                    {', '}
                    {t('then')}{' '}
                    <span style={{ color: theme.noticeText }}>
                      +{usd(lp.nextPay.amount)}
                    </span>{' '}
                    {t('on {{date}}', { date: short(lp.nextPay.date) })}
                  </>
                )}
              </>
            ) : (
              t('cash on hand')
            )}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <SyncChip lastSync={lastSync} />
          {waiting.length > 0 && (
            <Button variant="primary" onPress={() => setCheckingIn(c => !c)}>
              {t('Check in · {{n}} new', { n: waiting.length })}
            </Button>
          )}
          {action}
        </View>
      </View>

      {checkingIn && (
        <CheckIn
          waiting={waiting}
          quick={plan?.everyday ?? []}
          onDone={() => setCheckingIn(false)}
        />
      )}

      {days.length > 1 && (
        <View style={{ marginTop: 14, flexShrink: 0 }}>
          <CashLine days={days} height={170} />
        </View>
      )}

      <div className={tiles}>
        {[...open.filter(isCash), ...open.filter(a => !isCash(a))].map(a => (
          <AccountTile key={a.id} account={a} setAside={!isCash(a)} />
        ))}
      </div>
    </View>
  );
}

function SyncChip({ lastSync }: { lastSync: number }) {
  const { t } = useTranslation();
  const when = lastSync
    ? new Date(lastSync).toLocaleString(undefined, {
        weekday: Date.now() - lastSync > 864e5 ? 'short' : undefined,
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  return (
    <Text
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        padding: '4px 11px',
        fontSize: 13,
        fontWeight: 600,
        backgroundColor: theme.surfaceSunken,
        color: theme.pageTextSubdued,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 99,
          backgroundColor: when ? theme.reportsChartFill : theme.warningBorder,
        }}
      />
      {when ? t('Synced {{when}}', { when }) : t('Bank sync not set up')}
    </Text>
  );
}

type RecentRow = {
  id: string;
  amount: number;
  payeeName: string | null;
  imported_payee: string | null;
};

function AccountTile({
  account,
  setAside,
}: {
  account: AccountEntity;
  setAside: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const balance =
    useSheetValue<'account', 'balance'>(bindings.accountBalance(account.id)) ??
    0;
  const { data } = useQuery<RecentRow>(
    () =>
      q('transactions')
        .filter({ account: account.id, is_parent: false })
        .options({ splits: 'inline' })
        .orderBy([{ date: 'desc' }, { sort_order: 'desc' }])
        .limit(3)
        .select([
          'id',
          'amount',
          { payeeName: 'payee.name' },
          'imported_payee',
        ]),
    [account.id],
  );
  const recent = data ?? [];
  if (!balance && !recent.length) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/accounts/${account.id}`)}
      className={css({
        all: 'unset',
        cursor: 'pointer',
        backgroundColor: theme.cardBackground,
        borderRadius: 12,
        padding: 18,
        minWidth: 0,
        transition: 'background-color .15s',
        ':hover': { backgroundColor: theme.surfaceSunken },
        ':focus-visible': {
          outline: `2px solid ${theme.formInputBorderSelected}`,
          outlineOffset: 2,
        },
      })}
    >
      <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
        {setAside
          ? t('{{name}} · set aside', { name: account.name })
          : account.name}
      </Text>
      <PrivacyFilter>
        <Text
          style={{
            ...styles.tnum,
            display: 'block',
            fontSize: 30,
            fontWeight: 560,
            letterSpacing: '-0.032em',
            margin: '4px 0 10px',
            color: balance < 0 ? theme.errorText : theme.pageText,
          }}
        >
          {usd(balance / 100, true)}
        </Text>
      </PrivacyFilter>
      {recent.map(r => (
        <View
          key={r.id}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 10,
            padding: '3px 0',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: theme.pageTextSubdued,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {r.payeeName || r.imported_payee || <Trans>No payee</Trans>}
          </Text>
          <Text
            style={{
              ...styles.tnum,
              fontSize: 13,
              color: r.amount > 0 ? theme.noticeText : theme.pageTextSubdued,
              whiteSpace: 'nowrap',
            }}
          >
            {usd(r.amount / 100, true)}
          </Text>
        </View>
      ))}
    </button>
  );
}
