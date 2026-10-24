import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

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
          setMessage('Microphone or speech permission is off. Enable it in iOS Settings → Friday.');
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
      setMessage('Microphone or speech permission is off. Enable it in iOS Settings → Friday.');
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

export function speak(text: string) {
  Speech.stop();
  Speech.speak(text.replace(/^Demo mode[^\n]*\n\n/, '').slice(0, 1000), { rate: 1.0 });
}

export function stopSpeaking() {
  Speech.stop();
}
