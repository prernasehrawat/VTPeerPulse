import { NextResponse } from "next/server";
import { apiHandler, HttpError, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { clientKey, enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { importRoster } from "@/server/services/csv-import";

const MAX_CSV_BYTES = 1024 * 1024; // 1 MB

export const POST = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  enforceRateLimit(`import:${clientKey(req)}`, LIMITS.csvImport);
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected multipart/form-data with a 'file' field");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Missing 'file' field");
  if (file.size > MAX_CSV_BYTES) throw new HttpError(400, "CSV file too large (max 1 MB)");
  const csv = await file.text();
  const dryRun = form.get("dryRun") === "true";
  const sendInvites = form.get("sendInvites") !== "false";
  const result = await importRoster(courseId, csv, user.id, { dryRun, sendInvites });
  return NextResponse.json(result);
});
