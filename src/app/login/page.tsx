import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · VT PeerPulse" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
