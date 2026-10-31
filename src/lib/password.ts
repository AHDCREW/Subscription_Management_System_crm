// Password rules from the brief: more than 8 characters, with an uppercase
// letter, a lowercase letter and a special character. Shared by the signup
// form (live checklist) and the server (final check).

export const PASSWORD_RULES = [
  { id: "length", label: "More than 8 characters", test: (p: string) => p.length > 8 },
  { id: "upper", label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { id: "special", label: "A special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function passwordErrors(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
}
