import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/guards";
import { clientKey, enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/server/services/accounts";

const schema = z.object({ email: z.string().email() });

export const POST = apiHandler(async (req: Request) => {
  enforceRateLimit(`request-reset:${clientKey(req)}`, LIMITS.passwordReset);
  const { email } = await parseBody(req, schema);
  await requestPasswordReset(email);
  // Always 200: never reveal whether an account exists.
  return NextResponse.json({ ok: true });
});
