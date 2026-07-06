import NextAuth from "next-auth";
import { NextResponse } from "next/server";

// Edge-safe auth instance: no DB access here. Role/id come from the JWT.
const { auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "STUDENT" | "PROFESSOR";
      return session;
    },
  },
});

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;

  if (pathname === "/login") {
    if (user) {
      const home = user.role === "PROFESSOR" ? "/professor" : "/student";
      return NextResponse.redirect(new URL(home, req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!user) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith("/professor") && user.role !== "PROFESSOR") {
    return NextResponse.redirect(new URL("/student", req.nextUrl));
  }
  if (pathname.startsWith("/student") && user.role !== "STUDENT") {
    return NextResponse.redirect(new URL("/professor", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/", "/login", "/student/:path*", "/professor/:path*"],
};
