import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, apiErrorMessage } from "@/services/api";
import type { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("threadline_user");
    const token = localStorage.getItem("threadline_token");
    if (stored && token) {
      setUser(JSON.parse(stored));
      // Re-validate the session in the background.
      api
        .get("/auth/me")
        .then((res) => setUser(res.data.user))
        .catch(() => {
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email: string, password: string) {
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("threadline_token", res.data.token);
      localStorage.setItem("threadline_user", JSON.stringify(res.data.user));
      setUser(res.data.user);
    } catch (err) {
      throw new Error(apiErrorMessage(err));
    }
  }

  function logout() {
    localStorage.removeItem("threadline_token");
    localStorage.removeItem("threadline_user");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
