import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { StudentNav } from "./nav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <AppHeader title="Student" userName={session?.user?.name ?? ""} />
      <StudentNav />
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
    </div>
  );
}
