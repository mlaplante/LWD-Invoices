"use client";

import Link from "next/link";

export default function ProjectDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
      <h2 className="text-xl font-semibold">Failed to load project</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/projects"
          className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent transition-colors"
        >
          Back to projects
        </Link>
      </div>
    </div>
  );
}
