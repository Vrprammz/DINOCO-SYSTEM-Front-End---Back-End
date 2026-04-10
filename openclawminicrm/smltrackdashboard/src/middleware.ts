import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Public paths ที่ไม่ต้อง auth
const PUBLIC_PATHS = [
  "/api/auth",           // NextAuth endpoints
  "/login",
  "/_next",
  "/favicon.ico",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check API routes
  if (pathname.startsWith("/api/")) {
    // Dev mode: skip if no GOOGLE_CLIENT_ID
    if (!process.env.GOOGLE_CLIENT_ID) {
      return NextResponse.next();
    }

    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*", // Protect all API routes
  ],
};
