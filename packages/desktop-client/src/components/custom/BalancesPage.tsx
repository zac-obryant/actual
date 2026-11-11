// Fork: the Accounts tab. Cash on hand, where it's heading, and a tile per
// account; the registers are a tap away.
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { View } from '@actual-app/components/view';

import { Page } from '#components/Page';
import { useNavigate } from '#hooks/useNavigate';

import { AccountsOverview } from './AccountsOverview';
import { instrumentPage } from './primitives';

export function BalancesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isNarrowWidth } = useResponsive();
  return (
    <Page header={isNarrowWidth ? t('Accounts') : null} padding={0}>
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
        <AccountsOverview
          action={
            <Button variant="normal" onPress={() => navigate('/accounts')}>
              <Trans>All transactions</Trans>
            </Button>
          }
        />
      </View>
    </Page>
  );
}
