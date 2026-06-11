import { EmailPreferencesForm } from "./EmailPreferencesForm";

/**
 * Public email-preferences page reached from the unsubscribe footer in
 * non-transactional emails. Token-scoped (no login): exposes only the org
 * name and the toggle states, never invoice or contact data.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <EmailPreferencesForm token={token} />
    </main>
  );
}
