import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Preferences, Proposal, Recurrence } from '@friday/shared';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

/* ---------- identity ---------- */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: ts('locked_until'),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque bearer/cookie token; the raw token is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    client: text('client', { enum: ['web', 'mobile'] }).notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastUsedAt: ts('last_used_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<Preferences>().notNull(),
  updatedAt: updatedAt(),
});

/* ---------- tasks ---------- */

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: createdAt(),
  },
  (t) => [index('projects_user_idx').on(t.userId)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status', { enum: ['open', 'done'] }).notNull().default('open'),
    priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).notNull().default('medium'),
    dueAt: ts('due_at'),
    allDay: boolean('all_day').notNull().default(false),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    recurrence: jsonb('recurrence').$type<Recurrence>().notNull().default({ freq: 'none' }),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tasks_user_status_due_idx').on(t.userId, t.status, t.dueAt),
    index('tasks_tags_idx').using('gin', t.tags),
  ],
);

export const taskEvents = pgTable(
  'task_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['created', 'updated', 'completed', 'reopened', 'recurred'] }).notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('task_events_task_idx').on(t.taskId, t.createdAt)],
);

/* ---------- reminders & delivery ---------- */

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    /** First scheduled occurrence (UTC); supplies wall-clock time for recurrences. */
    anchorAt: ts('anchor_at').notNull(),
    /** Next occurrence the worker should deliver (UTC), before advance offset. */
    nextOccurrenceAt: ts('next_occurrence_at'),
    /** When to actually notify: next occurrence minus advance, or a snooze time. */
    nextFireAt: ts('next_fire_at'),
    timezone: text('timezone').notNull(),
    recurrence: jsonb('recurrence').$type<Recurrence>().notNull().default({ freq: 'none' }),
    advanceMinutes: integer('advance_minutes').notNull().default(0),
    status: text('status', { enum: ['active', 'completed', 'dismissed'] }).notNull().default('active'),
    lastFiredAt: ts('last_fired_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('reminders_due_idx').on(t.status, t.nextFireAt),
    index('reminders_user_idx').on(t.userId, t.status),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    reminderId: uuid('reminder_id').references(() => reminders.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: ['reminder', 'brief', 'system'] }).notNull(),
    /** Idempotency key component: the occurrence this delivery is for. */
    occurrenceKey: text('occurrence_key').notNull(),
    channel: text('channel', { enum: ['in_app', 'push'] }).notNull(),
    status: text('status', { enum: ['pending', 'sent', 'failed', 'skipped'] }).notNull().default('pending'),
    title: text('title').notNull(),
    body: text('body'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    readAt: ts('read_at'),
    createdAt: createdAt(),
    sentAt: ts('sent_at'),
  },
  (t) => [
    uniqueIndex('deliveries_idem_idx').on(t.userId, t.kind, t.occurrenceKey, t.channel),
    index('deliveries_user_idx').on(t.userId, t.createdAt),
  ],
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: ['ios', 'android', 'web'] }).notNull(),
    pushToken: text('push_token').notNull().unique(),
    createdAt: createdAt(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    disabledAt: ts('disabled_at'),
  },
  (t) => [index('devices_user_idx').on(t.userId)],
);

/* ---------- chat ---------- */

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** "daily" = Mira's per-day briefing thread. */
    kind: text('kind', { enum: ['chat', 'daily'] }).notNull().default('chat'),
    localDate: text('local_date'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('conversations_user_idx').on(t.userId, t.updatedAt),
    uniqueIndex('conversations_daily_idx').on(t.userId, t.localDate).where(sql`${t.kind} = 'daily'`),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    status: text('status', { enum: ['complete', 'streaming', 'error', 'cancelled'] }).notNull().default('complete'),
    provider: text('provider'),
    model: text('model'),
    clientMessageId: text('client_message_id'),
    proposals: jsonb('proposals').$type<Proposal[]>(),
    errorCode: text('error_code'),
    viaVoice: boolean('via_voice').notNull().default(false),
    kind: text('kind', { enum: ['chat', 'briefing'] }).notNull().default('chat'),
    createdAt: createdAt(),
  },
  (t) => [
    index('messages_conv_idx').on(t.conversationId, t.createdAt),
    uniqueIndex('messages_client_id_idx').on(t.userId, t.clientMessageId),
  ],
);

/* ---------- learning ---------- */

