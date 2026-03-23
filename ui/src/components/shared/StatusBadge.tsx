import type { SessionStatus } from "../../api/types";

const STATUS_COLORS: Record<SessionStatus, string> = {
  initializing: "bg-yellow-500",
  active: "bg-green-500",
  cancelled: "bg-zinc-400",
  finished: "bg-blue-500",
  error: "bg-red-500",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
      {status}
    </span>
  );
}
