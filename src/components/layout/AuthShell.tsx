import Image from "next/image";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

/** A consistent, low-distraction frame for account and workspace setup flows. */
export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="auth-shell min-h-screen bg-background px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(28rem,1.05fr)] lg:p-0">
      <section className="auth-shell__intro relative hidden overflow-hidden bg-sidebar px-10 py-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="relative z-10">
          <Image
            src="/logo-horizontal.png"
            alt="LWD Invoices"
            width={180}
            height={40}
            className="h-9 w-auto brightness-0 invert"
            priority
          />
        </div>
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
            <Image
              src="/logo-horizontal.png"
              alt="LWD Invoices"
              width={150}
              height={34}
              className="mb-7 h-7 w-auto lg:hidden"
              priority
            />
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
