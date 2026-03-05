'use client';

// ─── useSignalWireDevice (Server-Call Mode) ───────────────────────────────────
// Remote-team friendly: no browser Voice SDK, no mic permissions, no tokens.
// UI triggers server-side call initiation, backend/webhooks handle call lifecycle.

import { useEffect, useRef, useState, useCallback } from 'react';

export type CallState = 'idle' | 'connecting' | 'ringing' | 'in-call' | 'disconnecting' | 'error';

interface UseSignalWireDeviceOptions {
  agentId: string;
  onCallConnected?: (meta?: { callSid?: string | null }) => void;
  onCallDisconnected?: (meta?: { callSid?: string | null }) => void;
  onError?: (error: Error) => void;
}

export function useSignalWireDevice({
  agentId,
  onCallConnected,
  onCallDisconnected,
  onError,
}: UseSignalWireDeviceOptions) {
  const [state, setState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [callSid, setCallSid] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDuration(0);
  }, []);

  // Optional: if you later wire a realtime listener / polling endpoint to detect
  // answered/completed, you can transition states more accurately.
  const init = useCallback(async () => {
    // no-op in server-call mode
    setError(null);
    setState('idle');
  }, []);

  useEffect(() => {
    if (agentId) init();
    return () => {
      stopTimer();
    };
  }, [agentId, init, stopTimer]);

  const makeCall = useCallback(
    async (leadID: string) => {
      if (!agentId) {
        const e = new Error('Missing agentId');
        setError(e.message);
        setState('error');
        onError?.(e);
        return;
      }

      setError(null);
      setState('connecting');

      try {
        const res = await fetch('/api/calls/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, leadId: leadID }),
        });

        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) throw new Error(data?.error || 'Failed to start call');

        setCallSid(data?.callSid ?? null);

        // In server-side calling, "ringing/answered/completed" are best driven by webhooks.
        // We'll optimistically show ringing now.
        setState('ringing');

        // If you want to start timer only when actually answered, start it from a webhook-driven UI update instead.
        // For now, start it here so reps see time ticking.
        startTimer();

        onCallConnected?.({ callSid: data?.callSid ?? null });
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error('Call failed');
        setError(e.message);
        setState('error');
        stopTimer();
        onError?.(e);
      }
    },
    [agentId, onCallConnected, onError, startTimer, stopTimer],
  );

  const hangUp = useCallback(async () => {
    // If you have an API endpoint to end calls, call it here.
    // For now, just reset local UI state.
    setState('idle');
    setCallSid(null);
    stopTimer();
    onCallDisconnected?.({ callSid });
  }, [callSid, onCallDisconnected, stopTimer]);

  const mute = useCallback((_muted: boolean) => {
    // No-op in server-call mode (muting requires browser audio or a provider feature).
  }, []);

  return { state, error, callSid, duration, makeCall, hangUp, mute, reinit: init };
}
