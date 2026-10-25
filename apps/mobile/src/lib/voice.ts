import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { speakableText } from '@friday/shared';
import { API_URL, api, getToken } from './api';

export type VoiceState = 'unavailable' | 'idle' | 'listening' | 'denied' | 'error';

type RecognitionModule = typeof import('expo-speech-recognition');

/**
 * expo-speech-recognition is a native module: it works in a development/production build,
 * not in Expo Go. When it is missing we report voice as unavailable instead of faking it.
 */
function loadModule(): RecognitionModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition') as RecognitionModule;
    return mod.ExpoSpeechRecognitionModule?.isRecognitionAvailable?.() ? mod : null;
  } catch {
    return null;
  }
}

export function useVoiceInput(onFinal: (text: string) => void) {
  const modRef = useRef<RecognitionModule | null>(null);
  const [state, setState] = useState<VoiceState>('idle');
  const [interim, setInterim] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const finalText = useRef('');
  const cancelled = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const mod = loadModule();
    modRef.current = mod;
    if (!mod) {
      setState('unavailable');
      return;
    }
    const subs = [
      mod.ExpoSpeechRecognitionModule.addListener('result', (e) => {
        const t = e.results[0]?.transcript ?? '';
        finalText.current = t;
        setInterim(t);
      }),
      mod.ExpoSpeechRecognitionModule.addListener('error', (e) => {
        if (e.error === 'not-allowed') {
          setState('denied');
          setMessage('Microphone or speech permission is off. Enable it in iOS Settings → Mira.');
        } else if (e.error === 'no-speech' || e.error === 'speech-timeout') {
          setMessage("Didn't catch that — try again.");
          setState('idle');
        } else if (e.error !== 'aborted') {
          setState('error');
          setMessage('Voice input is unavailable right now.');
        }
      }),
      mod.ExpoSpeechRecognitionModule.addListener('end', () => {
        setState((s) => (s === 'listening' ? 'idle' : s));
        if (!cancelled.current && finalText.current.trim()) onFinalRef.current(finalText.current.trim());
        setInterim('');
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const start = useCallback(async () => {
    const mod = modRef.current;
    if (!mod) return;
    setMessage(null);
    const perm = await mod.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setState('denied');
      setMessage('Microphone or speech permission is off. Enable it in iOS Settings → Mira.');
      return;
    }
    finalText.current = '';
    cancelled.current = false;
    Speech.stop();
    mod.ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: false });
    setState('listening');
  }, []);

  const stop = useCallback(() => modRef.current?.ExpoSpeechRecognitionModule.stop(), []);
  const cancel = useCallback(() => {
    cancelled.current = true;
    modRef.current?.ExpoSpeechRecognitionModule.abort();
  }, []);

  return { state, interim, message, start, stop, cancel };
}

/* ---------------------------------------------------------------- */
/* Mira's voice                                                      */
/* ---------------------------------------------------------------- */

/** Natural-sounding female iOS voices, best first. "Enhanced"/"Premium" variants are preferred. */
const FEMALE_VOICES = ['Ava', 'Zoe', 'Samantha', 'Allison', 'Susan', 'Serena', 'Karen', 'Moira', 'Tessa', 'Fiona', 'Isha', 'Veena', 'Nicky', 'Kate', 'Victoria'];

export async function englishVoices(): Promise<Speech.Voice[]> {
  try {
    return (await Speech.getAvailableVoicesAsync()).filter((v) => v.language.toLowerCase().startsWith('en'));
  } catch {
    return [];
  }
}

export async function pickMiraVoice(preferred: string | null | undefined): Promise<Speech.Voice | null> {
  const voices = await englishVoices();
  if (preferred) {
    const exact = voices.find((v) => v.identifier === preferred);
    if (exact) return exact;
  }
  const score = (v: Speech.Voice) => {
    const i = FEMALE_VOICES.findIndex((n) => v.name.startsWith(n));
    const quality = v.quality === Speech.VoiceQuality.Enhanced || /premium|enhanced/i.test(v.name) ? -100 : 0;
    return (i < 0 ? 1000 : i) + quality;
  };
  const ranked = [...voices].sort((a, b) => score(a) - score(b));
  return ranked[0] && score(ranked[0]) < 1000 ? ranked[0] : null;
}

let player: AudioPlayer | null = null;

/**
 * Speaks as Mira: the natural server voice when available (a lifelike female voice),
 * otherwise the best female voice installed on this iPhone. Resolves to which was used.
 */
export async function speak(text: string, opts: { natural?: boolean; voiceId?: string | null } = {}): Promise<'natural' | 'device'> {
  stopSpeaking();
  if (opts.natural !== false) {
    try {
      const { url } = await api.post<{ url: string }>('/voice/clips', { text: text.slice(0, 20000) });
      await setAudioModeAsync({ playsInSilentMode: true });
      player = createAudioPlayer({ uri: `${API_URL}${url}`, headers: { authorization: `Bearer ${getToken() ?? ''}` } });
      player.play();
      return 'natural';
    } catch {
      /* fall back to the device voice */
    }
  }
  const voice = await pickMiraVoice(opts.voiceId);
  Speech.speak(speakableText(text, 3000), { voice: voice?.identifier, language: voice?.language ?? 'en-IN', pitch: 1.05, rate: 1.0 });
  return 'device';
}

export function stopSpeaking() {
  try {
    player?.pause();
    player?.remove();
  } catch {
    /* already released */
  }
  player = null;
  Speech.stop();
}
