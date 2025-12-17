import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Chrome, Mail } from "lucide-react";

type Props = {
  onSignIn?: (userId?: string) => void;
};

export default function Auth({ onSignIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError("");

      console.log("API: login attempt - google");

      // Store remember me preference
      if (rememberMe) {
        localStorage.setItem("financeflow_remember_me", "true");
      } else {
        localStorage.removeItem("financeflow_remember_me");
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}`,
        },
      });
      console.log("API: login attempt - google result", { error: error || null });
      if (error) throw error;
      // Attempt to notify parent that sign-in completed. For redirect flows
      // the page may reload and the auth listener will handle the rest.
      try { onSignIn?.(); } catch (e) {}
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");

      if (!email || !password) {
        throw new Error("Email and password are required");
      }

      // Store remember me preference
      if (rememberMe) {
        localStorage.setItem("financeflow_remember_me", "true");
      } else {
        localStorage.removeItem("financeflow_remember_me");
      }

      if (authMode === "signin") {
        console.log("API: login attempt - email", { email });
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        console.log("API: login attempt - email result", { data, error: error || null });
        if (error) throw error;
        // CRITICAL: Notify parent that sign-in completed so Index can eagerly reload data
        // Pass the user id when available to avoid session persistence races
        // The session is automatically stored in localStorage by Supabase, so Index can read it
        try { 
          if (data?.session) {
            // Session is already stored in localStorage by Supabase
            // Just pass the userId - Index will read session from localStorage or getSession()
            onSignIn?.(data.session.user?.id); 
          } else {
            onSignIn?.();
          }
        } catch (e) {
          console.warn("API: Auth - onSignIn callback failed", e);
        }
      } else {
        console.log("API: signup attempt - email", { email });
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        console.log("API: signup attempt - email result", { data, error: error || null });
        if (error) throw error;
        setError("Signup successful! Please check your email to verify your account.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6 sm:p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              FinanceFlow
            </h1>
            <p className="text-sm sm:text-base text-gray-600">
              Smart Income & Expense Tracking
            </p>
          </div>

          {error && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                error.includes("successful")
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {error}
            </div>
          )}

          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 rounded-lg px-4 py-3 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            <Chrome className="w-5 h-5" />
            Sign in with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-300"></div>
            <span className="text-sm text-gray-500">Or continue with email</span>
            <div className="flex-1 h-px bg-gray-300"></div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 text-white rounded-lg px-4 py-2 font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authMode === "signin" ? "Sign In" : "Sign Up"}
            </button>
          </form>

          {/* Toggle Auth Mode */}
          <div className="text-center mb-4">
            <button
              onClick={() => {
                setAuthMode(authMode === "signin" ? "signup" : "signin");
                setError("");
              }}
              disabled={loading}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-semibold disabled:opacity-50"
            >
              {authMode === "signin"
                ? "Need an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>

          {/* Remember Me Checkbox */}
          <div className="mb-6 flex items-center gap-2">
            <input
              type="checkbox"
              id="remember-me"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            />
            <label
              htmlFor="remember-me"
              className="text-sm text-gray-700 font-medium cursor-pointer"
            >
              Keep me signed in for 30 days
            </label>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Your data is encrypted and stored securely on your account only.
          </p>
        </div>
      </div>
    </div>
  );
}
