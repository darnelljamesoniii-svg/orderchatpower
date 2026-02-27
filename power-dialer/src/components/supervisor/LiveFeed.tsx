'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/collections';
import type { Agent, CallLog } from '@/types';
import { Card, MetricTile } from '@/components/ui/Card';
import { formatDuration, formatCurrency } from '@/lib/utils';
import { Activity, TrendingUp, Phone, DollarSign, Users } from 'lucide-react';

function AgentStatusDot({ status }: { status: Agent['status'] }) {
  const map = {
    ON_CALL:   'bg-neon animate-pulseGlow',
    AVAILABLE: 'bg-accent',
    PAUSED:    'bg-amber',
    OFFLINE:   'bg-muted',
    BUSY:      'bg-orange-400',
  };
  return <div className={`w-2 h-2 rounded-full flex-shrink-0 ${map[status]}`} />;
}

export default function LiveFeed() {
  const [agents,   setAgents]   = useState<Agent[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);

  useEffect(() => {
    const agentUnsub = onSnapshot(collection(db, COLLECTIONS.AGENTS), snap =>
      setAgents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Agent))),
    );

    const logQ    = query(collection(db, COLLECTIONS.CALL_LOGS), orderBy('startedAt', 'desc'), limit(20));
    const logUnsub = onSnapshot(logQ, snap =>
      setCallLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as CallLog))),
    );

    return () => { agentUnsub(); logUnsub(); };
  }, []);

  // Aggregate stats
  const totalRevenue  = agents.reduce((s, a) => s + (a.revenueToday ?? 0), 0);
  const totalCalls    = agents.reduce((s, a) => s + (a.callsToday  ?? 0), 0);
  const onCall        = agents.filter(a => a.status === 'ON_CALL').length;
  const available     = agents.filter(a => a.status === 'AVAILABLE').length;

  const successCalls  = callLogs.filter(l => l.disposition === 'SUCCESS').length;
  const convRate      = callLogs.length > 0 ? ((successCalls / callLogs.length) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-4">
      {/* Top Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <MetricTile value={onCall} label="On Call" color="text-neon" />
        </Card>
        <Card>
          <MetricTile value={available} label="Available" color="text-accent" />
        </Card>
        <Card>
          <MetricTile value={totalCalls} label="Calls Today" color="text-white" />
        </Card>
        <Card>
          <MetricTile value={formatCurrency(totalRevenue)} label="Revenue Today" color="text-neon" />
        </Card>
      </div>

      {/* Agent Grid */}
      <Card header={<><Users size={12} /> Agent Live Feed</>} noPadding>
        <div className="divide-y divide-border">
          {agents.length === 0 ? (
            <div className="p-6 text-center text-muted text-sm">
              No agents online. Agents appear here when they log in.
            </div>
          ) : (
            agents.map(agent => (
              <div key={agent.id} className="flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition-colors">
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[12px] font-rajdhani font-bold flex-shrink-0 ${
                  agent.status === 'ON_CALL'   ? 'bg-neon/15 text-neon border border-neon/30'   :
                  agent.status === 'AVAILABLE' ? 'bg-accent/15 text-accent border border-accent/30' :
                  'bg-muted/10 text-muted border border-border'
                }`}>
                  {agent.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <AgentStatusDot status={agent.status} />
                    <span className="text-white text-sm font-medium truncate">{agent.name}</span>
                  </div>
                  <div className="text-muted text-[10px] mt-0.5 font-mono">
                    {agent.status === 'ON_CALL' && agent.currentLeadId
                      ? `On call · Lead: ${agent.currentLeadId.slice(-6)}`
                      : agent.status.replace('_', ' ').toLowerCase()}
                  </div>
                </div>

                <div className="text-right flex-shrink-0 space-y-0.5">
                  <div className="flex items-center justify-end gap-1.5 text-[11px] text-white">
                    <Phone size={10} className="text-muted" />
                    <span className="font-mono">{agent.callsToday ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 text-[11px] text-neon">
                    <DollarSign size={10} />
                    <span className="font-mono">{formatCurrency(agent.revenueToday ?? 0)}</span>
                  </div>
                  <div className="text-muted text-[10px] font-mono">
                    {formatDuration(agent.talkTimeSeconds ?? 0)} talk
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Recent Calls */}
      <Card header={<><Activity size={12} /> Recent Call Log</>} noPadding>
        <div className="divide-y divide-border max-h-72 overflow-y-auto">
          {callLogs.length === 0 ? (
            <div className="p-4 text-center text-muted text-sm">No calls yet today.</div>
          ) : (
            callLogs.map(log => (
              <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-card-hover">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  log.disposition === 'SUCCESS'    ? 'bg-neon'   :
                  log.disposition === 'DNC'        ? 'bg-danger' :
                  log.disposition === 'NO_ANSWER'  ? 'bg-muted'  : 'bg-amber'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-white text-xs truncate font-mono">{log.leadId}</div>
                  <div className="text-muted text-[10px]">{log.agentId} · {
                    log.startedAt ? new Date(log.startedAt).toLocaleTimeString() : '—'
                  }</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-[10px] font-rajdhani font-bold tracking-widest uppercase ${
                    log.disposition === 'SUCCESS' ? 'text-neon' :
                    log.disposition === 'DNC'     ? 'text-danger' : 'text-muted'
                  }`}>
                    {log.dispositionLabel ?? log.disposition ?? 'IN PROGRESS'}
                  </div>
                  {log.durationSeconds && (
                    <div className="text-muted text-[10px] font-mono">{formatDuration(log.durationSeconds)}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
