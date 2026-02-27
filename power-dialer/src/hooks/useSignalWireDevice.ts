'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type CallState =
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'in-call'
  | 'disconnecting'
  | 'error'

// Minimal types we actually use from Relay v2
type RelayClient = {
  connect: () => Promise<void>
  disconnect: () => void
  newCall: (opts: { destinationNumber: string; callerNumber?: string }) => Promise<RelayCall>
  on: (ev: string, cb: (...args: any[]) => void) => RelayClient
  off: (ev: string, cb?: (...args: any[]) => void) => RelayClient
}

type RelayCall = {
  id: string
  state: string
  hangup: () => void
  deaf: () => void          // mute mic
  undeaf: () => void        // unmute mic
}

type RelayNotification =
  | { type: 'callUpdate'; call: RelayCall }
  | { type: 'refreshToken' }
  | { type: 'participantData' }
  | { type: 'userMediaError'; error: Error }
  | { type: string; [k: string]: any }

interface UseSignalWireDeviceOptions {
  agentId: string
  onCallConnected?: (call: RelayCall) => void
  onCallDisconnected?: (call: RelayCall) => void
  onError?: (error: Error) => void
}

export function useSignalWireDevice({
  agentId,
  onCallConnected,
  onCallDisconnected,
  onError,
}: UseSignalWireDeviceOptions) {
  const clientRef = useRef<RelayClient | null>(null)
  const callRef = useRef<RelayCall | null>(null)
  const callerNumberRef = useRef<string | undefined>(undefined)

  const [state, setState] = useState<CallState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [callSid, setCallSid] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setDuration(0)
  }, [])

  const resetCall = useCallback(() => {
    callRef.current = null
    setCallSid(null)
    stopTimer()
    setState('idle')
  }, [stopTimer])

  const mapRelayCallState = (s: string): CallState => {
    // Relay v2 Call states include: new/trying/requesting/ringing/answering/early/active/held/hangup/destroy/purge :contentReference[oaicite:4]{index=4}
    switch (s) {
      case 'trying':
      case 'requesting':
      case 'new':
      case 'answering':
      case 'early':
        return 'connecting'
      case 'ringing':
        return 'ringing'
      case 'active':
      case 'held':
        return 'in-call'
      case 'hangup':
      case 'destroy':
      case 'purge':
        return 'disconnecting'
      default:
        return 'connecting'
    }
  }

  const init = useCallback(async () => {
    try {
      setError(null)
      setState('connecting')

      const res = await fetch('/api/signalwire/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      })

      if (!res.ok) throw new Error(`Token endpoint failed (${res.status})`)

      const { token, project, callerNumber } = (await res.json()) as {
        token?: string
        project?: string
        callerNumber?: string
      }

      if (!token || !project) throw new Error('Missing { token, project } from /api/signalwire/token')

      callerNumberRef.current = callerNumber

      // IMPORTANT: Relay Browser SDK v2 is @signalwire/js@^1 :contentReference[oaicite:5]{index=5}
      const mod: any = await import('@signalwire/js')
      const RelayCtor = mod?.Relay ?? mod?.default?.Relay
      if (!RelayCtor) throw new Error('Relay not found (did you pin @signalwire/js@^1?)')

      const client: RelayClient = new RelayCtor({ project, token })

      const onReady = () => setState('idle')
      const onErr = (e: any) => {
        const err = e instanceof Error ? e : new Error(String(e?.message ?? e))
        setError(err.message)
        setState('error')
        onError?.(err)
      }

      const onNotif = (n: RelayNotification) => {
        // Notifications include callUpdate + userMediaError etc. :contentReference[oaicite:6]{index=6}
        if (n.type === 'userMediaError') {
          setError(n.error?.message ?? 'Microphone permission error')
          setState('error')
          return
        }

        if (n.type === 'callUpdate' && n.call?.id) {
          // only track the active call
          if (callRef.current && n.call.id !== callRef.current.id) return

          const next = mapRelayCallState(n.call.state)
          if (next === 'in-call') {
            if (state !== 'in-call') {
              startTimer()
              onCallConnected?.(n.call)
            }
            setState('in-call')
          } else if (next === 'disconnecting') {
            // Relay will continue to dispatch until it’s fully done; we finalize when it hits end-ish states.
            setState('disconnecting')
            // Treat hangup/destroy/purge as end
            if (['hangup', 'destroy', 'purge'].includes(n.call.state)) {
              onCallDisconnected?.(n.call)
              resetCall()
            }
          } else {
            setState(next)
          }
        }
      }

      client.on('signalwire.ready', onReady)
      client.on('signalwire.error', onErr)
      client.on('signalwire.notification', onNotif)

      await client.connect() // :contentReference[oaicite:7]{index=7}

      clientRef.current = client
      setState('idle')
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Device init failed')
      setError(err.message)
      setState('error')
      onError?.(err)
    }
  }, [agentId, onCallConnected, onCallDisconnected, onError, resetCall, startTimer, state])

  useEffect(() => {
    if (!agentId) return
    init()
    return () => {
      try {
        callRef.current?.hangup()
      } catch {}
      clientRef.current?.disconnect()
      clientRef.current = null
      stopTimer()
    }
  }, [agentId, init, stopTimer])

  const makeCall = useCallback(async (toNumber: string) => {
    const client = clientRef.current
    if (!client) {
      setError('Relay client not ready')
      setState('error')
      return
    }

    try {
      setError(null)
      setState('connecting')

      const call = await client.newCall({
        destinationNumber: toNumber,                    // PSTN supported :contentReference[oaicite:8]{index=8}
        callerNumber: callerNumberRef.current,          // must be owned SignalWire number :contentReference[oaicite:9]{index=9}
      })

      callRef.current = call
      setCallSid(call.id) // Relay call id (closest equivalent to CallSid) :contentReference[oaicite:10]{index=10}
      // state changes will be driven by callUpdate notifications :contentReference[oaicite:11]{index=11}
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Call failed')
      setError(err.message)
      setState('error')
      onError?.(err)
    }
  }, [onError])

  const hangUp = useCallback(() => {
    try {
      setState('disconnecting')
      callRef.current?.hangup() // :contentReference[oaicite:12]{index=12}
    } finally {
      // final UI reset happens via callUpdate; but don’t leave the UI stuck if notifications lag
      setTimeout(() => {
        if (callRef.current) return
        setState('idle')
      }, 750)
    }
  }, [])

  const mute = useCallback((muted: boolean) => {
    const call = callRef.current
    if (!call) return
    // In Relay v2, "deaf/undeaf" is mic input track control :contentReference[oaicite:13]{index=13}
    if (muted) call.deaf()
    else call.undeaf()
  }, [])

  return { state, error, callSid, duration, makeCall, hangUp, mute, reinit: init }
}
