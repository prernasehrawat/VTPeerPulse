import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(8),
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    AI_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
    AI_API_KEY: z.string().default(""),
    AI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    AI_MODEL: z.string().default("gpt-4o-mini"),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    ALLOWED_EMAIL_DOMAINS: z.string().default("vt.edu"),
    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    EMAIL_FROM: z.string().default("VT PeerPulse <no-reply@peerpulse.local>"),
    EMAIL_API_KEY: z.string().default(""),
    EMAIL_API_URL: z.string().url().default("https://api.resend.com/emails"),
    // University SSO via any OIDC-compliant IdP (Azure AD, Okta, Shibboleth OIDC plugin).
    OIDC_ISSUER: z.string().default(""),
    OIDC_CLIENT_ID: z.string().default(""),
    OIDC_CLIENT_SECRET: z.string().default(""),
    OIDC_PROVIDER_NAME: z.string().default("University SSO"),
    SCHEDULER_ENABLED: z
      .string()
      .default("true")
      .transform((v) => v !== "false" && v !== "0"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === "production") {
      if (cfg.AUTH_SECRET.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_SECRET"],
          message: "AUTH_SECRET must be at least 32 characters in production",
        });
      }
      if (cfg.EMAIL_PROVIDER === "resend" && !cfg.EMAIL_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_API_KEY"],
          message: "EMAIL_API_KEY is required when EMAIL_PROVIDER=resend",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}

export function allowedEmailDomains(): string[] {
  return env()
    .ALLOWED_EMAIL_DOMAINS.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function oidcEnabled(): boolean {
  const e = env();
  return Boolean(e.OIDC_ISSUER && e.OIDC_CLIENT_ID && e.OIDC_CLIENT_SECRET);
}
