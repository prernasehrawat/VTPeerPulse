"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CourseInfo = { id: string; code: string; name: string; term: string };

export const COURSE_COOKIE = "peerpulse-course";

const CourseContext = createContext<{ course: CourseInfo; courses: CourseInfo[] } | null>(null);

/** The active course for all data fetching under this provider. */
export function useCourse(): { course: CourseInfo; courses: CourseInfo[] } {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error("useCourse must be used inside a CourseProvider");
  return ctx;
}

export function CourseProvider({
  course,
  courses,
  children,
}: {
  course: CourseInfo;
  courses: CourseInfo[];
  children: ReactNode;
}) {
  return <CourseContext.Provider value={{ course, courses }}>{children}</CourseContext.Provider>;
}

/** Header dropdown to switch the active course. Persists via cookie + full refresh. */
export function CourseSwitcher({
  course,
  courses,
}: {
  course: CourseInfo;
  courses: CourseInfo[];
}) {
  const router = useRouter();
  if (courses.length <= 1) {
    return (
      <span className="text-sm text-white/80">
        {course.code} · {course.term}
      </span>
    );
  }
  return (
    <Select
      value={course.id}
      onValueChange={(id) => {
        document.cookie = `${COURSE_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      <SelectTrigger
        aria-label="Active course"
        className="h-8 w-40 border-white/30 bg-transparent text-white sm:w-56"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {courses.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.code} · {c.term}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
