import { z } from 'zod';
import { isValidTimezone } from './time.js';

/* ---------- primitives ---------- */

export const idSchema = z.uuid();
export const hmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:mm');
export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimezone, 'Unknown IANA timezone');
const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[\p{L}\p{N} _-]+$/u, 'Tags may contain letters, numbers, spaces, - and _');
const isoDateTime = z.iso.datetime({ offset: true });

export const priorities = ['low', 'medium', 'high', 'urgent'] as const;
export const prioritySchema = z.enum(priorities);
export type Priority = z.infer<typeof prioritySchema>;

export const recurrenceSchema = z
  .object({
    freq: z.enum(['none', 'daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1).max(365).optional(),
    /** ISO weekdays, 1 = Monday … 7 = Sunday. */
    byWeekday: z.array(z.number().int().min(1).max(7)).max(7).optional(),
    until: isoDateTime.optional(),
  })
  .strict();
export type Recurrence = z.infer<typeof recurrenceSchema>;

/* ---------- auth ---------- */

export const emailSchema = z.email().max(254).transform((e) => e.toLowerCase());
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(256, 'Password too long');

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(60),
    timezone: timezoneSchema.optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(256),
    client: z.enum(['web', 'mobile']).default('web'),
  })
  .strict();

export const deleteAccountSchema = z
  .object({ password: z.string().min(1).max(256), confirm: z.literal('DELETE') })
  .strict();

/* ---------- tasks & projects ---------- */

export const projectCreateSchema = z
  .object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() })
  .strict();

export const taskCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    notes: z.string().max(5000).optional(),
    dueAt: isoDateTime.nullable().optional(),
    allDay: z.boolean().optional(),
    priority: prioritySchema.default('medium'),
    tags: z.array(tagSchema).max(10).default([]),
    projectId: idSchema.nullable().optional(),
    recurrence: recurrenceSchema.optional(),
  })
  .strict();
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(5000).nullable().optional(),
    dueAt: isoDateTime.nullable().optional(),
    allDay: z.boolean().optional(),
    priority: prioritySchema.optional(),
    tags: z.array(tagSchema).max(10).optional(),
    projectId: idSchema.nullable().optional(),
    recurrence: recurrenceSchema.optional(),
    status: z.enum(['open', 'done']).optional(),
  })
  .strict();
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export const taskListQuerySchema = z
  .object({
    status: z.enum(['open', 'done', 'all']).default('open'),
    view: z.enum(['today', 'upcoming', 'overdue', 'all']).default('all'),
    q: z.string().trim().max(100).optional(),
    tag: tagSchema.optional(),
    projectId: idSchema.optional(),
    priority: prioritySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

export const parseRequestSchema = z
  .object({ text: z.string().trim().min(1).max(500) })
  .strict();

/* ---------- reminders ---------- */

export const reminderCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    remindAt: isoDateTime,
    timezone: timezoneSchema.optional(),
    recurrence: recurrenceSchema.default({ freq: 'none' }),
    advanceMinutes: z.number().int().min(0).max(1440).default(0),
    taskId: idSchema.nullable().optional(),
  })
  .strict();
export type ReminderCreate = z.infer<typeof reminderCreateSchema>;

export const reminderUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    remindAt: isoDateTime.optional(),
    timezone: timezoneSchema.optional(),
    recurrence: recurrenceSchema.optional(),
    advanceMinutes: z.number().int().min(0).max(1440).optional(),
  })
  .strict();

export const snoozeSchema = z
  .object({ minutes: z.number().int().min(1).max(24 * 60) })
  .strict();

/* ---------- notes ---------- */

export const noteCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().max(20000).default(''),
    tags: z.array(tagSchema).max(10).default([]),
    taskId: idSchema.nullable().optional(),
    lessonId: idSchema.nullable().optional(),
    pinned: z.boolean().default(false),
  })
  .strict();

export const noteUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().max(20000).optional(),
    tags: z.array(tagSchema).max(10).optional(),
    taskId: idSchema.nullable().optional(),
    lessonId: idSchema.nullable().optional(),
    pinned: z.boolean().optional(),
  })
  .strict();

/* ---------- chat ---------- */

export const chatSendSchema = z
  .object({
    conversationId: idSchema.optional(),
    content: z.string().trim().min(1).max(4000),
    /** Client-generated id so a retried send is not stored twice. */
    clientMessageId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
    viaVoice: z.boolean().default(false),
  })
  .strict();
export type ChatSend = z.infer<typeof chatSendSchema>;

export const providerIds = ['anthropic', 'openai', 'moonshot'] as const;
export const providerIdSchema = z.enum(providerIds);
export type ProviderId = z.infer<typeof providerIdSchema>;

