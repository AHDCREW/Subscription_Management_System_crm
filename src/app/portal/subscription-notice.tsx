"use client";

import { useState, useSyncExternalStore } from "react";
import { CalendarClock, CirclePause, FileText, Hourglass, Sparkles, type LucideIcon } from "lucide-react";
import { Button, ButtonLink } from "@/components/kit";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SubscriptionNotice } from "@/lib/subscriptions/portal-notice";

const ICONS: Record<SubscriptionNotice["kind"], LucideIcon> = {
  paused: CirclePause,
  quotation: FileText,
  confirmed: CalendarClock,
  requested: Hourglass,
  none: Sparkles,
};

// Bar across the top of every portal page while the customer has no active subscription.
export function SubscriptionNoticeBar({ notice }: { notice: SubscriptionNotice }) {
  const Icon = ICONS[notice.kind];
  return (
    <div role="status" className="-mx-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-sun/15 px-6 py-3 text-sm md:-mx-8 md:px-8">
      <Icon className="size-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{notice.title}.</span> <span className="text-muted-foreground">{notice.body}</span>
      </p>
      <ButtonLink href={notice.action.href} className="h-8 px-3">
        {notice.action.label}
      </ButtonLink>
    </div>
  );
}

// sessionStorage doesn't notify, so there is nothing to subscribe to.
const noSubscribe = () => () => {};

// The same message as a popup, shown once per browser session for each kind of notice.
export function SubscriptionNoticePopup({ notice }: { notice: SubscriptionNotice }) {
  const key = `brightloop:subscription-notice:${notice.kind}`;
  // The server treats it as already seen, so the popup only opens in the browser.
  const seen = useSyncExternalStore(noSubscribe, () => sessionStorage.getItem(key) !== null, () => true);
  const [closed, setClosed] = useState(false);
  const Icon = ICONS[notice.kind];

  const close = () => {
    sessionStorage.setItem(key, "1");
    setClosed(true);
  };

  return (
    <Dialog open={!seen && !closed} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-sun/20 text-warning">
            <Icon className="size-5" aria-hidden />
          </span>
          <DialogTitle className="text-lg font-semibold">{notice.title}</DialogTitle>
          <DialogDescription>{notice.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Not now
            </Button>
          </DialogClose>
          <ButtonLink href={notice.action.href} onClick={close}>
            {notice.action.label}
          </ButtonLink>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
