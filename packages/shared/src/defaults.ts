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
  },
  scheduleEnabled: {
    morningBrief: true,
    newsScans: true,
    microlearning: true,
    afternoonCheckIn: false,
    eveningReview: false,
  },
  briefSections: ['tasks', 'reminders', 'news', 'learning'],
  notifications: {
    push: true,
    reminderAdvanceMinutes: 0,
    quietHoursStart: null,
    quietHoursEnd: null,
  },
  learningTopics: ['technology', 'cybersecurity', 'finance', 'communication'],
  news: {
    categories: ['technology', 'business'],
    keywords: [],
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
  pageSizeMax: 100,
  conversationRetentionDays: 180,
  deliveryRetentionDays: 90,
} as const;
