"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GatewayType } from "@/generated/prisma";

export function GatewaySettingsForm() {
  const { data: gateways, refetch } = trpc.gatewaySettings.list.useQuery();
  const upsert = trpc.gatewaySettings.upsert.useMutation({ onSuccess: () => void refetch() });
  const toggle = trpc.gatewaySettings.toggle.useMutation({ onSuccess: () => void refetch() });

  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Stripe form state
  const [stripeKey, setStripeKey] = useState("");
  const [stripePubKey, setStripePubKey] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");
  const [stripeSurcharge, setStripeSurcharge] = useState("0");
  const [stripeLabel, setStripeLabel] = useState("");

  // PayPal form state
  const [ppEmail, setPpEmail] = useState("");
  const [ppSurcharge, setPpSurcharge] = useState("0");
  const [ppLabel, setPpLabel] = useState("");

  // Manual gateways
  const [bankInstructions, setBankInstructions] = useState("");
  const [bankLabel, setBankLabel] = useState("Bank Transfer");
  const [cashLabel, setCashLabel] = useState("Cash");
  const [cashInstructions, setCashInstructions] = useState("");

  function handleToggle(gatewayType: GatewayType, isEnabled: boolean) {
    toggle.mutate({ gatewayType, isEnabled });
  }

  function saveStripe(e: React.FormEvent) {
    e.preventDefault();
    setErrors((p) => ({ ...p, stripe: "" }));
    upsert.mutate(
      {
        gatewayType: GatewayType.STRIPE,
        surcharge: parseFloat(stripeSurcharge) || 0,
        label: stripeLabel || undefined,
        config: {
          secretKey: stripeKey,
          publishableKey: stripePubKey,
          webhookSecret: stripeWebhook,
        },
      },
      {
        onSuccess: () => setSaved((p) => ({ ...p, stripe: true })),
        onError: (err) => setErrors((p) => ({ ...p, stripe: err.message })),
      }
    );
  }

  function savePayPal(e: React.FormEvent) {
    e.preventDefault();
    setErrors((p) => ({ ...p, paypal: "" }));
    upsert.mutate(
      {
        gatewayType: GatewayType.PAYPAL,
        surcharge: parseFloat(ppSurcharge) || 0,
        label: ppLabel || undefined,
        config: { email: ppEmail },
      },
      {
        onSuccess: () => setSaved((p) => ({ ...p, paypal: true })),
        onError: (err) => setErrors((p) => ({ ...p, paypal: err.message })),
      }
    );
  }

  function saveBankTransfer(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      gatewayType: GatewayType.BANK_TRANSFER,
      label: bankLabel || undefined,
      config: { instructions: bankInstructions },
    }, {
      onSuccess: () => setSaved((p) => ({ ...p, bank: true })),
    });
  }

  function saveCash(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      gatewayType: GatewayType.CASH,
      label: cashLabel || undefined,
      config: { instructions: cashInstructions },
    }, {
      onSuccess: () => setSaved((p) => ({ ...p, cash: true })),
    });
  }

  const stripeEnabled = gateways?.find((g) => g.gatewayType === GatewayType.STRIPE)?.isEnabled ?? false;
  const paypalEnabled = gateways?.find((g) => g.gatewayType === GatewayType.PAYPAL)?.isEnabled ?? false;
  const bankEnabled = gateways?.find((g) => g.gatewayType === GatewayType.BANK_TRANSFER)?.isEnabled ?? false;
  const cashEnabled = gateways?.find((g) => g.gatewayType === GatewayType.CASH)?.isEnabled ?? false;

  return (
    <Tabs defaultValue="stripe">
      <TabsList>
        <TabsTrigger value="stripe">Stripe</TabsTrigger>
        <TabsTrigger value="paypal">PayPal</TabsTrigger>
        <TabsTrigger value="bank">Bank Transfer</TabsTrigger>
        <TabsTrigger value="cash">Cash</TabsTrigger>
      </TabsList>

      {/* Stripe */}
      <TabsContent value="stripe">
        <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Stripe</h3>
              <p className="text-sm text-muted-foreground">
                Accept credit card payments via Stripe Checkout.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={stripeEnabled}
                onChange={(e) => handleToggle(GatewayType.STRIPE, e.target.checked)}
              />
              <span className="text-sm">Enabled</span>
            </label>
          </div>

          <form onSubmit={saveStripe} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Secret Key</Label>
              <Input
                type="password"
                value={stripeKey}
                onChange={(e) => setStripeKey(e.target.value)}
                placeholder="sk_live_... or sk_test_..."
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Publishable Key</Label>
              <Input
                value={stripePubKey}
                onChange={(e) => setStripePubKey(e.target.value)}
                placeholder="pk_live_... or pk_test_..."
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Webhook Secret</Label>
              <Input
                type="password"
                value={stripeWebhook}
                onChange={(e) => setStripeWebhook(e.target.value)}
                placeholder="whsec_..."
                required
              />
              <p className="text-xs text-muted-foreground">
                Add webhook endpoint: <code className="bg-muted px-1 rounded">/api/webhooks/stripe</code>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Surcharge (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={stripeSurcharge}
                  onChange={(e) => setStripeSurcharge(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Button Label (optional)</Label>
                <Input
                  value={stripeLabel}
                  onChange={(e) => setStripeLabel(e.target.value)}
                  placeholder="Pay by Credit Card"
                />
              </div>
            </div>

            {errors.stripe && <p className="text-sm text-destructive">{errors.stripe}</p>}
            {saved.stripe && <p className="text-sm text-green-600">Saved successfully.</p>}

            <Button type="submit" disabled={upsert.isPending}>Save Stripe Settings</Button>
          </form>
        </div>
      </TabsContent>

      {/* PayPal */}
      <TabsContent value="paypal">
        <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">PayPal</h3>
              <p className="text-sm text-muted-foreground">
                Clients are sent to PayPal to pay using your email address. Payments must be recorded manually.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={paypalEnabled}
                onChange={(e) => handleToggle(GatewayType.PAYPAL, e.target.checked)}
              />
              <span className="text-sm">Enabled</span>
            </label>
          </div>

          <form onSubmit={savePayPal} className="space-y-4">
            <div className="space-y-1.5">
              <Label>PayPal Email</Label>
              <Input
                type="email"
                value={ppEmail}
                onChange={(e) => setPpEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <p className="text-xs text-muted-foreground">
                The PayPal account email that will receive payments.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Transaction Fee (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={ppSurcharge}
                  onChange={(e) => setPpSurcharge(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Button Label (optional)</Label>
                <Input
                  value={ppLabel}
                  onChange={(e) => setPpLabel(e.target.value)}
                  placeholder="Pay with PayPal"
                />
              </div>
            </div>

            {errors.paypal && <p className="text-sm text-destructive">{errors.paypal}</p>}
            {saved.paypal && <p className="text-sm text-green-600">Saved successfully.</p>}

            <Button type="submit" disabled={upsert.isPending}>Save PayPal Settings</Button>
          </form>
        </div>
      </TabsContent>

      {/* Bank Transfer */}
      <TabsContent value="bank">
        <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Bank Transfer</h3>
              <p className="text-sm text-muted-foreground">
                Display bank transfer instructions on the client portal.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={bankEnabled}
                onChange={(e) => handleToggle(GatewayType.BANK_TRANSFER, e.target.checked)}
              />
              <span className="text-sm">Enabled</span>
            </label>
          </div>

          <form onSubmit={saveBankTransfer} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Button Label</Label>
              <Input
                value={bankLabel}
                onChange={(e) => setBankLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instructions</Label>
              <Textarea
                value={bankInstructions}
                onChange={(e) => setBankInstructions(e.target.value)}
                placeholder="Account name: Acme Inc.&#10;BSB: 123-456&#10;Account: 987654321"
                rows={4}
              />
            </div>
            {saved.bank && <p className="text-sm text-green-600">Saved successfully.</p>}
            <Button type="submit" disabled={upsert.isPending}>Save</Button>
          </form>
        </div>
      </TabsContent>

      {/* Cash */}
      <TabsContent value="cash">
        <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Cash</h3>
              <p className="text-sm text-muted-foreground">
                Display cash payment instructions on the client portal.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={cashEnabled}
                onChange={(e) => handleToggle(GatewayType.CASH, e.target.checked)}
              />
              <span className="text-sm">Enabled</span>
            </label>
          </div>

          <form onSubmit={saveCash} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Button Label</Label>
              <Input
                value={cashLabel}
                onChange={(e) => setCashLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instructions</Label>
              <Textarea
                value={cashInstructions}
                onChange={(e) => setCashInstructions(e.target.value)}
                placeholder="Please bring cash to our office at..."
                rows={3}
              />
            </div>
            {saved.cash && <p className="text-sm text-green-600">Saved successfully.</p>}
            <Button type="submit" disabled={upsert.isPending}>Save</Button>
          </form>
        </div>
      </TabsContent>
    </Tabs>
  );
}
