import type { Preferences } from './schemas.js';

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Suggested defaults from the product spec. Every value is user-editable. */
export const DEFAULT_PREFERENCES: Preferences = {
  timezone: DEFAULT_TIMEZONE,
  verbosity: 'concise',
  theme: 'dark',
  schedule: {
    morningBrief: '08:00',
    newsScans: ['08:00', '17:00'],
    microlearning: '12:30',
    afternoonCheckIn: '13:00',
    eveningReview: '21:00',
    eveningNews: '18:00',
  },
  scheduleEnabled: {
    morningBrief: true,
    newsScans: true,
    microlearning: true,
    afternoonCheckIn: false,
    eveningReview: false,
    eveningNews: true,
  },
  briefSections: ['tasks', 'reminders', 'news', 'learning'],
  notifications: {
    push: true,
    reminderAdvanceMinutes: 0,
    quietHoursStart: null,
    quietHoursEnd: null,
  },
  learningTopics: ['cybersecurity', 'ot-security'],
  news: {
    categories: ['cybersecurity'],
    keywords: ['critical', 'exploited', 'zero-day', 'ransomware', 'ICS', 'SCADA', 'PLC', 'OT'],
    mutedKeywords: [],
  },
  ai: {
    providerOrder: ['anthropic', 'openai', 'moonshot'],
    monthlyBudgetUsd: 5,
    perProviderBudgetUsd: {},
    briefUsesAi: false,
  },
  voice: {
    speakResponses: false,
    naturalVoice: true,
    webVoice: null,
    iosVoice: null,
  },
  dashboard: {
    order: ['brief', 'tasks', 'reminders', 'learning', 'news', 'quickActions'],
    hidden: [],
  },
};

export const LIMITS = {
  chatHistoryMessages: 20,
  chatMessageMaxChars: 4000,
  noteMaxChars: 20000,
  maxOutputTokens: 800,
  /** Output budget for a generated daily briefing section. */
  briefingMaxOutputTokens: 2000,
  pageSizeMax: 100,
  conversationRetentionDays: 180,
  deliveryRetentionDays: 90,
} as const;
