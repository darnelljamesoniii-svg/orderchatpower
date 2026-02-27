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
  deaf: () => void
  undeaf: () => void
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

  // Use a ref so notification handler doesn't capture stale state
  const stateRef = useRef<CallState>('idle')

  const [state, _setState] = useState<CallState>('idle')
  const setState = useCallback((next: CallState) => {
    stateRef.current = next
    _setState(next)
  }, [])

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
  }, [setState, stopTimer])

  const mapRelayCallState = (s: string): CallState => {
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

      // Clean up any prior client before re-init
      try {
        callRef.current?.hangup()
      } catch {}
      try {
        clientRef.current?.disconnect()
      } catch {}
      clientRef.current = null
      callRef.current = null

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

      if (!token || !project) {
        throw new Error('Missing { token, project } from /api/signalwire/token')
      }

      callerNumberRef.current = callerNumber

      // Relay Browser SDK v2 requires @signalwire/js@^1
      const mod: any = await import('@signalwire/js')
      const RelayCtor = mod?.Relay ?? mod?.default?.Relay
      if (!RelayCtor) throw new Error('Relay not found. Install @signalwire/js@^1 and re-deploy.')

      const client: RelayClient = new RelayCtor({ project, token })

      const onReady = () => setState('idle')

      const onErr = (e: any) => {
        const err = e instanceof Error ? e : new Error(String(e?.message ?? e))
        setError(err.message)
        setState('error')
        onError?.(err)
      }

      const onNotif = (n: RelayNotification) => {
        if (n.type === 'userMediaError') {
          setError(n.error?.message ?? 'Microphone permission error')
          setState('error')
          return
        }

        if (n.type === 'callUpdate' && n.call?.id) {
          // Only track the call we started
          if (callRef.current && n.call.id !== callRef.current.id) return

          const next = mapRelayCallState(n.call.state)

          if (next === 'in-call') {
            if (stateRef.current !== 'in-call') {
              startTimer()
              onCallConnected?.(n.call)
            }
            setState('in-call')
            return
          }

          if (next === 'disconnecting') {
            setState('disconnecting')
            if (['hangup', 'destroy', 'purge'].includes(n.call.state)) {
              onCallDisconnected?.(n.call)
              resetCall()
            }
            return
          }

          setState(next)
        }
      }

      client.on('signalwire.ready', onReady)
      client.on('signalwire.error', onErr)
      client.on('signalwire.notification', onNotif)

      await client.connect()

      clientRef.current = client
      setState('idle')
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Device init failed')
      setError(err.message)
      setState('error')
      onError?.(err)
    }
  }, [agentId, onCallConnected, onCallDisconnected, onError, resetCall, setState, startTimer])

  useEffect(() => {
    if (!agentId) return
    init()

    return () => {
      try {
        callRef.current?.hangup()
      } catch {}
      try {
        clientRef.current?.disconnect()
      } catch {}
      clientRef.current = null
      callRef.current = null
      stopTimer()
    }
  }, [agentId, init, stopTimer])

  const makeCall = useCallback(
    async (toNumber: string) => {
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
          destinationNumber: toNumber,
          callerNumber: callerNumberRef.current,
        })

        callRef.current = call
        setCallSid(call.id)
        // state changes come via notifications
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error('Call failed')
        setError(err.message)
        setState('error')
        onError?.(err)
      }
    },
    [onError, setState]
  )

  const hangUp = useCallback(() => {
    setState('disconnecting')
    try {
      callRef.current?.hangup()
    } catch {}
  }, [setState])

  const mute = useCallback((muted: boolean) => {
    const call = callRef.current
    if (!call) return
    if (muted) call.deaf()
    else call.undeaf()
  }, [])

  return { state, error, callSid, duration, makeCall, hangUp, mute, reinit: init }
}