export interface LessonInsight {
  title: string;
  body: string;
  bullets: string[];
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

/** Shared, read-only curriculum content (not user-owned). */
export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    topic: text('topic').notNull(),
    title: text('title').notNull(),
    level: text('level', { enum: ['beginner', 'intermediate', 'advanced'] }).notNull(),
    minutes: integer('minutes').notNull(),
    summary: text('summary').notNull(),
    explanation: text('explanation').notNull(),
    example: text('example').notNull(),
    takeaway: text('takeaway').notNull(),
    quiz: jsonb('quiz').$type<QuizQuestion[]>().notNull(),
    artSeed: integer('art_seed').notNull().default(0),
    /** "How it works" steps. */
    steps: jsonb('steps').$type<string[]>().notNull().default([]),
    /** Plain-text architecture view, shown as a fixed-width diagram. */
    diagram: text('diagram'),
    /** Defensive tip shown as the daily insight. */
    insight: jsonb('insight').$type<LessonInsight>(),
    /** A scenario question that makes the reader apply the concept. */
    question: text('question'),
    /** Curated reference link (never model-generated). */
    learnMore: jsonb('learn_more').$type<{ label: string; url: string }>(),
    /** null = shared curriculum; set = AI-generated for one user. */
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    origin: text('origin', { enum: ['curated', 'ai'] }).notNull().default('curated'),
    createdAt: createdAt(),
  },
  (t) => [index('lessons_topic_idx').on(t.topic), index('lessons_owner_idx').on(t.ownerUserId)],
);

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['started', 'completed'] }).notNull().default('started'),
    saved: boolean('saved').notNull().default(false),
    ease: numeric('ease', { precision: 4, scale: 2, mode: 'number' }).notNull().default(2.5),
    intervalDays: integer('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    reviewDueAt: ts('review_due_at'),
    lastScore: integer('last_score'),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] }), index('progress_review_idx').on(t.userId, t.reviewDueAt)],
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
    correct: integer('correct').notNull(),
    total: integer('total').notNull(),
    answers: jsonb('answers').$type<number[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('quiz_attempts_user_idx').on(t.userId, t.createdAt)],
);

/* ---------- news ---------- */

export const newsSources = pgTable(
  'news_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    category: text('category').notNull().default('general'),
    enabled: boolean('enabled').notNull().default(true),
    lastFetchedAt: ts('last_fetched_at'),
    lastSuccessAt: ts('last_success_at'),
    lastError: text('last_error'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    etag: text('etag'),
    lastModified: text('last_modified'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('news_sources_user_url_idx').on(t.userId, t.url)],
);

export const newsItems = pgTable(
  'news_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').references(() => newsSources.id, { onDelete: 'cascade' }),
    sourceName: text('source_name').notNull(),
    url: text('url').notNull(),
    canonicalUrl: text('canonical_url').notNull(),
    titleKey: text('title_key').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    category: text('category').notNull().default('general'),
    importance: text('importance', { enum: ['breaking', 'important', 'relevant', 'background'] }).notNull(),
    publishedAt: ts('published_at'),
    fetchedAt: ts('fetched_at').notNull().defaultNow(),
    saved: boolean('saved').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    isDemo: boolean('is_demo').notNull().default(false),
    /** 0–100 cybersecurity relevance (deterministic). */
    relevance: integer('relevance').notNull().default(0),
    exploitation: text('exploitation', { enum: ['exploited', 'proof-of-concept', 'not-reported'] }).notNull().default('not-reported'),
    /** AI rewrite grounded in the feed text, cached so each story is summarised once. */
    brief: text('brief'),
    affected: text('affected'),
    action: text('action'),
  },
  (t) => [
    uniqueIndex('news_items_user_url_idx').on(t.userId, t.canonicalUrl),
    index('news_items_user_time_idx').on(t.userId, t.publishedAt),
  ],
);

/* ---------- notes ---------- */

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('notes_user_idx').on(t.userId, t.updatedAt)],
);

/* ---------- briefs ---------- */

export interface BriefContent {
  headline: string;
  sections: { kind: string; title: string; lines: string[] }[];
}

export const briefs = pgTable(
  'briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    localDate: text('local_date').notNull(),
    kind: text('kind', { enum: ['morning', 'checkin', 'evening', 'ondemand'] }).notNull(),
    content: jsonb('content').$type<BriefContent>().notNull(),
    generatedBy: text('generated_by', { enum: ['deterministic', 'ai'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('briefs_user_date_kind_idx').on(t.userId, t.localDate, t.kind)],
);

/* ---------- daily briefings ---------- */

export const briefings = pgTable(
  'briefings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    localDate: text('local_date').notNull(),
    slot: text('slot', { enum: ['morning', 'evening', 'ondemand'] }).notNull(),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    newsItemIds: jsonb('news_item_ids').$type<string[]>().notNull().default([]),
    generatedBy: text('generated_by', { enum: ['deterministic', 'ai'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('briefings_user_idx').on(t.userId, t.createdAt)],
);

/* ---------- operations ---------- */

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    purpose: text('purpose').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6, mode: 'number' }).notNull().default(0),
    outcome: text('outcome', { enum: ['ok', 'error', 'cancelled'] }).notNull(),
    errorClass: text('error_class'),
    latencyMs: integer('latency_ms'),
    createdAt: createdAt(),
  },
  (t) => [index('ai_usage_user_time_idx').on(t.userId, t.createdAt), index('ai_usage_time_idx').on(t.createdAt)],
);

export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    job: text('job').notNull(),
    /** Idempotency key: the same job+key never runs to completion twice. */
    key: text('key').notNull(),
    status: text('status', { enum: ['running', 'succeeded', 'failed'] }).notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    error: text('error'),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
  },
  (t) => [uniqueIndex('job_runs_job_key_idx').on(t.job, t.key), index('job_runs_job_time_idx').on(t.job, t.startedAt)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    target: text('target'),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_user_idx').on(t.userId, t.createdAt)],
);
