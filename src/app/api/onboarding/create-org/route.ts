import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/server/db";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Already has an org in app_metadata
  if (user.app_metadata?.organizationId) {
    return NextResponse.json({ error: "Organization already exists" }, { status: 400 });
  }

  // Also check DB — handles the case where a previous request created the org
  // but failed before writing app_metadata (race condition recovery).
  // Use email as fallback in case supabaseId column hasn't been migrated yet.
  let existingDbUser = null;
  try {
    existingDbUser = await db.user.findFirst({
      where: { supabaseId: user.id },
      select: { organizationId: true },
    });
  } catch {
    // supabaseId column may not exist yet — fall back to email lookup
    if (user.email) {
      existingDbUser = await db.user.findFirst({
        where: { email: user.email },
        select: { organizationId: true },
      });
    }
  }
  if (existingDbUser?.organizationId) {
    // Org exists in DB but wasn't written to app_metadata — fix that now
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { organizationId: existingDbUser.organizationId },
    });
    return NextResponse.json({ organizationId: existingDbUser.organizationId });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Business name is required" }, { status: 400 });
  }

  const DEFAULT_EXPENSE_CATEGORIES = [
    "Advertising & Marketing",
    "Bank Charges & Fees",
    "Equipment & Supplies",
    "Insurance",
    "Meals & Entertainment",
    "Office Expenses",
    "Professional Services",
    "Rent & Utilities",
    "Software & Subscriptions",
    "Travel & Transportation",
    "Wages & Payroll",
    "Taxes & Licenses",
  ];

  // Create org in DB
  const org = await db.organization.create({
    data: { id: `org_${crypto.randomUUID()}`, name },
  });

  const DEFAULT_EXPENSE_SUPPLIERS = [
    "Amazon", "Apple", "Google", "Microsoft", "Shopify",
    "Slack", "Stripe", "Zoom", "Dropbox", "FedEx",
    "UPS", "USPS", "Staples", "Home Depot", "Other",
  ];

  // Seed default expense categories, suppliers, and reminder sequence
  await Promise.all([
    db.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name, organizationId: org.id })),
    }),
    db.expenseSupplier.createMany({
      data: DEFAULT_EXPENSE_SUPPLIERS.map((name) => ({ name, organizationId: org.id })),
    }),
    db.reminderSequence.create({
      data: {
        name: "Default Reminder Sequence",
        isDefault: true,
        enabled: true,
        organizationId: org.id,
        steps: {
          create: [
            { daysRelativeToDue: -3, subject: "Upcoming: Invoice #{{ invoiceNumber }} due in 3 days", body: '<p>Hi {{ clientName }},</p><p>This is a friendly reminder that Invoice #{{ invoiceNumber }} for {{ amountDue }} is due on {{ dueDate }}.</p><p><a href="{{ paymentLink }}">View & Pay</a></p><p>{{ orgName }}</p>', sort: 0 },
            { daysRelativeToDue: 0, subject: "Due today: Invoice #{{ invoiceNumber }}", body: '<p>Hi {{ clientName }},</p><p>Invoice #{{ invoiceNumber }} for {{ amountDue }} is due today.</p><p><a href="{{ paymentLink }}">View & Pay</a></p><p>{{ orgName }}</p>', sort: 1 },
            { daysRelativeToDue: 7, subject: "Overdue: Invoice #{{ invoiceNumber }} (7 days past due)", body: '<p>Hi {{ clientName }},</p><p>Invoice #{{ invoiceNumber }} for {{ amountDue }} is now 7 days overdue.</p><p><a href="{{ paymentLink }}">View & Pay</a></p><p>{{ orgName }}</p>', sort: 2 },
            { daysRelativeToDue: 14, subject: "Second notice: Invoice #{{ invoiceNumber }} (14 days overdue)", body: '<p>Hi {{ clientName }},</p><p>This is a second reminder that Invoice #{{ invoiceNumber }} for {{ amountDue }} is 14 days past due.</p><p><a href="{{ paymentLink }}">View & Pay Now</a></p><p>{{ orgName }}</p>', sort: 3 },
            { daysRelativeToDue: 30, subject: "Final notice: Invoice #{{ invoiceNumber }} (30 days overdue)", body: '<p>Hi {{ clientName }},</p><p>Invoice #{{ invoiceNumber }} for {{ amountDue }} is now 30 days overdue. Please arrange payment immediately.</p><p><a href="{{ paymentLink }}">View & Pay Now</a></p><p>{{ orgName }}</p>', sort: 4 },
          ],
        },
      },
    }),
  ]);

  // Upsert user record — handle case where supabaseId column doesn't exist yet
  try {
    await db.user.upsert({
      where: { supabaseId: user.id },
      update: { organizationId: org.id, role: "OWNER" },
      create: {
        supabaseId: user.id,
        email: user.email!,
        firstName: user.user_metadata?.firstName ?? null,
        lastName: user.user_metadata?.lastName ?? null,
        organizationId: org.id,
        role: "OWNER",
      },
    });
  } catch {
    // supabaseId column missing — upsert by email instead
    await db.user.upsert({
      where: { email: user.email! },
      update: { organizationId: org.id, role: "OWNER" },
      create: {
        email: user.email!,
        firstName: user.user_metadata?.firstName ?? null,
        lastName: user.user_metadata?.lastName ?? null,
        organizationId: org.id,
        role: "OWNER",
      },
    });
  }

  // Store organizationId in Supabase app_metadata
  const admin = createAdminClient();
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { organizationId: org.id },
  });

  if (metaError) {
    console.error("[onboarding] Failed to set app_metadata:", metaError.message);
    return NextResponse.json({ error: "Failed to configure account" }, { status: 500 });
  }

  return NextResponse.json({ organizationId: org.id });
}
