import { useTheme } from "../../hooks/use-theme";

export function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex items-center justify-end h-12 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <button
        onClick={toggleTheme}
        className="p-2 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      >
        {theme === "light" ? "\uD83C\uDF19" : "\u2600\uFE0F"}
      </button>
    </header>
  );
}