/** An action the assistant proposes. Nothing happens until the user confirms it. */
export const proposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('task'),
    title: z.string(),
    dueAt: z.string().nullable(),
    priority: prioritySchema,
    recurrence: recurrenceSchema,
    needsConfirmation: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('reminder'),
    title: z.string(),
    remindAt: z.string(),
    recurrence: recurrenceSchema,
    needsConfirmation: z.array(z.string()),
  }),
]);
export type Proposal = z.infer<typeof proposalSchema>;

/* ---------- learning ---------- */

export const quizAnswerSchema = z
  .object({ answers: z.array(z.number().int().min(0).max(9)).min(1).max(20) })
  .strict();

export const reviewSchema = z
  .object({ quality: z.number().int().min(0).max(5) })
  .strict();

/* ---------- news ---------- */

export const newsSourceCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    url: z
      .url({ protocol: /^https$/ })
      .max(500),
    category: z.string().trim().min(1).max(40).default('general'),
  })
  .strict();

export const newsFeedbackSchema = z
  .object({ saved: z.boolean().optional(), hidden: z.boolean().optional() })
  .strict();

/* ---------- devices ---------- */

export const deviceRegisterSchema = z
  .object({
    platform: z.enum(['ios', 'android', 'web']),
    pushToken: z.string().min(10).max(300),
  })
  .strict();

/* ---------- preferences ---------- */

/** The only topics Mira teaches. Learning and AI-generated concepts never leave the user's selection. */
export const LEARNING_TOPICS = [
  { id: 'cybersecurity', label: 'Cybersecurity fundamentals' },
  { id: 'ot-security', label: 'OT / ICS security' },
  { id: 'network-security', label: 'Network security' },
  { id: 'incident-response', label: 'Incident response' },
  { id: 'cloud-security', label: 'Cloud security' },
  { id: 'appsec', label: 'Application security' },
] as const;
export const learningTopicIds = LEARNING_TOPICS.map((t) => t.id) as unknown as readonly [string, ...string[]];
export const learningTopicSchema = z.enum(LEARNING_TOPICS.map((t) => t.id) as [LearningTopicId, ...LearningTopicId[]]);
export type LearningTopicId = (typeof LEARNING_TOPICS)[number]['id'];

const widgetIds = ['brief', 'tasks', 'reminders', 'learning', 'news', 'quickActions'] as const;
export const widgetIdSchema = z.enum(widgetIds);
export type WidgetId = z.infer<typeof widgetIdSchema>;

export const preferencesSchema = z
  .object({
    timezone: timezoneSchema,
    verbosity: z.enum(['concise', 'balanced', 'detailed']),
    theme: z.enum(['dark', 'light', 'system']),
    schedule: z
      .object({
        morningBrief: hmSchema,
        newsScans: z.array(hmSchema).max(4),
        microlearning: hmSchema,
        afternoonCheckIn: hmSchema,
        eveningReview: hmSchema,
        /** Evening cybersecurity news briefing posted in chat. */
        eveningNews: hmSchema,
      })
      .strict(),
    scheduleEnabled: z
      .object({
        morningBrief: z.boolean(),
        newsScans: z.boolean(),
        microlearning: z.boolean(),
        afternoonCheckIn: z.boolean(),
        eveningReview: z.boolean(),
        eveningNews: z.boolean(),
      })
      .strict(),
    briefSections: z.array(z.enum(['tasks', 'reminders', 'news', 'learning'])).max(4),
    notifications: z
      .object({
        push: z.boolean(),
        reminderAdvanceMinutes: z.number().int().min(0).max(1440),
        quietHoursStart: hmSchema.nullable(),
        quietHoursEnd: hmSchema.nullable(),
      })
      .strict(),
    /** Learning (and the AI's teaching) is restricted to these topics. */
    learningTopics: z.array(learningTopicSchema).min(1).max(learningTopicIds.length),
    news: z
      .object({
        categories: z.array(z.string().trim().min(1).max(40)).max(12),
        keywords: z.array(z.string().trim().min(1).max(40)).max(30),
        mutedKeywords: z.array(z.string().trim().min(1).max(40)).max(30),
      })
      .strict(),
    ai: z
      .object({
        providerOrder: z.array(providerIdSchema).max(3),
        monthlyBudgetUsd: z.number().min(0).max(1000),
        perProviderBudgetUsd: z.partialRecord(providerIdSchema, z.number().min(0).max(1000)),
        briefUsesAi: z.boolean(),
      })
      .strict(),
    voice: z
      .object({
        speakResponses: z.boolean(),
        /** Use Mira's natural server voice when available, else the device voice. */
        naturalVoice: z.boolean(),
        /** Chosen device voice per platform (voice name / identifier), null = best female voice. */
        webVoice: z.string().max(200).nullable(),
        iosVoice: z.string().max(200).nullable(),
      })
      .strict(),
    dashboard: z
      .object({
        order: z.array(widgetIdSchema).max(widgetIds.length),
        hidden: z.array(widgetIdSchema).max(widgetIds.length),
      })
      .strict(),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;

export const preferencesPatchSchema = preferencesSchema.partial();
