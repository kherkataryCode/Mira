import { useEffect, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';
import type { Reminder } from '@friday/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import { getPermission, registerForServerPush, requestPermission, syncLocalReminders, type PermissionState } from '@/lib/notifications';
import { colors } from '@/lib/theme';
import { Badge, Body, Button, Card, Empty, ErrorNote, Loading, Screen, Title } from '@/components/ui';
import { QuickAdd } from '@/components/QuickAdd';

export default function RemindersScreen() {
  const { prefs } = useAuth();
  const { data, error, loading, refreshing, reload } = useResource<{ reminders: Reminder[] }>('/reminders');
  const [perm, setPerm] = useState<PermissionState | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void getPermission().then(setPerm);
  }, []);

  useEffect(() => {
    if (data && perm === 'granted') void syncLocalReminders(data.reminders).then((n) => setStatus(`${n} upcoming reminder(s) scheduled on this iPhone.`));
  }, [data, perm]);

  const enable = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') {
      const push = await registerForServerPush();
      setStatus(push.ok ? 'Notifications on. This device is registered for server push.' : `Notifications on for this device. Server push: ${push.reason}`);
    } else {
      setStatus('Notifications are off. You can enable them in iOS Settings → Friday → Notifications.');
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  return (
    <Screen edges={['left', 'right']} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.muted} />}>
      <Body muted>Timezone: {prefs?.timezone}</Body>
      {perm !== 'granted' ? (
        <Card>
          <Title size="md">Get reminder alerts</Title>
          <Body muted>
            Friday can alert you on this iPhone when a reminder is due. iOS asks once; you can change it later in Settings. Without permission, reminders still appear in the app.
          </Body>
          <Button variant="primary" title={perm === 'denied' ? 'Open iOS Settings to enable' : 'Allow notifications'} onPress={perm === 'denied' ? () => Alert.alert('Notifications are off', 'Open the Settings app → Friday → Notifications to turn them on.') : enable} />
        </Card>
      ) : null}
      {status ? <Body muted>{status}</Body> : null}
      <Card><QuickAdd onSaved={reload} /></Card>
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {actionError ? <ErrorNote message={actionError} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && data.reminders.length === 0 ? <Empty title="No reminders" body="Try “Remind me to stretch every day at 4pm”." /> : null}
      {data?.reminders.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Body>{r.title}</Body>
              <Body muted style={{ fontSize: 12 }}>{fmtDateTime(r.nextOccurrenceAt ?? r.anchorAt, prefs?.timezone)} · {r.recurrenceLabel}</Body>
              {r.lastDelivery ? <Body muted style={{ fontSize: 12 }}>Last: {r.lastDelivery.channel} {r.lastDelivery.status}{r.lastDelivery.error ? ` — ${r.lastDelivery.error}` : ''}</Body> : null}
            </View>
            <Badge label={r.deliveryState === 'delivered' ? 'Delivered' : 'Scheduled'} tone={r.deliveryState === 'delivered' ? 'positive' : 'demo'} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button title="Snooze 10m" onPress={() => void act(() => api.post(`/reminders/${r.id}/snooze`, { minutes: 10 }))} />
            <Button title="Dismiss" onPress={() => void act(() => api.post(`/reminders/${r.id}/dismiss`))} />
            <Button title="Complete" onPress={() => void act(() => api.post(`/reminders/${r.id}/complete`))} />
            <Button
              variant="danger"
              title="Delete"
              onPress={() =>
                Alert.alert('Delete reminder?', r.title, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => void act(() => api.del(`/reminders/${r.id}`)) },
                ])
              }
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
