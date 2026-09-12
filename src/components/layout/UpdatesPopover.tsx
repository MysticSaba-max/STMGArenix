import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { updates, tagConfig } from "@/data/updates";

const LAST_SEEN_KEY = "stmgarenix_updates_seen";

export function useUnseenUpdates() {
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    if (!lastSeen) {
      setUnseenCount(updates.length);
    } else {
      // La liste est déjà triée de la plus récente à la plus ancienne.
      // Les dates affichées en français ne se comparent pas comme des dates ISO.
      const lastSeenIndex = updates.findIndex((u) => u.date === lastSeen);
      setUnseenCount(lastSeenIndex === -1 ? updates.length : lastSeenIndex);
    }
  }, []);

  function markAllSeen() {
    if (updates.length > 0) {
      localStorage.setItem(LAST_SEEN_KEY, updates[0].date);
    }
    setUnseenCount(0);
  }

  return { unseenCount, markAllSeen };
}

export function UpdatesList() {
  return (
    <div className="flex flex-col gap-3">
      {updates.map((update, i) => {
        const tag = tagConfig[update.tag];
        const TagIcon = tag.icon;
        return (
          <div key={i}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 gap-1 font-medium", tag.className)}>
                <TagIcon className="w-3 h-3" />
                {tag.label}
              </Badge>
              <span className="text-[11px] text-muted-foreground">{update.date}</span>
            </div>
            <p className="text-sm font-medium mb-1">{update.title}</p>
            <ul className="space-y-0.5">
              {update.items.map((item, j) => (
                <li key={j} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className="text-primary mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function UpdatesPopover() {
  const { unseenCount, markAllSeen } = useUnseenUpdates();

  return (
    <Popover onOpenChange={(isOpen) => { if (isOpen) markAllSeen(); }}>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Voir les nouveautés"
        >
          <Bell className="h-5 w-5" />
          {unseenCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unseenCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Nouveautés</h3>
          <p className="text-xs text-muted-foreground">Les dernières mises à jour de STMGArenix</p>
        </div>
        <div className="p-4 max-h-80 overflow-y-auto">
          <UpdatesList />
        </div>
      </PopoverContent>
    </Popover>
  );
}
