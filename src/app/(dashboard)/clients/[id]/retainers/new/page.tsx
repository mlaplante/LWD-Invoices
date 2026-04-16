import Link from "next/link";
import { RetainerForm } from "@/components/admin/retainers/RetainerForm";

export default async function NewRetainerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to client
      </Link>
      <h1 className="text-2xl font-semibold">New hours retainer</h1>
      <RetainerForm mode="create" clientId={id} />
    </div>
  );
}
