// Fork: projected cash as one dashed line. Small on the accounts overview;
// large on the calendar, where paydays sit above the line, any day can be
// picked off it, and the picked day is marked.
import { useId } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import * as monthUtils from '@actual-app/core/shared/months';
import { css } from '@emotion/css';

import { useLocale } from '#hooks/useLocale';

import { lowPoint, usd } from './moneyPlan';
import type { PlanDay } from './moneyPlan';

const W = 1060;
const label = css({
  font: '500 12px var(--font-family, inherit)',
  fill: theme.pageTextSubdued,
});

export function CashLine({
  days,
  height,
  axisStart = days[0]?.date,
  axisEnd = days[days.length - 1]?.date,
  big = false,
  selected,
  onSelect,
}: {
  days: PlanDay[];
  height: number;
  axisStart?: string;
  axisEnd?: string;
  /** Paydays above the line and pickable days. */
  big?: boolean;
  selected?: string;
  onSelect?: (date: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const gradient = useId();
  const lp = lowPoint(days);
  if (!lp || !axisStart || !axisEnd) return null;

  const top = big ? 46 : 16;
  const H = height - top - (big ? 30 : 24);
  const x0 = 24;
  const x1 = W - 24;
  const span = Math.max(
    1,
    monthUtils.differenceInCalendarDays(axisEnd, axisStart),
  );
  const X = (date: string) =>
    x0 +
    (monthUtils.differenceInCalendarDays(date, axisStart) / span) * (x1 - x0);
  const max = Math.max(...days.map(d => d.bal));
  const min = Math.min(0, ...days.map(d => d.bal));
  const Y = (v: number) => top + H - ((v - min) / (max - min || 1)) * H;
  const pts = days.map(d => `${X(d.date).toFixed(1)},${Y(d.bal).toFixed(1)}`);
  const today = days[0];
  const picked = selected ? days.find(d => d.date === selected) : undefined;
  const ticks = monthUtils
    .dayRangeInclusive(axisStart, axisEnd)
    .filter(d => d === axisStart || d.endsWith('-01'));

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={t('Projected cash, lowest {{amount}} on {{date}}', {
        amount: usd(lp.low.bal),
        date: monthUtils.format(lp.low.date, 'MMM d', locale),
      })}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <defs>
        <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0"
            stopColor={theme.reportsChartFill}
            stopOpacity={0.3}
          />
          <stop offset="1" stopColor={theme.reportsChartFill} stopOpacity={0} />
        </linearGradient>
      </defs>
      {min < 0 && (
        <line
          x1={x0}
          x2={x1}
          y1={Y(0)}
          y2={Y(0)}
          stroke={theme.errorBorder}
          strokeOpacity={0.5}
        />
      )}
      <path
        d={`M${pts.join(' L')} L${X(days[days.length - 1].date)},${top + H} L${X(today.date)},${top + H}Z`}
        fill={`url(#${gradient})`}
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={theme.reportsChartFill}
        strokeWidth={2.5}
        strokeDasharray="6 5"
        strokeLinejoin="round"
      />
      {big &&
        days.flatMap(d =>
          d.events
            .filter(e => e.amount > 0)
            .map(e => (
              <g key={d.date + e.name}>
                <line
                  x1={X(d.date)}
                  x2={X(d.date)}
                  y1={top - 14}
                  y2={Y(d.bal)}
                  stroke={theme.reportsChartFill}
                  strokeOpacity={0.3}
                />
                <circle
                  cx={X(d.date)}
                  cy={top - 18}
                  r={4}
                  fill={theme.reportsChartFill}
                />
                <text
                  x={X(d.date)}
                  y={top - 28}
                  textAnchor="middle"
                  className={label}
                  style={{ fill: theme.noticeText, fontWeight: 600 }}
                >
                  +{usd(e.amount)}
                </text>
              </g>
            )),
        )}
      <circle
        cx={X(today.date)}
        cy={Y(today.bal)}
        r={5.5}
        fill={theme.reportsChartFill}
      />
      <circle
        cx={X(lp.low.date)}
        cy={Y(lp.low.bal)}
        r={5}
        fill={theme.warningBorder}
      />
      {!big && (
        <>
          <text
            x={X(today.date) + 10}
            y={Y(today.bal) - 10}
            className={label}
            style={{ fontWeight: 600 }}
          >
            <Trans>Today</Trans>
          </text>
          <text
            x={X(lp.low.date)}
            y={Y(lp.low.bal) + 20}
            textAnchor="middle"
            className={label}
            style={{ fill: theme.warningText, fontWeight: 600 }}
          >
            {usd(lp.low.bal)}
          </text>
        </>
      )}
      {ticks.map(d => (
        <text
          key={d}
          x={X(d)}
          y={height - 6}
          textAnchor={d === axisStart ? 'start' : 'middle'}
          className={label}
        >
          {monthUtils.format(d, 'MMM d', locale)}
        </text>
      ))}
      {picked && (
        <g pointerEvents="none">
          <line
            x1={X(picked.date)}
            x2={X(picked.date)}
            y1={top - 6}
            y2={top + H}
            stroke={theme.pageText}
            strokeOpacity={0.5}
          />
          <circle
            cx={X(picked.date)}
            cy={Y(picked.bal)}
            r={7}
            fill={theme.pageBackground}
            stroke={theme.pageText}
            strokeWidth={2.5}
          />
        </g>
      )}
      {onSelect &&
        days.map(d => (
          <rect
            key={d.date}
            x={X(d.date) - (x1 - x0) / span / 2}
            y={0}
            width={(x1 - x0) / span}
            height={height}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(d.date)}
          >
            <title>
              {monthUtils.format(d.date, 'EEE MMM d', locale)}: {usd(d.bal)}
            </title>
          </rect>
        ))}
    </svg>
  );
}
