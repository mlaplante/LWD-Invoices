import { CollectionsQueue } from "@/components/collections/CollectionsQueue";

export const metadata = { title: "Collections" };

export default function CollectionsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Your ranked daily queue — highest-risk receivables first. One click to chase, AI-drafted
          reminder reviewed before sending.
        </p>
      </div>
      <CollectionsQueue />
    </div>
  );
}
