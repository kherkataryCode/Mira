import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ArrowUp, Copy, Mic, Plus, RotateCcw, Square, Volume2, VolumeX, X } from 'lucide-react-native';
import type { ChatMessage, Preferences, Proposal } from '@friday/shared';
import { api, errorMessage, newClientId, streamChat, type ChatEvent } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { speak, stopSpeaking, useVoiceInput } from '@/lib/voice';
import { colors, fonts } from '@/lib/theme';
import { Badge, Body, Button, ErrorNote, IconButton, Title } from '@/components/ui';
import { EntryConfirm } from '@/components/EntryConfirm';

type UiMessage = ChatMessage & { demo?: boolean; errorText?: string };

function ProposalBlock({ p }: { p: Proposal }) {
  const [done, setDone] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return <Body muted>Proposal dismissed — nothing was saved.</Body>;
  if (done) return <Body style={{ color: colors.positive }}>{done}</Body>;
  return (
    <EntryConfirm
      draft={{
        kind: p.kind,
        title: p.title,
        dueAt: p.kind === 'reminder' ? p.remindAt : p.dueAt,
        priority: p.kind === 'task' ? p.priority : 'medium',
        recurrence: p.recurrence,
        ambiguities: p.needsConfirmation,
      }}
      onDone={setDone}
      onCancel={() => setDismissed(true)}
    />
  );
}

