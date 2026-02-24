import { currentUser } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const user = await currentUser();

  return (
    <div>
      <h1 className="text-2xl font-bold">
        Welcome{user?.firstName ? `, ${user.firstName}` : ""}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Pancake v2 — Phase 1 scaffold ready.
      </p>
    </div>
  );
}
