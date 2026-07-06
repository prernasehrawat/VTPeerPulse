import Link from "next/link";
import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <AppHeader title="Student" userName={session?.user?.name ?? ""} />
      <nav className="flex gap-4 border-b px-6 py-2 text-sm" aria-label="Student navigation">
        <Link href="/student" className="text-muted-foreground hover:text-foreground">
          Current evaluation
        </Link>
        <Link href="/student/history" className="text-muted-foreground hover:text-foreground">
          My past submissions
        </Link>
      </nav>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
    </div>
  );
}
