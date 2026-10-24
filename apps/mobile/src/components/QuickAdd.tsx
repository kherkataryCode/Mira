import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import type { ParsedEntry } from '@friday/shared';
import { api, errorMessage } from '@/lib/api';
import { colors } from '@/lib/theme';
import { Body, ErrorNote, IconButton, styles } from './ui';
import { EntryConfirm, type Draft } from './EntryConfirm';

export function QuickAdd({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const preview = async () => {
    if (!text.trim()) return;
    setPending(true);
    setError(null);
    try {
      const { preview: p } = await api.post<{ preview: ParsedEntry }>('/parse', { text: text.trim() });
      setDraft({ kind: p.kind, title: p.title, dueAt: p.dueAt, priority: p.priority, recurrence: p.recurrence, tags: p.tags, ambiguities: p.ambiguities });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          accessibilityLabel="Add a task or reminder in plain words"
          value={text}
          onChangeText={setText}
          onSubmitEditing={preview}
          returnKeyType="done"
          placeholder="Remind me to call the dentist tomorrow at 5 PM"
          placeholderTextColor="#8a7f70"
          style={[styles.input, { flex: 1 }]}
          maxLength={500}
        />
        <IconButton label="Preview" onPress={preview} disabled={pending || !text.trim()} style={{ backgroundColor: colors.panel }}>
          <Sparkles size={18} color={colors.onPanel} />
        </IconButton>
      </View>
      {error ? <ErrorNote message={error} /> : null}
      {flash ? <Body style={{ color: colors.positive }}>{flash}</Body> : null}
      {draft ? (
        <EntryConfirm
          key={JSON.stringify(draft)}
          draft={draft}
          onCancel={() => setDraft(null)}
          onDone={(msg) => {
            setDraft(null);
            setText('');
            setFlash(msg);
            onSaved();
          }}
        />
      ) : null}
    </View>
  );
}
