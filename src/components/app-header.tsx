"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { CourseSwitcher, type CourseInfo } from "@/components/course-context";
import { NotificationsBell } from "@/components/notifications-bell";

export function AppHeader({
  title,
  userName,
  course,
  courses,
}: {
  title: string;
  userName: string;
  course?: CourseInfo;
  courses?: CourseInfo[];
}) {
  return (
    <header className="border-b-4 border-vt-orange bg-vt-maroon-dark text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold tracking-tight">
            VT <span className="text-vt-orange">PeerPulse</span>
          </span>
          <span className="text-sm text-white/70">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {course && courses && <CourseSwitcher course={course} courses={courses} />}
          <NotificationsBell />
          <span className="text-sm text-white/80">{userName}</span>
          <Button
            variant="outline"
            size="sm"
            className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
