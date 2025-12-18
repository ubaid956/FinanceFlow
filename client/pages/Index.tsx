import { useState, useEffect, useRef } from "react";
import { Session } from "@supabase/supabase-js";
import Header from "@/components/Header";
import Auth from "@/components/Auth";
import DateFilter from "@/components/DateFilter";
import TransactionFilters from "@/components/TransactionFilters";
import TransactionForm from "@/components/TransactionForm";
import StatsPanel from "@/components/StatsPanel";
import TransactionsTable from "@/components/TransactionsTable";
import CategoryStats from "@/components/CategoryStats";
import ExportButton from "@/components/ExportButton";
import YearOverview from "@/components/YearOverview";
import TransactionSearch from "@/components/TransactionSearch";
import SpendingTrends from "@/components/SpendingTrends";
import BudgetGoals from "@/components/BudgetGoals";
import AccountBalances from "@/components/AccountBalances";
import MonthlyComparison from "@/components/MonthlyComparison";
import RecurringTransactions from "@/components/RecurringTransactions";
import DataBackup from "@/components/DataBackup";
import StorageBar from "@/components/StorageBar";
import { Transaction, TransactionFilters as FilterType, AccountType, BudgetGoal, RecurringTransaction } from "@shared/api";
import { Calendar, Clock, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";


const STORAGE_KEY = "financeflow_transactions";
const BUDGET_STORAGE_KEY = "financeflow_budgets";
const RECURRING_STORAGE_KEY = "financeflow_recurring";

// Helper function to get session from localStorage as fallback when getSession() times out
const getSessionFromLocalStorage = (): Session | null => {
  try {
    // Supabase stores session in localStorage with key pattern: sb-<project-ref>-auth-token
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return null;
    
    // Extract project ref from URL (e.g., https://xyz.supabase.co -> xyz)
    const projectRef = supabaseUrl.split('//')[1]?.split('.')[0];
    if (!projectRef) return null;
    
    const storageKey = `sb-${projectRef}-auth-token`;
    const stored = localStorage.getItem(storageKey);
    
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    // Supabase stores it as { access_token, refresh_token, expires_at, expires_in, token_type, user }
    if (parsed?.access_token && parsed?.user) {
      // Reconstruct session object
      return {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
        expires_at: parsed.expires_at,
        expires_in: parsed.expires_in,
        token_type: parsed.token_type || 'bearer',
        user: parsed.user,
      } as Session;
    }
  } catch (e) {
    console.warn("API: Failed to read session from localStorage", e);
  }
  return null;
};

// Supabase free tier database limit: 500MB
// We'll warn/block at 90% to be safe (450MB)
const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500MB
const STORAGE_WARNING_THRESHOLD = 0.9; // 90%

export default function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Track whether initial data has been loaded - prevents flash of empty content
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetGoal[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  // Force a re-render when needed to ensure derived filters update immediately
  const [renderTick, setRenderTick] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<AccountType | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [storageFull, setStorageFull] = useState(false);
  const [lastLoadedUserId, setLastLoadedUserId] = useState<string | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const { toast } = useToast();

  // Track pending saves to ensure they complete before page unload
  const pendingSavesRef = useRef<Promise<void>[]>([]);
  // Ensure we don't sync to Supabase until we've loaded data from Supabase
  // for the current user. This prevents an initial empty local state from
  // deleting the user's existing records in Supabase.
  const loadedFromSupabaseRef = useRef(false);
  // Track if we just logged out to force reload on next sign-in
  const justLoggedOutRef = useRef(false);
  // Track if we're currently loading data to prevent concurrent loads
  const isLoadingDataRef = useRef(false);
  // Track if we're in the process of signing in to prevent showing Auth component
  const isSigningInRef = useRef(false);
  // Track previous session so we only auto-load when a NEW session appears
  const prevSessionRef = useRef<Session | null>(null);
  // Detect if the current page load was a full reload so we can load data on refresh
  const pageReloadedRef = useRef<boolean>(false);
  // AbortController to cancel pending data loads when user logs out
  const loadAbortControllerRef = useRef<AbortController | null>(null);
  // Track the current userId for the active load to prevent stale loads
  const activeLoadUserIdRef = useRef<string | null>(null);

  // Initialize session from localStorage on mount
  // This runs once to bootstrap the session state without calling setSession during render
  useEffect(() => {
    if (!session) {
      const storedSession = getSessionFromLocalStorage();
      if (storedSession) {
        console.log("API: Initializing session from localStorage on mount", { userId: storedSession.user?.id });
        setSession(storedSession);
      }
    }
  }, []); // Only run once on mount

  // Check session and load data from Supabase
  useEffect(() => {
    // Detect full page reload once on mount
    try {
      const nav = (performance && (performance as any).getEntriesByType)
        ? ((performance as any).getEntriesByType("navigation") || [])[0]
        : null;
      const navAny = nav as any;
      pageReloadedRef.current = !!(navAny && (navAny.type === "reload" || ((performance as any).navigation && (performance as any).navigation.type === 1)));
    } catch (e) {
      pageReloadedRef.current = false;
    }
    try {
      bcRef.current = new BroadcastChannel("financeflow-storage");
    } catch (err) {
      bcRef.current = null;
    }

    // Listen for messages from other tabs (e.g., sign-out or data updates)
    try {
      if (bcRef.current) {
        bcRef.current.onmessage = (ev) => {
          try {
            const msg = ev.data || {};
            if (msg.type === "sign_out") {
              console.log("API: received sign_out broadcast from another tab - clearing session");
              setSession(null);
              setTransactions([]);
              setBudgets([]);
              setRecurring([]);
              loadedFromSupabaseRef.current = false;
              setLastLoadedUserId(null);
              setInitialDataLoaded(false);
              justLoggedOutRef.current = true;
            } else if (msg.type === "update") {
              // Another tab updated data; trigger a reload from Supabase.
              // Use getSession() here to avoid stale `session` captured by the closure.
              console.log("API: received update broadcast from another tab");
              (async () => {
                try {
                  const { data } = await supabase.auth.getSession();
                  const userId = data?.session?.user?.id;
                  if (userId) {
                    await loadDataFromSupabase(userId);
                  }
                } catch (e) {
                  console.warn("API: background reload after broadcast failed", e);
                }
              })();
            }
          } catch (e) {
            // ignore message handling errors
          }
        };
      }
    } catch (e) {
      // ignore
    }

    let mounted = true;
    const getSession = async () => {
      try {
        // Add timeout to getSession to prevent hanging after tab switches
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("getSession timeout after 5 seconds")), 5000);
        });

        let sessionResult: any;
        try {
          sessionResult = await Promise.race([sessionPromise, timeoutPromise]);
        } catch (timeoutErr: any) {
          if (timeoutErr?.message?.includes("timeout")) {
            console.warn("API: getSession timed out, will retry once");
            // Retry once after timeout
            try {
              await new Promise(resolve => setTimeout(resolve, 1000));
              sessionResult = await supabase.auth.getSession();
            } catch (retryErr) {
              console.error("API: getSession retry also failed", retryErr);
              // Try to get session from localStorage as fallback
              const fallbackSession = getSessionFromLocalStorage();
              if (fallbackSession && mounted) {
                console.log("API: Using session from localStorage fallback", {
                  user: fallbackSession.user?.id,
                  email: fallbackSession.user?.email,
                });
                setSession(fallbackSession);
                // Load data for this user
                loadedFromSupabaseRef.current = false;
                await loadDataFromSupabase(fallbackSession.user.id);
                setLoading(false);
                return;
              }
              // Don't clear session on timeout - keep existing session if we have one
              if (mounted && !session) {
                setLoading(false);
              }
              return;
            }
          } else {
            throw timeoutErr;
          }
        }

        const { data, error } = sessionResult;

        // If there's a refresh token error, sign out and let user log back in
        if (error && error.message?.includes("Refresh Token")) {
          console.warn("Refresh token invalid, signing out:", error);
          await supabase.auth.signOut();
          if (mounted) {
            setSession(null);
            loadDataFromLocalStorage();
          }
          return;
        }

        if (error) throw error;

        if (mounted) {
              // Only update session if we got a valid session or explicitly null
              // Don't clear session if getSession returns undefined/null due to transient errors
              if (data?.session) {
                setSession(data.session);
                console.log("API: session loaded (getSession)", {
                  user: data.session.user?.id,
                  email: data.session.user?.email,
                });
                // If we've already loaded this user's data from Supabase, skip reloading
                if (lastLoadedUserId === data.session.user.id && loadedFromSupabaseRef.current) {
                  // nothing to do
                } else {
                  // User is authenticated - try Supabase first, fall back to localStorage if it fails
                  // Reset loaded flag until the load completes successfully
                  loadedFromSupabaseRef.current = false;
                  await loadDataFromSupabase(data.session.user.id);
                }
              } else if (data?.session === null || data === null) {
                // Explicitly null - user is not authenticated
                setSession(null);
                loadedFromSupabaseRef.current = false;
                loadDataFromLocalStorage();
              } else {
                // data?.session is undefined - might be a transient error
                // Don't clear existing session, just log a warning
                console.warn("API: getSession returned undefined session, keeping existing session if any");
                if (!session) {
                  // Only clear if we don't have a session already
                  setSession(null);
                  loadDataFromLocalStorage();
                }
              }
        }
      } catch (error) {
        console.error("Failed to load session:", error);
        // Don't clear session on error - keep existing session if we have one
        // This prevents accidental session clearing that causes redirect to login
        if (mounted) {
          if (!session) {
            // Only clear if we don't have a session already
            loadDataFromLocalStorage();
          }
          setLoading(false);
        }
      } finally {
        if (mounted) {
          // Set loading false immediately - Supabase sync happens in background
          setLoading(false);
        }
      }
    };

    getSession();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (mounted) {
        // Only handle actual login/logout events, not token refresh
        // This prevents clearing data on every tab focus/session refresh
        // Log all auth events for debugging (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
        try {
          console.log("API: auth event", { event, newSession });
        } catch (e) {}

        if (event === "SIGNED_IN" && newSession) {
          console.log("API: auth event SIGNED_IN", {
            user: newSession.user.id,
            email: newSession.user.email,
            justLoggedOut: justLoggedOutRef.current,
            lastLoadedUserId: lastLoadedUserId,
            loadedFromSupabase: loadedFromSupabaseRef.current,
            isLoadingData: isLoadingDataRef.current,
            isSigningIn: isSigningInRef.current,
          });
          
          // CRITICAL: Set session immediately - this prevents redirect to login
          // Decide whether this SIGNED_IN represents a new login or a token refresh
          const isNewSessionEvent = !prevSessionRef.current || prevSessionRef.current.user?.id !== newSession.user.id;
          // If this is NOT a new session and we didn't just log out, and the page
          // wasn't reloaded, skip the eager reload — this avoids reloads caused
          // by token refreshes or visibility-driven SDK events.
          if (!isNewSessionEvent && !justLoggedOutRef.current && !pageReloadedRef.current) {
            console.log("API: auth event SIGNED_IN - non-new session/token refresh, skipping reload", { user: newSession.user.id });
            setSession(newSession);
            // update prevSession to current session
            prevSessionRef.current = newSession;
            setLoading(false);
            return;
          }

          setSession(newSession);
          // Mark that we're no longer signing in
          isSigningInRef.current = false;
          
          // Always reload data after logout, or if we haven't loaded for this user yet
          // The check here prevents unnecessary reloads on token refresh, but we force
          // reload after logout to ensure fresh data
          const wasJustLoggedOut = justLoggedOutRef.current;
          const shouldSkipReload = !wasJustLoggedOut && 
                                   lastLoadedUserId === newSession.user.id && 
                                   loadedFromSupabaseRef.current &&
                                   !isLoadingDataRef.current;
          
          if (shouldSkipReload) {
            console.log("API: skipping reload - data already loaded for this user");
            setLoading(false);
            return;
          }
          
          // Don't reset the logout flag yet - wait until data loads successfully
          // Mark that we haven't yet loaded this user's data from Supabase
          loadedFromSupabaseRef.current = false;
          setLastLoadedUserId(newSession.user.id);
          
          // NOTE: removed visibility wait on tab switch to preserve previous
          // behavior — do not block loading when the tab isn't visible.
          
          // Show loading UI while we fetch the user's data to avoid a flash of empty state
          setLoading(true);
          try {
            // Force reload after logout to ensure we get fresh data
            // Use a timeout wrapper to prevent hanging indefinitely
            // Only force reload when we actually just logged out. Previously this
            // used `wasJustLoggedOut || true` which always evaluated to true and
            // caused a reload on every SIGNED_IN event (even token refreshes).
            const loadPromise = loadDataFromSupabase(newSession.user.id, { force: wasJustLoggedOut });
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error("Load timeout after 20 seconds")), 20000);
            });
            
            await Promise.race([loadPromise, timeoutPromise]);
            
            // Only reset logout flag after successful load
            if (wasJustLoggedOut) {
              justLoggedOutRef.current = false;
            }
          } catch (e: any) {
            console.error("API: onAuthStateChange SIGNED_IN - loadDataFromSupabase failed", e);
            // Reset the flag anyway to prevent infinite retries
            if (wasJustLoggedOut) {
              justLoggedOutRef.current = false;
            }
            // CRITICAL: Don't clear session on load failure - session is still valid
            // The session was already set above, so we keep it even if data load fails
            // This prevents redirect to login page when data load fails
            console.warn("API: Data load failed but keeping session - user is still logged in");
            // Don't clear loading here - let the retry logic handle it
          } finally {
            setLoading(false);
          }
        } else if (event === "SIGNED_OUT") {
          // User logged out - clear everything and cancel any pending loads
          console.log("API: auth event SIGNED_OUT - clearing all state and canceling pending loads");
          
          // CRITICAL: Cancel any pending loadDataFromSupabase calls
          if (loadAbortControllerRef.current) {
            console.log("API: SIGNED_OUT - aborting pending data load");
            loadAbortControllerRef.current.abort();
            loadAbortControllerRef.current = null;
          }
          
          // Reset loading flags
          isLoadingDataRef.current = false;
          activeLoadUserIdRef.current = null;
          
          // Clear background retry if active
          if (backgroundRetryRef.current) {
            clearInterval(backgroundRetryRef.current);
            backgroundRetryRef.current = null;
          }
          
          setSession(null);
          setTransactions([]);
          setBudgets([]);
          setRecurring([]);
          setLastLoadedUserId(null);
          // No longer loaded for any user
          loadedFromSupabaseRef.current = false;
          // Reset initial data loaded flag so next login shows loading state
          setInitialDataLoaded(false);
          // Mark that we just logged out so next sign-in forces reload
          justLoggedOutRef.current = true;
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(BUDGET_STORAGE_KEY);
          localStorage.removeItem(RECURRING_STORAGE_KEY);
          try { bcRef.current?.postMessage({ type: 'sign_out' }); } catch (e) {}
        } else if (event === "TOKEN_REFRESHED") {
          // Token was refreshed - update session but don't clear it
          if (newSession) {
            console.log("API: auth event TOKEN_REFRESHED - updating session", { user: newSession.user?.id });
            setSession(newSession);
          }
        } else {
          // For other events (USER_UPDATED, PASSWORD_RECOVERY, etc.), only update session when present
          // CRITICAL: Never set session to null unless it's SIGNED_OUT
          // This prevents accidental session clearing that causes redirect to login
          if (newSession) {
            setSession(newSession);
          } else {
            // For non-SIGNED_OUT events, if newSession is null, don't clear the existing session
            // This prevents accidental session clearing from transient errors
            console.warn("API: auth event", event, "- newSession is null, keeping existing session to prevent redirect to login");
          }
        }
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
      if (bcRef.current) {
        try { bcRef.current.close(); } catch (e) {}
        bcRef.current = null;
      }
      if (backgroundRetryRef.current) {
        try { clearInterval(backgroundRetryRef.current); } catch (e) {}
        backgroundRetryRef.current = null;
      }
    };
  }, []);

  // Track if loading is taking too long (for showing "taking longer" message)
  const [loadingTakingLong, setLoadingTakingLong] = useState(false);
  
  // Show "taking longer than expected" message after timeout, but DON'T force initialDataLoaded
  // The loading screen should stay until data ACTUALLY loads
  useEffect(() => {
    if (!session) return;
    if (initialDataLoaded) {
      setLoadingTakingLong(false);
      return;
    }
    
    // Show "taking longer" message after 5 seconds
    const longId = window.setTimeout(() => {
      if (!initialDataLoaded) {
        console.log("API: Loading taking longer than expected");
        setLoadingTakingLong(true);
      }
    }, 5000);
    
    // Only clear the general loading state after 30 seconds as absolute fallback
    // but NEVER force initialDataLoaded - that should only be set when data loads
    const fallbackId = window.setTimeout(() => {
      if (!initialDataLoaded) {
        console.warn("API: 30s timeout reached - clearing loading state but NOT forcing initialDataLoaded");
        setLoading(false);
      }
    }, 30000);

    return () => {
      clearTimeout(longId);
      clearTimeout(fallbackId);
    };
  }, [session, initialDataLoaded]);

  // Ensure that when a session becomes active (for example after logging in
  // on another tab) or when the user returns to the tab (visibilitychange)
  // we attempt to load the authoritative data from Supabase. This covers
  // cases where the session is present but the UI wasn't refreshed after
  // a tab switch; we guard with loadedFromSupabaseRef and lastLoadedUserId
  // to avoid unnecessary reloads.
  useEffect(() => {
    if (!session) {
      prevSessionRef.current = session;
      return;
    }

    // Only auto-load in two cases:
    // 1) A NEW session appeared (prevSession was null) — user just logged in
    // 2) The page was reloaded (full refresh)
    const isNewSession = !prevSessionRef.current && !!session;
    const wasPageReload = pageReloadedRef.current === true;

    // Avoid duplicate loads when sign-in was initiated via handleAuthSignIn
    // (that function already triggers a load). In that case we skip here.
    if (!isNewSession && !wasPageReload) {
      // Nothing to do on ordinary session changes (token refresh, tab focus, etc.)
      prevSessionRef.current = session;
      return;
    }

    let mounted = true;

    const tryLoad = async () => {
      try {
        // Always reload if we just logged out (force fresh data after logout)
        const wasJustLoggedOut = justLoggedOutRef.current;

        // If we've already loaded for this user and didn't just log out, skip
        if (!wasJustLoggedOut && loadedFromSupabaseRef.current && lastLoadedUserId === session.user.id && !isLoadingDataRef.current) {
          console.log("API: data already loaded for session user, skipping reload", { userId: session.user.id });
          prevSessionRef.current = session;
          pageReloadedRef.current = false;
          return;
        }

        console.log("API: session present - loading data for user (session-effect)", {
          userId: session.user.id,
          wasJustLoggedOut,
          isNewSession,
          wasPageReload,
        });

        setLoading(true);
        try {
          await loadDataFromSupabase(session.user.id, { force: wasJustLoggedOut });
          // Only reset logout flag after successful load
          if (wasJustLoggedOut) {
            justLoggedOutRef.current = false;
          }
          // Mark prev session so future token refreshes don't re-trigger load
          prevSessionRef.current = session;
          pageReloadedRef.current = false;
        } catch (e) {
          console.warn("API: session-effect loadDataFromSupabase failed", e);
          // Reset flag anyway to prevent infinite retries
          if (wasJustLoggedOut) {
            justLoggedOutRef.current = false;
          }
        } finally {
          if (mounted) setLoading(false);
        }
      } catch (e) {
        console.warn("API: session-effect tryLoad failed", e);
        if (mounted) setLoading(false);
      }
    };

    // Only run the load if we're not currently in the middle of a local sign-in
    // (handleAuthSignIn will perform the eager load in that case).
    if (!isSigningInRef.current) {
      tryLoad();
    }

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  // Extra short-lived retry when session exists but transactions remain empty.
  // This covers cases where the initial load raced with other events (auth,
  // visibility, throttling) and the UI ends up empty until a manual refresh.
  // We attempt a few quick retries (5s apart) and then stop to avoid spamming.
  const reloadRetryRef = useRef<number>(0);
  useEffect(() => {
    if (!session) return;
    if (transactions.length > 0) return; // nothing to do, we have data
    if (initialDataLoaded) return; // data loaded (even if empty), don't retry
    if (loadedFromSupabaseRef.current && lastLoadedUserId === session.user.id) return;
    if (isLoadingDataRef.current) return; // don't retry while load is in progress

    const maxRetries = 2;
    let mounted = true;

    const tryRetry = async () => {
      if (!mounted) return;
      if (reloadRetryRef.current >= maxRetries) return;
      if (isLoadingDataRef.current) return; // skip if load started
      if (initialDataLoaded) return; // skip if data loaded
      reloadRetryRef.current += 1;
      try {
        console.log("API: retry loadDataFromSupabase (retry)", { attempt: reloadRetryRef.current, userId: session.user.id });
        await loadDataFromSupabase(session.user.id);
      } catch (e) {
        console.warn("API: retry load failed", e);
      }
    };

    // Start first retry after 5 seconds, second after 10 seconds
    const timers: number[] = [];
    for (let i = 1; i <= maxRetries; i++) {
      timers.push(window.setTimeout(tryRetry, i * 5000));
    }

    return () => {
      mounted = false;
      timers.forEach((id) => clearTimeout(id));
    };
  }, [session?.user?.id, transactions.length, initialDataLoaded]);

  // Ensure pending saves complete before page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // If there are pending saves, prevent default to give them time
      if (pendingSavesRef.current.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // Called by Auth component after a successful sign-in action to eagerly
  // reload data. This helps when sign-in was initiated from this tab and
  // the auth state events may be delayed or throttled after tab switches.
  const handleAuthSignIn = async (userIdArg?: string) => {
    // Mark that we're signing in to prevent showing Auth component
    isSigningInRef.current = true;
    
    try {
      // NOTE: removed visibility wait on sign-in to avoid forcing tab-visible
      // during login; preserve previous behavior and attempt loads immediately.

      let userId = userIdArg;
      let sessionData: any = null;
      
      // CRITICAL: Try localStorage first (fastest, no async call)
      // This is especially important after tab switches when getSession() might timeout
      const fallbackSession = getSessionFromLocalStorage();
      if (fallbackSession) {
        console.log("API: handleAuthSignIn - using session from localStorage", { userId: fallbackSession.user?.id });
        setSession(fallbackSession);
        if (!userId) {
          userId = fallbackSession.user?.id;
        }
        sessionData = { data: { session: fallbackSession } };
      }
      
      // If we still don't have session, try getSession() with timeout
      if (!sessionData?.data?.session || !userId) {
        const maxAttempts = 3; // Reduced attempts since we have localStorage fallback
        let attempt = 0;
        while (attempt < maxAttempts && (!userId || !sessionData?.data?.session)) {
          attempt += 1;
          try {
            const sessionPromise = supabase.auth.getSession();
            const sessionTimeout = new Promise((_, reject) => {
              setTimeout(() => reject(new Error("getSession timeout")), 2000);
            });
            
            sessionData = await Promise.race([sessionPromise, sessionTimeout]) as any;
            
            if (sessionData?.data?.session) {
              // CRITICAL: Set session immediately to prevent showing Auth component
              setSession(sessionData.data.session);
              if (!userId) {
                userId = sessionData.data.session.user?.id;
              }
              break;
            }
          } catch (e) {
            // If getSession fails, try localStorage again (might have been updated)
            if (!session) {
              const retryFallback = getSessionFromLocalStorage();
              if (retryFallback) {
                console.log("API: handleAuthSignIn - getSession failed, using localStorage retry", { userId: retryFallback.user?.id });
                setSession(retryFallback);
                if (!userId) {
                  userId = retryFallback.user?.id;
                }
                sessionData = { data: { session: retryFallback } };
                break;
              }
            }
            // ignore and retry
            if (attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 200 * attempt));
            }
          }
        }
      }

      // If we still don't have userId or session, something is wrong
      if (!userId && !session) {
        console.warn("API: handleAuthSignIn could not determine userId or session after sign-in");
        // Try one last time with localStorage
        const lastResortSession = getSessionFromLocalStorage();
        if (lastResortSession) {
          setSession(lastResortSession);
          userId = lastResortSession.user?.id;
        }
        if (!userId) {
          // Let onAuthStateChange handle it
          isSigningInRef.current = false;
          return;
        }
      }

      // Always reload after logout, or if we haven't loaded for this user yet
      // Don't skip if we just logged out - always force reload
      const wasJustLoggedOut = justLoggedOutRef.current;
      const shouldSkip = !wasJustLoggedOut && 
                         loadedFromSupabaseRef.current && 
                         lastLoadedUserId === userId &&
                         !isLoadingDataRef.current;
      
      if (shouldSkip) {
        console.log("API: handleAuthSignIn - skipping reload, data already loaded");
        isSigningInRef.current = false;
        return;
      }
      
      // Ensure session is set before loading data
      if (!session && sessionData?.data?.session) {
        setSession(sessionData.data.session);
      } else if (!session) {
        // Last resort: try localStorage one more time
        const finalFallback = getSessionFromLocalStorage();
        if (finalFallback) {
          setSession(finalFallback);
        }
      }
      
      setLoading(true);
      try {
        // Force reload after logout or when userId changes
        await loadDataFromSupabase(userId!, { force: true });
        // Only reset logout flag after successful load
        if (wasJustLoggedOut) {
          justLoggedOutRef.current = false;
        }
      } catch (e) {
        console.warn("API: handleAuthSignIn - loadDataFromSupabase failed", e);
        // Reset flag anyway to prevent infinite retries
        if (wasJustLoggedOut) {
          justLoggedOutRef.current = false;
        }
      }
    } catch (e) {
      console.warn("API: handleAuthSignIn failed", e);
      // Don't set loading to false here - let onAuthStateChange handle it
      // This ensures the UI doesn't get stuck if handleAuthSignIn fails
    } finally {
      // Only set loading false if we don't have a session
      // Otherwise let onAuthStateChange handle the loading state
      try {
        // Check if we have session from state or localStorage
        const hasSession = session || getSessionFromLocalStorage();
        if (!hasSession) {
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            setLoading(false);
            isSigningInRef.current = false;
          }
        } else {
          // We have a session, onAuthStateChange will handle loading state
          isSigningInRef.current = false;
        }
      } catch (e) {
        // If we have a session from state or localStorage, don't clear loading
        const hasSession = session || getSessionFromLocalStorage();
        if (!hasSession) {
          setLoading(false);
        }
        isSigningInRef.current = false;
      } finally {
        // Ensure we always clear the signing-in/loading flags here.
        // Previously we relied on onAuthStateChange to clear loading when a
        // session was present, but that can race (or be throttled) after
        // tab switches and lead to a stuck "Syncing..." overlay. Clearing
        // the loading flag here is safe because the session has been set
        // (or will be shortly) and data loading was attempted above.
        try {
          isSigningInRef.current = false;
          setLoading(false);
        } catch (err) {
          // ignore
        }
      }
    }
  };

  const loadDataFromLocalStorage = () => {
    // NOTE: transaction localStorage backup is currently disabled —
    // the app now treats Supabase as the source of truth for transactions.
    // const stored = localStorage.getItem(STORAGE_KEY);
    // if (stored) {
    //   try {
    //     setTransactions(JSON.parse(stored));
    //   } catch (error) {
    //     console.error("Failed to load transactions:", error);
    //   }
    // }
    // Budgets and recurring localStorage reads are disabled — rely on Supabase
    // for authenticated users and avoid populating UI from localStorage.
    // const budgetStored = localStorage.getItem(BUDGET_STORAGE_KEY);
    // if (budgetStored) {
    //   try {
    //     setBudgets(JSON.parse(budgetStored));
    //   } catch (error) {
    //     console.error("Failed to load budgets:", error);
    //   }
    // }

    // const recurringStored = localStorage.getItem(RECURRING_STORAGE_KEY);
    // if (recurringStored) {
    //   try {
    //     setRecurring(JSON.parse(recurringStored));
    //   } catch (error) {
    //     console.error("Failed to load recurring:", error);
    //   }
    // }
  };

  // Background retry timer id for attempting Supabase loads after failures
  const backgroundRetryRef = useRef<number | null>(null);

  const scheduleBackgroundRetry = (userId: string) => {
    if (backgroundRetryRef.current) return; // already scheduled
    // Try every 15 seconds until success
    const id = window.setInterval(async () => {
      console.log("API: background retry - attempting Supabase load", { userId });
      try {
        // attempt a single-shot load
        const [transactionsRes, budgetsRes, recurringRes] = await Promise.all([
          supabase.from("transactions").select("*").eq("user_id", userId),
          supabase.from("budgets").select("*").eq("user_id", userId),
          supabase.from("recurring_transactions").select("*").eq("user_id", userId),
        ]) as any[];

        if (transactionsRes?.error || budgetsRes?.error || recurringRes?.error) {
          console.warn("API: background retry - supabase returned errors", {
            transactionsError: transactionsRes?.error || null,
            budgetsError: budgetsRes?.error || null,
            recurringError: recurringRes?.error || null,
          });
          return; // try again later
        }

        // Success: write data and clear retry
        const txData = transactionsRes?.data || [];
        const bgData = budgetsRes?.data || [];
        const rtData = recurringRes?.data || [];

  // Use server data as source of truth
  setTransactions(txData as Transaction[]);
  // localStorage backup for transactions intentionally commented out
  // localStorage.setItem(STORAGE_KEY, JSON.stringify(txData));

  // Use server data as source of truth for budgets
  setBudgets(bgData as BudgetGoal[]);
  // localStorage backup for budgets intentionally commented out
  // localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(bgData));

  // Use server data as source of truth for recurring transactions
  setRecurring(rtData as RecurringTransaction[]);
  // localStorage backup for recurring intentionally commented out
  // localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(rtData));

        loadedFromSupabaseRef.current = true;
        setLastLoadedUserId(userId);
        try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}

        if (backgroundRetryRef.current) {
          clearInterval(backgroundRetryRef.current);
          backgroundRetryRef.current = null;
        }
        console.log("API: background retry - supabase load succeeded", { userId, transactions: (txData || []).length });
      } catch (err) {
        console.error("API: background retry failed:", err);
        // keep retrying
      }
    }, 15000);
    backgroundRetryRef.current = id;
  };

  const loadDataFromSupabase = async (userId: string, options?: { force?: boolean }) => {
    // CRITICAL: Check if this load is for a different user (stale load after logout)
    // If we have an active load for a different user, cancel it
    if (activeLoadUserIdRef.current && activeLoadUserIdRef.current !== userId) {
      console.warn("API: loadDataFromSupabase - canceling stale load for different user", {
        staleUserId: activeLoadUserIdRef.current,
        newUserId: userId
      });
      if (loadAbortControllerRef.current) {
        loadAbortControllerRef.current.abort();
        loadAbortControllerRef.current = null;
      }
      isLoadingDataRef.current = false;
    }
    
    // CRITICAL: Check if we still have a session for this user
    // If session is null or for a different user, this is a stale load (after logout)
    const currentSession = session || getSessionFromLocalStorage();
    if (!currentSession || currentSession.user.id !== userId) {
      console.warn("API: loadDataFromSupabase - skipping load, no session for user (likely stale load after logout)", { userId });
      return;
    }
    
    // Prevent concurrent loads - if we're already loading for this user, just return
    // Don't start another load - the existing one will complete
    if (isLoadingDataRef.current && activeLoadUserIdRef.current === userId) {
      console.log("API: loadDataFromSupabase - already loading for this user, skipping duplicate load", { userId });
      return;
    }

    // If we've already loaded data for this user, avoid re-loading on tab switches
    // unless caller explicitly forces a reload (for example after an OAuth redirect
    // back to the index page). This ensures redirects always fetch fresh data.
    if (!options?.force && loadedFromSupabaseRef.current && lastLoadedUserId === userId) {
      console.log("API: loadDataFromSupabase - already loaded for user, skipping", { userId });
      return;
    }

    // Create new AbortController for this load
    const abortController = new AbortController();
    loadAbortControllerRef.current = abortController;
    activeLoadUserIdRef.current = userId;
    
    // Set loading lock - CRITICAL: wrap entire function in try-finally to ensure this is always reset
    isLoadingDataRef.current = true;
    setSyncing(true);
    
    try {
      // Check if we were aborted before starting
      if (abortController.signal.aborted) {
        console.log("API: loadDataFromSupabase - aborted before starting", { userId });
        return;
      }
    // Clear any previously scheduled retry - we'll decide later if we need another
    if (backgroundRetryRef.current) {
      clearInterval(backgroundRetryRef.current);
      backgroundRetryRef.current = null;
    }

    const maxAttempts = 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        console.log("API: loadDataFromSupabase - attempt", attempt, { userId });
        
        // Get access token - prefer existing session from state, fallback to getSession
        // This avoids calling getSession() which can timeout after tab switches
        let accessToken: string | undefined;
        
        // First, try to use the session from React state (fastest, no async call)
        if (session?.access_token && session.user.id === userId) {
          accessToken = session.access_token;
          console.log("API: loadDataFromSupabase - using session from state", { userId });
        } else {
          // Try localStorage fallback before calling getSession()
          const fallbackSession = getSessionFromLocalStorage();
          if (fallbackSession?.access_token && fallbackSession.user.id === userId) {
            accessToken = fallbackSession.access_token;
            // Update React state with fallback session
            if (!session) {
              setSession(fallbackSession);
            }
            console.log("API: loadDataFromSupabase - using session from localStorage fallback", { userId });
          } else {
            // Fallback: try to get session from Supabase client
            // Use a shorter timeout since we already tried state
            try {
            const sessionPromise = supabase.auth.getSession();
            const sessionTimeout = new Promise((_, reject) => {
              setTimeout(() => reject(new Error("getSession timeout after 3 seconds")), 3000);
            });
            
            const { data: sessionData, error: sessionError } = await Promise.race([
              sessionPromise,
              sessionTimeout,
            ]) as any;
            
            if (sessionError) {
              console.warn("API: loadDataFromSupabase - session error", sessionError);
              throw sessionError;
            }
            accessToken = sessionData?.session?.access_token;
            if (!accessToken) {
              throw new Error("No access token available from getSession");
            }
            console.log("API: loadDataFromSupabase - got session from getSession", { userId });
          } catch (sessionErr: any) {
            console.error("API: loadDataFromSupabase - failed to get session", sessionErr);
            if (sessionErr?.message?.includes("timeout")) {
              console.warn("API: getSession timed out, trying localStorage fallback");
              // Try localStorage fallback
              const fallbackSession = getSessionFromLocalStorage();
              if (fallbackSession?.access_token && fallbackSession.user.id === userId) {
                accessToken = fallbackSession.access_token;
                // Update React state with fallback session
                if (!session) {
                  setSession(fallbackSession);
                }
                console.log("API: loadDataFromSupabase - using localStorage fallback after getSession timeout", { userId });
              } else {
                console.warn("API: getSession timed out, will retry with exponential backoff");
                if (attempt < maxAttempts) {
                  await new Promise((r) => setTimeout(r, attempt * 1000));
                  continue;
                }
                // Last attempt failed - try using Supabase client directly without getSession
                // The Supabase client might have the session cached even if getSession() times out
                console.warn("API: getSession failed, trying Supabase client queries directly (may use cached session)");
                // Continue to queries - Supabase client might work even if getSession() timed out
                accessToken = undefined; // Will use Supabase client's internal session
              }
            } else {
              if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, attempt * 1000));
                continue;
              }
              // Last attempt failed - try using Supabase client directly
              console.warn("API: getSession failed, trying Supabase client queries directly (may use cached session)");
              accessToken = undefined; // Will use Supabase client's internal session
            }
          }
          }
        }
        
        if (!accessToken) {
          // If we still don't have a token, try one more time with a direct query
          // Supabase client might have the session cached internally
          console.warn("API: No access token available, attempting queries with Supabase client (may use cached session)");
        }

        // Check if aborted before making queries
        if (abortController.signal.aborted) {
          console.log("API: loadDataFromSupabase - aborted before queries", { userId });
          return;
        }
        
        // Use Promise.all with timeout to prevent hanging
        const queriesPromise = Promise.all([
          supabase.from("transactions").select("*").eq("user_id", userId),
          supabase.from("budgets").select("*").eq("user_id", userId),
          supabase.from("recurring_transactions").select("*").eq("user_id", userId),
        ]) as Promise<any[]>;

        // Add timeout wrapper - use longer timeout for production (Netlify can be slow)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Request timeout after 45 seconds")), 45000);
        });

        let transactionsRes: any, budgetsRes: any, recurringRes: any;
        try {
          [transactionsRes, budgetsRes, recurringRes] = await Promise.race([
            queriesPromise,
            timeoutPromise,
            // Also race against abort signal
            new Promise((_, reject) => {
              abortController.signal.addEventListener('abort', () => {
                reject(new Error("Load aborted"));
              });
            }),
          ]) as any[];
        } catch (timeoutErr: any) {
          // Check if aborted
          if (abortController.signal.aborted) {
            console.log("API: loadDataFromSupabase - aborted during queries", { userId });
            return;
          }
          if (timeoutErr?.message?.includes("timeout")) {
            console.error("API: loadDataFromSupabase - request timed out", timeoutErr);
            throw new Error("Request timed out. Please check your connection and try again.");
          }
          throw timeoutErr;
        }
        
        // Check if aborted after queries
        if (abortController.signal.aborted) {
          console.log("API: loadDataFromSupabase - aborted after queries", { userId });
          return;
        }

        console.log("API: loadDataFromSupabase - raw responses", { 
          transactionsRes: transactionsRes ? { error: transactionsRes.error || null, dataLength: Array.isArray(transactionsRes.data) ? transactionsRes.data.length : 'not array' } : null,
          budgetsRes: budgetsRes ? { error: budgetsRes.error || null, dataLength: Array.isArray(budgetsRes.data) ? budgetsRes.data.length : 'not array' } : null,
          recurringRes: recurringRes ? { error: recurringRes.error || null, dataLength: Array.isArray(recurringRes.data) ? recurringRes.data.length : 'not array' } : null,
        });

        if (transactionsRes?.error || budgetsRes?.error || recurringRes?.error) {
          throw transactionsRes?.error || budgetsRes?.error || recurringRes?.error;
        }

  const txData = transactionsRes?.data || [];
        const bgData = budgetsRes?.data || [];
        const rtData = recurringRes?.data || [];

        // Debug: log what we received and whether it matches the currently
        // selected month/year so we can see if client-side filtering will
        // produce an empty list even when the server returned rows.
        try {
          const receivedCount = Array.isArray(txData) ? txData.length : 0;
          const filteredCount = Array.isArray(txData)
            ? txData.filter((t: any) => {
                const [dYear, dMonth] = (t.date || "").split("-");
                return parseInt(dYear) === year && parseInt(dMonth) - 1 === month;
              }).length
            : 0;
          console.log("API: loadDataFromSupabase - received", { receivedCount, filteredCount, month, year });
        } catch (e) {}

        // For authenticated users, Supabase is the source of truth
  // Use server data as source of truth
  setTransactions(txData as Transaction[]);

        // If the page was reloaded, keep the UI on the current month even
        // if the server returned transactions for other months. This ensures
        // refresh always lands the user in the current month view.
        try {
          if (pageReloadedRef.current) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            console.log("API: page reload detected - keeping UI on current month", { currentYear, currentMonth });
            setYear(currentYear);
            setMonth(currentMonth);
            try { setRenderTick((r) => r + 1); } catch (e) {}
          } else {
            // If we received rows but none match the user's currently selected
            // month/year, assume the user likely wants to see their recent data
            // and switch the UI to the month of the most recent transaction.
            if (Array.isArray(txData) && txData.length > 0) {
              const received = txData as any[];
              const filteredCount = received.filter((t) => {
                const [dYear, dMonth] = (t.date || "").split("-");
                return parseInt(dYear) === year && parseInt(dMonth) - 1 === month;
              }).length;
              if (filteredCount === 0) {
                // Find the newest transaction date
                const latest = received.reduce((acc, cur) => (cur.date > acc.date ? cur : acc), received[0]);
                try {
                  const [ly, lm] = (latest.date || "").split("-");
                  const newYear = parseInt(ly);
                  const newMonth = parseInt(lm) - 1;
                  console.log("API: aligning UI month/year to latest transaction", { newYear, newMonth });
                  setYear(newYear);
                  setMonth(newMonth);
                  // Force a render so derived filters update immediately
                  try { setRenderTick((r) => r + 1); } catch (e) {}
                } catch (e) {
                  // ignore parse errors
                }
              }
            }
          }
        } catch (e) {}
  // localStorage backup for transactions intentionally commented out
  // localStorage.setItem(STORAGE_KEY, JSON.stringify(txData));

  setBudgets(bgData as BudgetGoal[]);
  // localStorage backup for budgets intentionally commented out
  // localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(bgData));

  setRecurring(rtData as RecurringTransaction[]);
  // localStorage backup for recurring intentionally commented out
  // localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(rtData));

        // Mark that we've successfully loaded this user's data from Supabase.
  loadedFromSupabaseRef.current = true;
  // Force a re-render so derived computations (filters/stats) run immediately
  try { setRenderTick((r) => r + 1); } catch (e) {}
        setLastLoadedUserId(userId);
        try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}

        // Final check if aborted before setting state
        if (abortController.signal.aborted) {
          console.log("API: loadDataFromSupabase - aborted before setting state", { userId });
          return;
        }
        
        console.log("API: loadDataFromSupabase - success", { userId, transactions: txData.length });
        
        // Mark that initial data has been loaded - prevents flash of empty content
        setInitialDataLoaded(true);

        // If this is the first successful load for this tab (no previous
        // lastLoadedUserId) or the page was reloaded, prefer showing the
        // current month after a refresh instead of aligning to the latest
        // transaction. This avoids jumping to older months (e.g., 2022)
        // when the user expected to see the current month after a refresh.
        try {
          if (!lastLoadedUserId || pageReloadedRef.current) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            console.log("API: initial load or reload - keeping UI on current month", { currentYear, currentMonth });
            setYear(currentYear);
            setMonth(currentMonth);
            try { setRenderTick((r) => r + 1); } catch (e) {}
          }
        } catch (e) {}
        
        // CRITICAL: If we successfully loaded data but don't have a session in state,
        // try to get it one more time to prevent redirect to login
        // This can happen if getSession() timed out but Supabase client queries worked
        if (!session) {
          try {
            // Use a quick timeout - if this fails, at least we have the data loaded
            const sessionPromise = supabase.auth.getSession();
            const sessionTimeout = new Promise((_, reject) => {
              setTimeout(() => reject(new Error("getSession timeout")), 2000);
            });
            const { data: sessionCheck } = await Promise.race([sessionPromise, sessionTimeout]) as any;
            if (sessionCheck?.session && !abortController.signal.aborted) {
              console.log("API: loadDataFromSupabase - setting session after successful load", { userId });
              setSession(sessionCheck.session);
            }
          } catch (e) {
            console.warn("API: loadDataFromSupabase - failed to get session after load (data is loaded though)", e);
            // Data is loaded, so we can continue - session might be set by onAuthStateChange
          }
        }
        
        setSyncing(false);
        isLoadingDataRef.current = false;
        activeLoadUserIdRef.current = null;
        loadAbortControllerRef.current = null;
        return;
      } catch (error: any) {
        // Check if aborted
        if (abortController.signal.aborted || error?.message === "Load aborted") {
          console.log("API: loadDataFromSupabase - load was aborted during attempt", { attempt, userId });
          return;
        }
        
        console.error("API: loadDataFromSupabase attempt failed:", attempt, error);
        if (attempt < maxAttempts) {
          // Check if aborted before retry
          if (abortController.signal.aborted) {
            console.log("API: loadDataFromSupabase - aborted before retry", { userId });
            return;
          }
          // exponential backoff between attempts
          await new Promise((r) => setTimeout(r, attempt * 1000));
          // Check again after backoff
          if (abortController.signal.aborted) {
            console.log("API: loadDataFromSupabase - aborted during backoff", { userId });
            return;
          }
          continue;
        }

        // Check if aborted before REST fallback
        if (abortController.signal.aborted) {
          console.log("API: loadDataFromSupabase - aborted before REST fallback", { userId });
          return;
        }
        
        // All client attempts exhausted. Try a REST fallback using the access token
        // which can succeed when the client is impacted by tab throttling.
        console.warn("API: Supabase client failed after attempts; trying REST fallback");
        try {
          // Prefer existing session token from state (fastest, no async call)
          let accessToken: string | undefined = session?.access_token;
          
          // Try localStorage fallback if no session in state
          if (!accessToken) {
            const fallbackSession = getSessionFromLocalStorage();
            if (fallbackSession?.access_token && fallbackSession.user.id === userId) {
              accessToken = fallbackSession.access_token;
              // Update React state with fallback session
              if (!session) {
                setSession(fallbackSession);
              }
              console.log("API: REST fallback - using session from localStorage", { userId });
            }
          }
          
          // Only try getSession if we still don't have a token
          if (!accessToken) {
            try {
              // Use shorter timeout for REST fallback
              const sessionPromise = supabase.auth.getSession();
              const sessionTimeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error("getSession timeout")), 2000);
              });
              const s = await Promise.race([sessionPromise, sessionTimeout]) as any;
              accessToken = s?.data?.session?.access_token;
              // If we got session from getSession, update state
              if (s?.data?.session && !session) {
                setSession(s?.data?.session);
              }
            } catch (e) {
              // ignore - will try without token or fail gracefully
              console.warn("API: REST fallback - getSession failed, will try with session from state/localStorage if available", e);
            }
          }

          if (accessToken) {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const fetchUrl = `${supabaseUrl}/rest/v1/transactions?user_id=eq.${userId}&select=*`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            let fetchResp: Response;
            try {
              fetchResp = await fetch(fetchUrl, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: supabaseKey,
                  Authorization: `Bearer ${accessToken}`,
                },
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
            } catch (fetchErr) {
              clearTimeout(timeoutId);
              throw fetchErr;
            }

            if (!fetchResp.ok) {
              const errBody = await fetchResp.text().catch(() => '');
              throw new Error(`REST fallback failed: ${fetchResp.status} ${fetchResp.statusText} ${errBody}`);
            }

            const txs = await fetchResp.json().catch(() => []);
            console.log("API: REST fallback succeeded, rows:", Array.isArray(txs) ? txs.length : 0);

            // Try budgets and recurring best-effort
            let bgData: any[] = [];
            let rtData: any[] = [];
            try {
              const bResp = await fetch(`${supabaseUrl}/rest/v1/budgets?user_id=eq.${userId}&select=*`, {
                method: 'GET',
                headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` },
              });
              if (bResp.ok) bgData = await bResp.json().catch(() => []);
            } catch (e) {}
            try {
              const rResp = await fetch(`${supabaseUrl}/rest/v1/recurring_transactions?user_id=eq.${userId}&select=*`, {
                method: 'GET',
                headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` },
              });
              if (rResp.ok) rtData = await rResp.json().catch(() => []);
            } catch (e) {}

            // Check if aborted before setting state
            if (abortController.signal.aborted) {
              console.log("API: REST fallback - aborted before setting state", { userId });
              return;
            }
            
            // Update state from REST results
            setTransactions(txs as Transaction[]);
            setBudgets(bgData as BudgetGoal[]);
            setRecurring(rtData as RecurringTransaction[]);
            loadedFromSupabaseRef.current = true;
            try { setRenderTick((r) => r + 1); } catch (e) {}
            setLastLoadedUserId(userId);
            try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
            
            // CRITICAL: If we successfully loaded data but don't have a session in state,
            // try to get it from localStorage or getSession to prevent redirect to login
            if (!session && !abortController.signal.aborted) {
              const fallbackSession = getSessionFromLocalStorage();
              if (fallbackSession && fallbackSession.user.id === userId) {
                console.log("API: REST fallback - setting session from localStorage after successful load", { userId });
                setSession(fallbackSession);
              } else if (!abortController.signal.aborted) {
                try {
                  const sessionPromise = supabase.auth.getSession();
                  const sessionTimeout = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error("getSession timeout")), 2000);
                  });
                  const { data: sessionCheck } = await Promise.race([sessionPromise, sessionTimeout]) as any;
                  if (sessionCheck?.session && !abortController.signal.aborted) {
                    console.log("API: REST fallback - setting session after successful load", { userId });
                    setSession(sessionCheck.session);
                  }
                } catch (e) {
                  console.warn("API: REST fallback - failed to get session after load (data is loaded though)", e);
                }
              }
            }
            
            // Mark that initial data has been loaded - prevents flash of empty content
            setInitialDataLoaded(true);
            
            setSyncing(false);
            isLoadingDataRef.current = false; // Reset lock before returning
            activeLoadUserIdRef.current = null;
            if (loadAbortControllerRef.current === abortController) {
              loadAbortControllerRef.current = null;
            }
            console.log("API: loadDataFromSupabase - REST fallback success", { userId, transactions: Array.isArray(txs) ? txs.length : 0 });
            return;
          }

          console.warn("API: REST fallback skipped - no access token available");
        } catch (restErr) {
          console.error("API: REST fallback failed:", restErr);
        }

        // Check if aborted before fallback
        if (abortController.signal.aborted) {
          console.log("API: loadDataFromSupabase - aborted before fallback", { userId });
          return;
        }
        
        // Fallback behavior if REST also failed
        console.warn("API: Supabase load failed after attempts, using localStorage backup and scheduling background retries");
        loadDataFromLocalStorage();
        loadedFromSupabaseRef.current = false;
        if (!abortController.signal.aborted) {
          scheduleBackgroundRetry(userId);
        }
        setSyncing(false);
        isLoadingDataRef.current = false;
        activeLoadUserIdRef.current = null;
        if (loadAbortControllerRef.current === abortController) {
          loadAbortControllerRef.current = null;
        }
        return;
      }
    }
    } catch (error: any) {
      // Check if error is due to abort
      if (abortController.signal.aborted || error?.message === "Load aborted") {
        console.log("API: loadDataFromSupabase - load was aborted in outer catch", { userId });
        return; // Don't throw, just return silently
      }
      // Re-throw other errors to be handled by outer catch
      throw error;
    } finally {
      // CRITICAL: Always reset the loading lock, even if an error occurred
      // This prevents the lock from getting stuck if something throws unexpectedly
      // Only reset if this is still the active load (not aborted and replaced)
      if (activeLoadUserIdRef.current === userId) {
        if (isLoadingDataRef.current) {
          console.warn("API: loadDataFromSupabase - resetting loading lock in finally block", { userId });
          isLoadingDataRef.current = false;
        }
        activeLoadUserIdRef.current = null;
        if (loadAbortControllerRef.current === abortController) {
          loadAbortControllerRef.current = null;
        }
      }
      setSyncing(false);
    }
  };


  

  // Check if storage is full based on current data size
  const checkStorageQuota = () => {
    // Estimate size of data in bytes
    const transactionsSize = JSON.stringify(transactions).length;
    const budgetsSize = JSON.stringify(budgets).length;
    const recurringSize = JSON.stringify(recurring).length;
    const totalSize = transactionsSize + budgetsSize + recurringSize;

    // Check if we're over the warning threshold
    const isOverLimit = totalSize > (STORAGE_LIMIT_BYTES * STORAGE_WARNING_THRESHOLD);

    if (isOverLimit && !storageFull) {
      setStorageFull(true);
      console.warn(`Storage quota warning: ${(totalSize / 1024 / 1024).toFixed(2)}MB of ${(STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0)}MB used`);
    } else if (!isOverLimit && storageFull) {
      setStorageFull(false);
    }
  };

  // Check storage quota whenever data changes
  useEffect(() => {
    checkStorageQuota();
  }, [transactions, budgets, recurring]);

  // Transactions background whole-list sync disabled.
  // We now perform add/update/delete operations directly in the respective handlers
  // and reload the authoritative list from Supabase. Leaving this effect in place
  // caused duplicate upserts (upserted: 0) and unnecessary network traffic.
  // If you later want a background sync, re-enable a targeted, debounced sync.
  /*
  useEffect(() => {
    // Transaction localStorage backup is disabled — prefer Supabase as source of truth
    // localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));

    if (!session || !loadedFromSupabaseRef.current) {
      return;
    }

    // Background sync intentionally disabled here. Individual handlers (add/update/delete)
    // perform Supabase writes and reload the server list as the source of truth.
  }, [transactions, session]);
  */

  // Background budget sync disabled: budgets are now saved directly to Supabase in handlers
  // useEffect(() => {
  //   // ALWAYS save to localStorage immediately as emergency backup
  //   localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgets));
  //
  //   if (!session || !loadedFromSupabaseRef.current) {
  //     return;
  //   }
  //
  //   // For authenticated users, also save to Supabase immediately (no debounce to prevent data loss)
  //   const saveToSupabase = async () => {
  //     try {
  //       const userId = session.user.id;
  //
  //       // Step 1: Get current budget IDs from Supabase
  //       const { data: existingBudgets, error: fetchError } = await supabase
  //         .from("budgets")
  //         .select("id")
  //         .eq("user_id", userId);
  //
  //       if (fetchError) {
  //         console.error("Failed to fetch existing budgets:", fetchError);
  //         throw fetchError;
  //       }
  //
  //       const existingIds = new Set(existingBudgets?.map(b => b.id) || []);
  //       const currentIds = new Set(budgets.map(b => b.id));
  //
  //       // Step 2: Delete budgets that no longer exist
  //       const idsToDelete = Array.from(existingIds).filter(id => !currentIds.has(id));
  //       if (idsToDelete.length > 0) {
  //         const { error: deleteError } = await supabase
  //           .from("budgets")
  //           .delete()
  //           .in("id", idsToDelete);
  //
  //         if (deleteError) {
  //           console.error("Failed to delete budgets:", deleteError);
  //           throw deleteError;
  //         }
  //       }
  //
  //       // Step 3: Upsert (insert or update) all current budgets
  //       if (budgets.length > 0) {
  //         const toUpsert = budgets.map((b) => ({
  //           ...b,
  //           user_id: userId,
  //         }));
  //
  //         const { error: upsertError } = await supabase
  //           .from("budgets")
  //           .upsert(toUpsert, { onConflict: "id" });
  //
  //         if (upsertError) {
  //           console.error("Failed to upsert budgets:", upsertError);
  //           throw upsertError;
  //         }
  //       }
  //     } catch (error) {
  //       console.error("Failed to sync budgets to Supabase:", error);
  //       // Data is safe in localStorage, will retry on next change
  //     }
  //   };
  //
  //   // Save immediately and track the promise to ensure it completes before unload
  //   const savePromise = saveToSupabase();
  //   pendingSavesRef.current.push(savePromise);
  //
  //   // Clean up completed promise from array
  //   savePromise.finally(() => {
  //     pendingSavesRef.current = pendingSavesRef.current.filter(p => p !== savePromise);
  //   });
  // }, [budgets, session]);

  // Background recurring sync disabled: recurring items are saved directly to Supabase in handlers
  // useEffect(() => {
  //   // ALWAYS save to localStorage immediately as emergency backup
  //   localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(recurring));
  //
  //   if (!session || !loadedFromSupabaseRef.current) {
  //     return;
  //   }
  //
  //   // For authenticated users, also save to Supabase immediately (no debounce to prevent data loss)
  //   const saveToSupabase = async () => {
  //     try {
  //       const userId = session.user.id;
  //
  //       // Step 1: Get current recurring IDs from Supabase
  //       const { data: existingRecurring, error: fetchError } = await supabase
  //         .from("recurring_transactions")
  //         .select("id")
  //         .eq("user_id", userId);
  //
  //       if (fetchError) {
  //         console.error("Failed to fetch existing recurring:", fetchError);
  //         throw fetchError;
  //       }
  //
  //       const existingIds = new Set(existingRecurring?.map(r => r.id) || []);
  //       const currentIds = new Set(recurring.map(r => r.id));
  //
  //       // Step 2: Delete recurring transactions that no longer exist
  //       const idsToDelete = Array.from(existingIds).filter(id => !currentIds.has(id));
  //       if (idsToDelete.length > 0) {
  //         const { error: deleteError } = await supabase
  //           .from("recurring_transactions")
  //           .delete()
  //           .in("id", idsToDelete);
  //
  //         if (deleteError) {
  //           console.error("Failed to delete recurring:", deleteError);
  //           throw deleteError;
  //         }
  //       }
  //
  //       // Step 3: Upsert (insert or update) all current recurring transactions
  //       if (recurring.length > 0) {
  //         const toUpsert = recurring.map((r) => ({
  //           ...r,
  //           user_id: userId,
  //         }));
  //
  //         const { error: upsertError } = await supabase
  //           .from("recurring_transactions")
  //           .upsert(toUpsert, { onConflict: "id" });
  //
  //         if (upsertError) {
  //           console.error("Failed to upsert recurring:", upsertError);
  //           throw upsertError;
  //         }
  //       }
  //     } catch (error) {
  //       console.error("Failed to sync recurring to Supabase:", error);
  //       // Data is safe in localStorage, will retry on next change
  //     }
  //   };
  //
  //   // Save immediately and track the promise to ensure it completes before unload
  //   const savePromise = saveToSupabase();
  //   pendingSavesRef.current.push(savePromise);
  //
  //   // Clean up completed promise from array
  //   savePromise.finally(() => {
  //     pendingSavesRef.current = pendingSavesRef.current.filter(p => p !== savePromise);
  //   });
  // }, [recurring, session]);

  // No special handling needed - just like axios, let the browser handle network requests
  // Supabase client works fine even after tab switches

  // Add new transaction
  const handleAddTransaction = async (newTransaction: Omit<Transaction, "id">): Promise<void> => {
    const transaction: Transaction = {
      ...newTransaction,
      id: uuidv4(),
    };
    console.log("API: add transaction", { id: transaction.id, amount: transaction.amount, category: transaction.category });

    if (!session) {
      // No session - local-only add - return resolved promise
      setTransactions([transaction, ...transactions]);
      try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
      return Promise.resolve();
    }

    // Authenticated - save directly to Supabase
    // Ensure tab is visible and browser network stack is ready before making request
    try {
      setSyncing(true);
      const userId = session.user.id;
      
      // NOTE: removed visibility wait before submitting to preserve previous
      // behavior — do not block or delay submits based on tab visibility.
      
      console.log("Starting Supabase insert for user:", userId);
      
      // Use direct fetch API (like axios) to ensure reliable request after tab switches
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      // Use existing session token - don't call getSession() as it can hang after tab switches
      // The session we have is already valid, Supabase handles token refresh automatically
      if (!session?.access_token) {
        throw new Error("No valid session token. Please log in again.");
      }
      const accessToken = session.access_token;
      
      // Insert using direct fetch with AbortController for timeout (like axios would handle it)
      const insertUrl = `${supabaseUrl}/rest/v1/transactions`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      let insertResponse: Response;
      try {
        insertResponse = await fetch(insertUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${accessToken}`,
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ ...transaction, user_id: userId }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error("Request timed out. Please check your connection and try again.");
        }
        throw fetchError;
      }
      
      if (!insertResponse.ok) {
        const errorData = await insertResponse.json().catch(() => ({ message: insertResponse.statusText }));
        throw new Error(errorData.message || `Insert failed with status ${insertResponse.status}`);
      }
      
      const insertData = await insertResponse.json();
      console.log("Insert completed", { hasData: !!insertData, count: Array.isArray(insertData) ? insertData.length : 0 });

      if (!insertData || !Array.isArray(insertData) || insertData.length === 0) {
        console.error("Insert returned no rows", { insertData });
        throw new Error("Insert did not return created record");
      }

      console.log("Insert successful, fetching updated list...");
      
      // Fetch updated transactions list using direct fetch with timeout
      const fetchUrl = `${supabaseUrl}/rest/v1/transactions?user_id=eq.${userId}&select=*`;
      const fetchController = new AbortController();
      const fetchTimeoutId = setTimeout(() => fetchController.abort(), 10000); // 10 second timeout
      
      let fetchResponse: Response;
      try {
        fetchResponse = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${accessToken}`,
          },
          signal: fetchController.signal,
        });
        clearTimeout(fetchTimeoutId);
      } catch (fetchError: any) {
        clearTimeout(fetchTimeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error("Fetch request timed out. Please check your connection and try again.");
        }
        throw fetchError;
      }

      if (!fetchResponse.ok) {
        const errorData = await fetchResponse.json().catch(() => ({ message: fetchResponse.statusText }));
        throw new Error(errorData.message || `Fetch failed with status ${fetchResponse.status}`);
      }
      
      const txs = await fetchResponse.json();

      console.log("Fetch successful, updating state with", Array.isArray(txs) ? txs.length : 0, "transactions");
      setTransactions(Array.isArray(txs) ? txs : []);
      try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
    } catch (err) {
      console.error("Error adding transaction to Supabase:", err);
      try {
        const msg = err instanceof Error ? err.message : String(err);
        toast({ title: "Transaction Failed to store in the database", description: msg, variant: "destructive" });
      } catch (e) {}
      // Re-throw so the form can handle it
      throw err;
    } finally {
      setSyncing(false);
    }
  };

  // Delete transaction: do NOT remove locally until Supabase confirms deletion
  // This ensures the TransactionsTable can show a spinner in-place while the
  // backend operation completes.
  const handleDeleteTransaction = async (id: string): Promise<void> => {
    const toRemove = transactions.find((t) => t.id === id) || null;
    // Keep a snapshot so we can restore on failure
    const prevTransactions = transactions.slice();

    if (!session) {
      // No session - local-only deletion; remove immediately
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      return;
    }

    try {
      // Optimistic UI: remove locally immediately so UI reflects action even
      // if the network is throttled after a tab switch. We'll restore on error.
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}

      // Debug: log the transaction and current session user id so we can
      // quickly see why Supabase might delete 0 rows (RLS or mismatched user_id)
      try {
        console.log("API: attempting delete", {
          id,
          sessionUserId: session?.user?.id,
          transactionRow: toRemove,
        });
      } catch (e) {
        // ignore console failures
      }

      // Use direct REST DELETE with the current access token when possible.
      // This mirrors the add flow which proved more reliable after tab switches.
      let deleteData: any = null;
      let deleteError: any = null;

      if (session?.access_token) {
        // NOTE: removed visibility check/delay before delete to preserve
        // previous behavior — do not block delete on tab visibility.

        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const accessToken = session.access_token;

          const deleteUrl = `${supabaseUrl}/rest/v1/transactions?id=eq.${id}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const resp = await fetch(deleteUrl, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseKey,
              Authorization: `Bearer ${accessToken}`,
              Prefer: "return=representation",
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!resp.ok) {
            const errData = await resp.json().catch(() => ({ message: resp.statusText }));
            deleteError = new Error(errData.message || `Delete failed with status ${resp.status}`);
          } else {
            deleteData = await resp.json().catch(() => null);
          }
        } catch (err) {
          deleteError = err;
        }
      } else {
        // Fallback to using supabase client if no access token available
        try {
          const res = await supabase
            .from("transactions")
            .delete()
            .eq("id", id)
            .eq("user_id", session.user.id)
            .select();
          deleteData = res.data;
          deleteError = res.error;
        } catch (err) {
          deleteError = err;
        }
      }

      console.log("API: delete transaction result", { id, deletedRows: Array.isArray(deleteData as any) ? (deleteData as any).length : 0, error: deleteError || null });

      if (deleteError) {
        // restore
        setTransactions(prevTransactions);
        try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
        throw deleteError;
      }

      // If delete returned rows, success
      const deletedCount = Array.isArray(deleteData as any) ? (deleteData as any).length : 0;
  if (deletedCount === 0) {
        // Some Supabase setups (or RLS) may return no representation even when delete succeeded.
        // Double-check by querying the row directly. If it's gone, treat as success; otherwise raise.
        try {
          const { data: checkData, error: checkErr } = await supabase
            .from("transactions")
            .select("id")
            .eq("id", id);
          if (checkErr) {
            console.warn("API: could not verify delete (check query failed)", checkErr);
            throw checkErr;
          }

          const stillExists = Array.isArray(checkData) && checkData.length > 0;
          if (!stillExists) {
            // Row is gone — consider delete successful. local state already removed optimistically
            try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
            return;
          }
        } catch (e) {
          // If verification failed, fall through to throw below
          console.error("API: verification after delete failed:", e);
        }

        console.warn("Delete reported success but deleted 0 rows", { id });
        // restore previous state
        setTransactions(prevTransactions);
        try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
        throw new Error("No rows were deleted (permission or non-existent record)");
      }

      // On success, reload transactions from Supabase (source-of-truth)
      try {
        const { data: txs, error: fetchErr } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", session.user.id);
        if (fetchErr) {
          // restore previous state before throwing
          setTransactions(prevTransactions);
          try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
          throw fetchErr;
        }
        setTransactions(txs || []);
        try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
      } catch (e) {
        // If fetch fails, restore previous state to avoid data loss
        setTransactions(prevTransactions);
      }
    } catch (err) {
      // Let caller (TransactionsTable) show toast; do not modify local state
      throw err;
    }
  };

  // Log number of transactions for the currently selected month/year when they change
  useEffect(() => {
    const count = transactions.filter((t) => {
      const [dateYear, monthStr] = t.date.split("-");
      return parseInt(dateYear) === year && parseInt(monthStr) - 1 === month;
    }).length;
    console.log("API: transactions for month", { year, month, count });
  }, [transactions, month, year]);

  // Update transaction
  const handleUpdateTransaction = async (updatedTransaction: Transaction) => {
    if (!session) {
      // Local-only update when not authenticated
      setTransactions(
        transactions.map((t) => (t.id === updatedTransaction.id ? updatedTransaction : t))
      );
      return;
    }

    try {
      setSyncing(true);
      const userId = session.user.id;
      const { error: upsertError } = await supabase
        .from("transactions")
        .upsert([{ ...updatedTransaction, user_id: userId }], { onConflict: "id" });

      if (upsertError) {
        console.error("Failed to update transaction:", upsertError);
        throw upsertError;
      }

      // Reload from server
      const { data: txs, error: fetchErr } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId);
      if (fetchErr) throw fetchErr;
      setTransactions(txs || []);
      try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
    } catch (err) {
      console.error("Error updating transaction on Supabase:", err);
      // Fall back to local update for UI responsiveness
      setTransactions(
        transactions.map((t) => (t.id === updatedTransaction.id ? updatedTransaction : t))
      );
      try {
        const msg = err instanceof Error ? err.message : String(err);
        toast({ title: "Transaction Failed to store in the database", description: msg, variant: "destructive" });
      } catch (e) {}
    } finally {
      setSyncing(false);
    }
  };

  // Add budget
  const handleAddBudget = async (budget: BudgetGoal) => {
    if (!session) {
      setBudgets([...budgets, budget]);
      return;
    }

    try {
      setSyncing(true);
      const userId = session.user.id;
      const { data: insertData, error: insertError } = await supabase
        .from("budgets")
        .insert([{ ...budget, user_id: userId }])
        .select();

      if (insertError) throw insertError;

      const { data: bgData, error: fetchErr } = await supabase
        .from("budgets")
        .select("*")
        .eq("user_id", userId);

      if (fetchErr) throw fetchErr;

      setBudgets(bgData || []);
    } catch (err) {
      console.error("Failed to add budget:", err);
      setBudgets([...budgets, budget]); // fallback
      try { const msg = err instanceof Error ? err.message : String(err); toast({ title: "Budget failed to save", description: msg, variant: "destructive" }); } catch (e) {}
    } finally {
      setSyncing(false);
    }
  };

  // Delete budget: wait for Supabase confirmation before removing locally
  const handleDeleteBudget = async (id: string): Promise<void> => {
    if (!session) {
      setBudgets((prev) => prev.filter((b) => b.id !== id));
      return;
    }

    try {
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) throw error;

      // Reload budgets from server
      const { data: bgData, error: fetchErr } = await supabase
        .from("budgets")
        .select("*")
        .eq("user_id", session.user.id);
      if (fetchErr) throw fetchErr;
      setBudgets(bgData || []);
    } catch (err) {
      console.error("Failed to delete budget:", err);
      // fallback: remove locally
      setBudgets((prev) => prev.filter((b) => b.id !== id));
      throw err;
    }
  };

  // Add recurring
  const handleAddRecurring = async (trans: RecurringTransaction) => {
    if (!session) {
      setRecurring([...recurring, trans]);
      return;
    }

    try {
      setSyncing(true);
      const userId = session.user.id;
      const { data: insertData, error: insertError } = await supabase
        .from("recurring_transactions")
        .insert([{ ...trans, user_id: userId }])
        .select();

      if (insertError) throw insertError;

      const { data: rcData, error: fetchErr } = await supabase
        .from("recurring_transactions")
        .select("*")
        .eq("user_id", userId);

      if (fetchErr) throw fetchErr;

      setRecurring(rcData || []);
    } catch (err) {
      console.error("Failed to add recurring:", err);
      setRecurring([...recurring, trans]); // fallback
      try { const msg = err instanceof Error ? err.message : String(err); toast({ title: "Recurring failed to save", description: msg, variant: "destructive" }); } catch (e) {}
    } finally {
      setSyncing(false);
    }
  };

  // Delete recurring: wait for Supabase confirmation before removing locally
  const handleDeleteRecurring = async (id: string): Promise<void> => {
    if (!session) {
      setRecurring((prev) => prev.filter((r) => r.id !== id));
      return;
    }

    try {
      const { error } = await supabase
        .from("recurring_transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) throw error;

      // Reload recurring from server
      const { data: rcData, error: fetchErr } = await supabase
        .from("recurring_transactions")
        .select("*")
        .eq("user_id", session.user.id);
      if (fetchErr) throw fetchErr;
      setRecurring(rcData || []);
    } catch (err) {
      console.error("Failed to delete recurring:", err);
      // fallback: remove locally
      setRecurring((prev) => prev.filter((r) => r.id !== id));
      throw err;
    }
  };

  // Get all unique categories from transactions
  const allCategories = Array.from(
    new Set(transactions.map((t) => t.category))
  ).sort();

  // Filter transactions based on selected filters
  const filteredTransactions = transactions.filter((t) => {
    // Parse date in local timezone to avoid timezone shifts
    const [dateYear, monthStr, day] = t.date.split("-");
    const transactionMonth = parseInt(monthStr) - 1; // Convert to 0-indexed
    const transactionYear = parseInt(dateYear);

    // Month and year filter
    if (transactionMonth !== month || transactionYear !== year) {
      return false;
    }

    // Account filter
    if (selectedAccount && t.account !== selectedAccount) {
      return false;
    }

    // Category filter
    if (selectedCategory && t.category !== selectedCategory) {
      return false;
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matches =
        t.description?.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query) ||
        t.amount.toString().includes(query);
      if (!matches) {
        return false;
      }
    }

    return true;
  });

  // Calculate stats for filtered transactions
  const totalIncome = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = filteredTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const handleLogout = async () => {
    try {
      console.log("API: logout requested - canceling pending data loads and waiting for pending saves (max 3s)");
      
      // CRITICAL: Cancel any pending loadDataFromSupabase calls immediately
      if (loadAbortControllerRef.current) {
        console.log("API: handleLogout - aborting pending data load");
        loadAbortControllerRef.current.abort();
        loadAbortControllerRef.current = null;
      }
      isLoadingDataRef.current = false;
      activeLoadUserIdRef.current = null;
      
      // Wait for any pending saves to complete before clearing data
      if (pendingSavesRef.current.length > 0) {
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
        await Promise.race([Promise.all(pendingSavesRef.current), timeoutPromise]);
      }

      // Immediately clear local UI state and localStorage so the user sees
      // the logged-out UI even if signOut/network calls are delayed after tab switching.
      console.log("API: clearing local state and storage immediately (fire-and-forget signOut)");

      // Clear Supabase session from localStorage first
      // Supabase stores session with key pattern: sb-<project-ref>-auth-token
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (supabaseUrl) {
          const projectRef = supabaseUrl.split('//')[1]?.split('.')[0];
          if (projectRef) {
            const storageKey = `sb-${projectRef}-auth-token`;
            localStorage.removeItem(storageKey);
            console.log("API: Removed Supabase session from localStorage", { storageKey });
          }
        }
      } catch (e) {
        console.warn("API: Failed to remove Supabase session from localStorage", e);
      }
      
      // Clear app-specific localStorage entries
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(BUDGET_STORAGE_KEY);
        localStorage.removeItem(RECURRING_STORAGE_KEY);
        localStorage.removeItem("financeflow_remember_me");
      } catch (e) {
        console.warn("API: Failed to remove app data from localStorage", e);
      }
      // Reset state - the onAuthStateChange listener will also update session
      // but we do this to ensure immediate UI update
      setSession(null);
      setTransactions([]);
      setBudgets([]);
      setRecurring([]);
      // Clear loaded flags so a subsequent sign-in always reloads from server.
      // Set these directly without try-catch to ensure they're always cleared
      loadedFromSupabaseRef.current = false;
      setLastLoadedUserId(null);
      // Reset initial data loaded flag so next login shows loading state
      setInitialDataLoaded(false);
      // Mark that we just logged out so next sign-in forces reload
      justLoggedOutRef.current = true;

      // Notify other tabs that we've signed out so they can clear UI state
      try { bcRef.current?.postMessage({ type: 'sign_out' }); } catch (e) {}

      // Fire off the actual signOut but don't wait for it to complete before
      // updating the UI — this avoids browser throttling or token refresh races
      (async () => {
        try {
          console.log("API: calling supabase.auth.signOut() (background)");
          try {
            const { data: before } = await supabase.auth.getSession();
            console.log("API: session before background signOut", before?.session ?? null);
          } catch (e) {
            console.warn("API: failed to read session before background signOut", e);
          }

          const { error } = await supabase.auth.signOut();
          if (error) console.error("Supabase signOut error (background):", error);

          try {
            const { data: after } = await supabase.auth.getSession();
            console.log("API: session after background signOut", after?.session ?? null);
          } catch (e) {
            console.warn("API: failed to read session after background signOut", e);
          }

          // If session still exists, try to clear supabase keys then reload
          try {
            const { data } = await supabase.auth.getSession();
            if (data?.session) {
              console.warn("API: session still present after background signOut; clearing supabase keys and reloading");
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i) as string;
                  if (!key) continue;
                  if (key.toLowerCase().includes("supabase") || key.toLowerCase().includes("gotrue") || key.toLowerCase().includes("sb-")) {
                    try { localStorage.removeItem(key); } catch (e) {}
                  }
                }
              } catch (e) {
                console.warn("API: failed to remove supabase keys from localStorage", e);
              }
              try { window.location.reload(); } catch (e) {}
            }
          } catch (e) {
            try { window.location.reload(); } catch (e) {}
          }
        } catch (e) {
          console.error("API: background signOut failed", e);
        }
      })();
    } catch (error) {
      console.error("Failed to logout:", error);
      // Even if logout fails, clear session state and show auth
      setSession(null);
      setTransactions([]);
      setBudgets([]);
      setRecurring([]);
      loadedFromSupabaseRef.current = false;
      setLastLoadedUserId(null);
      setInitialDataLoaded(false);
      justLoggedOutRef.current = true;
      try { window.location.reload(); } catch (e) {}
      try { bcRef.current?.postMessage({ type: 'sign_out' }); } catch (e) {}
    }
  };

  // Check if we have a session in localStorage (used for deciding what to render)
  // NOTE: We don't call setSession here - that's handled by useEffects
  const hasLocalStorageSession = !!getSessionFromLocalStorage();

  // Show full-screen loading when:
  // 1. We're loading/signing in and don't have a session yet (but might have one in localStorage)
  // 2. We have a session but haven't loaded initial data yet
  if ((loading || isSigningInRef.current) && !session) {
    // Check localStorage - if session exists there, show loading (data will load soon)
    // If no session in localStorage either, show Auth
    if (!hasLocalStorageSession) {
      return <Auth onSignIn={handleAuthSignIn} />;
    }
    // Session exists in localStorage - show loading while we wait for it to be set
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-gray-300 border-t-emerald-500 animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show Auth if we definitely don't have a session
  if (!session && !loading && !isSigningInRef.current && !hasLocalStorageSession) {
    return <Auth onSignIn={handleAuthSignIn} />;
  }

  // CRITICAL: Show full-screen loading until initial data is loaded
  // This prevents the flash of "0 transactions" on page refresh
  // Use fully opaque background so content isn't visible behind it
  if (session && !initialDataLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-gray-300 border-t-emerald-500 animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {loadingTakingLong ? "Still loading... Please wait" : "Loading your data..."}
          </p>
          {loadingTakingLong && (
            <p className="mt-2 text-sm text-gray-500">
              This is taking longer than expected. Your data will appear shortly.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Show loading overlay for subsequent loads (e.g., returning from background tab)
  // This is semi-transparent since we already have data to show
  const showLoadingOverlay = session && loading && initialDataLoaded;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Semi-transparent overlay for subsequent data refreshes */}
      {showLoadingOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full border-4 border-gray-300 border-t-emerald-500 animate-spin mx-auto"></div>
            <p className="mt-4 text-gray-600">Syncing...</p>
          </div>
        </div>
      )}
      <Header userEmail={session?.user?.email} onLogout={handleLogout} />
      <StorageBar transactions={transactions} budgets={budgets} recurring={recurring} />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        {/* View Mode Toggle and Date Filter */}
        <div className="mb-8 flex flex-col gap-4">
          <div className="flex gap-2 w-full">
            <button
              onClick={() => setViewMode("month")}
              className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-lg font-semibold text-sm sm:text-base transition-all ${
                viewMode === "month"
                  ? "bg-emerald-500 text-white shadow-md"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Month View</span>
              <span className="sm:hidden">Month</span>
            </button>
            <button
              onClick={() => setViewMode("year")}
              className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-lg font-semibold text-sm sm:text-base transition-all ${
                viewMode === "year"
                  ? "bg-emerald-500 text-white shadow-md"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Year View</span>
              <span className="sm:hidden">Year</span>
            </button>
          </div>
          {viewMode === "month" && (
            <DateFilter
              month={month}
              year={year}
              onMonthChange={setMonth}
              onYearChange={setYear}
            />
          )}
        </div>

        {viewMode === "year" ? (
          <YearOverview
            transactions={transactions}
            year={year}
            onMonthClick={(selectedMonth) => {
              setMonth(selectedMonth);
              setViewMode("month");
            }}
            onYearChange={setYear}
          />
        ) : (
          <>
            {/* Quick Stats Overview */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <StatsPanel
                totalIncome={totalIncome}
                totalExpense={totalExpense}
              />
            </div>

            {/* Search */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <TransactionSearch
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>

            {/* Transaction Input Form */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <TransactionForm
                onAddTransaction={handleAddTransaction}
                categories={allCategories}
                currentMonth={month}
                currentYear={year}
                disabled={storageFull}
              />
            </div>

            {/* Transactions Table */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <TransactionsTable
                transactions={filteredTransactions}
                onDelete={handleDeleteTransaction}
                onUpdate={handleUpdateTransaction}
              />
            </div>

            {/* Export Button */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <ExportButton transactions={filteredTransactions} />
            </div>

            {/* Filters Section */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <TransactionFilters
                selectedAccount={selectedAccount}
                selectedCategory={selectedCategory}
                categories={allCategories}
                onAccountChange={setSelectedAccount}
                onCategoryChange={setSelectedCategory}
              />
            </div>

            {/* Monthly Comparison */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <MonthlyComparison
                transactions={transactions}
                month={month}
                year={year}
              />
            </div>

            {/* Spending Trends Chart */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <SpendingTrends transactions={transactions} year={year} />
            </div>

            {/* Account Balances */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <AccountBalances transactions={transactions} />
            </div>

            {/* Budget Goals */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <BudgetGoals
                budgets={budgets}
                transactions={transactions}
                month={month}
                year={year}
                onAddBudget={handleAddBudget}
                onDeleteBudget={handleDeleteBudget}
                disabled={storageFull}
              />
            </div>

            {/* Recurring Transactions */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <RecurringTransactions
                recurring={recurring}
                onAdd={handleAddRecurring}
                onDelete={handleDeleteRecurring}
                disabled={storageFull}
              />
            </div>

            {/* Data Backup */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <DataBackup transactions={transactions} />
            </div>

            {/* Category Statistics */}
            <div className="mb-4 sm:mb-6 md:mb-8 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
              <CategoryStats
                transactions={filteredTransactions}
                type="income"
              />
              <CategoryStats
                transactions={filteredTransactions}
                type="expense"
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

