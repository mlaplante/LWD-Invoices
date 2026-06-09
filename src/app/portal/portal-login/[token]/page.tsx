"use client";

import { useParams } from "next/navigation";
import { PortalPassphraseLoginForm } from "@/components/portal/PortalPassphraseLoginForm";

export default function PortalLoginPage() {
  const params = useParams<{ token: string }>();

  return (
    <PortalPassphraseLoginForm
      title="Protected Invoice"
      description="This invoice is password protected. Enter the passphrase to continue."
      authUrl={`/api/portal/${params.token}/auth`}
      successUrl={`/portal/${params.token}`}
      submitLabel="View Invoice"
      portalToken={params.token}
    />
  );
}
