import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from Server Component — cookies cannot be set.
            // Middleware handles session refresh.
          }
        },
      },
    },
  );
});

/** Cached per-request — deduplicates getUser() across layout, page, and tRPC context */
export const getUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});
