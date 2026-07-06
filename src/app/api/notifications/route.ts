import { NextResponse } from "next/server";
import { apiHandler, requireUser } from "@/lib/guards";
import { listNotifications, markNotificationsRead } from "@/server/services/notifications";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return NextResponse.json(await listNotifications(user.id));
});

/** Marks all of the caller's notifications as read. */
export const POST = apiHandler(async () => {
  const user = await requireUser();
  await markNotificationsRead(user.id);
  return NextResponse.json({ ok: true });
});
