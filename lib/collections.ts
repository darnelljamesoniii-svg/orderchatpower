// Collection name constants — single source of truth
export const COLLECTIONS = {
  LEADS:        'leads',
  AGENTS:       'agents',
  DISPOSITIONS: 'dispositions',
  CAMPAIGNS:    'campaigns',
  CALL_LOGS:    'call_logs',
  SETTINGS:     'settings',
} as const;

// Default dispositions — seeded on first supervisor load
export const DEFAULT_DISPOSITIONS = [
  { id: 'no_answer',    label: 'No Answer',       action: 'NO_ANSWER',    color: '#94a3b8', delayMinutes: 120,  isActive: true, sortOrder: 1 },
  { id: 'busy',         label: 'Busy',             action: 'BUSY',         color: '#f59e0b', delayMinutes: 5,    isActive: true, sortOrder: 2 },
  { id: 'voicemail',    label: 'Voicemail',        action: 'VOICEMAIL',    color: '#8b5cf6', delayMinutes: 1440, isActive: true, sortOrder: 3 },
  { id: 'recall',       label: 'Schedule Recall',  action: 'RECALL',       color: '#6366f1', delayMinutes: 0,    isActive: true, sortOrder: 4 },
  { id: 'success',      label: 'SUCCESS 🎯',       action: 'SUCCESS',      color: '#00ff88', delayMinutes: 0,    isActive: true, sortOrder: 5 },
  { id: 'dnc',          label: 'DNC',              action: 'DNC',          color: '#ef4444', delayMinutes: 0,    isActive: true, sortOrder: 6 },
  { id: 'wrong_number', label: 'Wrong Number',     action: 'WRONG_NUMBER', color: '#4b5563', delayMinutes: 0,    isActive: true, sortOrder: 7 },
] as const;

// Default campaign waves
export const DEFAULT_CAMPAIGNS = [
  {
    id:             'wave1',
    name:           'Wave 1 — General',
    isActive:       true,
    startHourLocal: 9,
    endHourLocal:   20,
    timezone:       'America/New_York',
    description:    'General businesses — call during local business hours',
  },
  {
    id:             'wave2',
    name:           'Wave 2 — Pizza / Restaurants',
    isActive:       false,
    startHourLocal: 11,
    endHourLocal:   22,
    timezone:       'America/New_York',
    description:    'Restaurants — call during lunch/dinner service windows',
  },
] as const;
