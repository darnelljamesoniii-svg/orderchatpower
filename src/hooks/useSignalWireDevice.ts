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

type BrowserTokenResponse = {
  ok?: boolean;
  project?: string;
  token?: string;
  error?: string;
};

function normalizeE164(input: string): string {
  const raw = (input ?? '').toString().trim();
  if (!raw) return '';

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');

  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return raw;
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
  const clientRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const connectedFiredRef = useRef(false);

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

  const fireConnectedOnce = useCallback(() => {
    if (connectedFiredRef.current) return;
    connectedFiredRef.current = true;
    onCallConnected?.({ callSid: null, callLogId: null });
  }, [onCallConnected]);

  const cleanupCall = useCallback(() => {
    stopTimer();
    callRef.current = null;
    connectedFiredRef.current = false;
    setCallSid(null);
    setDuration(0);
    setState('idle');
    onCallDisconnected?.();
  }, [onCallDisconnected, stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const ensureClient = useCallback(async () => {
    if (clientRef.current) return clientRef.current;

    const tokenRes = await fetch('/api/signalwire/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });

    const tokenData = (await tokenRes.json()) as BrowserTokenResponse;
    if (!tokenRes.ok || !tokenData?.token) {
      throw new Error(tokenData?.error ?? 'Unable to initialize browser calling token');
    }

    const mod = await import('@signalwire/js');
    const client = await mod.SignalWire({
      ...(tokenData.project ? { project: tokenData.project } : {}),
      token: tokenData.token,
    } as any);

    clientRef.current = client;
    return client;
  }, [agentId]);

  const makeCall = useCallback(async (toRaw: string, leadId?: string) => {
    try {
      setError(null);
      setState('connecting');
      setDuration(0);
      connectedFiredRef.current = false;

      const to = normalizeE164(toRaw);
      if (!to || !to.startsWith('+')) {
        throw new Error('Lead missing/invalid phone number');
      }

      if (!leadId) {
        throw new Error('leadId is required to start a call.');
      }

      const client = await ensureClient();
      const call = await client.dial({
        to,
        audio: true,
        video: false,
        negotiateAudio: true,
        negotiateVideo: false,
      });

      callRef.current = call;
      setState('ringing');

      call.on('call.state', (evt: any) => {
        const nextState = String(evt?.callState ?? evt?.call_state ?? evt?.state ?? '').toLowerCase();

        if (nextState.includes('ring')) {
          setState('ringing');
          return;
        }

        if (nextState.includes('answer') || nextState.includes('active') || nextState.includes('progress')) {
          setState('in-call');
          startTimer();
          fireConnectedOnce();
          return;
        }

        if (
          nextState.includes('end') ||
          nextState.includes('hangup') ||
          nextState.includes('fail') ||
          nextState.includes('busy') ||
          nextState.includes('complete')
        ) {
          cleanupCall();
        }
      });

      call.once('room.subscribed', () => {
        setState('in-call');
        startTimer();
        fireConnectedOnce();
      });

      call.once('destroy', () => {
        cleanupCall();
      });

      // Start/answer media session. Without this, the dialed call object may never bridge audio.
      await call.start();

      return { callSid: null, callLogId: null };
    } catch (err: any) {
      const wrapped = err instanceof Error ? err : new Error(err?.message ?? 'Call failed');
      setError(wrapped.message);
      setState('error');
      onError?.(wrapped);
      return null;
    }
  }, [cleanupCall, ensureClient, fireConnectedOnce, onError, startTimer]);

  const hangUp = useCallback(async () => {
    setState('disconnecting');

    try {
      if (callRef.current && typeof callRef.current.hangup === 'function') {
        await callRef.current.hangup();
      }
    } catch {
      // best effort
    } finally {
      cleanupCall();
    }
  }, [cleanupCall]);

  const mute = useCallback(async (muted: boolean) => {
    const call = callRef.current;
    if (!call) return;

    try {
      if (muted) {
        await call.audioMute?.();
      } else {
        await call.audioUnmute?.();
      }
    } catch {
      // best effort
    }
  }, []);

  const reinit = useCallback(async () => {
    stopTimer();
    setError(null);
    setState('idle');
    setCallSid(null);
    setDuration(0);

    try {
      if (callRef.current?.hangup) {
        await callRef.current.hangup();
      }
    } catch {
      // best effort
    }

    callRef.current = null;

    try {
      await clientRef.current?.disconnect?.();
    } catch {
      // best effort
    }
    clientRef.current = null;
    connectedFiredRef.current = false;
  }, [stopTimer]);

  return { state, error, callSid, duration, makeCall, hangUp, mute, reinit };
}
