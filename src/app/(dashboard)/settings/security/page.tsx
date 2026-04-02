import { MfaEnrollment } from "@/components/settings/MfaEnrollment";

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage two-factor authentication and security settings for your account.
        </p>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Authentication
          </p>
          <p className="text-base font-semibold mt-1">Two-Factor Authentication</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Add an extra layer of security to your account by requiring a code from
            your authenticator app when signing in.
          </p>
        </div>
        <div className="px-6 py-6">
          <MfaEnrollment />
        </div>
      </div>
    </div>
  );
}
