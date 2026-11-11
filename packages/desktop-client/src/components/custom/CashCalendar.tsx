// Fork: the calendar as one line over a quiet grid, both covering the same
// seven weeks. The line is the Money Plan's projected cash; each day in the
// grid carries only marks (green for money in, a bar per bill sized by amount)
// and its end-of-day balance. Picking a day on either moves the other.
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { css } from '@emotion/css';

import { Page } from '#components/Page';
import { useLocale } from '#hooks/useLocale';

import { CashLine } from './CashLine';
import { lowPoint, usd, usePlan } from './moneyPlan';
import type { PlanDay } from './moneyPlan';
import { HeroNumber, instrumentPage } from './primitives';

const WEEKS = 7;

const split = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.5fr) minmax(260px, 1fr)',
  gap: 20,
  alignItems: 'start',
  marginTop: 18,
  '@media (max-width: 860px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});
const grid = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 4,
});
const dayCell = css({
  all: 'unset',
  boxSizing: 'border-box',
  cursor: 'pointer',
  minHeight: 60,
  borderRadius: 10,
  padding: '6px 8px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: 3,
  transition: 'background-color .15s',
  ':hover': { backgroundColor: theme.surfaceSunken },
  ':focus-visible': {
    outline: `2px solid ${theme.formInputBorderSelected}`,
    outlineOffset: 1,
  },
});

export function CashCalendar() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { isNarrowWidth } = useResponsive();
  const plan = usePlan();
  const days = plan?.days ?? [];
  const byDate = new Map(days.map(d => [d.date, d]));
  const lp = lowPoint(days);

  const today = monthUtils.currentDay();
  const start = monthUtils.subDays(
    today,
    new Date(`${today}T12:00:00`).getDay(),
  );
  const end = monthUtils.addDays(start, WEEKS * 7 - 1);
  const cells = monthUtils.dayRangeInclusive(start, end);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? lp?.low.date ?? today;
  const shown = days.filter(d => d.date <= end);

  const fmt = (d: string, f: string) => monthUtils.format(d, f, locale);
  const biggestBill = Math.max(
    1,
    ...days.flatMap(d =>
      d.events.filter(e => e.amount < 0).map(e => -e.amount),
    ),
  );

  return (
    <Page header={isNarrowWidth ? t('Calendar') : null} padding={0}>
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
        <Text style={{ ...styles.displayText }}>
          <Trans>Next seven weeks</Trans>
        </Text>
        <Text
          style={{
            ...styles.tnum,
            fontSize: 15,
            color: theme.pageTextSubdued,
            marginTop: 6,
          }}
        >
          {lp ? (
            <>
              {t('Lowest point')}{' '}
              <b style={{ color: theme.warningText }}>{usd(lp.low.bal)}</b>{' '}
              {t('on {{date}}', { date: fmt(lp.low.date, 'EEEE, MMM d') })}
              {lp.nextPay &&
                monthUtils.addDays(lp.low.date, 1) === lp.nextPay.date &&
                `, ${t('the day before {{name}} lands', { name: lp.nextPay.name })}`}
              .
            </>
          ) : plan === undefined ? (
            t('Loading the Money Plan…')
          ) : (
            t(
              "The Money Plan isn't reachable, so there's no projection. Open the receipts link once on this device, or check that the companion is running.",
            )
          )}
        </Text>

        {shown.length > 1 && (
          <View style={{ marginTop: 18, flexShrink: 0 }}>
            <CashLine
              days={shown}
              height={300}
              axisStart={start}
              axisEnd={end}
              big
              selected={selected}
              onSelect={setPicked}
            />
          </View>
        )}

        <div className={split}>
          <div
            className={grid}
            role="grid"
            aria-label={t('Seven weeks of days')}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => (
              <Text
                key={w}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.pageTextSubdued,
                  padding: '0 8px 6px',
                }}
              >
                {t(w)}
              </Text>
            ))}
            {cells.map(date => {
              const d = byDate.get(date);
              const past = date < today;
              const isLow = lp?.low.date === date;
              return (
                <button
                  key={date}
                  type="button"
                  className={dayCell}
                  aria-pressed={date === selected}
                  aria-label={fmt(date, 'EEEE, MMMM d')}
                  onClick={() => setPicked(date)}
                  style={{
                    opacity: past ? 0.38 : 1,
                    backgroundColor:
                      date === selected
                        ? `color-mix(in oklab, ${theme.reportsChartFill} 28%, ${theme.surfaceSunken})`
                        : undefined,
                    boxShadow:
                      date === today
                        ? `inset 0 0 0 1.5px ${theme.pageText}`
                        : undefined,
                  }}
                >
                  <Text style={{ fontWeight: 600, fontSize: 14 }}>
                    {date.endsWith('-01')
                      ? fmt(date, 'MMM d')
                      : Number(date.slice(8))}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 4,
                      minHeight: 6,
                    }}
                  >
                    {(d?.events ?? [])
                      .filter(e => e.name !== 'Tithe')
                      .map(e => (
                        <span
                          key={e.name}
                          title={`${e.name} ${usd(e.amount)}`}
                          style={{
                            height: 6,
                            borderRadius: 3,
                            width:
                              e.amount > 0
                                ? 26
                                : Math.max(
                                    6,
                                    Math.round((-e.amount / biggestBill) * 26),
                                  ),
                            backgroundColor:
                              e.amount > 0
                                ? theme.reportsChartFill
                                : theme.pageTextSubdued,
                          }}
                        />
                      ))}
                  </View>
                  <Text
                    style={{
                      ...styles.tnum,
                      fontSize: 12,
                      color: isLow ? theme.warningText : theme.pageTextSubdued,
                      fontWeight: isLow ? 600 : 400,
                    }}
                  >
                    {d ? usd(d.bal) : ' '}
                  </Text>
                </button>
              );
            })}
          </div>
          <DayDetail date={selected} day={byDate.get(selected)} today={today} />
        </div>
        <Text
          style={{ fontSize: 13, color: theme.pageTextSubdued, marginTop: 14 }}
        >
          <Trans>
            Green dot: payday. Bar: a bill, longer means bigger. Small number:
            expected balance at the end of the day, after everyday spending and
            before any extra debt payments.
          </Trans>
        </Text>
      </View>
    </Page>
  );
}

