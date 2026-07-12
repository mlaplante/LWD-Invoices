import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

/* The logo PNG has an opaque background plate, so image treatments (invert,
   dark panels) render it as a solid box — use a typographic wordmark here. */
function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={className} aria-label="LWD Invoices home">
      <span className="font-display text-2xl leading-none tracking-tight">
        LWD <span className="text-primary">Invoices</span>
      </span>
    </Link>
  );
}

/** A consistent, low-distraction frame for account and workspace setup flows. */
export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="auth-shell min-h-screen bg-background px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(28rem,1.05fr)] lg:p-0">
      <section className="auth-shell__intro relative hidden overflow-hidden bg-sidebar px-10 py-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between xl:px-16">
        <Wordmark className="relative z-10 inline-block text-sidebar-foreground" />
        <div className="relative z-10 max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Client billing, made clear
          </p>
          <p className="mt-4 font-display text-5xl leading-[0.96] tracking-tight text-sidebar-foreground xl:text-6xl">
            Keep the work moving and the cash flowing.
          </p>
          <p className="mt-5 max-w-sm text-sm leading-6 text-sidebar-foreground/65">
            Invoices, clients, and follow-ups in one focused workspace.
          </p>
        </div>
        <p className="relative z-10 text-xs text-sidebar-foreground/45">
          LaPlante Web Development
        </p>
      </section>

      <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center lg:min-h-screen lg:px-10 xl:px-16">
        <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-7">
            <Wordmark className="mb-7 inline-block text-foreground lg:hidden" />
            <h1 className="font-display text-4xl leading-none tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
