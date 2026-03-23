import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 ${className}`}
    >
      {title && (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 text-sm font-medium">
          {title}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
