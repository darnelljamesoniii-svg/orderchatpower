'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { TranscriptEntry } from '@/types';

interface UseSpeechTranscriptionOptions {
  onTranscript?: (entries: TranscriptEntry[]) => void;
  onObjection?: (text: string) => void;
}

const OBJECTION_KEYWORDS = [
  'not interested', 'too expensive', 'already have', 'no budget', 'cant afford',
  'call me back', 'send email', 'busy right now', 'not a good time', 'dont need',
  'have someone', 'contract', 'too much', 'happy with',
];

export function useSpeechTranscription(
  { onTranscript, onObjection }: UseSpeechTranscriptionOptions = {}
) {
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [lastText, setLastText] = useState('');

  const addEntry = useCallback(
    (text: string, speaker: 'agent' | 'lead' = 'lead') => {
      const entry: TranscriptEntry = { speaker, text, timestamp: new Date().toISOString() };
      setTranscript((prev) => {
        const next = [...prev, entry];
        onTranscript?.(next);
        return next;
      });
      setLastText(text);

      const lower = text.toLowerCase();
      if (OBJECTION_KEYWORDS.some((kw) => lower.includes(kw))) {
        onObjection?.(text);
      }
    },
    [onTranscript, onObjection]
  );

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (recognitionRef.current) return; // already running

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      console.warn('Speech recognition not supported');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          addEntry(String(event.results[i][0].transcript || '').trim(), 'lead');
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e?.error !== 'no-speech') console.error('Speech error:', e?.error ?? e);
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      if (recognitionRef.current) recognition.start();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [addEntry]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const clear = useCallback(() => setTranscript([]), []);

  useEffect(() => () => { stop(); }, [stop]);

  return { isListening, transcript, lastText, start, stop, clear, addEntry };
}
