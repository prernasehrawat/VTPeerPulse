import { z } from "zod";

const timezoneSchema = z
  .string()
  .trim()
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown IANA timezone");

export const courseCreateSchema = z.object({
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(200),
  term: z.string().trim().min(2).max(50),
  timezone: timezoneSchema.default("America/New_York"),
});

export const courseUpdateSchema = z.object({
  code: z.string().trim().min(2).max(50).optional(),
  name: z.string().trim().min(2).max(200).optional(),
  term: z.string().trim().min(2).max(50).optional(),
  timezone: timezoneSchema.optional(),
  active: z.boolean().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const questionCreateSchema = z.object({
  prompt: z.string().trim().min(3).max(500),
  type: z.enum(["RATING", "TEXT"]).default("RATING"),
  required: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const questionUpdateSchema = questionCreateSchema.partial();

export const questionReorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const roundCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sprint: z.number().int().min(1).max(100),
  opensAt: z.coerce.date().optional(),
  closesAt: z.coerce.date().optional(),
});

export const roundUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
});

export const roundStatusSchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "CLOSED"]),
});

export const answerSchema = z.object({
  questionId: z.string().min(1),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(4000).optional(),
});

export const peerEvaluationSchema = z.object({
  evaluateeId: z.string().min(1),
  answers: z.array(answerSchema).min(1).max(100),
});

export const submissionSchema = z.object({
  roundId: z.string().min(1),
  evaluations: z.array(peerEvaluationSchema).min(1).max(50),
});

export const draftAnswerSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(4000).optional(),
});

export const draftSaveSchema = z.object({
  roundId: z.string().min(1),
  // Keyed by `${teammateId}:${questionId}`; bounded so a draft can't be abused
  // as unbounded storage (max 50 teammates × 100 questions upstream anyway).
  data: z
    .record(z.string(), draftAnswerSchema)
    .refine((d) => Object.keys(d).length <= 5000, "Draft has too many entries"),
});
export type DraftSaveInput = z.infer<typeof draftSaveSchema>;

export const nudgeRoundSchema = z.object({
  // Omit or empty → remind everyone still outstanding; otherwise just these students.
  userIds: z.array(z.string().min(1)).max(1000).optional(),
});
export type NudgeRoundInput = z.infer<typeof nudgeRoundSchema>;

export const thresholdsSchema = z.object({
  lowAverage: z.number().min(1).max(5).default(3),
  trendDrop: z.number().min(0.1).max(4).default(0.5),
  repeatedConcernRounds: z.number().int().min(2).max(10).default(2),
});
export type Thresholds = z.infer<typeof thresholdsSchema>;

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  teamId: z.string().nullable().optional(),
});

export const summaryRequestSchema = z.object({
  roundId: z.string().min(1),
  subjectType: z.enum(["ROUND", "TEAM", "STUDENT"]),
  subjectId: z.string().optional(),
  kind: z.enum(["COMPLAINTS", "POSITIVES", "CONSTRUCTIVE", "INSTRUCTOR", "STUDENT_FEEDBACK"]),
});

export const bulkSummarySchema = z.object({
  roundId: z.string().min(1),
  // Bulk generation fans out over every subject of one type that has feedback.
  subjectType: z.enum(["STUDENT", "TEAM"]),
  kind: z.enum(["COMPLAINTS", "POSITIVES", "CONSTRUCTIVE", "INSTRUCTOR", "STUDENT_FEEDBACK"]),
});
export type BulkSummaryInput = z.infer<typeof bulkSummarySchema>;

export type SubmissionInput = z.infer<typeof submissionSchema>;
export type SummaryRequest = z.infer<typeof summaryRequestSchema>;
