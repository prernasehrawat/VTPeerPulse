import { Suspense } from "react";
import { env, oidcEnabled } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · VT PeerPulse" };

export default function LoginPage() {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-vt-maroon-dark via-vt-maroon to-vt-maroon-dark p-4"
    >
      <div className="text-center text-white">
        <h1 className="text-3xl font-bold tracking-tight">
          VT <span className="text-vt-orange">PeerPulse</span>
        </h1>
        <p className="mt-1 text-sm text-white/70">Peer evaluations for team-based courses</p>
      </div>
      <Suspense>
        <LoginForm sso={oidcEnabled() ? { name: env().OIDC_PROVIDER_NAME } : null} />
      </Suspense>
    </main>
  );
}
