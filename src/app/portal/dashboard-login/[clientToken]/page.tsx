"use client";

import { useParams } from "next/navigation";
import { PortalPassphraseLoginForm } from "@/components/portal/PortalPassphraseLoginForm";

export default function PortalDashboardLoginPage() {
  const params = useParams<{ clientToken: string }>();

  return (
    <PortalPassphraseLoginForm
      title="Client Portal"
      description="Enter your passphrase to access your dashboard."
      authUrl={`/api/portal/dashboard/${params.clientToken}/auth`}
      successUrl={`/portal/dashboard/${params.clientToken}`}
      submitLabel="Sign In"
      portalToken={params.clientToken}
    />
  );
}
