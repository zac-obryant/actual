// Fork: shown when this device can't read the Money Plan yet. One tap connects
// it, using the budget login it already has.
import { useState } from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { connectAndReload } from './moneyPlan';

export function ConnectDevice() {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  return (
    <View
      style={{
        backgroundColor: theme.cardBackground,
        borderRadius: 16,
        padding: 22,
        marginBottom: 24,
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: 600 }}>
        <Trans>This device isn't connected to the Money Plan yet</Trans>
      </Text>
      <Text style={{ fontSize: 15, color: theme.pageTextSubdued }}>
        {state === 'failed' ? (
          <Trans>
            That didn't work. Check that Tailscale is on, then try again.
          </Trans>
        ) : (
          <Trans>
            Connect it to see where you stand, this week's spending money and
            the bills.
          </Trans>
        )}
      </Text>
      <Button
        variant="primary"
        isDisabled={state === 'busy'}
        onPress={async () => {
          setState('busy');
          setState((await connectAndReload()) ? 'idle' : 'failed');
        }}
        style={{ minHeight: 44, padding: '0 20px' }}
      >
        {state === 'busy' ? (
          <Trans>Connecting…</Trans>
        ) : (
          <Trans>Connect this device</Trans>
        )}
      </Button>
    </View>
  );
}
