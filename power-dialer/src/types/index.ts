// ─── Core Types ───────────────────────────────────────────────────────────────

export interface AppUser {
  uid:         string;
  email:       string;
  displayName: string;
  role:        'supervisor' | 'rep';
  agentId?:    string;   // links to agents collection for reps
  createdAt:   string;
  createdBy:   string;   // supervisor uid who created this account
  active:      boolean;
}

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
  phone2?:         string;       // ← NEW
  email?:          string;       // ← NEW
  kgmid:           string;
  timezone:        string;
  utcOffsetHours:  number;
  status:          LeadStatus;
  campaign:        string;
  retryCount:      number;
  sessionId?:      string;       // ← NEW generated on lead load
  nextAvailableAt?: string;
  assignedAgentId?: string;
  ownerAgentId?:   string;       // ← NEW callback ownership
  callbackDueAt?:  string;       // ← NEW scheduled callback time
  callbackNote?:   string;       // ← NEW callback note
  lockedUntil?:    string;
  lastCalledAt?:   string;
  closedAt?:       string;
  notes?:          string;
  address?:        string;
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
  status:           'AVAILABLE' | 'ON_CALL' | 'OFFLINE' | 'BUSY' | "PAUSED';
  currentLeadId?:   string | null;
  callsToday:       number;
  revenueToday:     number;
  talkTimeSeconds:  number;
  lastActiveAt?:    string;
  createdAt:        string;
}

export interface AgentAlert {
  id:          string;
  type:        'return_visit' | 'callback_due';
  leadId:      string;
  businessName: string;
  message:     string;
  placeId?:    string;
  sessionId?:  string;
  createdAt:   string;
  read:        boolean;
}

export interface CallLog {
  id?:              string;
  leadId:           string;
  agentId:          string;
  callSid?:         string | null;
  startedAt:        string;
  endedAt?:         string;
  durationSeconds?: number;
  disposition?:     string;
  dispositionLabel?: string;
  callStatus?:      string;
  notes:            string;
  transcript:       TranscriptEntry[];
  summary?:         string;        // ← NEW Gemini coaching
  coachingTips?:    string[];      // ← NEW
  objections?:      string[];      // ← NEW
  emailSentAt?:     string;        // ← NEW
}

export interface TranscriptEntry {
  speaker:   'agent' | 'lead';
  text:      string;
  timestamp: string;
}

export interface LPSession {
  sessionId:         string;
  placeId:           string;
  agentId?:          string;
  loadedAt:          string;
  lastEventAt:       string;
  step:              string;
  stingCompleted?:   boolean;
  zonesExpanded?:    string[];
  selectedAvgTicket?: number;
  tierHovered?:      string;
  selectedTierId?:   string;
  paymentOpened?:    boolean;
  lockClicked?:      boolean;
  returnVisits?:     number;
  lastReturnAt?:     string;
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
  callbackDueAt?:    string;   // ← NEW for RECALL
  callbackNote?:     string;   // ← NEW
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
