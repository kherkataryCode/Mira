import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import type { Task } from '@friday/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { colors } from '@/lib/theme';
import { Card, Chip, Empty, ErrorNote, Loading, Screen, Title, styles } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { QuickAdd } from '@/components/QuickAdd';

const VIEWS = [
  { id: 'today', label: 'Today', q: 'view=today&status=open' },
  { id: 'upcoming', label: 'Upcoming', q: 'view=upcoming&status=open' },
  { id: 'overdue', label: 'Overdue', q: 'view=overdue&status=open' },
  { id: 'all', label: 'All', q: 'view=all&status=open' },
  { id: 'done', label: 'Done', q: 'view=all&status=done' },
] as const;

export default function TasksScreen() {
  const { prefs } = useAuth();
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('today');
  const [q, setQ] = useState('');
  const query = `${VIEWS.find((v) => v.id === view)!.q}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}&limit=100`;
  const { data, error, loading, refreshing, reload } = useResource<{ tasks: Task[] }>(`/tasks?${query}`);
  const [actionError, setActionError] = useState<string | null>(null);

  const options = (t: Task) => {
    const run = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await reload();
      } catch (e) {
        setActionError(errorMessage(e));
      }
    };
    const choices = ['Set priority: high', 'Postpone 1 day', 'Delete', 'Cancel'];
    const handle = (i: number) => {
      if (i === 0) void run(() => api.patch(`/tasks/${t.id}`, { priority: 'high' }));
      if (i === 1) {
        const base = t.dueAt ? new Date(t.dueAt) : new Date();
        void run(() => api.patch(`/tasks/${t.id}`, { dueAt: new Date(base.getTime() + 86_400_000).toISOString() }));
      }
      if (i === 2) {
        Alert.alert('Delete task?', `"${t.title}" will be removed permanently.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void run(() => api.del(`/tasks/${t.id}`)) },
        ]);
      }
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: choices, destructiveButtonIndex: 2, cancelButtonIndex: 3, title: t.title }, handle);
    else Alert.alert(t.title, undefined, choices.slice(0, 3).map((c, i) => ({ text: c, onPress: () => handle(i) })));
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.muted} />}>
      <Title>Tasks</Title>
      <Card><QuickAdd onSaved={reload} /></Card>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {VIEWS.map((v) => <Chip key={v.id} label={v.label} active={view === v.id} onPress={() => setView(v.id)} />)}
      </ScrollView>
      <TextInput accessibilityLabel="Search tasks" value={q} onChangeText={setQ} placeholder="Search tasks" placeholderTextColor="#8a7f70" style={styles.input} />
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {actionError ? <ErrorNote message={actionError} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && data.tasks.length === 0 ? <Empty title="All clear" body="Nothing in this view." /> : null}
      {data && data.tasks.length > 0 ? (
        <Card>
          <View>{data.tasks.map((t) => <TaskRow key={t.id} task={t} timezone={prefs?.timezone} onChange={reload} onLongPress={() => options(t)} />)}</View>
        </Card>
      ) : null}
    </Screen>
  );
}
