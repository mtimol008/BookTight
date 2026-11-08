// Single source of truth for the minimum password length, enforced here
// (signup, reset-password) and separately in the Supabase dashboard's own
// Auth settings for both projects — the two are meant to match, but this
// one is what actually produces a clear, specific error message instead of
// whatever generic rejection Supabase's own check would give.
export const MIN_PASSWORD_LENGTH = 10;

export function passwordTooShortMessage(): string {
  return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
}
