import { auth } from "@/lib/auth";
import { resolveCourses } from "@/server/course-resolution";
import { AppHeader } from "@/components/app-header";
import { CourseProvider } from "@/components/course-context";
import { StudentNav } from "./nav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const { courses, active } = session?.user
    ? await resolveCourses(session.user.id, "STUDENT")
    : { courses: [], active: null };

  if (!active) {
    return (
      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader title="Student" userName={session?.user?.name ?? ""} />
        <main id="main" className="mx-auto w-full max-w-4xl flex-1 p-6">
          <h1 className="mb-2 text-lg font-semibold">No course enrollment</h1>
          <p className="text-sm text-muted-foreground">
            You are not enrolled in any course yet. Contact your instructor.
          </p>
        </main>
      </div>
    );
  }

  return (
    <CourseProvider course={active} courses={courses}>
      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader
          title="Student"
          userName={session?.user?.name ?? ""}
          course={active}
          courses={courses}
        />
        <StudentNav />
        <main id="main" className="mx-auto w-full max-w-4xl flex-1 p-6">
          {children}
        </main>
      </div>
    </CourseProvider>
  );
}
