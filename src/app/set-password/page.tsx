import { Suspense } from "react";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Set password · VT PeerPulse" };

export default function SetPasswordPage() {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-vt-maroon-dark via-vt-maroon to-vt-maroon-dark p-4"
    >
      <div className="text-center text-white">
        <h1 className="text-3xl font-bold tracking-tight">
          VT <span className="text-vt-orange">PeerPulse</span>
        </h1>
      </div>
      <Suspense>
        <SetPasswordForm />
      </Suspense>
    </main>
  );
}
