"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // ถ้า login แล้ว redirect ไปหน้าหลัก
  useEffect(() => {
    if (status === "authenticated") {
      const setupComplete = (session?.user as any)?.setupComplete;
      if (setupComplete === false) {
        router.replace("/onboarding");
      } else {
        router.replace("/");
      }
    }
  }, [status, session, router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    await signIn("google", {
      callbackUrl: "/dashboard/kung-room",
    });
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen theme-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg flex items-center justify-center px-3 md:px-4 pb-24 md:pb-0">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--primary)]/10 rounded-full blur-3xl" />
        <div className="absolute top-2/3 left-1/3 w-[400px] h-[400px] bg-[var(--accent)]/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Card */}
        <div className="theme-bg-secondary backdrop-blur-xl border theme-border rounded-2xl p-8 shadow-2xl shadow-black/50">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-[var(--primary)]/30 mb-4">
              🏍️
            </div>
            <h1 className="text-2xl font-bold theme-text tracking-tight">
              DINOCO AI
            </h1>
            <p className="text-sm theme-text-secondary mt-1 text-center">
              Chat Intelligence Dashboard
              <br />
              <span className="theme-text-muted">Facebook · Instagram · LINE</span>
            </p>
          </div>

          {/* Divider */}
          <div className="border-t theme-border mb-6" />

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-900 font-medium py-3 px-4 rounded-xl transition-all duration-150 shadow-md hover:shadow-lg disabled:opacity-50 mb-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบด้วย Google"}</span>
          </button>

          {/* Footer note */}
          <p className="text-center text-xs theme-text-muted mt-4">
            เฉพาะทีมงาน DINOCO เท่านั้น
          </p>
        </div>

        {/* Version */}
        <p className="text-center text-xs theme-text-muted mt-4">
          DINOCO AI v1.0
        </p>
      </div>
    </div>
  );
}
