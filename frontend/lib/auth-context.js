"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== "undefined" && localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    api.me()
      .then(setUser)
      .catch(() => { localStorage.removeItem("token"); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, user } = await api.login(email, password);
    localStorage.setItem("token", token);
    setUser(user);
    // Routed the same either way — the dashboard itself gates on
    // mustChangePassword, so there is one place that decision lives rather
    // than every entry point having to remember to check.
    router.push("/dashboard");
  }

  // Called after a successful password change so the gate lifts without a
  // full reload.
  function clearPasswordChangeRequirement() {
    setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, clearPasswordChangeRequirement }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
