import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import DocumentDetail from "./pages/DocumentDetail";
import LearningSession from "./pages/LearningSession";
import SessionHistory from "./pages/SessionHistory";
import GroupDetail from "./pages/GroupDetail";
import SocraticProfile from "./pages/SocraticProfile";
import AdminSocratic from "./pages/AdminSocratic";
import KnowledgeLibrary from "./pages/KnowledgeLibrary";
import AIConnection from "./pages/AIConnection";
import Login from "./pages/Login";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/documents/:id" component={DocumentDetail} />
      <Route path="/sessions/:id" component={LearningSession} />
      <Route path="/history" component={SessionHistory} />
      <Route path="/groups/:id" component={GroupDetail} />
      <Route path="/profile/socratic" component={SocraticProfile} />
      <Route path="/admin/socratic" component={AdminSocratic} />
      <Route path="/library" component={KnowledgeLibrary} />
      <Route path="/ai-connection" component={AIConnection} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
