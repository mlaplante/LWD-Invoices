/**
 * Guard for the "match an existing DB user by email" bridge (the Clerk →
 * Supabase migration path in /auth/callback and /api/auth/migrate).
 *
 * Linking gives the signed-in Supabase identity every org membership the
 * matched DB user holds, so it is only allowed when:
 *  - Supabase has verified the session's email address, and
 *  - the DB user is not already linked to a *different* Supabase identity
 *    (re-linking the same identity is an idempotent no-op).
 */
export function canLinkExistingUser(
  sessionUser: { id: string; email_confirmed_at?: string | null },
  dbUser: { supabaseId?: string | null },
): boolean {
  if (!sessionUser.email_confirmed_at) return false;
  if (dbUser.supabaseId && dbUser.supabaseId !== sessionUser.id) return false;
  return true;
}
