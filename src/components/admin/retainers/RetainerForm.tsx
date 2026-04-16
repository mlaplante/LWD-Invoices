"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type Mode =
  | { mode: "create"; clientId: string }
  | {
      mode: "edit";
      id: string;
      initial: {
        name: string;
        includedHours: number;
        hourlyRate: number | null;
        active: boolean;
        clientId: string;
      };
    };

export function RetainerForm(props: Mode) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [name, setName] = useState(props.mode === "edit" ? props.initial.name : "");
  const [type, setType] = useState<"MONTHLY" | "BLOCK">("MONTHLY");
  const [includedHours, setIncludedHours] = useState(
    props.mode === "edit" ? String(props.initial.includedHours) : "20",
  );
  const [hourlyRate, setHourlyRate] = useState(
    props.mode === "edit" && props.initial.hourlyRate !== null
      ? String(props.initial.hourlyRate)
      : "",
  );
  const [active, setActive] = useState(
    props.mode === "edit" ? props.initial.active : true,
  );

  const clientId = props.mode === "create" ? props.clientId : props.initial.clientId;

  const create = trpc.hoursRetainers.create.useMutation({
    onSuccess: (r) => {
      toast.success("Retainer created");
      router.push(`/clients/${clientId}/retainers/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.hoursRetainers.update.useMutation({
    onSuccess: () => {
      toast.success("Retainer updated");
      if (props.mode === "edit") {
        utils.hoursRetainers.getDetail.invalidate({ id: props.id });
        utils.hoursRetainers.list.invalidate({ clientId });
      }
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      includedHours: Number(includedHours),
      hourlyRate: hourlyRate ? Number(hourlyRate) : undefined,
      active,
    };
    if (props.mode === "create") {
      create.mutate({ ...payload, type, clientId: props.clientId });
    } else {
      update.mutate({ id: props.id, ...payload });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-lg">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Monthly Maintenance"
        />
      </div>

      {props.mode === "create" && (
        <div>
          <Label>Type</Label>
          <div className="space-y-1 mt-1">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={type === "MONTHLY"}
                onChange={() => setType("MONTHLY")}
              />
              Monthly (resets each period)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={type === "BLOCK"}
                onChange={() => setType("BLOCK")}
              />
              Block (fixed pool)
            </label>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="hours">Included hours</Label>
        <Input
          id="hours"
          type="number"
          step="0.01"
          min="0.01"
          value={includedHours}
          onChange={(e) => setIncludedHours(e.target.value)}
          required
        />
      </div>

      <div>
        <Label htmlFor="rate">Hourly rate (optional, display-only)</Label>
        <Input
          id="rate"
          type="number"
          step="0.01"
          min="0.01"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="active"
          checked={active}
          onCheckedChange={(v) => setActive(Boolean(v))}
        />
        <Label htmlFor="active">Active</Label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || update.isPending}>
          {props.mode === "create" ? "Create retainer" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
