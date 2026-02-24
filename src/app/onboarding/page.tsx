import { CreateOrganization } from "@clerk/nextjs";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold">Create your workspace</h1>
        <p className="text-muted-foreground">
          Set up an organization to get started with Pancake.
        </p>
        <CreateOrganization afterCreateOrganizationUrl="/" />
      </div>
    </div>
  );
}
