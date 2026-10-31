import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function UserMenu({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9">
        <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <form action={logout}>
        <button
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Log out"
          aria-label="Log out"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
