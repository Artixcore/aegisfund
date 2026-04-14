import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AegisLayout from "./components/AegisLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Wallets from "./pages/Wallets";
import Agents from "./pages/Agents";
import Messages from "./pages/Messages";
import SettingsPage from "./pages/SettingsPage";
import KYC from "./pages/KYC";
import AdminKYC from "./pages/AdminKYC";

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard">
        <AegisLayout>
          <Dashboard />
        </AegisLayout>
      </Route>
      <Route path="/wallets">
        <AegisLayout>
          <Wallets />
        </AegisLayout>
      </Route>
      <Route path="/agents">
        <AegisLayout>
          <Agents />
        </AegisLayout>
      </Route>
      <Route path="/messages">
        <AegisLayout>
          <Messages />
        </AegisLayout>
      </Route>
      <Route path="/settings">
        <AegisLayout>
          <SettingsPage />
        </AegisLayout>
      </Route>
      <Route path="/kyc">
        <AegisLayout>
          <KYC />
        </AegisLayout>
      </Route>
      <Route path="/admin/kyc">
        <AegisLayout>
          <AdminKYC />
        </AegisLayout>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" position="bottom-right" />
          <AppRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
