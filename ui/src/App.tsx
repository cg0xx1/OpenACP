import { Routes, Route } from "react-router";
import { Layout } from "./components/layout/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { AgentsPage } from "./pages/AgentsPage";
import { SessionsPage } from "./pages/SessionsPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route
          path="/sessions/:id"
          element={<div className="text-xl">Session Detail — coming soon</div>}
        />
        <Route path="/agents" element={<AgentsPage />} />
        <Route
          path="/config"
          element={<div className="text-xl">Config — coming soon</div>}
        />
        <Route
          path="/topics"
          element={<div className="text-xl">Topics — coming soon</div>}
        />
      </Route>
    </Routes>
  );
}
