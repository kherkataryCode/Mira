'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Copy, History, Mic, Plus, RotateCcw, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import type { ChatMessage, Proposal } from '@/lib/types';
import { api, errorMessage, streamChat, type ChatEvent } from '@/lib/api';
import { newClientId, relativeTime } from '@/lib/format';
import { Badge, Button, ErrorNote, IconButton, Loading } from '@/components/ui';
import { EntryConfirm } from '@/components/EntryConfirm';
import { speak, stopSpeaking, useSpeechInput } from '@/components/useSpeech';
import { useSession } from '@/components/AppShell';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

type UiMessage = ChatMessage & { demo?: boolean; errorText?: string };

function ProposalBlock({ proposal }: { proposal: Proposal }) {
  const [done, setDone] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return <p className="text-xs text-muted">Proposal dismissed — nothing was saved.</p>;
  if (done) return <p role="status" className="text-sm text-positive">{done}</p>;
  return (
    <EntryConfirm
      compact
      draft={{
        kind: proposal.kind,
        title: proposal.title,
        dueAt: proposal.kind === 'reminder' ? proposal.remindAt : proposal.dueAt,
        priority: proposal.kind === 'task' ? proposal.priority : 'medium',
        recurrence: proposal.recurrence,
        ambiguities: proposal.needsConfirmation,
      }}
      onDone={setDone}
      onCancel={() => setDismissed(true)}
    />
  );
}

