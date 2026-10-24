import { useEffect, useState } from 'react';
import { Alert, Share, Switch, View } from 'react-native';
import type { Preferences } from '@friday/shared';
import { api, API_URL, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { Body, Button, Card, Chip, ErrorNote, Input, Screen, Title } from '@/components/ui';

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      <Body style={{ flex: 1 }}>{label}</Body>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} />
    </View>
  );
}

export default function SettingsScreen() {
  const { prefs, setPrefs, user, signOut } = useAuth();
  const [draft, setDraft] = useState<Preferences | null>(prefs);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  useEffect(() => setDraft(prefs), [prefs]);
  if (!draft) return null;

  const save = async () => {
    setErr(null);
    try {
      const r = await api.patch<{ preferences: Preferences }>('/preferences', draft);
      setPrefs(r.preferences);
      setMsg('Saved');
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const exportData = async () => {
    try {
      const data = await api.get<unknown>('/account/export');
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'Friday data export' });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const deleteAccount = () =>
    Alert.alert('Delete your account?', 'This permanently deletes all your Friday data.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void api
            .post('/account/delete', { password, confirm: 'DELETE' })
            .then(() => signOut())
            .catch((e: unknown) => setErr(errorMessage(e))),
      },
    ]);

  return (
    <Screen edges={['left', 'right']}>
      <Card>
        <Title size="md">{user?.displayName}</Title>
        <Body muted>{user?.email}</Body>
        <Body muted style={{ fontSize: 12 }}>Server: {API_URL}</Body>
      </Card>
      <Card>
        <Title size="md">Time & replies</Title>
        <Input label="Timezone (IANA)" value={draft.timezone} onChangeText={(v) => setDraft({ ...draft, timezone: v })} autoCapitalize="none" />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {(['concise', 'balanced', 'detailed'] as const).map((v) => <Chip key={v} label={v} active={draft.verbosity === v} onPress={() => setDraft({ ...draft, verbosity: v })} />)}
        </View>
      </Card>
      <Card>
        <Title size="md">Schedule</Title>
        <Row label={`Morning brief (${draft.schedule.morningBrief})`} value={draft.scheduleEnabled.morningBrief} onChange={(v) => setDraft({ ...draft, scheduleEnabled: { ...draft.scheduleEnabled, morningBrief: v } })} />
        <Row label={`News scans (${draft.schedule.newsScans.join(', ')})`} value={draft.scheduleEnabled.newsScans} onChange={(v) => setDraft({ ...draft, scheduleEnabled: { ...draft.scheduleEnabled, newsScans: v } })} />
        <Row label={`Microlearning (${draft.schedule.microlearning})`} value={draft.scheduleEnabled.microlearning} onChange={(v) => setDraft({ ...draft, scheduleEnabled: { ...draft.scheduleEnabled, microlearning: v } })} />
        <Row label={`Evening review (${draft.schedule.eveningReview})`} value={draft.scheduleEnabled.eveningReview} onChange={(v) => setDraft({ ...draft, scheduleEnabled: { ...draft.scheduleEnabled, eveningReview: v } })} />
        <Body muted style={{ fontSize: 12 }}>Change exact times on the web app.</Body>
      </Card>
      <Card>
        <Title size="md">Notifications & voice</Title>
        <Row label="Push notifications" value={draft.notifications.push} onChange={(v) => setDraft({ ...draft, notifications: { ...draft.notifications, push: v } })} />
        <Row label="Read chat replies aloud" value={draft.voice.speakResponses} onChange={(v) => setDraft({ ...draft, voice: { speakResponses: v } })} />
      </Card>
      {err ? <ErrorNote message={err} /> : null}
      {msg ? <Body style={{ color: colors.positive }}>{msg}</Body> : null}
      <Button variant="primary" title="Save settings" onPress={save} />
      <Card>
        <Title size="md">Your data</Title>
        <Button title="Export my data" onPress={exportData} />
        <Button title="Sign out everywhere else" onPress={() => void api.post('/auth/sessions/revoke-others').then(() => setMsg('Other sessions signed out')).catch((e: unknown) => setErr(errorMessage(e)))} />
      </Card>
      <Card>
        <Title size="md">Delete account</Title>
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Button variant="danger" title="Delete my account" onPress={deleteAccount} disabled={!password} />
      </Card>
    </Screen>
  );
}
