'use client';

import { useCallback, useState } from 'react';

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

  const makeCall = useCallback(async (_toE164: string) => {
    const err = new Error(
      'Browser calling is temporarily disabled while SignalWire client SDK is being corrected.'
    );
    setError(err.message);
    setState('error');
    onError?.(err);
  }, [onError]);

  const hangUp = useCallback(() => {
    setState('idle');
    setCallSid(null);
    setDuration(0);
    onCallDisconnected?.();
  }, [onCallDisconnected]);

  const mute = useCallback((_muted: boolean) => {
    // no-op for temporary stub
  }, []);

  const reinit = useCallback(async () => {
    setError(null);
    setState('idle');
  }, []);

  return { state, error, callSid, duration, makeCall, hangUp, mute, reinit };
}
