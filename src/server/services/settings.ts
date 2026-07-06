import { db } from "@/lib/db";
import { thresholdsSchema, type Thresholds } from "@/lib/schemas";

const THRESHOLDS_KEY = "alert-thresholds";

export async function getThresholds(): Promise<Thresholds> {
  const row = await db.setting.findUnique({ where: { key: THRESHOLDS_KEY } });
  if (!row) return thresholdsSchema.parse({});
  const parsed = thresholdsSchema.safeParse(row.value);
  return parsed.success ? parsed.data : thresholdsSchema.parse({});
}

export async function setThresholds(input: unknown): Promise<Thresholds> {
  const value = thresholdsSchema.parse(input);
  await db.setting.upsert({
    where: { key: THRESHOLDS_KEY },
    create: { key: THRESHOLDS_KEY, value },
    update: { value },
  });
  return value;
}
