import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveCourses } from "@/server/course-resolution";
import { AppHeader } from "@/components/app-header";
import { CourseProvider } from "@/components/course-context";
import { ProfessorNav } from "./nav";

export default async function ProfessorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const { courses, active } = session?.user
    ? await resolveCourses(session.user.id, "PROFESSOR")
    : { courses: [], active: null };

  if (!active) {
    return (
      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader title="Instructor" userName={session?.user?.name ?? ""} />
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 p-6">
          <h1 className="mb-2 text-lg font-semibold">No courses yet</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Create your first course to start importing rosters and running evaluation rounds.{" "}
            <Link className="underline" href="/professor/courses">
              Create a course
            </Link>
            .
          </p>
          {children}
        </main>
      </div>
    );
  }

  return (
    <CourseProvider course={active} courses={courses}>
      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader
          title="Instructor"
          userName={session?.user?.name ?? ""}
          course={active}
          courses={courses}
        />
        <div className="flex flex-1">
          <ProfessorNav />
          <main id="main" className="w-full max-w-6xl flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    </CourseProvider>
  );
}
