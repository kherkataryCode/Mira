'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

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

/** Speaks text if the browser supports speech synthesis; silently no-ops otherwise. */
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/^Demo mode[^\n]*\n\n/, '').slice(0, 1000));
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
