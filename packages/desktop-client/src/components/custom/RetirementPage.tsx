// Fork: the Retirement tab. What the IRA is worth, how it has moved, and what it
// is made of. Holdings come from Fidelity through SimpleFIN (via the sync
// server's /simplefin/holdings), daily prices from the server too; the
// arithmetic is in iraMath.ts.
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type { AccountEntity } from '@actual-app/core/types/models';

import { Page } from '#components/Page';
import { useOffBudgetAccounts } from '#hooks/useOffBudgetAccounts';
import { useQuery } from '#hooks/useQuery';

import { isIra, portfolio } from './iraMath';
import type { Fund, Holdings, Range } from './iraMath';
import {
  Delta,
  Direction,
  Finding,
  instrumentPage,
  Meter,
  NoticeBar,
  PageHero,
  PillTabs,
  ScrubChart,
  SectionHeader,
  Sparkline,
} from './primitives';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const pct = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const shareFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

function dayLabel(date: string, withYear = false) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear && { year: 'numeric' }),
  });
}

function timeLabel(epochSeconds: number) {
  return new Date(epochSeconds * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The off-budget account that holds the IRA. */
function useIraAccount(): AccountEntity | undefined {
  const { data: offBudget = [] } = useOffBudgetAccounts();
  // ponytail: one IRA; a picker when there is a second investment account
  return offBudget.find(isIra);
}

type Load =
  | { state: 'loading' }
  | { state: 'error'; reason: string }
  | { state: 'ready'; data: Holdings };

function useHoldings(accountId: string | null | undefined): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  useEffect(() => {
    if (!accountId) return;
    let live = true;
    void (async () => {
      try {
        const [server, token] = await Promise.all([
          send('get-server-url'),
          send('fork-user-token'),
        ]);
        const r = await fetch(`${server ?? ''}/simplefin/holdings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ACTUAL-TOKEN': token ?? '',
          },
          body: JSON.stringify({ accountId }),
        });
        const body = await r.json();
        const data = body?.data;
        if (!live) return;
        if (!data || data.error_code) {
          setLoad({
            state: 'error',
            reason: data?.reason ?? 'Fidelity did not send this account.',
          });
        } else {
          setLoad({ state: 'ready', data });
        }
      } catch {
        if (live) {
          setLoad({
            state: 'error',
            reason: 'The budget server is not reachable.',
          });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [accountId]);
  return load;
}

const RANGES: ReadonlyArray<{ value: Range; label: string }> = [
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1Y' },
];

export function RetirementPage() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const account = useIraAccount();
  const load = useHoldings(account?.account_id);
  const [range, setRange] = useState<Range>('1M');
  const [scrub, setScrub] = useState<number | null>(null);
  const today = monthUtils.currentDay();

  const period = {
    '1W': t('past week'),
    '1M': t('past month'),
    '3M': t('past 3 months'),
    YTD: t('this year'),
    '1Y': t('past year'),
  }[range];

  return (
    <Page header={isNarrowWidth ? t('Retirement') : null} padding={0}>
      <View
        style={{
          ...instrumentPage,
          ...(isNarrowWidth && { padding: '16px 16px 40px' }),
          maxWidth: 1120,
          width: '100%',
          alignSelf: 'center',
          flexShrink: 0,
        }}
      >
        {!account ? (
          <NoticeBar
            title={<Trans>No IRA is linked</Trans>}
            detail={
              <Trans>
                Link the Fidelity IRA in Bank Sync and keep it off budget. This
                page fills in on its own.
              </Trans>
            }
          />
        ) : load.state === 'error' ? (
          <NoticeBar
            tone="negative"
            title={<Trans>The IRA can't be shown right now</Trans>}
            detail={load.reason}
          />
        ) : load.state === 'loading' ? (
          <PageHero
            label={account.name}
            figure={<span style={{ opacity: 0.35 }}>$—</span>}
          >
            <Text style={{ color: theme.pageTextSubdued, fontSize: 15 }}>
              <Trans>Getting today's prices…</Trans>
            </Text>
          </PageHero>
        ) : (
          <Portfolio
            account={account}
            data={load.data}
            range={range}
            setRange={r => {
              setScrub(null);
              setRange(r);
            }}
            scrub={scrub}
            setScrub={setScrub}
            today={today}
            period={period}
            narrow={isNarrowWidth}
          />
        )}
      </View>
    </Page>
  );
}

function Portfolio({
  account,
  data,
  range,
  setRange,
  scrub,
  setScrub,
  today,
  period,
  narrow,
}: {
  account: AccountEntity;
  data: Holdings;
  range: Range;
  setRange: (r: Range) => void;
  scrub: number | null;
  setScrub: (i: number | null) => void;
  today: string;
  period: string;
  narrow: boolean;
}) {
  const { t } = useTranslation();
  const p = portfolio(data, range, today);
  const pts = p.points;
  const first = pts[0]?.value ?? p.value;
  const shownIndex = scrub ?? pts.length - 1;
  const shown = pts[shownIndex]?.value ?? p.value;
  const change = shown - first;
  const rangeUp = p.value - first >= 0;
  const late = p.funds.filter(f => f.listed);

  return (
    <View>
      <PageHero label={account.name} figure={money.format(shown)}>
        <Delta
          up={change >= 0}
          amount={money.format(Math.abs(change))}
          percent={first ? pct.format(Math.abs(change / first)) : undefined}
          period={
            scrub != null && pts[scrub]
              ? t('to {{date}}', { date: dayLabel(pts[scrub].date, true) })
              : period
          }
        />
      </PageHero>

      <ScrubChart
        height={narrow ? 190 : 260}
        points={pts.map(x => ({
          label: `${dayLabel(x.date, true)}: ${money.format(x.value)}`,
          value: x.value,
        }))}
        onScrub={setScrub}
        color={rangeUp ? theme.reportsChartFill : theme.errorBorder}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginTop: 14,
          paddingBottom: 14,
          borderBottom: `1px solid ${theme.tableBorder}`,
        }}
      >
        <PillTabs
          label={t('Time range')}
          options={RANGES}
          value={range}
          onChange={setRange}
        />
        {pts.length ? (
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
            {dayLabel(pts[0].date, true)} –{' '}
            {dayLabel(pts[pts.length - 1].date, true)}
          </Text>
        ) : null}
      </View>

      <Finding style={{ marginTop: 22 }}>
        <Trans
          i18nKey={
            p.gain >= 0
              ? "You paid {{cost}} for what's in this account. It's worth <b>{{gain}}</b> more now, up {{pct}}."
              : "You paid {{cost}} for what's in this account. It's worth <b>{{gain}}</b> less now, down {{pct}}."
          }
          values={{
            cost: money.format(p.cost),
            gain: money.format(Math.abs(p.gain)),
            pct: pct.format(Math.abs(p.gain) / (p.cost || 1)),
          }}
          components={{
            b: (
              <strong
                style={{
                  fontWeight: 650,
                  color: p.gain >= 0 ? theme.noticeText : theme.errorText,
                }}
              />
            ),
          }}
        />
      </Finding>

      <SectionHeader
        label={<Trans>What you own</Trans>}
        total={money.format(p.value)}
      />
      {!narrow ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 20,
            padding: '12px 0 4px',
            fontSize: 13,
            color: theme.pageTextSubdued,
          }}
        >
          <Text style={{ flex: 1 }}>
            <Trans>Fund</Trans>
          </Text>
          <Text style={{ width: 96 }}>{period}</Text>
          <Text style={{ width: 150 }}>
            <Trans>Share of account</Trans>
          </Text>
          <Text style={{ width: 170, textAlign: 'right' }}>
            <Trans>Value · gain since bought</Trans>
          </Text>
        </View>
      ) : null}
      {p.funds.map(f => (
        <FundRow key={f.symbol} fund={f} narrow={narrow} />
      ))}

      <Dividends accountId={account.id} />

      <Text
        style={{
          marginTop: 34,
          fontSize: 13,
          lineHeight: 1.5,
          color: theme.pageTextSubdued,
          maxWidth: '75ch',
        }}
      >
        <Trans>
          Funds and what you paid come from Fidelity (updated{' '}
          {{ fetched: timeLabel(data.fetchedAt / 1000) }}). Prices are daily
          closes, delayed during market hours
        </Trans>
        {p.asOf ? ` (${timeLabel(p.asOf)})` : ''}.{' '}
        <Trans>
          The chart prices the funds you own today on each past day, so it shows
          how they moved, not trades you made.
        </Trans>
        {late.map(f => (
          <span key={f.symbol}>
            {' '}
            <Trans>
              {{ symbol: f.symbol }} started trading{' '}
              {{ date: dayLabel(f.listed!, true) }}, so it's flat before then.
            </Trans>
          </span>
        ))}
      </Text>
    </View>
  );
}

function FundRow({ fund: f, narrow }: { fund: Fund; narrow: boolean }) {
  const cash = !f.closes.length;
  const up = f.gain >= 0;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        padding: '14px 0',
        borderBottom: `1px solid ${theme.tableBorder}`,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: 650,
              letterSpacing: '-0.016em',
              color: theme.pageText,
            }}
          >
            {f.symbol}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: theme.pageTextLight,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {titleCase(f.name)}
          </Text>
        </View>
        <Text
          style={{ ...styles.tnum, fontSize: 13, color: theme.pageTextSubdued }}
        >
          {cash ? (
            <Trans>Cash, where dividends land</Trans>
          ) : (
            <Trans>
              {{ shares: shareFmt.format(f.shares) }} shares at{' '}
              {{ price: money.format(f.price) }} · paid{' '}
              {{ avg: money.format(f.avgCost) }}
            </Trans>
          )}
          {narrow ? ` · ${pct.format(f.share)}` : ''}
        </Text>
      </View>

      {!narrow ? (
        <>
          <View style={{ width: 96 }}>
            {cash ? null : (
              <Sparkline
                values={f.closes}
                width={96}
                height={24}
                color={
                  f.change >= 0 ? theme.reportsChartFill : theme.errorBorder
                }
              />
            )}
          </View>
          <View
            style={{
              width: 150,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Meter percent={f.share * 100} color={theme.pageText} height={5} />
            <Text
              style={{
                ...styles.tnum,
                width: 44,
                textAlign: 'right',
                fontSize: 13,
                fontWeight: 550,
                color: theme.pageTextLight,
              }}
            >
              {pct.format(f.share)}
            </Text>
          </View>
        </>
      ) : null}

      <View
        style={{
          width: narrow ? undefined : 170,
          alignItems: 'flex-end',
          gap: 3,
        }}
      >
        <Text
          style={{
            ...styles.tnum,
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: theme.pageText,
          }}
        >
          {money.format(f.now)}
        </Text>
        {cash || !f.avgCost ? (
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>—</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Direction
              up={up}
              color={up ? theme.noticeText : theme.errorText}
            />
            <Text
              style={{
                ...styles.tnum,
                fontSize: 13,
                fontWeight: 600,
                color: up ? theme.noticeText : theme.errorText,
              }}
            >
              {money.format(Math.abs(f.gain))} (
              {pct.format(Math.abs(f.gain / f.cost))})
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Fidelity's names arrive in capitals half the time. */
function titleCase(name: string) {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/\b([a-z])/g, c => c.toUpperCase())
    .replace(/\b(Etf|Usd|Cl|Fds|Tr|Ser)\b/g, w => w.toUpperCase());
}

function Dividends({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const { data: rows } = useQuery<{
    id: string;
    date: string;
    amount: number;
    notes: string | null;
  }>(
    () =>
      q('transactions')
        .filter({
          account: accountId,
          amount: { $gt: 0 },
          notes: { $like: '%DIVIDEND%' },
        })
        .options({ splits: 'none' })
        .orderBy([{ date: 'desc' }])
        .select(['id', 'date', 'amount', 'notes']),
    [accountId],
  );
  const data = rows ?? [];
  if (!data.length) return null;
  const total = data.reduce((s, r) => s + r.amount, 0) / 100;
  return (
    <View>
      <SectionHeader
        label={<Trans>Dividends paid</Trans>}
        total={money.format(total)}
      />
      <Finding style={{ marginTop: 8, fontSize: 13 }}>
        <Trans>
          Paid into cash, then reinvested. Already counted in the value above.
        </Trans>
      </Finding>
      {data.map(r => (
        <View
          key={r.id}
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 16,
            padding: '10px 0',
            borderBottom: `1px solid ${theme.tableBorder}`,
          }}
        >
          <Text
            style={{
              ...styles.tnum,
              width: 64,
              fontSize: 13,
              color: theme.pageTextSubdued,
            }}
          >
            {dayLabel(r.date)}
          </Text>
          <Text
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: 550,
              color: theme.pageText,
            }}
          >
            {r.notes?.match(/\(([A-Z]{2,6})\)/)?.[1] ?? t('Fund')}
          </Text>
          <Text
            style={{
              ...styles.tnum,
              fontSize: 15,
              fontWeight: 600,
              color: theme.noticeText,
            }}
          >
            +{money.format(r.amount / 100)}
          </Text>
        </View>
      ))}
    </View>
  );
}
