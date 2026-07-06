import { db } from "@/lib/db";
import type { Pagination } from "@/lib/schemas";
import type { Prisma } from "@/generated/prisma/client";

/** Paginated audit trail, newest first. */
export async function listAuditLogs({ page, pageSize }: Pagination) {
  const [total, items] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  return { items, total, page, pageSize };
}

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
