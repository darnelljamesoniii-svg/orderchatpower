'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CallState = 'idle' | 'connecting' | 'ringing' | 'in-call' | 'disconnecting' | 'error';

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

  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setDuration(0);
  };

  const ensureAudioEl = () => {
    if (audioElRef.current) return audioElRef.current;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.playsInline = true;
    document.body.appendChild(el);
    audioElRef.current = el;
    return el;
  };

  const init = useCallback(async () => {
    setError(null);
    setState('connecting');

    try {
      // IMPORTANT: your token route expects POST
      const res = await fetch('/api/signalwire/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.token) throw new Error(data?.error || 'Token fetch failed');

      const device = new Device(data.token, {
        codecPreferences: ['opus', 'pcmu'],
        enableRingingState: true,
      });

      device.on('ready', () => setState('idle'));
      device.on('error', (e: any) => {
        const err = e instanceof Error ? e : new Error(String(e?.message ?? 'Device error'));
        setError(err.message);
        setState('error');
        onError?.(err);
      });

      device.on('connect', (call: any) => {
        callRef.current = call;
        setCallSid(call?.parameters?.CallSid ?? null);
        setState('in-call');

        // attach remote audio -> your headphones
        try {
          const audioEl = ensureAudioEl();
          const remote = call?.getRemoteStream?.();
          if (remote) audioEl.srcObject = remote;
        } catch {}

        startTimer();
        onCallConnected?.(call);
      });

      device.on('disconnect', () => {
        callRef.current = null;
        setState('idle');
        stopTimer();
        onCallDisconnected?.();
      });

      deviceRef.current = device;
      device.register();
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error('Init failed');
      setError(err.message);
      setState('error');
      onError?.(err);
    }
  }, [agentId, onCallDisconnected, onCallConnected, onError]);

  useEffect(() => {
    if (agentId) init();
    return () => {
      stopTimer();
      try {
        deviceRef.current?.destroy?.();
      } catch {}
      if (audioElRef.current) {
        audioElRef.current.remove();
        audioElRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // NOTE: in WebRTC mode, pass the PHONE NUMBER as "to"
  const makeCall = useCallback(async (toE164: string) => {
    try {
      setError(null);
      if (!deviceRef.current) throw new Error('Device not ready');

      // mic permission prompt happens here
      setState('ringing');

      const call = deviceRef.current.connect({
        params: { To: toE164 }, // this hits your SignalWire LaML App webhook
      });

      callRef.current = call;

      // optional: if SDK emits ringing state
      call?.on?.('ringing', () => setState('ringing'));
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error('Call failed');
      setError(err.message);
      setState('error');
      stopTimer();
      onError?.(err);
    }
  }, [onError]);

  const hangUp = useCallback(() => {
    setState('disconnecting');
    try {
      callRef.current?.disconnect?.();
    } catch {}
    callRef.current = null;
    setCallSid(null);
    stopTimer();
    setState('idle');
  }, []);

  const mute = useCallback((muted: boolean) => {
    try {
      callRef.current?.mute?.(muted);
    } catch {}
  }, []);

  return { state, error, callSid, duration, makeCall, hangUp, mute, reinit: init };
}
