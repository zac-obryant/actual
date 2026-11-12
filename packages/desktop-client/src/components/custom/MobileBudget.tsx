// Fork: the Budget tab on a phone. The same bills-and-spending screen as the
// desktop, with a compact month switcher in place of the twelve-month strip.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronLeft,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';

import { Page } from '#components/Page';
import { useLocale } from '#hooks/useLocale';

import { BillsAndSpending } from './BillsAndSpending';

export function MobileBudget() {
  const { t } = useTranslation();
  const locale = useLocale();
  const [month, setMonth] = useState(monthUtils.currentMonth());
  const [bounds, setBounds] = useState<{ start: string; end: string } | null>(
    null,
  );
  useEffect(() => {
    void send('get-budget-bounds').then(setBounds);
  }, []);
  const prev = monthUtils.subMonths(month, 1);
  const next = monthUtils.addMonths(month, 1);
  const thisMonth = monthUtils.currentMonth();

  return (
    <Page header={t('Budget')} padding={0}>
      <View style={{ padding: '12px 16px 40px', flexShrink: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
          }}
        >
          <Button
            variant="bare"
            aria-label={t('Previous month')}
            isDisabled={!!bounds && prev < bounds.start}
            onPress={() => setMonth(prev)}
            style={{ width: 44, height: 44 }}
          >
            <SvgCheveronLeft width={18} height={18} />
          </Button>
          <Button
            variant="bare"
            aria-label={t('Back to this month')}
            isDisabled={month === thisMonth}
            onPress={() => setMonth(thisMonth)}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: theme.pageText,
              }}
            >
              {monthUtils.format(month, 'MMMM yyyy', locale)}
            </Text>
          </Button>
          <Button
            variant="bare"
            aria-label={t('Next month')}
            isDisabled={!!bounds && next > bounds.end}
            onPress={() => setMonth(next)}
            style={{ width: 44, height: 44 }}
          >
            <SvgCheveronRight width={18} height={18} />
          </Button>
        </View>
        <BillsAndSpending month={month} />
      </View>
    </Page>
  );
}
