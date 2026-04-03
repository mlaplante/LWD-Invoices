"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "0.5rem" }}>
          Something went wrong
        </h1>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "#666", marginBottom: "0.5rem" }}>
            Error ID: {error.digest}
          </p>
        )}
        <p style={{ fontSize: "0.875rem", color: "#444", marginBottom: "1rem" }}>
          An unexpected error occurred. Please try again or contact support if the problem persists.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            background: "#000",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