export default function ChatScreen() {
  const { prefs, setPrefs } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [viaVoice, setViaVoice] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const speakOn = prefs?.voice.speakResponses ?? false;

  const voice = useVoiceInput(
    useCallback((text: string) => {
      setInput((prev) => (prev ? `${prev} ${text}` : text));
      setViaVoice(true);
    }, []),
  );

  useEffect(() => {
    api
      .get<{ conversations: { id: string }[] }>('/chat/conversations')
      .then(async (r) => {
        const first = r.conversations[0];
        if (!first) return;
        const c = await api.get<{ messages: ChatMessage[] }>(`/chat/conversations/${first.id}`);
        setConversationId(first.id);
        setMessages(c.messages);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
    return () => abortRef.current?.abort();
  }, []);

  const run = async (path: string, body: unknown, userText?: string, existingId?: string) => {
    const ctl = new AbortController();
    abortRef.current = ctl;
    let assistantId = existingId ?? null;
    let full = '';
    setError(null);
    try {
      await streamChat(
        path,
        body,
        (e: ChatEvent) => {
          if (e.type === 'meta') {
            assistantId = e.assistantMessageId;
            setStreaming(assistantId);
            setConversationId(e.conversationId);
            setMessages((prev) => {
              const next = prev.filter((m) => m.id !== 'pending' && m.id !== e.assistantMessageId);
              if (userText !== undefined) next.push({ id: e.userMessageId, role: 'user', content: userText, status: 'complete', provider: null, model: null, proposals: null, errorCode: null, createdAt: new Date().toISOString() });
              next.push({ id: e.assistantMessageId, role: 'assistant', content: '', status: 'streaming', provider: null, model: null, proposals: e.proposals, errorCode: null, createdAt: new Date().toISOString() });
              return next;
            });
          } else if (e.type === 'delta') {
            full += e.text;
            const id = assistantId;
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + e.text } : m)));
          } else if (e.type === 'done') {
            const id = assistantId;
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'complete', provider: e.provider, model: e.model, demo: e.demo } : m)));
            if (speakOn) speak(full);
          } else {
            const id = assistantId;
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: e.code === 'cancelled' ? 'cancelled' : 'error', errorText: e.message } : m)));
          }
        },
        ctl.signal,
      );
    } catch (err) {
      const aborted = ctl.signal.aborted;
      const id = assistantId;
      if (id) {
        setMessages((prev) => prev.map((m) => (m.id === id && m.status === 'streaming' ? { ...m, status: aborted ? 'cancelled' : 'error', errorText: aborted ? 'Stopped.' : errorMessage(err) } : m)));
        if (aborted) await api.post(`/chat/messages/${id}/cancel`).catch(() => undefined);
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== 'pending'));
        if (userText !== undefined) setInput(userText);
        if (!aborted) setError(errorMessage(err));
      }
    } finally {
      setStreaming(null);
      abortRef.current = null;
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || streaming) return;
    stopSpeaking();
    setInput('');
    setMessages((prev) => [...prev, { id: 'pending', role: 'user', content: text, status: 'complete', provider: null, model: null, proposals: null, errorCode: null, createdAt: new Date().toISOString() }]);
    const body = { content: text, clientMessageId: newClientId(), viaVoice, ...(conversationId ? { conversationId } : {}) };
    setViaVoice(false);
    void run('/chat/send', body, text);
  };

  const toggleSpeak = async () => {
    if (!prefs) return;
    if (speakOn) stopSpeaking();
    try {
      const r = await api.patch<{ preferences: Preferences }>('/preferences', { voice: { speakResponses: !speakOn } });
      setPrefs(r.preferences);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const voiceLabel =
    voice.state === 'unavailable' ? 'Voice input unavailable in this build' : voice.state === 'listening' ? 'Stop listening' : 'Start voice input';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <Title size="md">Chat</Title>
            <Body muted style={{ fontSize: 12 }}>Ask, plan, or say “Remind me to…”</Body>
          </View>
          <IconButton label={speakOn ? 'Mute spoken replies' : 'Speak replies aloud'} onPress={toggleSpeak}>
            {speakOn ? <Volume2 color={colors.text} size={20} /> : <VolumeX color={colors.muted} size={20} />}
          </IconButton>
          <IconButton label="New chat" onPress={() => { abortRef.current?.abort(); setConversationId(null); setMessages([]); }}>
            <Plus color={colors.text} size={20} />
          </IconButton>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 900, width: '100%', alignSelf: 'center' }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <View style={{ alignItems: 'center', gap: 10, marginTop: 24 }}>
              <Title>How can I help?</Title>
              {['What do I have today?', 'Remind me to call the dentist tomorrow at 5 PM'].map((s) => (
                <Pressable key={s} onPress={() => setInput(s)} style={{ minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, justifyContent: 'center' }}>
                  <Body muted>{s}</Body>
                </Pressable>
              ))}
            </View>
          ) : null}
          {messages.map((m) => (
            <View key={m.id} style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
              <View
                style={{
                  maxWidth: '88%',
                  borderRadius: 22,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: m.role === 'user' ? 'rgba(79,119,85,0.45)' : colors.surface,
                  borderWidth: m.role === 'user' ? 0 : 1,
                  borderColor: colors.line,
                  gap: 6,
                }}
              >
                {m.role === 'assistant' && (m.demo || m.provider === 'demo') ? <Badge label="Demo response" tone="demo" /> : null}
                <Text selectable style={{ color: colors.text, fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 }}>
                  {m.content || (m.status === 'streaming' ? 'Thinking…' : '')}
                </Text>
              </View>
              {m.role === 'assistant' && (m.status === 'error' || m.status === 'cancelled') ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Body style={{ color: m.status === 'error' ? colors.accentText : colors.muted, fontSize: 12 }}>{m.status === 'cancelled' ? 'Stopped.' : (m.errorText ?? 'Friday could not answer.')}</Body>
                  <Button
                    variant="ghost"
                    title="Retry"
                    icon={<RotateCcw size={14} color={colors.text} />}
                    disabled={Boolean(streaming)}
                    onPress={() => {
                      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, content: '', status: 'streaming' } : x)));
                      void run(`/chat/messages/${m.id}/retry`, {}, undefined, m.id);
                    }}
                  />
                </View>
              ) : null}
              {m.role === 'assistant' && m.status === 'complete' && m.content ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Copy reply" onPress={() => void Clipboard.setStringAsync(m.content)} style={{ flexDirection: 'row', gap: 4, alignItems: 'center', minHeight: 36 }}>
                  <Copy size={13} color={colors.muted} />
                  <Body muted style={{ fontSize: 12 }}>Copy</Body>
                </Pressable>
              ) : null}
              {m.role === 'assistant' && m.proposals?.length ? <View style={{ width: '100%' }}>{m.proposals.map((p, i) => <ProposalBlock key={i} p={p} />)}</View> : null}
            </View>
          ))}
        </ScrollView>

        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, padding: 10, gap: 6, backgroundColor: colors.bg }}>
          {error ? <ErrorNote message={error} /> : null}
          {voice.state === 'listening' ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.raised, borderRadius: 16, padding: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
              <Body style={{ flex: 1 }} numberOfLines={1}>{voice.interim || 'Listening…'}</Body>
              <Button variant="ghost" title="Done" onPress={voice.stop} />
              <IconButton label="Cancel voice input" onPress={voice.cancel}><X color={colors.muted} size={18} /></IconButton>
            </View>
          ) : null}
          {voice.message ? <Body style={{ color: colors.accentText, fontSize: 12 }}>{voice.message}</Body> : null}
          {viaVoice && input ? <Body muted style={{ fontSize: 12 }}>Transcribed from voice — edit if needed, then send.</Body> : null}
          {voice.state === 'unavailable' ? <Body muted style={{ fontSize: 12 }}>Voice input needs a development or App Store build (not Expo Go).</Body> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              accessibilityLabel="Message Friday"
              value={input}
              onChangeText={setInput}
              placeholder="Type a message…"
              placeholderTextColor="#8a7f70"
              multiline
              maxLength={4000}
              style={{ flex: 1, minHeight: 46, maxHeight: 140, borderRadius: 23, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised, color: colors.text, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16, fontFamily: fonts.sans }}
            />
            <IconButton
              label={voiceLabel}
              onPress={voice.state === 'listening' ? voice.stop : () => void voice.start()}
              disabled={voice.state === 'unavailable' || voice.state === 'denied' || Boolean(streaming)}
              style={{ backgroundColor: colors.accent, width: 46, height: 46, borderRadius: 23 }}
            >
              <Mic color={colors.onAccent} size={20} />
            </IconButton>
            {streaming ? (
              <IconButton label="Stop generating" onPress={() => abortRef.current?.abort()} style={{ backgroundColor: colors.panel, width: 46, height: 46, borderRadius: 23 }}>
                <Square color={colors.onPanel} size={16} />
              </IconButton>
            ) : (
              <IconButton label="Send message" onPress={send} disabled={!input.trim()} style={{ backgroundColor: colors.panel, width: 46, height: 46, borderRadius: 23 }}>
                <ArrowUp color={colors.onPanel} size={20} />
              </IconButton>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
