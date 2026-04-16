import { RetainerForm } from "@/components/admin/retainers/RetainerForm";

export default async function NewRetainerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New hours retainer</h1>
      <RetainerForm mode="create" clientId={id} />
    </div>
  );
}
