import { useEffect, useState } from 'react';
import type { Voice } from 'expo-speech';
import { Alert, Share, Switch, View } from 'react-native';
import { LEARNING_TOPICS, type LearningTopicId, type Preferences } from '@friday/shared';
import { englishVoices, pickMiraVoice, speak } from '@/lib/voice';
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
  const [voices, setVoices] = useState<Voice[]>([]);
  const [deviceVoice, setDeviceVoice] = useState('loading…');
  useEffect(() => setDraft(prefs), [prefs]);
  useEffect(() => {
    void englishVoices().then((vs) => setVoices(vs.sort((a, b) => Number(b.quality === 'Enhanced') - Number(a.quality === 'Enhanced'))));
  }, []);
  useEffect(() => {
    void pickMiraVoice(draft?.voice.iosVoice).then((v) => setDeviceVoice(v ? `${v.name}${v.quality === 'Enhanced' ? ' (Enhanced)' : ''}` : 'system default'));
  }, [draft?.voice.iosVoice]);
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
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'Mira data export' });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const deleteAccount = () =>
    Alert.alert('Delete your account?', 'This permanently deletes all your Mira data.', [
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
        <Row label={`Morning briefing in chat (${draft.schedule.morningBrief})`} value={draft.scheduleEnabled.morningBrief} onChange={(v) => setDraft({ ...draft, scheduleEnabled: { ...draft.scheduleEnabled, morningBrief: v } })} />
        <Row label={`News scans (${draft.schedule.newsScans.join(', ')})`} value={draft.scheduleEnabled.newsScans} onChange={(v) => setDraft({ ...draft, scheduleEnabled: { ...draft.scheduleEnabled, newsScans: v } })} />
        <Row label={`Evening security news in chat (${draft.schedule.eveningNews})`} value={draft.scheduleEnabled.eveningNews} onChange={(v) => setDraft({ ...draft, scheduleEnabled: { ...draft.scheduleEnabled, eveningNews: v } })} />
        <Row label={`Microlearning (${draft.schedule.microlearning})`} value={draft.scheduleEnabled.microlearning} onChange={(v) => setDraft({ ...draft, scheduleEnabled: { ...draft.scheduleEnabled, microlearning: v } })} />
        <Row label={`Evening review (${draft.schedule.eveningReview})`} value={draft.scheduleEnabled.eveningReview} onChange={(v) => setDraft({ ...draft, scheduleEnabled: { ...draft.scheduleEnabled, eveningReview: v } })} />
        <Body muted style={{ fontSize: 12 }}>Change exact times on the web app.</Body>
      </Card>
      <Card>
        <Title size="md">Notifications & voice</Title>
        <Row label="Push notifications" value={draft.notifications.push} onChange={(v) => setDraft({ ...draft, notifications: { ...draft.notifications, push: v } })} />
      </Card>
      <Card>
        <Title size="md">Learning topics</Title>
        <Body muted>Mira teaches only these topics — in lessons, daily concepts and chat.</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LEARNING_TOPICS.map((t) => {
            const on = draft.learningTopics.includes(t.id);
            const next: LearningTopicId[] = on ? draft.learningTopics.filter((x) => x !== t.id) : [...draft.learningTopics, t.id];
            return <Chip key={t.id} label={t.label} active={on} onPress={() => next.length && setDraft({ ...draft, learningTopics: next })} />;
          })}
        </View>
      </Card>
      <Card>
        <Title size="md">Mira’s voice</Title>
        <Row label="Read chat replies aloud" value={draft.voice.speakResponses} onChange={(v) => setDraft({ ...draft, voice: { ...draft.voice, speakResponses: v } })} />
        <Row label="Natural voice (server, uses AI budget)" value={draft.voice.naturalVoice} onChange={(v) => setDraft({ ...draft, voice: { ...draft.voice, naturalVoice: v } })} />
        <Body muted style={{ fontSize: 12 }}>
          Fallback iPhone voice: {deviceVoice}. For the most human sound, download a Premium or Enhanced voice (e.g. Ava or Zoe) in iOS Settings → Accessibility → Spoken Content → Voices → English.
        </Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Automatic" active={!draft.voice.iosVoice} onPress={() => setDraft({ ...draft, voice: { ...draft.voice, iosVoice: null } })} />
          {voices.slice(0, 12).map((v) => (
            <Chip key={v.identifier} label={`${v.name}${v.quality === 'Enhanced' ? ' (Enhanced)' : ''}`} active={draft.voice.iosVoice === v.identifier} onPress={() => setDraft({ ...draft, voice: { ...draft.voice, iosVoice: v.identifier } })} />
          ))}
        </View>
        <Button title="Test Mira’s voice" onPress={() => void speak('Hi, I’m Mira. Your evening security briefing is ready whenever you are.', { natural: draft.voice.naturalVoice, voiceId: draft.voice.iosVoice })} />
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
