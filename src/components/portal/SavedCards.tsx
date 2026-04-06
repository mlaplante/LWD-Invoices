"use client";

import { trpc } from "@/trpc/client";
import { CreditCard, Trash2 } from "lucide-react";
import { toast } from "sonner";

function brandLabel(brand: string): string {
  const brands: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
  };
  return brands[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function SavedCards({ clientToken }: { clientToken: string }) {
  const { data: cards, refetch } = trpc.portal.savedCards.useQuery({ clientToken });
  const removeCard = trpc.portal.removeCard.useMutation({
    onSuccess: () => {
      toast.success("Card removed");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!cards || cards.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-muted-foreground" />
        Saved Payment Methods
      </h3>
      <div className="space-y-2">
        {cards.map((card) => (
          <div key={card.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {brandLabel(card.brand)} ending {card.last4}
              </span>
              <span className="text-xs text-muted-foreground">
                Expires {card.expiresMonth.toString().padStart(2, "0")}/{card.expiresYear}
              </span>
              {card.isDefault && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  Default
                </span>
              )}
            </div>
            <button
              onClick={() => removeCard.mutate({ clientToken, cardId: card.id })}
              disabled={removeCard.isPending}
              className="text-muted-foreground hover:text-red-600 transition-colors p-1"
              aria-label="Remove card"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
