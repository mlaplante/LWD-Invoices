"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import type { GatewayType } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Gateway = {
  gatewayType: GatewayType;
  surcharge: number;
  label: string | null;
  paypalUrl?: string;
};

type Props = {
  token: string;
  gateways: Gateway[];
  total: string;
  orgName: string;
  partialPaymentId?: string;
  payFullBalance?: boolean;
  label?: string;
};

export function PaymentButtons({ token, gateways, total, orgName, partialPaymentId, payFullBalance, label }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const createStripeCheckout = trpc.portal.createStripeCheckout.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => {
      setError(err.message);
      setLoading(null);
    },
  });

  const handleStripe = () => {
    setError("");
    setLoading("stripe");
    createStripeCheckout.mutate({ token, partialPaymentId, payFullBalance });
  };

  const stripeGateway = gateways.find((g) => g.gatewayType === "STRIPE");
  const paypalGateway = gateways.find((g) => g.gatewayType === "PAYPAL");
  const manualGateways = gateways.filter(
    (g) => g.gatewayType !== "STRIPE" && g.gatewayType !== "PAYPAL"
  );

  const surchargeNote = (g: Gateway) =>
    g.surcharge > 0 ? ` (+${g.surcharge}% fee)` : "";

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <h2 className="text-base font-semibold text-foreground mb-4">{label ?? "Pay Now"}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Amount due: <span className="font-semibold text-foreground">{total}</span>
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {stripeGateway && (
          <Button
            onClick={handleStripe}
            disabled={loading !== null}
            className="w-full py-6 gap-2 text-white hover:opacity-90"
            style={{ backgroundColor: "var(--portal-brand)" }}
          >
            {loading === "stripe" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.929 3.477 1.634 3.477 2.66 0 1.05-.965 1.638-2.519 1.638-2.107 0-4.482-.694-6.379-1.638l-.878 5.63C5.58 24.119 8.502 25 11.908 25c2.66 0 4.842-.692 6.426-2.048 1.677-1.439 2.522-3.469 2.522-5.933 0-4.184-2.557-5.907-6.88-7.869z" />
              </svg>
            )}
            {stripeGateway.label ?? "Pay by Credit Card"}
            {surchargeNote(stripeGateway)}
          </Button>
        )}

        {paypalGateway?.paypalUrl && (
          <Button asChild className="w-full py-6 bg-yellow-400 text-yellow-900 hover:bg-yellow-500">
            <a
              href={paypalGateway.paypalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="font-bold text-blue-700">Pay</span>
              {paypalGateway.label ?? "Pay with PayPal"}
              {surchargeNote(paypalGateway)}
            </a>
          </Button>
        )}

        {manualGateways.map((g) => (
          <div
            key={g.gatewayType}
            className="rounded-xl border border-border/50 bg-accent/30 p-4"
          >
            <p className="text-sm font-medium text-foreground mb-1">
              {g.label ?? g.gatewayType.replace("_", " ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Please use the payment details provided by {orgName} to complete your payment.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
