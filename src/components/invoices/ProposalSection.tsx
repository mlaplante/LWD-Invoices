"use client";

import { trpc } from "@/trpc/client";
import { GenerateProposalButton } from "./GenerateProposalButton";
import { ProposalEditor } from "./ProposalEditor";
import { ProposalFileUpload } from "./ProposalFileUpload";

export function ProposalSection({ invoiceId }: { invoiceId: string }) {
  const utils = trpc.useUtils();
  const { data: proposal, isLoading } = trpc.proposals.get.useQuery({ invoiceId });

  const invalidate = () => utils.proposals.get.invalidate({ invoiceId });

  if (isLoading) return null;

  // State 1: No proposal — show both options
  if (!proposal) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <GenerateProposalButton invoiceId={invoiceId} />
          <span className="text-xs text-muted-foreground">or</span>
          <ProposalFileUpload
            invoiceId={invoiceId}
            fileUrl={null}
            fileName={null}
            onUploaded={invalidate}
            onRemoved={invalidate}
          />
        </div>
      </div>
    );
  }

  // State 2: Uploaded file
  if (proposal.fileUrl) {
    return (
      <div className="space-y-4">
        <ProposalFileUpload
          invoiceId={invoiceId}
          fileUrl={proposal.fileUrl}
          fileName={proposal.fileName}
          onUploaded={invalidate}
          onRemoved={invalidate}
        />
      </div>
    );
  }

  // State 3: Built-in editor
  return (
    <div className="space-y-4">
      <ProposalEditor invoiceId={invoiceId} />
    </div>
  );
}
