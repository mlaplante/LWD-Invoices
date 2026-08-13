import Image from "next/image";
import type { PortalBranding } from "@/lib/portal-branding";

type Props = {
  branding: PortalBranding;
  children: React.ReactNode;
  maxWidth?: string; // Tailwind max-w class, default "max-w-3xl"
  /** Mono line under the org name — e.g. "client portal · aurnova, inc." */
  subtitle?: string;
};

/** Darken a #rrggbb by `amount` (0-1) for the header gradient's far stop. */
function darken(hex: string, amount = 0.22): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const int = parseInt(match[1], 16);
  const channel = (shift: number) =>
    Math.max(0, Math.round(((int >> shift) & 0xff) * (1 - amount)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/**
 * Client-facing shell. This is the one surface in the system that uses a
 * gradient — it's what separates "your client is looking at this" from the
 * flat paper-white admin app at a glance.
 *
 * The gradient is derived from the org's own brandColor rather than the
 * design's blog blue, so white-labelled portals keep their colour and the
 * default (#2563eb) still lands on the intended blue.
 */
export function PortalShell({
  branding,
  children,
  maxWidth = "max-w-3xl",
  subtitle,
}: Props) {
  return (
    <div
      className={`min-h-screen bg-[#f8f9fa] dark:bg-background ${branding.fontClass}`}
      style={
        {
          "--portal-brand": branding.brandColor,
          fontFamily: branding.fontFamily,
        } as React.CSSProperties
      }
    >
      <header
        className="shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
        style={{
          backgroundImage: `linear-gradient(135deg, ${branding.brandColor}, ${darken(branding.brandColor)})`,
        }}
      >
        <div
          className={`mx-auto ${maxWidth} flex items-center gap-4 px-6 py-6 text-white`}
        >
          {branding.logoUrl ? (
            <Image
              src={branding.logoUrl}
              alt={branding.orgName}
              width={120}
              height={40}
              unoptimized
              className="h-10 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-bold"
            >
              {branding.orgName.slice(0, 2).toUpperCase()}
            </span>
          )}

          <div className="min-w-0">
            <p className="truncate text-base font-semibold">
              {branding.orgName}
            </p>
            {(subtitle ?? branding.tagline) && (
              <p className="truncate font-mono text-[10px] tracking-[1px] text-white/70">
                {subtitle ?? branding.tagline}
              </p>
            )}
          </div>

          <p className="ml-auto hidden shrink-0 font-mono text-[10.5px] text-white/75 sm:block">
            secure link · no account needed
          </p>
        </div>
      </header>

      <main className={`mx-auto ${maxWidth} px-6 py-9`}>{children}</main>

      <footer className="pb-9 pt-4 text-center font-mono text-[10px] text-muted-foreground">
        <div className={`mx-auto ${maxWidth} space-y-1 px-6`}>
          {branding.footerText && <p>{branding.footerText}</p>}
          {!branding.hidePoweredBy && (
            <p className="opacity-60">Powered by LWD Invoices</p>
          )}
        </div>
      </footer>
    </div>
  );
}
