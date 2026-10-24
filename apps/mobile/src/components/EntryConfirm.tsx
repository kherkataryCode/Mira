import { useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlertTriangle } from 'lucide-react-native';
import type { Recurrence } from '@friday/shared';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, recurrenceLabel } from '@/lib/format';
import { colors, fonts } from '@/lib/theme';
import { Body, Button, Chip, ErrorNote, Input } from './ui';

export interface Draft {
  kind: 'task' | 'reminder';
  title: string;
  dueAt: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  recurrence: Recurrence;
  tags?: string[];
  ambiguities: string[];
}

/** Editable preview; nothing is saved until Confirm. Mirrors the web EntryConfirm. */
export function EntryConfirm({ draft, onDone, onCancel }: { draft: Draft; onDone: (msg: string) => void; onCancel?: () => void }) {
  const [kind, setKind] = useState(draft.kind);
  const [title, setTitle] = useState(draft.title);
  const [when, setWhen] = useState<Date | null>(draft.dueAt ? new Date(draft.dueAt) : null);
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [ack, setAck] = useState(draft.ambiguities.length === 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      if (kind === 'reminder') {
        if (!when) throw new Error('Pick a date and time for the reminder.');
        await api.post('/reminders', { title, remindAt: when.toISOString(), recurrence: draft.recurrence });
        onDone(`Reminder set: ${title}`);
      } else {
        await api.post('/tasks', { title, dueAt: when ? when.toISOString() : null, priority: draft.priority, tags: draft.tags ?? [], recurrence: draft.recurrence });
        onDone(`Task added: ${title}`);
      }
    } catch (e) {
      setError(e instanceof Error && !(e as { status?: number }).status ? e.message : errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={{ gap: 12, backgroundColor: colors.raised, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip label="Task" active={kind === 'task'} onPress={() => setKind('task')} />
        <Chip label="Reminder" active={kind === 'reminder'} onPress={() => setKind('reminder')} />
        {draft.recurrence.freq !== 'none' ? <Body muted>Repeats: {recurrenceLabel(draft.recurrence)}</Body> : null}
      </View>
      <Input label="Title" value={title} onChangeText={setTitle} maxLength={200} />
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.sansMedium }}>{kind === 'reminder' ? 'Remind me at' : 'Due'}</Text>
        {Platform.OS !== 'ios' ? <Button title={when ? fmtDateTime(when.toISOString()) : 'Pick date & time'} onPress={() => setShowPicker(true)} /> : null}
        {showPicker ? (
          <DateTimePicker
            value={when ?? new Date()}
            mode="datetime"
            themeVariant="dark"
            onChange={(_e, d) => {
              if (Platform.OS !== 'ios') setShowPicker(false);
              if (d) setWhen(d);
            }}
          />
        ) : null}
      </View>
      {draft.ambiguities.length ? (
        <View style={{ gap: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(212,188,158,0.4)', padding: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <AlertTriangle size={14} color={colors.sand} />
            <Body style={{ fontFamily: fonts.sansBold }}>Please check</Body>
          </View>
          {draft.ambiguities.map((a) => <Body key={a} muted>• {a}</Body>)}
          <Pressable onPress={() => setAck(!ack)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }} accessibilityRole="switch" accessibilityState={{ checked: ack }}>
            <Switch value={ack} onValueChange={setAck} trackColor={{ true: colors.accent }} accessibilityLabel="The details above are correct" />
            <Body>The details above are correct</Body>
          </Pressable>
        </View>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="primary" title="Confirm" onPress={save} pending={pending} disabled={!ack || !title.trim()} />
        {onCancel ? <Button variant="ghost" title="Cancel" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}
