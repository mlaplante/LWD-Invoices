export type PortalBranding = {
  brandColor: string;
  logoUrl: string | null;
  orgName: string;
  tagline: string | null;
  footerText: string | null;
  fontClass: string;
  fontFamily: string;
  hidePoweredBy: boolean;
};

const FONT_MAP: Record<string, { className: string; family: string }> = {
  inter: {
    className: "font-sans",
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  georgia: {
    className: "font-serif",
    family: "Georgia, 'Times New Roman', Times, serif",
  },
  system: {
    className: "font-sans",
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
};

export function getPortalBranding(org: {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  portalTagline?: string | null;
  portalFooterText?: string | null;
  brandFont?: string | null;
  hidePoweredBy?: boolean;
}): PortalBranding {
  const font = FONT_MAP[org.brandFont ?? "inter"] ?? FONT_MAP.inter;
  return {
    brandColor: org.brandColor ?? "#2563eb",
    logoUrl: org.logoUrl,
    orgName: org.name,
    tagline: org.portalTagline ?? null,
    footerText: org.portalFooterText ?? null,
    fontClass: font.className,
    fontFamily: font.family,
    hidePoweredBy: org.hidePoweredBy ?? false,
  };
}
