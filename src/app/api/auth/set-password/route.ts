import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/guards";
import { clientKey, enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { setPasswordWithToken } from "@/server/services/accounts";

const schema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200),
});

export const POST = apiHandler(async (req: Request) => {
  enforceRateLimit(`set-password:${clientKey(req)}`, LIMITS.passwordReset);
  const { token, password } = await parseBody(req, schema);
  await setPasswordWithToken(token, password);
  return NextResponse.json({ ok: true });
});
