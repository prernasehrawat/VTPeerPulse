import { NextResponse } from "next/server";
import { apiHandler, HttpError, requireProfessor } from "@/lib/guards";
import { importRoster } from "@/server/services/csv-import";

const MAX_CSV_BYTES = 1024 * 1024; // 1 MB

export const POST = apiHandler(async (req: Request) => {
  const user = await requireProfessor();
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected multipart/form-data with a 'file' field");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Missing 'file' field");
  if (file.size > MAX_CSV_BYTES) throw new HttpError(400, "CSV file too large (max 1 MB)");
  const csv = await file.text();
  const result = await importRoster(csv, user.id);
  return NextResponse.json(result);
});
