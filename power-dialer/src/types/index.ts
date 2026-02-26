// ─── Core Types ───────────────────────────────────────────────────────────────

export type LeadStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'CALLBACK_MANUAL'
  | 'CALLBACK_AUTO'
  | 'CLOSED'
  | 'BLACKLISTED'
  | 'EXHAUSTED';

export interface Lead {
  id:              string;
  businessName:    string;
  contactName:     string;
  phone:           string;
  kgmid:           string;
  timezone:        string;
  utcOffsetHours:  number;
  status:          LeadStatus;
  campaign:        string;
  retryCount:      number;
  nextAvailableAt?: string;
  assignedAgentId?: string;
  lockedUntil?:    string;
  lastCalledAt?:   string;
  closedAt?:       string;
  notes?:          string;
  squarePaymentUrl?: string;
  createdAt:       string;
  updatedAt:       string;
}

export interface Disposition {
  id:            string;
  label:         string;
  action:        string;
  color:         string;
  delayMinutes:  number;
  isActive:      boolean;
  sortOrder:     number;
}

export interface CampaignWave {
  id:              string;
  name:            string;
  isActive:        boolean;
  startHourLocal:  number;
  endHourLocal:    number;
  timezone:        string;
  description?:    string;
}

export interface Agent {
  id:               string;
  name:             string;
  status:           'AVAILABLE' | 'ON_CALL' | 'OFFLINE' | 'BUSY';
  currentLeadId?:   string | null;
  callsToday:       number;
  revenueToday:     number;
  talkTimeSeconds:  number;
  lastActiveAt?:    string;
  createdAt:        string;
}

export interface CallLog {
  id?:              string;
  leadId:           string;
  agentId:          string;
  callSid?:         string | null;   // SignalWire CallSid
  startedAt:        string;
  endedAt?:         string;
  durationSeconds?: number;
  disposition?:     string;
  dispositionLabel?: string;
  callStatus?:      string;
  notes:            string;
  transcript:       TranscriptEntry[];
}

export interface TranscriptEntry {
  speaker:   'agent' | 'lead';
  text:      string;
  timestamp: string;
}

export interface DispositionPayload {
  leadId:            string;
  agentId:           string;
  callLogId?:        string;
  action:            string;
  dispositionLabel?: string;
  recallAt?:         string;
  notes?:            string;
  squareAmount?:     number;
}

export type DispositionAction =
  | 'NO_ANSWER'
  | 'BUSY'
  | 'VOICEMAIL'
  | 'RECALL'
  | 'SUCCESS'
  | 'DNC'
  | 'WRONG_NUMBER';

export interface NextLeadResponse {
  lead:       Lead | null;
  queueDepth: number;
  message?:   string;
}

export interface BattleCard {
  rebuttal:    string;
  followUp:    string;
  toneAdvice:  string;
}
