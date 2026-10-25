'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { speakableText } from '@friday/shared';

/* Minimal typings for the Web Speech API (not in lib.dom for all browsers). */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type Ctor = new () => SpeechRecognitionLike;

export type VoiceState = 'unsupported' | 'idle' | 'listening' | 'denied' | 'error';

/**
 * Browser speech-to-text (Web Speech API). Shows real states only: if the browser lacks
 * support or permission is denied, voice is reported as unavailable — never a fake success.
 */
export function useSpeechInput(onFinal: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [interim, setInterim] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef('');
  const cancelled = useRef(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) setState('unsupported');
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C) {
      setState('unsupported');
      return;
    }
    const rec = new C();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    finalRef.current = '';
    cancelled.current = false;
    setInterim('');
    setErrorMsg(null);
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i]![0]!.transcript;
      finalRef.current = text;
      setInterim(text);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setState('denied');
        setErrorMsg('Microphone permission was denied. Allow it in your browser settings to use voice.');
      } else if (e.error === 'no-speech') {
        setErrorMsg("Didn't catch anything — try again.");
        setState('idle');
      } else if (e.error !== 'aborted') {
        setState('error');
        setErrorMsg('Voice input is unavailable right now.');
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setState((s) => (s === 'listening' ? 'idle' : s));
      if (!cancelled.current && finalRef.current.trim()) onFinal(finalRef.current.trim());
      setInterim('');
    };
    recRef.current = rec;
    try {
      rec.start();
      setState('listening');
    } catch {
      setState('error');
      setErrorMsg('Could not start the microphone.');
    }
  }, [onFinal]);

  const stop = useCallback(() => recRef.current?.stop(), []);
  const cancel = useCallback(() => {
    cancelled.current = true;
    recRef.current?.abort();
  }, []);

  return { state, interim, errorMsg, start, stop, cancel };
}

/* ---------------------------------------------------------------- */
/* Mira's voice                                                      */
/* ---------------------------------------------------------------- */

/** Natural-sounding female voices, best first, across Edge, Chrome, Safari and Windows. */
const FEMALE_VOICES = [
  'Microsoft Aria Online (Natural)', 'Microsoft Jenny Online (Natural)', 'Microsoft Sonia Online (Natural)', 'Microsoft Neerja Online (Natural)',
  'Microsoft Ava Online (Natural)', 'Microsoft Emma Online (Natural)', 'Google UK English Female', 'Google US English',
  'Ava', 'Samantha', 'Allison', 'Susan', 'Zoe', 'Serena', 'Karen', 'Moira', 'Tessa', 'Fiona', 'Veena', 'Isha', 'Victoria', 'Microsoft Zira',
];

export function englishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

/** The chosen voice, else the most natural known female English voice available. */
export function pickMiraVoice(preferred: string | null | undefined): SpeechSynthesisVoice | null {
  const voices = englishVoices();
  if (preferred) {
    const exact = voices.find((v) => v.name === preferred);
    if (exact) return exact;
  }
  const score = (v: SpeechSynthesisVoice) => {
    const i = FEMALE_VOICES.findIndex((n) => v.name.startsWith(n));
    const natural = /natural|premium|enhanced|neural/i.test(v.name) ? -100 : 0;
    return (i < 0 ? 1000 : i) + natural;
  };
  const ranked = [...voices].sort((a, b) => score(a) - score(b));
  return ranked[0] && score(ranked[0]) < 1000 ? ranked[0] : (voices[0] ?? null);
}

let currentAudio: HTMLAudioElement | null = null;

function speakWithDevice(text: string, voiceName: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakableText(text, 3000));
  const v = pickMiraVoice(voiceName);
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  u.rate = 1;
  u.pitch = 1.05;
  window.speechSynthesis.speak(u);
  return true;
}

/**
 * Speaks as Mira: the natural server voice when available (a lifelike female voice),
 * otherwise the best female voice this browser has. Resolves to which one was used.
 */
export async function speak(text: string, opts: { natural?: boolean; voiceName?: string | null } = {}): Promise<'natural' | 'device' | 'none'> {
  stopSpeaking();
  if (opts.natural !== false) {
    try {
      const res = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-friday-csrf': '1' },
        credentials: 'same-origin',
        body: JSON.stringify({ text: text.slice(0, 20000) }),
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url);
        currentAudio = audio;
        audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
        await audio.play();
        return 'natural';
      }
    } catch {
      /* fall back to the device voice */
    }
  }
  return speakWithDevice(text, opts.voiceName) ? 'device' : 'none';
}

export function stopSpeaking() {
  currentAudio?.pause();
  currentAudio = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
