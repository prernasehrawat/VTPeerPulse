// Single source of truth for the AI summary types: their labels, plain-language
// descriptions, and whether they can be released to students. Shared by the
// single-summary generator, the bulk generator, and the onboarding guide so the
// dropdowns, hints, and notice never drift apart.
export type SummaryKindMeta = {
  value: string;
  label: string;
  blurb: string;
  shareable: boolean;
};

export const SUMMARY_KINDS: SummaryKindMeta[] = [
  {
    value: "INSTRUCTOR",
    label: "Instructor briefing",
    blurb:
      "A private overview for you: overall team health, risks, and students who may need support. Never shown to students.",
    shareable: false,
  },
  {
    value: "COMPLAINTS",
    label: "Complaint summary",
    blurb: "Groups the recurring concerns and criticisms raised in the feedback. For your review only.",
    shareable: false,
  },
  {
    value: "POSITIVES",
    label: "Positive summary",
    blurb: "Groups the strengths and praise mentioned in the feedback. For your review only.",
    shareable: false,
  },
  {
    value: "CONSTRUCTIVE",
    label: "Constructive feedback",
    blurb: "Turns the feedback into specific, encouraging, actionable suggestions. For your review only.",
    shareable: false,
  },
  {
    value: "STUDENT_FEEDBACK",
    label: "Student-shareable feedback",
    blurb:
      "Anonymized feedback written to give directly to a student. You can review, edit, then release it to them.",
    shareable: true,
  },
];

export const kindByValue = new Map(SUMMARY_KINDS.map((k) => [k.value, k]));

/** Kinds in the order the bulk generator surfaces them (most common first). */
export const BULK_KIND_ORDER = ["STUDENT_FEEDBACK", "CONSTRUCTIVE", "INSTRUCTOR", "COMPLAINTS", "POSITIVES"];
