import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { Reminder } from '@friday/shared';
import { api } from './api';

/**
 * Two delivery paths, both honest about their limits:
 *  1. Local notifications scheduled on this iPhone for upcoming reminders (works offline,
 *     needs notification permission; iOS keeps at most 64 pending per app).
 *  2. Server push via Expo Push Service → APNs (needs a development/production build,
 *     an EAS project id, APNs credentials in EAS, and PUSH_ENABLED on the server).
 * The server worker remains the source of truth for delivery status.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const LOCAL_PREFIX = 'friday-reminder:';
const MAX_LOCAL = 50;

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPermission(): Promise<PermissionState> {
  const s = await Notifications.getPermissionsAsync();
  return s.granted ? 'granted' : s.canAskAgain ? 'undetermined' : 'denied';
}

/** Ask only in context (from the Reminders screen), never on first launch. */
export async function requestPermission(): Promise<PermissionState> {
  const s = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return s.granted ? 'granted' : 'denied';
}

export interface PushRegistration {
  ok: boolean;
  reason?: string;
}

export async function registerForServerPush(): Promise<PushRegistration> {
  if (!Device.isDevice) return { ok: false, reason: 'Push notifications need a physical iPhone (the Simulator cannot receive APNs pushes).' };
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return { ok: false, reason: 'EAS project id is not configured in this build (set EAS_PROJECT_ID).' };
  if ((await getPermission()) !== 'granted') return { ok: false, reason: 'Notification permission is not granted.' };
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/devices', { platform: Platform.OS === 'ios' ? 'ios' : 'android', pushToken: data });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not obtain a push token. Server push may not be configured for this build.' };
  }
}

/** Mirrors the next upcoming reminders as on-device notifications. Idempotent. */
export async function syncLocalReminders(reminders: Reminder[]): Promise<number> {
  if ((await getPermission()) !== 'granted') return 0;
  await unregisterLocalSchedules();
  const now = Date.now();
  const upcoming = reminders
    .filter((r) => r.status === 'active' && r.nextFireAt && new Date(r.nextFireAt).getTime() > now + 5_000)
    .sort((a, b) => new Date(a.nextFireAt!).getTime() - new Date(b.nextFireAt!).getTime())
    .slice(0, MAX_LOCAL);
  for (const r of upcoming) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${LOCAL_PREFIX}${r.id}`,
      content: { title: r.title, body: 'Reminder from Friday', data: { reminderId: r.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.nextFireAt!) },
    });
  }
  return upcoming.length;
}

export async function unregisterLocalSchedules(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith(LOCAL_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}
