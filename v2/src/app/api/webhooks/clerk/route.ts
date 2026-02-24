import { headers } from "next/headers";
import { Webhook } from "svix";
import { db } from "@/server/db";
import type { UserJSON, OrganizationJSON } from "@clerk/nextjs/server";

type WebhookEvent =
  | { type: "user.created" | "user.updated"; data: UserJSON }
  | {
      type: "organization.created" | "organization.updated";
      data: OrganizationJSON;
    };

export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  let event: WebhookEvent;
  try {
    const wh = new Webhook(webhookSecret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "organization.created": {
      const org = event.data;
      await db.organization.create({
        data: {
          clerkId: org.id,
          name: org.name,
          slug: org.slug ?? undefined,
        },
      });
      break;
    }

    case "organization.updated": {
      const org = event.data;
      await db.organization.update({
        where: { clerkId: org.id },
        data: {
          name: org.name,
          slug: org.slug ?? undefined,
        },
      });
      break;
    }

    case "user.created": {
      const user = event.data;
      const primaryEmail = user.email_addresses.find(
        (e) => e.id === user.primary_email_address_id
      );
      if (!primaryEmail) break;

      await db.user.upsert({
        where: { clerkId: user.id },
        create: {
          clerkId: user.id,
          email: primaryEmail.email_address,
          firstName: user.first_name ?? undefined,
          lastName: user.last_name ?? undefined,
          organizationId: "__pending__",
        },
        update: {
          email: primaryEmail.email_address,
          firstName: user.first_name ?? undefined,
          lastName: user.last_name ?? undefined,
        },
      });
      break;
    }

    case "user.updated": {
      const user = event.data;
      const primaryEmail = user.email_addresses.find(
        (e) => e.id === user.primary_email_address_id
      );
      if (!primaryEmail) break;

      await db.user.updateMany({
        where: { clerkId: user.id },
        data: {
          email: primaryEmail.email_address,
          firstName: user.first_name ?? undefined,
          lastName: user.last_name ?? undefined,
        },
      });
      break;
    }
  }

  return new Response("OK", { status: 200 });
}
