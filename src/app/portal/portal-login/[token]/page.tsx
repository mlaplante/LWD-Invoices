import { PortalPassphraseLoginForm } from "@/components/portal/PortalPassphraseLoginForm";

export default async function PortalLoginPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <PortalPassphraseLoginForm
      title="Protected Invoice"
      description="This invoice is password protected. Enter the passphrase to continue."
      authUrl={`/api/portal/${token}/auth`}
      successUrl={`/portal/${token}`}
      submitLabel="View Invoice"
      portalToken={token}
    />
  );
}
