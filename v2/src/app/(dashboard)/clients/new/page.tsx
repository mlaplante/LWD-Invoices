import { ClientForm } from "@/components/clients/ClientForm";

export default function NewClientPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">New Client</h1>
      <ClientForm mode="create" />
    </div>
  );
}
