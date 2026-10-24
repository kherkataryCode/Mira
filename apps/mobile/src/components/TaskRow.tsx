import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { Task } from '@friday/shared';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, recurrenceLabel } from '@/lib/format';
import { colors, fonts } from '@/lib/theme';

const DOT: Record<Task['priority'], string> = { urgent: colors.vermilion, high: colors.vermilion, medium: colors.sand, low: colors.sage };

export function TaskRow({ task, timezone, onChange, onLongPress }: { task: Task; timezone?: string; onChange: () => void; onLongPress?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = task.status === 'done';
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/tasks/${task.id}`, { status: done ? 'open' : 'done' });
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderBottomColor: colors.line, borderBottomWidth: 0.5 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: busy }}
        accessibilityLabel={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onPress={toggle}
        disabled={busy}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: done ? colors.positive : colors.muted, backgroundColor: done ? colors.green : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {done ? <Check size={14} color={colors.cream} /> : null}
        </View>
      </Pressable>
      <Pressable onLongPress={onLongPress} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }} accessibilityHint={onLongPress ? 'Long press for options' : undefined}>
        <Text style={{ color: done ? colors.muted : colors.text, fontFamily: fonts.sansMedium, fontSize: 15, textDecorationLine: done ? 'line-through' : 'none' }}>{task.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: DOT[task.priority] }} />
          <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.sans }}>
            {fmtDateTime(task.dueAt, timezone)}
            {task.recurrence.freq !== 'none' ? ` · ${recurrenceLabel(task.recurrence)}` : ''}
            {task.tags.length ? ` · ${task.tags.map((t) => `#${t}`).join(' ')}` : ''}
          </Text>
        </View>
        {error ? <Text accessibilityRole="alert" style={{ color: colors.accentText, fontSize: 12 }}>{error}</Text> : null}
      </Pressable>
    </View>
  );
}
