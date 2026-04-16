import { useAuth } from "@/_core/hooks/useAuth";
import {
  BarChart3,
  Bot,
  ChevronRight,
  Menu,
  Layers,
  Lock,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  ShieldCheck,
  X,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_ITEMS = [
  { label: "Dashboard", icon: BarChart3, href: "/dashboard" },
  { label: "Wallets", icon: Wallet, href: "/wallets" },
  { label: "AI Agents", icon: Bot, href: "/agents" },
  { label: "Messages", icon: MessageSquare, href: "/messages" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

const SECONDARY_NAV = [
  { label: "KYC / Identity", icon: ShieldCheck, href: "/kyc" },
];

const ADMIN_NAV = [
  { label: "KYC Review", icon: Shield, href: "/admin/kyc" },
];

function NavItem({ item, active }: { item: typeof NAV_ITEMS[0]; active: boolean }) {
  return (
    <Link href={item.href}>
      <div
        className={`nav-item group ${active ? "nav-item-active" : ""}`}
        role="button"
      >
        <item.icon
          size={16}
          className={`shrink-0 transition-colors ${
            active
              ? "text-foreground"
              : "text-muted-foreground group-hover:text-foreground"
          }`}
        />
        <span className={`text-sm font-medium ${active ? "text-foreground" : ""}`}>
          {item.label}
        </span>
        {active && (
          <ChevronRight size={12} className="ml-auto text-muted-foreground" />
        )}
      </div>
    </Link>
  );
}

interface AegisLayoutProps {
  children: React.ReactNode;
}

export default function AegisLayout({ children }: AegisLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      logout();
      window.location.href = "/";
    },
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileSidebarOpen]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Shield size={32} className="text-muted-foreground animate-pulse" />
          <p className="mono-label">Authenticating session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 max-w-sm w-full px-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-foreground/5 border border-border flex items-center justify-center">
              <Shield size={24} className="text-foreground" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight">Aegis Fund</h1>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Institutional Intelligence Terminal
              </p>
            </div>
          </div>

          {/* Login card */}
          <div className="w-full aegis-card flex flex-col gap-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-mono">
              <Lock size={12} />
              <span>SECURE AUTHENTICATION</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sign in to access your portfolio, AI intelligence agents, and encrypted communications.
            </p>
            <a
              href="/login"
              className="w-full flex items-center justify-center gap-2 bg-foreground text-background rounded-md px-4 py-2.5 text-sm font-semibold hover:bg-foreground/90 transition-colors"
            >
              <Shield size={14} />
              Sign in
            </a>
          </div>

          {/* Security note */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock size={10} />
            <span className="font-mono">End-to-end encrypted · Zero-knowledge architecture</span>
          </div>
        </div>
      </div>
    );
  }

  const timeStr = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateStr = currentTime.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const userInitials = (user?.name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ---- Desktop Sidebar ---- */}
      <aside
        className="hidden lg:flex w-56 shrink-0 flex-col border-r"
        style={{
          backgroundColor: "var(--sidebar)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        {/* Brand */}
        <div className="px-4 py-5 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-foreground/8 border border-border flex items-center justify-center shrink-0">
              <Shield size={14} className="text-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-foreground">Aegis Fund</div>
              <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">
                Intelligence Terminal
              </div>
            </div>
          </div>
        </div>

        {/* Clock */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="font-mono text-xs text-muted-foreground">
            <div className="text-foreground text-sm font-medium tabular-nums">{timeStr}</div>
            <div className="text-[10px] tracking-wider">{dateStr} UTC</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <div className="mono-label px-2 mb-2">Navigation</div>
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              active={location === item.href || location.startsWith(item.href + "/")}
            />
          ))}
        </nav>

        {/* Secondary nav */}
        <div className="px-2 py-2 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="mono-label px-2 mb-1.5">Compliance</div>
          {SECONDARY_NAV.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              active={location === item.href || location.startsWith(item.href + "/")}
            />
          ))}
          {user?.role === "admin" && (
            <>
              <div className="mono-label px-2 mt-2 mb-1.5">Admin</div>
              {ADMIN_NAV.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  active={location === item.href || location.startsWith(item.href + "/")}
                />
              ))}
            </>
          )}
        </div>

        {/* System status */}
        <div className="px-4 py-3 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="pulse-dot pulse-green" />
            <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
              ALL SYSTEMS OPERATIONAL
            </span>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <Lock size={9} className="text-muted-foreground" />
            <span className="text-[10px] font-mono text-muted-foreground">E2E ENCRYPTED</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Layers size={9} className="text-muted-foreground" />
            <span className="text-[10px] font-mono text-muted-foreground">MULTI-CHAIN ACTIVE</span>
          </div>
        </div>

        {/* User profile */}
        <div
          className="px-3 py-3 border-t"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-foreground/10 border border-border flex items-center justify-center shrink-0">
              <span className="text-[10px] font-mono font-semibold text-foreground">
                {userInitials}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {user?.name ?? "Operator"}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground truncate">
                {user?.role?.toUpperCase() ?? "USER"}
              </div>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* ---- Main content ---- */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMobileSidebarOpen((prev) => !prev)}
                className="h-9 w-9 shrink-0 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                aria-label={mobileSidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                {mobileSidebarOpen ? <X size={16} className="mx-auto" /> : <Menu size={16} className="mx-auto" />}
              </button>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Aegis Fund</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">{dateStr} UTC</div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-9 px-3 rounded-md border border-border text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  aria-label="Open mobile menu"
                >
                  Menu
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
                  Navigation
                </DropdownMenuLabel>
                {NAV_ITEMS.map((item) => (
                  <DropdownMenuItem key={item.href} onClick={() => setLocation(item.href)}>
                    <item.icon size={14} />
                    <span>{item.label}</span>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
                  Compliance
                </DropdownMenuLabel>
                {SECONDARY_NAV.map((item) => (
                  <DropdownMenuItem key={item.href} onClick={() => setLocation(item.href)}>
                    <item.icon size={14} />
                    <span>{item.label}</span>
                  </DropdownMenuItem>
                ))}
                {user?.role === "admin" && ADMIN_NAV.map((item) => (
                  <DropdownMenuItem key={item.href} onClick={() => setLocation(item.href)}>
                    <item.icon size={14} />
                    <span>{item.label}</span>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => logoutMutation.mutate()}
                >
                  <LogOut size={14} />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile sidebar drawer */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <button
              aria-label="Close sidebar backdrop"
              className="flex-1 bg-black/55 backdrop-blur-[1px]"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <aside
              className="h-full w-[84vw] max-w-xs flex flex-col border-r shadow-xl"
              style={{
                backgroundColor: "var(--sidebar)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <div className="px-4 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--sidebar-border)" }}>
                <div>
                  <div className="text-sm font-semibold tracking-tight text-foreground">Aegis Fund</div>
                  <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">
                    Intelligence Terminal
                  </div>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="h-8 w-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  aria-label="Close sidebar"
                >
                  <X size={14} className="mx-auto" />
                </button>
              </div>

              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
                <div className="font-mono text-xs text-muted-foreground">
                  <div className="text-foreground text-sm font-medium tabular-nums">{timeStr}</div>
                  <div className="text-[10px] tracking-wider">{dateStr} UTC</div>
                </div>
              </div>

              <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
                <div className="mono-label px-2 mb-2">Navigation</div>
                {NAV_ITEMS.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    active={location === item.href || location.startsWith(item.href + "/")}
                  />
                ))}

                <div className="mono-label px-2 mt-4 mb-1.5">Compliance</div>
                {SECONDARY_NAV.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    active={location === item.href || location.startsWith(item.href + "/")}
                  />
                ))}

                {user?.role === "admin" && (
                  <>
                    <div className="mono-label px-2 mt-4 mb-1.5">Admin</div>
                    {ADMIN_NAV.map((item) => (
                      <NavItem
                        key={item.href}
                        item={item}
                        active={location === item.href || location.startsWith(item.href + "/")}
                      />
                    ))}
                  </>
                )}
              </nav>

              <div className="px-3 py-3 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-foreground/10 border border-border flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-mono font-semibold text-foreground">
                      {userInitials}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">
                      {user?.name ?? "Operator"}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      {user?.role?.toUpperCase() ?? "USER"}
                    </div>
                  </div>
                  <button
                    onClick={() => logoutMutation.mutate()}
                    className="h-8 w-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                    title="Sign out"
                  >
                    <LogOut size={13} className="mx-auto" />
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
