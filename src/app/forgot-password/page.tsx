"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api("/api/auth/request-reset", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch {
      // Deliberately ignored: the endpoint never reveals whether the account exists.
    } finally {
      setSent(true);
      setSubmitting(false);
    }
  }

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
      <Card className="w-full max-w-sm border-t-4 border-t-vt-orange shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">Reset password</CardTitle>
          <CardDescription>
            Enter your university email and we&apos;ll send a reset link if an account exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-sm">
              <p>
                If an account exists for <strong>{email}</strong>, a reset link is on its way.
                Check your inbox.
              </p>
              <Link href="/login" className="underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@vt.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !email}>
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
              <p className="text-center text-sm">
                <Link href="/login" className="text-muted-foreground underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
