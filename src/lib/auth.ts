import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { env, oidcEnabled } from "./env";
import { checkRateLimit, LIMITS } from "./rate-limit";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
  interface User {
    role?: Role;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function providers(): Provider[] {
  const list: Provider[] = [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase().trim();
        // Throttle by both account and client IP to slow credential stuffing.
        const ip = request?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        if (!checkRateLimit(`login:${email}`, LIMITS.login)) return null;
        if (!checkRateLimit(`login-ip:${ip}`, { limit: 30, windowMs: 5 * 60_000 })) return null;
        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.active || !user.passwordHash) return null;
        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ];

  // University SSO: any OIDC-compliant IdP (Azure AD, Okta, Shibboleth OIDC plugin).
  if (oidcEnabled()) {
    const e = env();
    list.push({
      id: "university",
      name: e.OIDC_PROVIDER_NAME,
      type: "oidc",
      issuer: e.OIDC_ISSUER,
      clientId: e.OIDC_CLIENT_ID,
      clientSecret: e.OIDC_CLIENT_SECRET,
    });
  }
  return list;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // 12h; API guards also revalidate against the DB
  pages: { signIn: "/login" },
  providers: providers(),
  callbacks: {
    /**
     * SSO sign-ins are roster-controlled: the account must already exist
     * (created by CSV import) and be active. SSO never auto-provisions users.
     */
    async signIn({ user, account }) {
      if (account?.provider !== "university") return true;
      const email = user.email?.toLowerCase().trim();
      if (!email) return false;
      const existing = await db.user.findUnique({ where: { email } });
      return Boolean(existing?.active);
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "university" && user?.email) {
        const dbUser = await db.user.findUnique({
          where: { email: user.email.toLowerCase().trim() },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
        return token;
      }
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
});
