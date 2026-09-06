import { PortalPassphraseLoginForm } from "@/components/portal/PortalPassphraseLoginForm";

export default async function PortalDashboardLoginPage({
  params,
}: {
  params: Promise<{ clientToken: string }>;
}) {
  const { clientToken } = await params;

  return (
    <PortalPassphraseLoginForm
      title="Client Portal"
      description="Enter your passphrase to access your dashboard."
      authUrl={`/api/portal/dashboard/${clientToken}/auth`}
      successUrl={`/portal/dashboard/${clientToken}`}
      submitLabel="Sign In"
      portalToken={clientToken}
    />
  );
}
