import React, { Suspense, useEffect } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import { useRouter } from "./lib/router";
import { FullPageSpinner } from "./components/Spinner";
import { Toaster, toast } from "./components/Toaster";
import ErrorBoundary from "./components/ErrorBoundary";
import Landing from "./components/Landing";
import AuthPage from "./components/AuthPage";
import CookieConsent from "./components/CookieConsent";
const CreatorDashboard = React.lazy(() => import("./components/CreatorDashboard"));
import ClientDashboard from "./components/ClientDashboard";
import MeellChat from "./components/MeellChat";
import { supabase } from "./lib/supabase";

function Routes() {
  const { route, navigate } = useRouter();
  const { user, profile, loading } = useAuth();

  if (loading) return <FullPageSpinner />;

  const path = route.path;
  const segs = route.segments;

  // Public routes
  if (path === "/" || path === "") return <Landing navigate={navigate} />;
  if (path === "/login") return <AuthPage mode="login" navigate={navigate} />;
  if (path === "/signup") return <AuthPage mode="signup" navigate={navigate} />;
  if (path === "/recovery")
    return <AuthPage mode="recovery" navigate={navigate} />;

  // Protected app
  if (segs[0] === "app") {
    const deliveryToken = route.query.get("token");

    // Link de entrega com token será tratado como acesso público
    if (!user && deliveryToken) {
      return <ClientDashboard navigate={navigate} />;
    }

    if (!user) {
      return <AuthPage mode="login" navigate={navigate} />;
    }
    if (!profile) return <FullPageSpinner />;
    if (profile.account_type === "client") {
      return <ClientDashboard navigate={navigate} />;
    }
    return <Suspense fallback={<FullPageSpinner />}><CreatorDashboard navigate={navigate} /></Suspense>;
  }

  // Fallback
  return <Landing navigate={navigate} />;
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes />
        <MeellChat />
        <Toaster />
        <CookieConsent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
