"use client";

// dynamic() only defers a chunk when called from a Client Component. The
// dashboard layout is a Server Component, so calling next/dynamic directly
// there would still bundle CommandPalette (cmdk + Radix Dialog + the action
// flows it renders) into the layout's server-rendered entry JS instead of
// fetching it after hydration. This tiny "use client" wrapper gives
// next/dynamic a real client boundary to defer from.
import dynamic from "next/dynamic";

export const CommandPaletteLazy = dynamic(
  () => import("@/components/layout/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false, loading: () => null },
);
