import { createClient } from "@/lib/supabase/server";

export type AuthResult =
  | { user: { id: string }; orgId: string }
  | Response;

/**
 * Authenticates the current request and extracts the organizationId.
 * Returns a Response(401) if unauthorized, otherwise returns { user, orgId }.
 */
export async function getAuthenticatedOrg(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = user?.app_metadata?.organizationId as string | undefined;

  if (!user || !orgId) {
    return new Response("Unauthorized", { status: 401 });
  }

  return { user: { id: user.id }, orgId };
}

/** Type guard: true if the result is an auth failure Response */
export function isAuthError(result: AuthResult): result is Response {
  return result instanceof Response;
}
