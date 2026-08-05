"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Entry point just routes to login; the login page itself redirects
// straight to /dashboard if a valid token is already stored.
export default function Home() {
  const router = useRouter();
  useEffect(() => { router.replace("/login"); }, [router]);
  return null;
}
