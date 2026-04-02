import { MfaEnrollment } from "@/components/settings/MfaEnrollment";
import { ShieldCheck } from "lucide-react";

export default function MfaEnrollRequiredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Set Up Two-Factor Authentication</h1>
          <p className="text-muted-foreground text-sm">
            Your organization requires two-factor authentication.
            Please set up an authenticator app to continue.
          </p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-6">
          <MfaEnrollment />
        </div>
      </div>
    </div>
  );
}
