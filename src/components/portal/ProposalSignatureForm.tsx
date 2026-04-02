"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SignatureCapture } from "./SignatureCapture";
import { CheckCircle, Loader2 } from "lucide-react";

interface Props {
  token: string;
  invoiceNumber: string;
}

export function ProposalSignatureForm({ token, invoiceNumber }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");

  const signMutation = trpc.portal.signProposal.useMutation({
    onError: (err) => setError(err.message),
  });

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    signatureDataUrl !== null &&
    consent &&
    !signMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !signatureDataUrl) return;
    setError("");
    signMutation.mutate({
      token,
      signedByName: fullName.trim(),
      signedByEmail: email.trim(),
      signatureData: signatureDataUrl,
      legalConsent: true,
    });
  }

  if (signMutation.isSuccess) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
        <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto" />
        <p className="text-base font-semibold text-emerald-800">
          Proposal Signed Successfully
        </p>
        <p className="text-sm text-emerald-600">
          Estimate #{invoiceNumber} has been signed and accepted.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">Sign Proposal</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Please review the proposal above and sign below to accept.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Name + Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sig-name">Full Name</Label>
          <Input
            id="sig-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            required
            disabled={signMutation.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sig-email">Email</Label>
          <Input
            id="sig-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={signMutation.isPending}
          />
        </div>
      </div>

      {/* Signature capture */}
      <div className="space-y-1.5">
        <Label>Signature</Label>
        <SignatureCapture
          onCapture={(dataUrl) => setSignatureDataUrl(dataUrl)}
          disabled={signMutation.isPending}
        />
      </div>

      {/* Signature preview */}
      {signatureDataUrl && (
        <div className="space-y-1.5">
          <Label>Preview</Label>
          <div className="rounded-lg border border-border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signatureDataUrl}
              alt="Your signature"
              className="h-[60px] w-auto object-contain"
            />
          </div>
        </div>
      )}

      {/* Legal consent */}
      <div className="flex items-start gap-3">
        <Checkbox
          id="sig-consent"
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked)}
          disabled={signMutation.isPending}
        />
        <label htmlFor="sig-consent" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
          I agree that this electronic signature is legally binding and that I have
          reviewed and accept the terms of this proposal.
        </label>
      </div>

      {/* Submit */}
      <Button type="submit" disabled={!canSubmit} className="w-full">
        {signMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Signing...
          </>
        ) : (
          "Sign & Accept Proposal"
        )}
      </Button>
    </form>
  );
}
