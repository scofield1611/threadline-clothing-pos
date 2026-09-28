import { Menu, Moon, Sun, LogOut, User as UserIcon } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";

export function Navbar({ onOpenMobileMenu, title }: { onOpenMobileMenu: () => void; title: string }) {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => localStorage.getItem("threadline_theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("threadline_theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onOpenMobileMenu} className="shrink-0 text-muted-foreground lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate font-display text-sm font-semibold">{title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={() => setDark((d) => !d)}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <UserIcon className="h-3.5 w-3.5" />
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-medium leading-none">{user?.name}</p>
            </div>
            <Badge variant="primary" className="hidden sm:inline-flex">
              {user?.role}
            </Badge>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" className="z-50 min-w-[160px] rounded-md border bg-card p-1 shadow-elevated">
              <DropdownMenu.Item
                onSelect={logout}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-danger outline-none hover:bg-danger/10"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
