type Props = {
  title: string;
  orgName: string;
  logoUrl?: string | null;
  dateRange?: string;
};

export function ReportHeader({ title, orgName, logoUrl, dateRange }: Props) {
  return (
    <>
      {/* Professional letterhead — visible on screen and print */}
      <div className="rounded-2xl border border-border/50 bg-card px-6 py-5 print:border-0 print:rounded-none print:px-0 print:py-0 print:mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={orgName}
                className="h-10 w-auto max-w-[160px] object-contain"
              />
            )}
            <div>
              <p className="text-lg font-bold tracking-tight">{orgName}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-extrabold tracking-tight">{title}</p>
            {dateRange && (
              <p className="text-sm text-muted-foreground mt-0.5">{dateRange}</p>
            )}
          </div>
        </div>
        <div className="border-t border-border/50 mt-4 pt-0 print:border-border" />
      </div>

      {/* Print footer — only visible when printing */}
      <div className="hidden print:block fixed bottom-4 right-6 text-xs text-muted-foreground">
        Generated on {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </div>
    </>
  );
}
