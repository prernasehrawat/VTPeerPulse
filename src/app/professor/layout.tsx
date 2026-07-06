import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { ProfessorNav } from "./nav";

export default async function ProfessorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <AppHeader title="Instructor" userName={session?.user?.name ?? ""} />
      <div className="flex flex-1">
        <ProfessorNav />
        <main className="w-full max-w-6xl flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
