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
  const shouldListenRef = useRef(false);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [lastText, setLastText] = useState('');

  const addEntry = useCallback(
    (text: string, speaker: 'agent' | 'lead' = 'lead') => {
      const cleaned = String(text || '').trim();
      if (!cleaned) return;

      const entry: TranscriptEntry = {
        speaker,
        text: cleaned,
        timestamp: new Date().toISOString(),
      };

      setTranscript((prev) => {
        const next = [...prev, entry];
        onTranscript?.(next);
        return next;
      });

      setLastText(cleaned);

      const lower = cleaned.toLowerCase();
      if (OBJECTION_KEYWORDS.some((kw) => lower.includes(kw))) {
        onObjection?.(cleaned);
      }
    },
    [onTranscript, onObjection]
  );

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      console.warn('Speech recognition not supported');
      return;
    }

    // If already running, just mark intent and return
    shouldListenRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.start?.(); } catch {}
      setIsListening(true);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          addEntry(event.results[i][0]?.transcript, 'lead');
        }
      }
    };

    recognition.onerror = (e: any) => {
      // no-speech is common noise; ignore it
      if (e?.error !== 'no-speech') console.error('Speech error:', e?.error ?? e);
    };

    recognition.onend = () => {
      // only restart if user still wants listening
      if (shouldListenRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;

    try { recognition.start(); } catch {}
    setIsListening(true);
  }, [addEntry]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);

    try { recognitionRef.current?.stop?.(); } catch {}
    recognitionRef.current = null;
  }, []);

  const clear = useCallback(() => setTranscript([]), []);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      shouldListenRef.current = false;
      try { recognitionRef.current?.stop?.(); } catch {}
      recognitionRef.current = null;
    };
  }, []);

  return { isListening, transcript, lastText, start, stop, clear, addEntry };
}
