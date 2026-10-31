"use client";

import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password";
import { cx } from "@/components/kit";

export function passwordMeetsRules(password: string) {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

/** Id of the checklist, so the password input can point at it with aria-describedby. */
export const PASSWORD_RULES_ID = "password-rules";

// Live checklist under a password field: each rule turns green once it is met.
// Used by signup, reset password and the profile page; the server checks the same rules again.
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul id={PASSWORD_RULES_ID} className="space-y-1 text-xs" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        const Icon = met ? Check : Circle;
        return (
          <li
            key={rule.id}
            className={cx(
              "flex items-center gap-2 transition-colors duration-300",
              met ? "text-success" : "text-muted-foreground",
            )}
          >
            <Icon aria-hidden className={cx("size-3.5 transition-transform duration-300", met && "scale-110")} />
            {rule.label}
            <span className="sr-only">{met ? "(met)" : "(not met yet)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
