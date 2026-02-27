'use client';

// ─── useSignalWireDevice ──────────────────────────────────────────────────────
// Drop-in replacement for useTwilioDevice.
// SignalWire's @signalwire/js browser SDK has near-identical API surface.

import { useEffect, useRef, useState, useCallback } from 'react';

// SignalWire JS SDK types (we import dynamically to avoid SSR issues)
type SWCall   = { parameters: { CallSid?: string }; mute: (m: boolean) => void; disconnect: () => void; on: (ev: string, cb: (...args: unknown[]) => void) => void };
type SWDevice = { connect: (opts: { params: Record<string, string> }) => Promise<SWCall>; register: () => Promise<void>; destroy: () => void; on: (ev: string, cb: (...args: unknown[]) => void) => void };

export type CallState = 'idle' | 'connecting' | 'ringing' | 'in-call' | 'disconnecting' | 'error';

interface UseSignalWireDeviceOptions {
  agentId:             string;
  onCallConnected?:    (call: SWCall) => void;
  onCallDisconnected?: (call: SWCall) => void;
  onError?:            (error: Error) => void;
}

export function useSignalWireDevice({
  agentId,
  onCallConnected,
  onCallDisconnected,
  onError,
}: UseSignalWireDeviceOptions) {
  const deviceRef = useRef<SWDevice | null>(null);
  const callRef   = useRef<SWCall   | null>(null);

  const [state,    setState]    = useState<CallState>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [callSid,  setCallSid]  = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setDuration(0);
  }, []);

  const init = useCallback(async () => {
try {
  // Fetch access token from our API
  const res = await fetch('/api/signalwire/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });

  const { token } = await res.json();
  if (!token) throw new Error('No token returned from /api/signalwire/token');

  // Dynamically import SignalWire JS SDK (avoids SSR crash)
  const SW = await import('@signalwire/js');

  const Voice = (SW as any).default?.Voice ?? (SW as any).Voice;
  if (!Voice?.Client) {
    throw new Error('SignalWire Voice Client not found on @signalwire/js export');
  }

  const device = new Voice.Client(token, {
    logLevel: 'error',
    // keep your existing options
  });

  await device.register();
  deviceRef.current = device;
  setState('idle');

} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : 'Device init failed';
  setError(msg);
  setState('error');
}
  }, [agentId, onCallConnected, onError, startTimer]);

  useEffect(() => {
    if (agentId) init();
    return () => {
      deviceRef.current?.destroy();
      stopTimer();
    };
  }, [agentId, init, stopTimer]);

  const makeCall = useCallback(async (toNumber: string) => {
    if (!deviceRef.current) { setError('Device not ready'); return; }
    setState('connecting');

    try {
      const call = await deviceRef.current.connect({ params: { To: toNumber } });
      callRef.current = call;

      call.on('accept', () => {
        setState('in-call');
        setCallSid(call.parameters?.CallSid ?? null);
        startTimer();
        onCallConnected?.(call);
      });

      call.on('disconnect', () => {
        setState('idle');
        setCallSid(null);
        stopTimer();
        onCallDisconnected?.(call);
        callRef.current = null;
      });

      call.on('error', (err: Error) => {
        setError(err.message);
        setState('error');
        stopTimer();
      });

      setState('ringing');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Call failed');
      setState('error');
    }
  }, [onCallConnected, onCallDisconnected, startTimer, stopTimer]);

  const hangUp = useCallback(() => {
    callRef.current?.disconnect();
    setState('idle');
    stopTimer();
  }, [stopTimer]);

  const mute = useCallback((muted: boolean) => {
    callRef.current?.mute(muted);
  }, []);

  return { state, error, callSid, duration, makeCall, hangUp, mute, reinit: init };
}
