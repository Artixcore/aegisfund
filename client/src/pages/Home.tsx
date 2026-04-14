import { useAuth } from "@/_core/hooks/useAuth";
import { Shield } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    navigate(isAuthenticated ? "/dashboard" : "/login");
  }, [isAuthenticated, loading, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Shield size={28} className="text-muted-foreground animate-pulse" />
    </div>
  );
}
