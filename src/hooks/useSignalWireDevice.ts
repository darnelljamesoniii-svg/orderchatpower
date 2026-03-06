'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Device } from '@signalwire/compatibility-api';

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
  const [callSid, setCallSid] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<any>(null);

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setDuration(0);
  };

  const init = useCallback(async () => {

    try {
      const res = await fetch('/api/signalwire/token');
      const data = await res.json();

      const device = new Device(data.token, {
        codecPreferences: ['opus','pcmu'],
        fakeLocalDTMF: true,
        enableRingingState: true
      });

      deviceRef.current = device;

      device.on('ready', () => {
        console.log('SignalWire device ready');
      });

      device.on('error', (err:any) => {
        setState('error');
        onError?.(err);
      });

      device.on('connect', (call:any) => {

        callRef.current = call;
        setCallSid(call.parameters?.CallSid ?? null);
        setState('in-call');

        const audio = new Audio();
        audio.autoplay = true;
        audio.srcObject = call.getRemoteStream();
        audioRef.current = audio;

        startTimer();
        onCallConnected?.(call);
      });

      device.on('disconnect', () => {
        setState('idle');
        stopTimer();
        onCallDisconnected?.();
      });

      device.register();

    } catch (err:any) {
      setState('error');
      onError?.(err);
    }

  }, [onCallConnected, onCallDisconnected, onError]);

  useEffect(() => {
    if (agentId) init();
    return () => stopTimer();
  }, [agentId, init]);

  const makeCall = useCallback(async (leadId: string) => {

    if (!deviceRef.current) return;

    setState('connecting');

    const call = deviceRef.current.connect({
      params: { leadId }
    });

    callRef.current = call;

    call.on('ringing', () => setState('ringing'));

  }, []);

  const hangUp = useCallback(() => {

    if (callRef.current) {
      callRef.current.disconnect();
      callRef.current = null;
    }

  }, []);

  const mute = useCallback((muted:boolean) => {
    if (!callRef.current) return;
    callRef.current.mute(muted);
  }, []);

  return {
    state,
    callSid,
    duration,
    makeCall,
    hangUp,
    mute,
    reinit: init
  };
}
