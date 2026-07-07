import { db } from "@/lib/db";
import { thresholdsSchema, type Thresholds } from "@/lib/schemas";

const GLOBAL_KEY = "alert-thresholds";
const courseKey = (courseId: string) => `${GLOBAL_KEY}:${courseId}`;

function parse(value: unknown): Thresholds | null {
  const parsed = thresholdsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Alert thresholds for a course. Per-course settings win; a legacy global
 * setting is honored as a fallback; otherwise schema defaults apply.
 */
export async function getThresholds(courseId?: string): Promise<Thresholds> {
  if (courseId) {
    const row = await db.setting.findUnique({ where: { key: courseKey(courseId) } });
    const value = row && parse(row.value);
    if (value) return value;
  }
  const globalRow = await db.setting.findUnique({ where: { key: GLOBAL_KEY } });
  return (globalRow && parse(globalRow.value)) ?? thresholdsSchema.parse({});
}

export async function setThresholds(courseId: string, input: unknown): Promise<Thresholds> {
  const value = thresholdsSchema.parse(input);
  await db.setting.upsert({
    where: { key: courseKey(courseId) },
    create: { key: courseKey(courseId), value },
    update: { value },
  });
  return value;
}
