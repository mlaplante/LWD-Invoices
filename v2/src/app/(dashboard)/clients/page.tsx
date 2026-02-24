import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function ClientsPage() {
  const clients = await api.clients.list({ includeArchived: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Button asChild>
          <Link href="/clients/new">New Client</Link>
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">No clients yet</p>
          <p className="mt-1 text-sm">Add your first client to get started.</p>
          <Button asChild className="mt-4">
            <Link href="/clients/new">Add Client</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Phone</th>
                <th className="px-4 py-3 text-left font-medium">City</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/clients/${client.id}`} className="hover:underline">
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {client.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {client.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {client.city ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/clients/${client.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