export default function ChatPage() {
  const { prefs, setPrefs } = useSession();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loadingConvo, setLoadingConvo] = useState(false);
  const [input, setInput] = useState('');
  const [viaVoice, setViaVoice] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const speakOn = prefs?.voice.speakResponses ?? false;

  const voice = useSpeechInput(
    useCallback((text: string) => {
      // Put the transcript in the composer for review — never auto-send.
      setInput((prev) => (prev ? `${prev} ${text}` : text));
      setViaVoice(true);
      inputRef.current?.focus();
    }, []),
  );

  const loadConversations = useCallback(async () => {
    const r = await api.get<{ conversations: Conversation[] }>('/chat/conversations');
    setConversations(r.conversations);
    return r.conversations;
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setLoadingConvo(true);
    setError(null);
    try {
      const r = await api.get<{ messages: ChatMessage[] }>(`/chat/conversations/${id}`);
      setConversationId(id);
      setMessages(r.messages);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingConvo(false);
      setShowHistory(false);
    }
  }, []);

  useEffect(() => {
    loadConversations()
      .then((list) => (list[0] ? openConversation(list[0].id) : undefined))
      .catch((e: unknown) => setError(errorMessage(e)));
    return () => abortRef.current?.abort();
  }, [loadConversations, openConversation]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const runStream = async (path: string, body: unknown, assistantId: string | null, userText?: string) => {
    const ctl = new AbortController();
    abortRef.current = ctl;
    let currentAssistant = assistantId;
    let full = '';
    setError(null);
    try {
      await streamChat(
        path,
        body,
        (e: ChatEvent) => {
          if (e.type === 'meta') {
            currentAssistant = e.assistantMessageId;
            setStreaming(e.assistantMessageId);
            if (!conversationId) setConversationId(e.conversationId);
            setMessages((prev) => {
              const withoutTemp = prev.filter((m) => m.id !== 'pending-user' && m.id !== e.assistantMessageId);
              const next = [...withoutTemp];
              if (userText !== undefined) {
                next.push({ id: e.userMessageId, role: 'user', content: userText, status: 'complete', provider: null, model: null, proposals: null, errorCode: null, createdAt: new Date().toISOString(), viaVoice });
              }
              next.push({ id: e.assistantMessageId, role: 'assistant', content: '', status: 'streaming', provider: null, model: null, proposals: e.proposals, errorCode: null, createdAt: new Date().toISOString() });
              return next;
            });
          } else if (e.type === 'delta') {
            full += e.text;
            const id = currentAssistant;
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + e.text } : m)));
          } else if (e.type === 'done') {
            const id = currentAssistant;
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'complete', provider: e.provider, model: e.model, demo: e.demo } : m)));
            if (speakOn) speak(full);
          } else if (e.type === 'error') {
            const id = currentAssistant;
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: e.code === 'cancelled' ? 'cancelled' : 'error', errorCode: e.code, errorText: e.message } : m)));
          }
        },
        ctl.signal,
      );
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      const id = currentAssistant;
      if (id) {
        setMessages((prev) => prev.map((m) => (m.id === id && m.status === 'streaming' ? { ...m, status: aborted ? 'cancelled' : 'error', errorText: aborted ? 'Stopped' : errorMessage(err) } : m)));
      } else {
        // The send failed before the server stored anything: keep the text so nothing is lost.
        setMessages((prev) => prev.filter((m) => m.id !== 'pending-user'));
        if (userText !== undefined) setInput(userText);
        if (!aborted) setError(errorMessage(err));
      }
      if (aborted && id) await api.post(`/chat/messages/${id}/cancel`).catch(() => undefined);
    } finally {
      setStreaming(null);
      abortRef.current = null;
      void loadConversations().catch(() => undefined);
    }
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    stopSpeaking();
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: 'pending-user', role: 'user', content: text, status: 'complete', provider: null, model: null, proposals: null, errorCode: null, createdAt: new Date().toISOString(), viaVoice },
    ]);
    const body = { content: text, clientMessageId: newClientId(), viaVoice, ...(conversationId ? { conversationId } : {}) };
    setViaVoice(false);
    await runStream('/chat/send', body, null, text);
  };

  const retry = (m: UiMessage) => {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, content: '', status: 'streaming', errorText: undefined } : x)));
    void runStream(`/chat/messages/${m.id}/retry`, {}, m.id);
  };

  const stop = () => abortRef.current?.abort();

  const copy = async (m: UiMessage) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(m.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Copy is not available in this browser.');
    }
  };

  const newChat = () => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const deleteConversation = async (id: string) => {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await api.del(`/chat/conversations/${id}`);
      if (id === conversationId) newChat();
      await loadConversations();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const toggleSpeak = async () => {
    if (!prefs) return;
    if (speakOn) stopSpeaking();
    const r = await api.patch<{ preferences: typeof prefs }>('/preferences', { voice: { speakResponses: !speakOn } }).catch(() => null);
    if (r) setPrefs(r.preferences);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.status === 'complete');
  const providerLabel = lastAssistant?.demo || lastAssistant?.provider === 'demo' ? 'Demo mode' : lastAssistant?.provider ? `${lastAssistant.provider} · ${lastAssistant.model}` : null;

  return (
    <div className="flex h-[calc(100dvh-var(--topbar-h)-env(safe-area-inset-top))] flex-col">
      <div className="compact-landscape flex items-center gap-2 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="display display-md">Chat</h1>
          <p className="truncate text-xs text-muted" aria-live="polite">{providerLabel ? `Answering with ${providerLabel}` : 'Ask, plan, or say “Remind me to…”'}</p>
        </div>
        <IconButton label={speakOn ? 'Mute spoken replies' : 'Speak replies aloud'} onClick={toggleSpeak} aria-pressed={speakOn}>
          {speakOn ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
        </IconButton>
        <IconButton label="Conversation history" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
          <History className="size-5" aria-hidden />
        </IconButton>
        <IconButton label="New chat" onClick={newChat}>
          <Plus className="size-5" aria-hidden />
        </IconButton>
      </div>

      {showHistory ? (
        <div className="mb-2 max-h-[40dvh] overflow-y-auto rounded-2xl border border-line bg-raised p-2 scrollbar-thin">
          {!conversations ? <Loading /> : conversations.length === 0 ? <p className="p-2 text-sm text-muted">No conversations yet.</p> : null}
          <ul>
            {conversations?.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <button onClick={() => void openConversation(c.id)} className={`min-h-11 flex-1 truncate rounded-xl px-3 text-left text-sm ${c.id === conversationId ? 'bg-surface font-semibold' : ''}`}>
                  {c.title} <span className="text-xs text-muted">· {relativeTime(c.updatedAt)}</span>
                </button>
                <IconButton label={`Delete conversation ${c.title}`} onClick={() => void deleteConversation(c.id)}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin" aria-live="polite" aria-busy={Boolean(streaming)}>
        {loadingConvo ? <Loading label="Loading conversation" /> : null}
        {!loadingConvo && messages.length === 0 ? (
          <div className="mx-auto mt-6 max-w-md text-center">
            <p className="display display-lg">How can I help?</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['What do I have today?', 'Remind me to call the dentist tomorrow at 5 PM', 'Add a task to review the firewall config on Friday 11am'].map((s) => (
                <button key={s} onClick={() => setInput(s)} className="min-h-11 rounded-full border border-line px-4 text-sm text-muted hover:text-text">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <ol className="flex flex-col gap-3 pb-4">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[min(42rem,88%)] flex-col gap-2 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-[0.95rem] leading-relaxed ${
                    m.role === 'user' ? 'rounded-br-md bg-green/45 text-text' : 'rounded-bl-md border border-line bg-surface'
                  }`}
                >
                  {m.role === 'assistant' && (m.demo || m.provider === 'demo') ? <div className="mb-1"><Badge tone="demo">Demo response</Badge></div> : null}
                  {m.content}
                  {m.status === 'streaming' && !m.content ? (
                    <span className="inline-flex gap-1" aria-label="Friday is thinking">
                      <span className="typing-dot size-1.5 rounded-full bg-muted" />
                      <span className="typing-dot size-1.5 rounded-full bg-muted" />
                      <span className="typing-dot size-1.5 rounded-full bg-muted" />
                    </span>
                  ) : null}
                  {m.viaVoice ? <span className="mt-1 block text-[0.7rem] text-muted">via voice</span> : null}
                </div>
                {m.role === 'assistant' && (m.status === 'error' || m.status === 'cancelled') ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={m.status === 'error' ? 'text-accent-text' : 'text-muted'}>
                      {m.status === 'cancelled' ? 'Stopped.' : (m.errorText ?? (m.errorCode === 'interrupted' ? 'This reply was interrupted.' : 'Friday could not answer.'))}
                    </span>
                    <Button variant="ghost" className="!min-h-9" onClick={() => retry(m)} disabled={Boolean(streaming)}>
                      <RotateCcw className="size-3.5" aria-hidden /> Retry
                    </Button>
                  </div>
                ) : null}
                {m.role === 'assistant' && m.status === 'complete' && m.content ? (
                  <button onClick={() => void copy(m)} className="inline-flex min-h-9 items-center gap-1 px-1 text-xs text-muted hover:text-text">
                    <Copy className="size-3.5" aria-hidden /> {copied === m.id ? 'Copied' : 'Copy'}
                  </button>
                ) : null}
                {m.role === 'assistant' && m.proposals?.length ? (
                  <div className="w-full min-w-[min(100%,20rem)]">{m.proposals.map((p, i) => <ProposalBlock key={i} proposal={p} />)}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {error ? <div className="pb-2"><ErrorNote message={error} /></div> : null}

      <form onSubmit={send} className="safe-bottom border-t border-line bg-bg pt-2">
        {voice.state === 'listening' ? (
          <div role="status" className="mb-2 flex items-center gap-2 rounded-2xl bg-raised px-3 py-2 text-sm">
            <span className="listening size-2.5 rounded-full bg-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{voice.interim || 'Listening…'}</span>
            <Button type="button" variant="ghost" className="!min-h-9" onClick={voice.stop}>Done</Button>
            <IconButton type="button" label="Cancel voice input" onClick={voice.cancel}><X className="size-4" aria-hidden /></IconButton>
          </div>
        ) : null}
        {voice.errorMsg ? <p role="alert" className="mb-2 text-xs text-accent-text">{voice.errorMsg}</p> : null}
        {viaVoice && input ? <p className="mb-1 text-xs text-muted">Transcribed from voice — edit if needed, then send.</p> : null}
        <div className="flex items-end gap-2">
          <label htmlFor="composer" className="sr-only">Message Friday</label>
          <textarea
            id="composer"
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={4000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message…"
            className="max-h-40 min-h-12 flex-1 resize-none rounded-3xl border border-line bg-raised px-4 py-3 text-[16px] placeholder:text-muted/70 focus:border-sand focus:outline-none"
          />
          <button
            type="button"
            onClick={voice.state === 'listening' ? voice.stop : voice.start}
            disabled={voice.state === 'unsupported' || voice.state === 'denied' || Boolean(streaming)}
            aria-label={voice.state === 'unsupported' ? 'Voice input is not supported in this browser' : voice.state === 'listening' ? 'Stop listening' : 'Start voice input'}
            title={voice.state === 'unsupported' ? 'Voice input is not supported in this browser' : voice.state === 'denied' ? 'Microphone permission denied' : 'Voice input'}
            className={`grid size-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition disabled:opacity-40 ${voice.state === 'listening' ? 'listening' : ''}`}
          >
            <Mic className="size-5" aria-hidden />
          </button>
          {streaming ? (
            <button type="button" onClick={stop} aria-label="Stop generating" className="grid size-12 shrink-0 place-items-center rounded-full bg-panel text-on-panel">
              <Square className="size-4" aria-hidden />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} aria-label="Send message" className="grid size-12 shrink-0 place-items-center rounded-full bg-panel text-on-panel disabled:opacity-40">
              <ArrowUp className="size-5" aria-hidden />
            </button>
          )}
        </div>
        {voice.state === 'unsupported' ? <p className="mt-1 text-xs text-muted">Voice input isn&apos;t available in this browser. Typing works everywhere.</p> : null}
      </form>
    </div>
  );
}
