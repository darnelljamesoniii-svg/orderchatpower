'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CallState =
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'in-call'
  | 'disconnecting'
  | 'error';

interface UseSignalWireDeviceOptions {
  agentId: string;
  onCallConnected?: (call: any) => void;
  onCallDisconnected?: () => void;
  onError?: (error: Error) => void;
}

interface MakeCallResponse {
  ok?: boolean;
  callSid?: string | null;
  callLogId?: string | null;
  error?: string;
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

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    tickRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const makeCall = useCallback(async (_toE164: string, leadId?: string) => {
    try {
      setError(null);
      setState('connecting');

      if (!leadId) {
        throw new Error('leadId is required to start a call.');
      }

      const res = await fetch('/api/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, agentId }),
      });

      const data = (await res.json()) as MakeCallResponse;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? 'Failed to start call.');
      }

      const sid = data.callSid ?? null;
      setCallSid(sid);
      setDuration(0);

      setState('ringing');
      window.setTimeout(() => {
        setState('in-call');
        startTimer();
        onCallConnected?.({ callSid: sid, callLogId: data.callLogId ?? null });
      }, 700);

      return { callSid: sid, callLogId: data.callLogId ?? null };
    } catch (err: any) {
      const wrapped = err instanceof Error ? err : new Error(err?.message ?? 'Call failed');
      setError(wrapped.message);
      setState('error');
      onError?.(wrapped);
      return null;
    }
  }, [agentId, onCallConnected, onError, startTimer]);

  const hangUp = useCallback(async () => {
    setState('disconnecting');

    try {
      if (callSid) {
        await fetch('/api/calls/hangup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid }),
        }).catch(() => {});
      }
    } finally {
      stopTimer();
      setState('idle');
      setCallSid(null);
      setDuration(0);
      onCallDisconnected?.();
    }
  }, [callSid, onCallDisconnected, stopTimer]);

  const mute = useCallback((_muted: boolean) => {
    // Server-initiated calling path does not expose browser media tracks yet.
  }, []);

  const reinit = useCallback(async () => {
    stopTimer();
    setError(null);
    setState('idle');
    setCallSid(null);
    setDuration(0);
  }, [stopTimer]);

  return { state, error, callSid, duration, makeCall, hangUp, mute, reinit };
}
