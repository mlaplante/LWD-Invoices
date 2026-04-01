import type { PortalBranding } from "@/lib/portal-branding";

type Props = {
  branding: PortalBranding;
  children: React.ReactNode;
  maxWidth?: string; // Tailwind max-w class, default "max-w-3xl"
};

export function PortalShell({ branding, children, maxWidth = "max-w-3xl" }: Props) {
  return (
    <div
      className={`min-h-screen bg-background ${branding.fontClass}`}
      style={
        {
          "--portal-brand": branding.brandColor,
          fontFamily: branding.fontFamily,
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <header
        className="border-b"
        style={{ borderColor: `${branding.brandColor}20` }}
      >
        <div className={`mx-auto ${maxWidth} px-4 py-6 text-center`}>
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.orgName}
              className="mx-auto mb-3 h-12 w-auto max-w-[160px] object-contain"
            />
          )}
          <h1 className="text-2xl font-bold text-foreground">
            {branding.orgName}
          </h1>
          {branding.tagline && (
            <p className="text-sm text-muted-foreground mt-1">
              {branding.tagline}
            </p>
          )}
        </div>
      </header>

      {/* Content */}
      <main className={`mx-auto ${maxWidth} px-4 py-8`}>{children}</main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        <div className={`mx-auto ${maxWidth} px-4 space-y-1`}>
          {branding.footerText && <p>{branding.footerText}</p>}
          {!branding.hidePoweredBy && (
            <p className="opacity-60">Powered by LWD Invoices</p>
          )}
        </div>
      </footer>
    </div>
  );
}
