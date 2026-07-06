import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  meta?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditLog.create({
    data: { actorId, action, entity, entityId: entityId ?? null, meta: meta ?? undefined },
  });
}
