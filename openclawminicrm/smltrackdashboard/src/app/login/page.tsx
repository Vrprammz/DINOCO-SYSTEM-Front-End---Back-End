"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  // ถ้า login แล้ว หรือ dev mode (ไม่มี NEXTAUTH_SECRET) → redirect ไปหน้าหลัก
  useEffect(() => {
    if (status === "authenticated" || status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  return (
    <div className="min-h-screen theme-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
