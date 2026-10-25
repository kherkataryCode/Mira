/** Response shapes of the Mira API, shared by the web and iOS clients (types only). */
import type { Preferences, Proposal, Recurrence } from './schemas.js';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role?: 'owner' | 'member';
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: 'open' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueAt: string | null;
  allDay: boolean;
  tags: string[];
  projectId: string | null;
  recurrence: Recurrence;
  completedAt: string | null;
  createdAt: string;
}

export interface Reminder {
  id: string;
  title: string;
  anchorAt: string;
  nextOccurrenceAt: string | null;
  nextFireAt: string | null;
  timezone: string;
  recurrence: Recurrence;
  recurrenceLabel?: string;
  advanceMinutes: number;
  status: 'active' | 'completed' | 'dismissed';
  deliveryState?: 'scheduled' | 'delivered' | 'completed' | 'dismissed';
  lastDelivery?: { status: string; channel: string; createdAt: string; error: string | null } | null;
}

export interface Lesson {
  id: string;
  slug: string;
  topic: string;
  title: string;
  level: string;
  minutes: number;
  summary: string;
  artSeed: number;
  explanation?: string;
  example?: string;
  takeaway?: string;
  quiz?: { q: string; options: string[] }[];
  steps?: string[];
  diagram?: string | null;
  insight?: { title: string; body: string; bullets: string[] } | null;
  question?: string | null;
  learnMore?: { label: string; url: string } | null;
  origin?: 'curated' | 'ai';
  progress: { status: 'started' | 'completed'; saved: boolean; reviewDueAt: string | null; lastScore: number | null; repetitions: number } | null;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  category: string;
  importance: 'breaking' | 'important' | 'relevant' | 'background';
  publishedAt: string | null;
  fetchedAt: string;
  saved: boolean;
  isDemo: boolean;
  relevance?: number;
  exploitation?: 'exploited' | 'proof-of-concept' | 'not-reported';
  /** Grounded one-paragraph brief, when a briefing has already written one. */
  brief?: string | null;
  affected?: string | null;
  action?: string | null;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  taskId: string | null;
  lessonId: string | null;
  updatedAt: string;
}

export interface Brief {
  id: string;
  localDate: string;
  kind: string;
  generatedBy: 'deterministic' | 'ai';
  createdAt: string;
  content: { headline: string; sections: { kind: string; title: string; lines: string[] }[] };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'streaming' | 'error' | 'cancelled';
  provider: string | null;
  model: string | null;
  proposals: Proposal[] | null;
  errorCode: string | null;
  viaVoice?: boolean;
  /** "briefing" = a daily briefing Mira posted (markdown). */
  kind?: 'chat' | 'briefing';
  createdAt: string;
}

export interface Home {
  greeting: string;
  localDate: string;
  timezone: string;
  dashboard: Preferences['dashboard'];
  counts: { tasksToday: number; openTasks: number; reminders: number; news: number; reviewsDue: number };
  tasks: Task[];
  /** Next open to-dos (by due date), for when nothing is due today. */
  upNext: Task[];
  reminders: Reminder[];
  lesson: { id: string; title: string; topic: string; minutes: number; summary: string; takeaway: string; artSeed: number; status: string | null } | null;
  news: NewsItem[];
  brief: Brief | null;
}
