import { MfaEnrollment } from "@/components/settings/MfaEnrollment";
import { ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";

export default function MfaEnrollRequiredPage() {
  return (
    <AuthShell title="Set up two-factor authentication" description="Your organization requires an authenticator app before you can continue.">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
          </div>
        </div>

        <MfaEnrollment />
      </div>
    </AuthShell>
  );
}
