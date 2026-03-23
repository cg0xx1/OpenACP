import { NavLink } from "react-router";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "\u25C9" },
  { to: "/sessions", label: "Sessions", icon: "\u25CE" },
  { to: "/agents", label: "Agents", icon: "\u25CE" },
  { to: "/config", label: "Config", icon: "\u25CE" },
  { to: "/topics", label: "Topics", icon: "\u25CE" },
];

export function Sidebar({ connectionStatus }: { connectionStatus: string }) {
  return (
    <aside className="flex flex-col w-56 h-screen bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 shrink-0">
      <div className="p-4 text-lg font-bold text-zinc-900 dark:text-white">
        OpenACP
      </div>

      <nav className="flex-1 px-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-green-500"
                : connectionStatus === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
            }`}
          />
          {connectionStatus === "connected"
            ? "Online"
            : connectionStatus === "connecting"
              ? "Connecting..."
              : "Offline"}
        </div>
      </div>
    </aside>
  );
}
