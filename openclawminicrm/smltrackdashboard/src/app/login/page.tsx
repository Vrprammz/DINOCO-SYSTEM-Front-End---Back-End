"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/kung-room");
    }
  }, [status, session, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", {
      password,
      redirect: false,
    });
    if (result?.ok) {
      router.replace("/kung-room");
    } else {
      setError("รหัสผ่านไม่ถูกต้อง");
      setLoading(false);
    }
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
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--primary)]/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="theme-bg-secondary backdrop-blur-xl border theme-border rounded-2xl p-8 shadow-2xl shadow-black/50">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-[var(--primary)]/30 mb-4">
              🏍️
            </div>
            <h1 className="text-2xl font-bold theme-text tracking-tight">
              DINOCO AI
            </h1>
            <p className="text-sm theme-text-secondary mt-1">
              Chat Intelligence Dashboard
            </p>
          </div>

          <div className="border-t theme-border mb-6" />

          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่าน"
              className="w-full px-4 py-3 rounded-xl theme-bg border theme-border theme-text placeholder:theme-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)] mb-3"
              autoFocus
            />
            {error && (
              <p className="text-red-400 text-sm mb-3 text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 px-4 bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] text-white font-medium rounded-xl transition-all duration-150 shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>

          <p className="text-center text-xs theme-text-muted mt-4">
            เฉพาะทีมงาน DINOCO เท่านั้น
          </p>
        </div>

        <p className="text-center text-xs theme-text-muted mt-4">
          DINOCO AI v1.0
        </p>
      </div>
    </div>
  );
}
