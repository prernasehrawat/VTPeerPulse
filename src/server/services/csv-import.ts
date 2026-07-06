import Papa from "papaparse";
import { z } from "zod";
import { db } from "@/lib/db";
import { allowedEmailDomains } from "@/lib/env";
import { audit } from "./audit";

const rowSchema = z.object({
  team: z.string().trim().min(1, "Team is required").max(100),
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Invalid email"),
});

export type CsvRowError = { row: number; message: string };
export type ImportResult = {
  created: number;
  updated: number;
  teamsCreated: number;
  errors: CsvRowError[];
};

type ParsedRow = z.infer<typeof rowSchema>;

const HEADER_ALIASES: Record<string, keyof ParsedRow> = {
  team: "team",
  "team name": "team",
  name: "name",
  "student name": "name",
  student: "name",
  email: "email",
  "university email": "email",
  "student email": "email",
};

/** Parses and validates a roster CSV. Returns valid rows plus per-row errors. */
export function parseRosterCsv(csv: string): { rows: ParsedRow[]; errors: CsvRowError[] } {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase(),
  });

  const errors: CsvRowError[] = [];
  const rows: ParsedRow[] = [];

  if (result.data.length === 0) {
    return { rows, errors: [{ row: 0, message: "CSV contains no data rows" }] };
  }
  const fields = result.meta.fields ?? [];
  for (const required of ["team", "name", "email"] as const) {
    if (!fields.includes(required)) {
      return {
        rows,
        errors: [{ row: 0, message: `Missing required column: "${required}" (accepted headers: Team, Student Name, University Email)` }],
      };
    }
  }

  const domains = allowedEmailDomains();
  const seen = new Map<string, number>();

  result.data.forEach((raw, i) => {
    const rowNum = i + 2; // 1-based + header row
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push({ row: rowNum, message: `${issue?.path.join(".")}: ${issue?.message}` });
      return;
    }
    const { email } = parsed.data;
    const domain = email.split("@")[1] ?? "";
    if (domains.length > 0 && !domains.includes(domain)) {
      errors.push({ row: rowNum, message: `Email domain "${domain}" is not an allowed university domain` });
      return;
    }
    const firstSeen = seen.get(email);
    if (firstSeen !== undefined) {
      errors.push({ row: rowNum, message: `Duplicate email ${email} (first seen on row ${firstSeen})` });
      return;
    }
    seen.set(email, rowNum);
    rows.push(parsed.data);
  });

  return { rows, errors };
}

/** Imports a roster CSV: upserts users, creates teams, reassigns memberships. */
export async function importRoster(csv: string, actorId: string): Promise<ImportResult> {
  const { rows, errors } = parseRosterCsv(csv);
  if (rows.length === 0) {
    return { created: 0, updated: 0, teamsCreated: 0, errors };
  }

  let created = 0;
  let updated = 0;
  let teamsCreated = 0;

  await db.$transaction(async (tx) => {
    const teamNames = [...new Set(rows.map((r) => r.team))];
    const teamIds = new Map<string, string>();
    for (const name of teamNames) {
      const existing = await tx.team.findUnique({ where: { name } });
      if (existing) {
        teamIds.set(name, existing.id);
      } else {
        const team = await tx.team.create({ data: { name } });
        teamIds.set(name, team.id);
        teamsCreated++;
      }
    }

    for (const row of rows) {
      const teamId = teamIds.get(row.team)!;
      const existing = await tx.user.findUnique({ where: { email: row.email } });
      let userId: string;
      if (existing) {
        // Never change role or password from a roster import.
        await tx.user.update({ where: { id: existing.id }, data: { name: row.name, active: true } });
        userId = existing.id;
        updated++;
      } else {
        const user = await tx.user.create({
          data: { email: row.email, name: row.name, role: "STUDENT" },
        });
        userId = user.id;
        created++;
      }
      await tx.teamMembership.upsert({
        where: { userId },
        create: { userId, teamId },
        update: { teamId },
      });
    }
  });

  await audit(actorId, "roster.import", "Team", undefined, {
    created,
    updated,
    teamsCreated,
    errorCount: errors.length,
  });

  return { created, updated, teamsCreated, errors };
}
