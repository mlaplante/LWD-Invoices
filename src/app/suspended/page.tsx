import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function SuspendedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-2xl font-bold">Account Suspended</h1>
        <p className="text-muted-foreground">
          Your account has been suspended by your organization administrator.
          Please contact them to restore access.
        </p>
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign out</Link>
        </Button>
      </div>
    </div>
  );
}
