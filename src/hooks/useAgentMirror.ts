'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export function useAgentMirror() {
  const videoRef    = useRef<HTMLVideoElement | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const [ready,     setReady]    = useState(false);
  const [error,     setError]    = useState<string | null>(null);
  const [mirrored,  setMirrored] = useState(true);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setReady(true);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Camera access denied');
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  return { videoRef, ready, error, mirrored, setMirrored };
}
