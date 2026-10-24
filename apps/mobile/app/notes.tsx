import { useState } from 'react';
import { Alert, Pressable, RefreshControl, TextInput, View } from 'react-native';
import type { Note } from '@friday/shared';
import { api, errorMessage } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { relativeTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Body, Button, Card, Empty, ErrorNote, Input, Loading, Screen, Title, styles } from '@/components/ui';

export default function NotesScreen() {
  const [q, setQ] = useState('');
  const { data, error, loading, refreshing, reload } = useResource<{ notes: Note[] }>(`/notes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const open = (n: Note | 'new') => {
    setEditing(n);
    setTitle(n === 'new' ? '' : n.title);
    setBody(n === 'new' ? '' : n.body);
  };
  const save = async () => {
    setActionError(null);
    try {
      if (editing === 'new') await api.post('/notes', { title, body });
      else if (editing) await api.patch(`/notes/${editing.id}`, { title, body });
      setEditing(null);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };
  const remove = (n: Note) =>
    Alert.alert('Delete note?', n.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void api.del(`/notes/${n.id}`).then(() => { setEditing(null); return reload(); }).catch((e: unknown) => setActionError(errorMessage(e))) },
    ]);

  if (editing) {
    return (
      <Screen edges={['left', 'right']}>
        <Input label="Title" value={title} onChangeText={setTitle} maxLength={200} />
        <Input label="Note" value={body} onChangeText={setBody} multiline style={{ minHeight: 220, textAlignVertical: 'top', paddingTop: 10 }} maxLength={20000} />
        {actionError ? <ErrorNote message={actionError} /> : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" title="Save" onPress={save} disabled={!title.trim()} />
          <Button title="Cancel" onPress={() => setEditing(null)} />
          {editing !== 'new' ? <Button variant="danger" title="Delete" onPress={() => remove(editing)} /> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right']} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.muted} />}>
      <Button variant="primary" title="New note" onPress={() => open('new')} style={{ alignSelf: 'flex-start' }} />
      <TextInput accessibilityLabel="Search notes" value={q} onChangeText={setQ} placeholder="Search notes" placeholderTextColor="#8a7f70" style={styles.input} />
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && data.notes.length === 0 ? <Empty title="No notes yet" /> : null}
      {data?.notes.map((n) => (
        <Pressable key={n.id} accessibilityRole="button" onPress={() => open(n)}>
          <Card>
            <Title size="md">{n.title}</Title>
            <Body muted numberOfLines={3}>{n.body || 'Empty note'}</Body>
            <Body muted style={{ fontSize: 12 }}>{n.tags.map((t) => `#${t}`).join(' ')} {relativeTime(n.updatedAt)}</Body>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