function DayDetail({
  date,
  day,
  today,
}: {
  date: string;
  day: PlanDay | undefined;
  today: string;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <View
      style={{
        backgroundColor: theme.cardBackground,
        borderRadius: 16,
        padding: 20,
        position: 'sticky',
        top: 16,
      }}
    >
      <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
        {monthUtils.format(date, 'EEEE, MMMM d', locale)}
      </Text>
      <View style={{ marginTop: 8 }}>
        <HeroNumber>{day ? usd(day.bal) : '—'}</HeroNumber>
      </View>
      <Text style={{ color: theme.pageTextSubdued, marginTop: 4 }}>
        {!day
          ? date < today
            ? t('Already happened. The account registers have what posted.')
            : t('Past the end of the projection.')
          : date === today
            ? t('in your SoFi accounts now')
            : t('expected at the end of the day')}
      </Text>
      <View style={{ marginTop: 14 }}>
        {day && day.events.length === 0 && (
          <Text style={{ fontSize: 14, color: theme.pageTextSubdued }}>
            <Trans>Nothing due. Everyday spending only.</Trans>
          </Text>
        )}
        {day?.events.map((e, i) => (
          <View
            key={e.name}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 0',
              borderTop: i ? `1px solid ${theme.tableBorder}` : 'none',
            }}
          >
            <Text style={{ fontSize: 15 }}>{e.name}</Text>
            <Text
              style={{
                ...styles.tnum,
                fontSize: 15,
                fontWeight: 600,
                color: e.amount > 0 ? theme.noticeText : theme.pageText,
              }}
            >
              {e.amount > 0 ? '+' : ''}
              {usd(e.amount, true)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
