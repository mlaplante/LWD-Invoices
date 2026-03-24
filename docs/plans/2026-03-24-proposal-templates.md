# Proposal Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add proposal template support so ESTIMATE-type invoices can generate full multi-page proposal PDFs with reusable content blocks and named templates.

**Architecture:** New `ProposalTemplate` and `ProposalContent` Prisma models layered on top of existing Invoice/Estimate system. New tRPC routers for CRUD. Proposal PDF generated via `@react-pdf/renderer` reusing existing Pancake styling. Markdown content with `{{variable}}` substitution.

**Tech Stack:** Prisma 7, tRPC v11, @react-pdf/renderer, React 19, shadcn/ui, Tailwind v4, marked (new dep for markdown→HTML)

---

### Task 1: Add Prisma Models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add ProposalTemplate and ProposalContent models to schema**

Add at the end of the schema file, before the closing:

```prisma
model ProposalTemplate {
  id              String   @id @default(cuid())
  name            String
  sections        Json     // Array of { key, title, content } objects
  isDefault       Boolean  @default(false)
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  proposals       ProposalContent[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model ProposalContent {
  id              String   @id @default(cuid())
  invoiceId       String   @unique
  invoice         Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  templateId      String?
  template        ProposalTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  sections        Json     // Array of { key, title, content } objects
  version         String   @default("1.0")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Step 2: Add relations to existing models**

Add to the `Organization` model relations list:

```prisma
  proposalTemplates   ProposalTemplate[]
  proposalContents    ProposalContent[]
```

Add to the `Invoice` model relations:

```prisma
  proposalContent     ProposalContent?
```

**Step 3: Run migration**

```bash
npx prisma migrate dev --name add-proposal-templates
```

Expected: Migration created and applied. Prisma client regenerated.

**Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add ProposalTemplate and ProposalContent models"
```

---

### Task 2: Seed Default Template from DOCX Content

**Files:**
- Create: `prisma/seeds/proposal-template-seed.ts`

**Step 1: Create the seed file with DOCX content**

```typescript
import { PrismaClient } from "../src/generated/prisma";

const DEFAULT_SECTIONS = [
  {
    key: "executive_summary",
    title: "Executive Summary",
    content: `## Overview

{{client_url}}

Developer: Michael La Plante, La Plante Web Development

{{project_type}}

{{platform}}

## Goals

{{project_goals}}

## Key Highlights

- {{highlight_1}}
- {{highlight_2}}
- {{highlight_3}}
- {{highlight_4}}
- {{highlight_5}}

## Current State Assessment

{{current_state_assessment}}`,
  },
  {
    key: "developer_profile",
    title: "Developer Profile",
    content: `## Security-First Development

Security is not an afterthought — it is built into every solution from the ground up. With deep roots in cybersecurity from FireEye/Mandiant, we bring a security-first mindset to every project, from code injection audits to best practices for client data handling.

## Strategic Approach

We are not just developers — we are strategic partners who take the time to truly understand your business, challenges, and goals before proposing solutions. Every recommendation in this proposal is grounded in research specific to your industry and market.

## Notable Clients & Experience

Our experience extends across companies of all sizes, from social media giants and trillion-dollar search engines to government agencies. Clients include Shell, Redcell Technologies, Facebook, MadcapLogic, and many more. Michael is also a Full Sail University Hall of Fame inductee with 70+ speaking engagements worldwide.`,
  },
  {
    key: "technologies",
    title: "Technologies & Approach",
    content: `## Platform

{{platform_description}}

## Development Tools

{{development_tools}}

## Analytics & Monitoring

{{analytics_tools}}`,
  },
  {
    key: "budget",
    title: "Budget",
    content: null, // Auto-generated from estimate line items
  },
  {
    key: "production_process",
    title: "Production Process",
    content: `## Discovery Process

The first phase of the process is all about gathering and examining the necessary information to kick off the project.

- Collect the client's existing materials, brand guidelines, and content.
- Determine the target audience.
- Learn who the client's competitors are.
- Determine project timeline and phase deliverables.

## Design & Strategy

{{design_strategy_description}}

## Development & Implementation

{{development_implementation_description}}

## Delivery

The last phase is where we deliver all completed work and hand off documentation to the client.

- All changes documented with before/after evidence where applicable.
- Client training session on all delivered systems and tools.
- Written documentation covering workflows, checklists, and user guides.
- Final review meeting with client.`,
  },
  {
    key: "assumptions",
    title: "Details and Assumptions",
    content: `- All content and imagery will be provided by the client.
- If needed, La Plante Web Development will offer additional services at an additional cost to original project budget.
- All content is to be delivered by specific dates discussed, otherwise project launch could be delayed.
- The estimated budget is based on existing information. Once criteria and site direction are finalized, additional costs may apply.
- If this proposal is accepted, La Plante Web Development and the client agree to have a kickoff meeting to discuss specific client needs for the project.`,
  },
  {
    key: "terms",
    title: "Terms of Agreement",
    content: `This proposal outlines the scope of the project requested by {{client_name}} as understood by La Plante Web Development and serves as an estimate only. Actual timelines and costs are determined by the actual scope of work completed.

Start of work for the project outlined in this statement of work is contingent upon signing of a contractual agreement between {{client_name}} and La Plante Web Development.

La Plante Web Development typically invoices for total costs at THREE key points of project development: Initial statement of work approval (signing of this document), mid-project milestone, and 30 days after project completion.

This proposal is subject to acceptance within 30 days.

Any requirements not able to be implemented within this timeframe or any additional requirements not documented in the business requirements document as part of the initial project scope can be estimated and contracted at a later date.

Payment term for all invoices is 30 days — with initial invoice due upon receipt.

## Disclaimer

Copyright © 2026 La Plante Web Development. Other trade names mentioned in this publication belong to their respective owners. The enclosed material is proprietary to La Plante Web Development.`,
  },
];

export { DEFAULT_SECTIONS };

export async function seedProposalTemplate(db: PrismaClient, organizationId: string) {
  const existing = await db.proposalTemplate.findFirst({
    where: { organizationId, isDefault: true },
  });
  if (existing) return existing;

  return db.proposalTemplate.create({
    data: {
      name: "La Plante Project Proposal",
      sections: DEFAULT_SECTIONS,
      isDefault: true,
      organizationId,
    },
  });
}
```

**Step 2: Commit**

```bash
git add prisma/seeds/
git commit -m "feat: add default proposal template seed with DOCX content"
```

---

### Task 3: Proposal Templates tRPC Router

**Files:**
- Create: `src/server/routers/proposal-templates.ts`
- Modify: `src/server/routers/_app.ts`

**Step 1: Write the failing test**

Create `src/test/proposal-templates-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { proposalSectionsSchema, validateSections } from "../server/routers/proposal-templates-helpers";

describe("proposalSectionsSchema", () => {
  it("accepts valid sections array", () => {
    const valid = [
      { key: "executive_summary", title: "Executive Summary", content: "Some content" },
      { key: "budget", title: "Budget", content: null },
    ];
    expect(() => proposalSectionsSchema.parse(valid)).not.toThrow();
  });

  it("rejects sections without key", () => {
    const invalid = [{ title: "No Key", content: "text" }];
    expect(() => proposalSectionsSchema.parse(invalid)).toThrow();
  });

  it("rejects empty array", () => {
    const invalid: unknown[] = [];
    expect(() => proposalSectionsSchema.parse(invalid)).toThrow();
  });
});

describe("validateSections", () => {
  it("returns true for valid default section keys", () => {
    const sections = [
      { key: "executive_summary", title: "Executive Summary", content: "text" },
      { key: "budget", title: "Budget", content: null },
    ];
    expect(validateSections(sections)).toBe(true);
  });

  it("allows custom section keys", () => {
    const sections = [
      { key: "custom_section", title: "Custom", content: "text" },
    ];
    expect(validateSections(sections)).toBe(true);
  });

  it("rejects duplicate keys", () => {
    const sections = [
      { key: "executive_summary", title: "Exec 1", content: "a" },
      { key: "executive_summary", title: "Exec 2", content: "b" },
    ];
    expect(validateSections(sections)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/proposal-templates-helpers.test.ts
```

Expected: FAIL — module not found.

**Step 3: Create helpers file**

Create `src/server/routers/proposal-templates-helpers.ts`:

```typescript
import { z } from "zod";

export const proposalSectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  content: z.string().nullable(),
});

export const proposalSectionsSchema = z.array(proposalSectionSchema).min(1);

type ProposalSection = z.infer<typeof proposalSectionSchema>;

export function validateSections(sections: ProposalSection[]): boolean {
  const keys = sections.map((s) => s.key);
  return new Set(keys).size === keys.length;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/test/proposal-templates-helpers.test.ts
```

Expected: PASS (all 5 tests)

**Step 5: Create the router**

Create `src/server/routers/proposal-templates.ts`:

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { proposalSectionsSchema, validateSections } from "./proposal-templates-helpers";

export const proposalTemplatesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.proposalTemplate.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { createdAt: "desc" },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.db.proposalTemplate.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      return template;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      sections: proposalSectionsSchema,
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!validateSections(input.sections as any)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Duplicate section keys" });
      }

      if (input.isDefault) {
        await ctx.db.proposalTemplate.updateMany({
          where: { organizationId: ctx.orgId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return ctx.db.proposalTemplate.create({
        data: {
          name: input.name,
          sections: input.sections,
          isDefault: input.isDefault ?? false,
          organizationId: ctx.orgId,
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      sections: proposalSectionsSchema.optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalTemplate.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.sections && !validateSections(input.sections as any)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Duplicate section keys" });
      }

      if (input.isDefault) {
        await ctx.db.proposalTemplate.updateMany({
          where: { organizationId: ctx.orgId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return ctx.db.proposalTemplate.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.sections !== undefined && { sections: input.sections }),
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalTemplate.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.proposalTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

**Step 6: Register the router in `_app.ts`**

Add to imports in `src/server/routers/_app.ts`:

```typescript
import { proposalTemplatesRouter } from "./proposal-templates";
```

Add to the router object:

```typescript
proposalTemplates: proposalTemplatesRouter,
```

**Step 7: Commit**

```bash
git add src/server/routers/proposal-templates.ts src/server/routers/proposal-templates-helpers.ts src/test/proposal-templates-helpers.test.ts src/server/routers/_app.ts
git commit -m "feat: add proposalTemplates tRPC router with validation helpers"
```

---

### Task 4: Proposals tRPC Router

**Files:**
- Create: `src/server/routers/proposals.ts`
- Modify: `src/server/routers/_app.ts`

**Step 1: Write the failing test**

Create `src/test/proposals-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { substituteVariables, SUPPORTED_VARIABLES } from "../server/routers/proposals-helpers";

describe("substituteVariables", () => {
  it("replaces {{client_name}} with actual client name", () => {
    const result = substituteVariables("Hello {{client_name}}", {
      client_name: "Acme Corp",
    });
    expect(result).toBe("Hello Acme Corp");
  });

  it("replaces multiple variables in one string", () => {
    const result = substituteVariables(
      "Project for {{client_name}} at {{client_url}}",
      { client_name: "Acme Corp", client_url: "acme.com" }
    );
    expect(result).toBe("Project for Acme Corp at acme.com");
  });

  it("leaves unknown variables as-is", () => {
    const result = substituteVariables("Hello {{unknown_var}}", {});
    expect(result).toBe("Hello {{unknown_var}}");
  });

  it("handles null content by returning null", () => {
    const result = substituteVariables(null, { client_name: "Acme" });
    expect(result).toBeNull();
  });

  it("replaces same variable multiple times", () => {
    const result = substituteVariables(
      "{{client_name}} agrees. Signed: {{client_name}}",
      { client_name: "Acme" }
    );
    expect(result).toBe("Acme agrees. Signed: Acme");
  });
});

describe("SUPPORTED_VARIABLES", () => {
  it("includes expected variable names", () => {
    expect(SUPPORTED_VARIABLES).toContain("client_name");
    expect(SUPPORTED_VARIABLES).toContain("client_url");
    expect(SUPPORTED_VARIABLES).toContain("date");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/proposals-helpers.test.ts
```

Expected: FAIL

**Step 3: Create helpers file**

Create `src/server/routers/proposals-helpers.ts`:

```typescript
export const SUPPORTED_VARIABLES = [
  "client_name",
  "client_url",
  "client_email",
  "date",
  "project_type",
  "platform",
  "platform_description",
  "project_goals",
  "highlight_1",
  "highlight_2",
  "highlight_3",
  "highlight_4",
  "highlight_5",
  "current_state_assessment",
  "design_strategy_description",
  "development_implementation_description",
  "development_tools",
  "analytics_tools",
] as const;

export function substituteVariables(
  content: string | null,
  variables: Record<string, string>
): string | null {
  if (content === null) return null;

  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/test/proposals-helpers.test.ts
```

Expected: PASS (all 6 tests)

**Step 5: Create the proposals router**

Create `src/server/routers/proposals.ts`:

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { proposalSectionsSchema } from "./proposal-templates-helpers";

export const proposalsRouter = router({
  get: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const proposal = await ctx.db.proposalContent.findFirst({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
        include: { template: { select: { id: true, name: true } } },
      });
      return proposal;
    }),

  create: protectedProcedure
    .input(z.object({
      invoiceId: z.string(),
      templateId: z.string().optional(),
      sections: proposalSectionsSchema.optional(),
      version: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the invoice is an ESTIMATE owned by this org
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId, type: "ESTIMATE" },
      });
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Estimate not found" });
      }

      // Check no existing proposal
      const existing = await ctx.db.proposalContent.findFirst({
        where: { invoiceId: input.invoiceId },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Proposal already exists for this estimate" });
      }

      // If templateId provided, load template sections as defaults
      let sections = input.sections;
      if (!sections && input.templateId) {
        const template = await ctx.db.proposalTemplate.findFirst({
          where: { id: input.templateId, organizationId: ctx.orgId },
        });
        if (!template) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
        }
        sections = template.sections as any;
      }

      // If still no sections, try org default template
      if (!sections) {
        const defaultTemplate = await ctx.db.proposalTemplate.findFirst({
          where: { organizationId: ctx.orgId, isDefault: true },
        });
        if (defaultTemplate) {
          sections = defaultTemplate.sections as any;
        }
      }

      if (!sections) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No sections provided and no default template found" });
      }

      return ctx.db.proposalContent.create({
        data: {
          invoiceId: input.invoiceId,
          organizationId: ctx.orgId,
          templateId: input.templateId ?? null,
          sections,
          version: input.version ?? "1.0",
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({
      invoiceId: z.string(),
      sections: proposalSectionsSchema.optional(),
      version: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalContent.findFirst({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.proposalContent.update({
        where: { id: existing.id },
        data: {
          ...(input.sections !== undefined && { sections: input.sections }),
          ...(input.version !== undefined && { version: input.version }),
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalContent.findFirst({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.proposalContent.delete({ where: { id: existing.id } });
      return { success: true };
    }),
});
```

**Step 6: Register in `_app.ts`**

Add import and register:

```typescript
import { proposalsRouter } from "./proposals";
// ...
proposals: proposalsRouter,
```

**Step 7: Commit**

```bash
git add src/server/routers/proposals.ts src/server/routers/proposals-helpers.ts src/test/proposals-helpers.test.ts src/server/routers/_app.ts
git commit -m "feat: add proposals tRPC router with variable substitution"
```

---

### Task 5: Proposal PDF Generator

**Files:**
- Create: `src/server/services/proposal-pdf.tsx`
- Modify: `src/server/services/invoice-pdf.tsx` (extract shared helpers)

**Step 1: Write the failing test for markdown-to-react-pdf**

Create `src/test/proposal-pdf-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseMarkdownSections, extractHeadings } from "../server/services/proposal-pdf-helpers";

describe("parseMarkdownSections", () => {
  it("splits content by h2 headings", () => {
    const md = "## Overview\nSome text\n## Goals\nMore text";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("Overview");
    expect(sections[0].body).toContain("Some text");
    expect(sections[1].heading).toBe("Goals");
  });

  it("handles content before first heading", () => {
    const md = "Intro text\n## Section One\nBody";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBeNull();
    expect(sections[0].body).toContain("Intro text");
  });

  it("handles h3 headings within sections", () => {
    const md = "## Main\nText\n### Sub\nMore text";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toContain("### Sub");
  });
});

describe("extractHeadings", () => {
  it("extracts all headings from markdown content", () => {
    const md = "## First\ntext\n## Second\nmore\n### Third\ndeep";
    const headings = extractHeadings(md);
    expect(headings).toEqual([
      { level: 2, text: "First" },
      { level: 2, text: "Second" },
      { level: 3, text: "Third" },
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/proposal-pdf-helpers.test.ts
```

Expected: FAIL

**Step 3: Create helpers**

Create `src/server/services/proposal-pdf-helpers.ts`:

```typescript
export type MarkdownSection = {
  heading: string | null;
  body: string;
};

export type Heading = {
  level: number;
  text: string;
};

export function parseMarkdownSections(content: string): MarkdownSection[] {
  const lines = content.split("\n");
  const sections: MarkdownSection[] = [];
  let currentHeading: string | null = null;
  let currentBody: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      if (currentBody.length > 0 || currentHeading !== null) {
        sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
      }
      currentHeading = h2Match[1];
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  if (currentBody.length > 0 || currentHeading !== null) {
    sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
  }

  return sections;
}

export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^(#{2,3}) (.+)$/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2] });
    }
  }
  return headings;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/test/proposal-pdf-helpers.test.ts
```

Expected: PASS

**Step 5: Extract shared helpers from invoice-pdf.tsx**

Move `formatAmount` and `formatDate` from `src/server/services/invoice-pdf.tsx` into a new shared file `src/server/services/pdf-shared.ts`:

```typescript
export function formatAmount(
  amount: number | string | { toNumber(): number },
  symbol: string,
  symbolPosition: string
): string {
  const num =
    typeof amount === "object" && "toNumber" in amount
      ? amount.toNumber()
      : Number(amount);
  const formatted = num.toFixed(2);
  return symbolPosition === "before" ? `${symbol}${formatted}` : `${formatted}${symbol}`;
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
```

Update `invoice-pdf.tsx` to import from the shared file instead of defining locally.

**Step 6: Create the proposal PDF generator**

Create `src/server/services/proposal-pdf.tsx`:

```typescript
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { FullInvoice } from "./invoice-pdf";
import type { ProposalContent } from "@/generated/prisma";
import { formatAmount, formatDate } from "./pdf-shared";
import { parseMarkdownSections } from "./proposal-pdf-helpers";
import { substituteVariables } from "../routers/proposals-helpers";

type ProposalSection = { key: string; title: string; content: string | null };

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 48,
    color: "#1a1a1a",
  },
  coverPage: {
    justifyContent: "center",
    alignItems: "center",
    padding: 48,
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 40,
  },
  coverClient: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  coverMeta: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
    paddingBottom: 6,
    borderBottom: "2 solid #e5e7eb",
  },
  h2: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 6,
  },
  h3: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 6,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 3,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 10,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.5,
  },
  // Reuse invoice table styles
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    padding: "6 8",
    borderRadius: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    padding: "5 8",
    borderBottom: "1 solid #f3f4f6",
  },
  colName: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colRate: { flex: 1.5, textAlign: "right" },
  colAmount: { flex: 1.5, textAlign: "right" },
  totalsSection: { marginTop: 16, alignItems: "flex-end" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 3,
    minWidth: 200,
  },
  totalsLabel: { flex: 1, textAlign: "right", paddingRight: 16, color: "#6b7280" },
  totalsValue: { width: 90, textAlign: "right" },
  totalFinal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 6,
    paddingTop: 6,
    borderTop: "1.5 solid #1a1a1a",
    minWidth: 200,
  },
  totalFinalLabel: {
    flex: 1,
    textAlign: "right",
    paddingRight: 16,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  totalFinalValue: {
    width: 90,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
});

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      elements.push(<Text key={i} style={styles.h3}>{h3Match[1]}</Text>);
      continue;
    }

    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      elements.push(<Text key={i} style={styles.h2}>{h2Match[1]}</Text>);
      continue;
    }

    const bulletMatch = line.match(/^[-*] (.+)$/);
    if (bulletMatch) {
      elements.push(
        <View key={i} style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{renderInlineMarkdown(bulletMatch[1])}</Text>
        </View>
      );
      continue;
    }

    if (line.trim() === "") continue;

    elements.push(
      <Text key={i} style={styles.paragraph}>{renderInlineMarkdown(line)}</Text>
    );
  }

  return <View>{elements}</View>;
}

function renderInlineMarkdown(text: string): string {
  // Strip bold/italic markers for PDF (react-pdf doesn't support mixed inline styles easily)
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
}

function BudgetSection({ invoice, fmt }: { invoice: FullInvoice; fmt: (n: number | string | { toNumber(): number }) => string }) {
  return (
    <View>
      <View style={styles.tableHeader}>
        <Text style={[styles.colName, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Description</Text>
        <Text style={[styles.colQty, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Qty</Text>
        <Text style={[styles.colRate, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Rate</Text>
        <Text style={[styles.colAmount, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Amount</Text>
      </View>
      {invoice.lines.sort((a, b) => a.sort - b.sort).map((line) => (
        <View key={line.id} style={styles.tableRow}>
          <View style={styles.colName}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{line.name}</Text>
            {line.description ? (
              <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{line.description}</Text>
            ) : null}
          </View>
          <Text style={styles.colQty}>{Number(line.qty).toFixed(2)}</Text>
          <Text style={styles.colRate}>{fmt(line.rate)}</Text>
          <Text style={styles.colAmount}>{fmt(line.subtotal)}</Text>
        </View>
      ))}
      <View style={styles.totalsSection}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{fmt(invoice.subtotal)}</Text>
        </View>
        {Number(invoice.discountTotal) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Discount</Text>
            <Text style={styles.totalsValue}>-{fmt(invoice.discountTotal)}</Text>
          </View>
        )}
        {Number(invoice.taxTotal) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>{fmt(invoice.taxTotal)}</Text>
          </View>
        )}
        <View style={styles.totalFinal}>
          <Text style={styles.totalFinalLabel}>Total</Text>
          <Text style={styles.totalFinalValue}>{fmt(invoice.total)}</Text>
        </View>
      </View>
    </View>
  );
}

function ProposalDocument({
  invoice,
  proposal,
}: {
  invoice: FullInvoice;
  proposal: ProposalContent;
}) {
  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmt = (n: number | string | { toNumber(): number }) => formatAmount(n, sym, symPos);
  const brandColor = invoice.organization.brandColor ?? "#2563eb";

  const variables: Record<string, string> = {
    client_name: invoice.client.name,
    client_url: invoice.client.website ?? "",
    client_email: invoice.client.email ?? "",
    date: formatDate(invoice.date),
  };

  const sections = proposal.sections as ProposalSection[];

  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" style={[styles.page, styles.coverPage]}>
        {invoice.organization.logoUrl ? (
          <Image
            src={invoice.organization.logoUrl}
            style={{ height: 60, maxWidth: 200, marginBottom: 24, objectFit: "contain" }}
          />
        ) : null}
        <Text style={[styles.coverTitle, { color: brandColor }]}>PROJECT PROPOSAL</Text>
        <Text style={styles.coverSubtitle}>{invoice.organization.name}</Text>
        <Text style={styles.coverClient}>{invoice.client.name}</Text>
        <Text style={styles.coverMeta}>Version {proposal.version}</Text>
        <Text style={styles.coverMeta}>{formatDate(invoice.date)}</Text>
      </Page>

      {/* Content Pages */}
      {sections.map((section) => (
        <Page key={section.key} size="A4" style={styles.page}>
          <Text style={[styles.sectionTitle, { borderBottomColor: brandColor }]}>
            {section.title}
          </Text>
          {section.key === "budget" ? (
            <BudgetSection invoice={invoice} fmt={fmt} />
          ) : section.content ? (
            <MarkdownContent
              content={substituteVariables(section.content, variables) ?? ""}
            />
          ) : null}
        </Page>
      ))}
    </Document>
  );
}

export async function generateProposalPDF(
  invoice: FullInvoice,
  proposal: ProposalContent
): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <ProposalDocument invoice={invoice} proposal={proposal} />
  );
  return Buffer.from(buffer);
}
```

**Step 6: Commit**

```bash
git add src/server/services/proposal-pdf.tsx src/server/services/proposal-pdf-helpers.ts src/server/services/pdf-shared.ts src/server/services/invoice-pdf.tsx src/test/proposal-pdf-helpers.test.ts
git commit -m "feat: add proposal PDF generator with markdown rendering and variable substitution"
```

---

### Task 6: Proposal PDF API Routes

**Files:**
- Create: `src/app/api/invoices/[id]/proposal-pdf/route.ts`
- Create: `src/app/api/portal/[token]/proposal-pdf/route.ts`

**Step 1: Create dashboard proposal PDF route**

Create `src/app/api/invoices/[id]/proposal-pdf/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { generateProposalPDF } from "@/server/services/proposal-pdf";
import type { FullInvoice } from "@/server/services/invoice-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = user.app_metadata?.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const invoice = await db.invoice.findFirst({
    where: { id, organizationId: orgId, type: "ESTIMATE" },
    include: {
      client: true,
      currency: true,
      organization: true,
      lines: { include: { taxes: { include: { tax: true } } } },
      payments: true,
      partialPayments: true,
    },
  }) as FullInvoice | null;

  if (!invoice) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const proposal = await db.proposalContent.findFirst({
    where: { invoiceId: id, organizationId: orgId },
  });

  if (!proposal) {
    return NextResponse.json({ error: "No proposal found for this estimate" }, { status: 404 });
  }

  const buffer = await generateProposalPDF(invoice, proposal);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="proposal-${invoice.number}.pdf"`,
    },
  });
}
```

**Step 2: Create portal proposal PDF route**

Create `src/app/api/portal/[token]/proposal-pdf/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateProposalPDF } from "@/server/services/proposal-pdf";
import type { FullInvoice } from "@/server/services/invoice-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invoice = await db.invoice.findFirst({
    where: { portalToken: token, type: "ESTIMATE" },
    include: {
      client: true,
      currency: true,
      organization: true,
      lines: { include: { taxes: { include: { tax: true } } } },
      payments: true,
      partialPayments: true,
    },
  }) as FullInvoice | null;

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const proposal = await db.proposalContent.findFirst({
    where: { invoiceId: invoice.id },
  });

  if (!proposal) {
    return NextResponse.json({ error: "No proposal" }, { status: 404 });
  }

  const buffer = await generateProposalPDF(invoice, proposal);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="proposal-${invoice.number}.pdf"`,
    },
  });
}
```

**Step 3: Commit**

```bash
git add src/app/api/invoices/[id]/proposal-pdf/ src/app/api/portal/[token]/proposal-pdf/
git commit -m "feat: add proposal PDF download endpoints for dashboard and portal"
```

---

### Task 7: Settings UI — Proposal Template Management

**Files:**
- Create: `src/app/(dashboard)/settings/proposals/page.tsx`
- Create: `src/components/settings/ProposalTemplateList.tsx`
- Create: `src/components/settings/ProposalTemplateForm.tsx`

**Step 1: Create the settings page**

Create `src/app/(dashboard)/settings/proposals/page.tsx`:

```typescript
import { api } from "@/lib/trpc/server";
import { ProposalTemplateList } from "@/components/settings/ProposalTemplateList";

export default async function ProposalTemplatesSettingsPage() {
  const templates = await api.proposalTemplates.list();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Proposal Templates</h1>
        <p className="text-muted-foreground">
          Manage reusable proposal templates for your estimates.
        </p>
      </div>
      <ProposalTemplateList initialTemplates={templates} />
    </div>
  );
}
```

**Step 2: Create the template list component**

Create `src/components/settings/ProposalTemplateList.tsx`:

```typescript
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ProposalTemplateForm } from "./ProposalTemplateForm";
import { Plus, Pencil, Trash2 } from "lucide-react";

type Template = {
  id: string;
  name: string;
  isDefault: boolean;
  sections: unknown;
  createdAt: Date;
};

export function ProposalTemplateList({ initialTemplates }: { initialTemplates: Template[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const utils = trpc.useUtils();
  const { data: templates } = trpc.proposalTemplates.list.useQuery(undefined, {
    initialData: initialTemplates,
  });

  const deleteMutation = trpc.proposalTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.proposalTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (creating || editing) {
    return (
      <ProposalTemplateForm
        templateId={editing ?? undefined}
        onDone={() => {
          setEditing(null);
          setCreating(false);
          utils.proposalTemplates.list.invalidate();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setCreating(true)}>
        <Plus className="mr-2 h-4 w-4" /> New Template
      </Button>

      {templates?.length === 0 && (
        <p className="text-muted-foreground text-sm">No templates yet. Create one to get started.</p>
      )}

      <div className="space-y-2">
        {templates?.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <span className="font-medium">{t.name}</span>
              {t.isDefault && <Badge variant="secondary">Default</Badge>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(t.id)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Delete this template?")) {
                    deleteMutation.mutate({ id: t.id });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Create the template form component**

Create `src/components/settings/ProposalTemplateForm.tsx`:

```typescript
"use client";

import { useState, useEffect, useTransition } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Section = { key: string; title: string; content: string | null };

const DEFAULT_SECTIONS: Section[] = [
  { key: "executive_summary", title: "Executive Summary", content: "" },
  { key: "developer_profile", title: "Developer Profile", content: "" },
  { key: "technologies", title: "Technologies & Approach", content: "" },
  { key: "budget", title: "Budget", content: null },
  { key: "production_process", title: "Production Process", content: "" },
  { key: "assumptions", title: "Details and Assumptions", content: "" },
  { key: "terms", title: "Terms of Agreement", content: "" },
];

export function ProposalTemplateForm({
  templateId,
  onDone,
}: {
  templateId?: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [isDefault, setIsDefault] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { data: template } = trpc.proposalTemplates.get.useQuery(
    { id: templateId! },
    { enabled: !!templateId }
  );

  useEffect(() => {
    if (template) {
      setName(template.name);
      setSections(template.sections as Section[]);
      setIsDefault(template.isDefault);
    }
  }, [template]);

  const createMutation = trpc.proposalTemplates.create.useMutation({
    onSuccess: () => { toast.success("Template created"); onDone(); },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.proposalTemplates.update.useMutation({
    onSuccess: () => { toast.success("Template updated"); onDone(); },
    onError: (err) => toast.error(err.message),
  });

  function updateSection(index: number, content: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, content } : s)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => {
      if (templateId) {
        updateMutation.mutate({ id: templateId, name, sections, isDefault });
      } else {
        createMutation.mutate({ name, sections, isDefault });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {templateId ? "Edit Template" : "New Template"}
        </h2>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Template Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Web Redesign Proposal"
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch id="isDefault" checked={isDefault} onCheckedChange={setIsDefault} />
        <Label htmlFor="isDefault">Set as default template</Label>
      </div>

      <div className="space-y-4">
        {sections.map((section, i) => (
          <div key={section.key} className="space-y-1">
            <Label>{section.title}</Label>
            {section.key === "budget" ? (
              <p className="text-sm text-muted-foreground">
                Auto-generated from estimate line items.
              </p>
            ) : (
              <Textarea
                rows={8}
                value={section.content ?? ""}
                onChange={(e) => updateSection(i, e.target.value)}
                placeholder={`Markdown content for ${section.title}...`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : templateId ? "Update Template" : "Create Template"}
        </Button>
      </div>
    </form>
  );
}
```

**Step 4: Add link to settings navigation**

In `src/app/(dashboard)/settings/page.tsx`, add a new navigation card for "Proposal Templates" pointing to `/settings/proposals` with a `FileText` icon and description "Manage reusable proposal templates for estimates".

**Step 5: Commit**

```bash
git add src/app/\(dashboard\)/settings/proposals/ src/components/settings/ProposalTemplateList.tsx src/components/settings/ProposalTemplateForm.tsx src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add proposal template management settings page"
```

---

### Task 8: Estimate Detail — Generate Proposal Button & Editor

**Files:**
- Create: `src/components/invoices/GenerateProposalButton.tsx`
- Create: `src/components/invoices/ProposalEditor.tsx`
- Modify: `src/app/(dashboard)/invoices/[id]/page.tsx`

**Step 1: Create the Generate Proposal button**

Create `src/components/invoices/GenerateProposalButton.tsx`:

```typescript
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText } from "lucide-react";

export function GenerateProposalButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");

  const { data: templates } = trpc.proposalTemplates.list.useQuery();
  const { data: existingProposal } = trpc.proposals.get.useQuery({ invoiceId });
  const utils = trpc.useUtils();

  const createMutation = trpc.proposals.create.useMutation({
    onSuccess: () => {
      toast.success("Proposal created");
      setOpen(false);
      utils.proposals.get.invalidate({ invoiceId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (existingProposal) {
    return null; // Proposal already exists, show editor instead
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="mr-2 h-4 w-4" />
          Generate Proposal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Proposal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.isDefault ? "(Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => createMutation.mutate({
              invoiceId,
              templateId: templateId || undefined,
            })}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Proposal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Create the Proposal Editor component**

Create `src/components/invoices/ProposalEditor.tsx`:

```typescript
"use client";

import { useState, useEffect, useTransition } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";

type Section = { key: string; title: string; content: string | null };

export function ProposalEditor({ invoiceId }: { invoiceId: string }) {
  const { data: proposal, isLoading } = trpc.proposals.get.useQuery({ invoiceId });
  const [sections, setSections] = useState<Section[]>([]);
  const [isPending, startTransition] = useTransition();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (proposal) {
      setSections(proposal.sections as Section[]);
    }
  }, [proposal]);

  const updateMutation = trpc.proposals.update.useMutation({
    onSuccess: () => toast.success("Proposal saved"),
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.proposals.delete.useMutation({
    onSuccess: () => {
      toast.success("Proposal removed");
      utils.proposals.get.invalidate({ invoiceId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return null;
  if (!proposal) return null;

  function updateSection(index: number, content: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, content } : s)));
  }

  function handleSave() {
    startTransition(() => {
      updateMutation.mutate({ invoiceId, sections });
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Proposal</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/invoices/${invoiceId}/proposal-pdf`} target="_blank">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Remove this proposal?")) {
                deleteMutation.mutate({ invoiceId });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {sections.map((section, i) => (
        <div key={section.key} className="space-y-1">
          <Label>{section.title}</Label>
          {section.key === "budget" ? (
            <p className="text-sm text-muted-foreground">
              Auto-generated from estimate line items.
            </p>
          ) : (
            <Textarea
              rows={6}
              value={section.content ?? ""}
              onChange={(e) => updateSection(i, e.target.value)}
            />
          )}
        </div>
      ))}

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving..." : "Save Proposal"}
      </Button>
    </div>
  );
}
```

**Step 3: Add to estimate detail page**

In `src/app/(dashboard)/invoices/[id]/page.tsx`, add the proposal components for ESTIMATE-type invoices:

- Import `GenerateProposalButton` and `ProposalEditor`
- After the existing action buttons section, conditionally render for ESTIMATE type:

```tsx
{invoice.type === "ESTIMATE" && (
  <div className="mt-6">
    <GenerateProposalButton invoiceId={invoice.id} />
    <ProposalEditor invoiceId={invoice.id} />
  </div>
)}
```

**Step 4: Commit**

```bash
git add src/components/invoices/GenerateProposalButton.tsx src/components/invoices/ProposalEditor.tsx src/app/\(dashboard\)/invoices/\[id\]/page.tsx
git commit -m "feat: add proposal generation and editing UI on estimate detail page"
```

---

### Task 9: Portal Proposal View

**Files:**
- Modify: Portal estimate page to show "View Proposal" button when proposal exists

**Step 1: Add proposal PDF link to portal**

In the portal estimate view (where EstimateActions component lives), add a conditional link:

```tsx
{/* Add alongside existing estimate actions */}
<a
  href={`/api/portal/${token}/proposal-pdf`}
  target="_blank"
  className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
>
  View Full Proposal
</a>
```

This should be conditionally rendered only when the estimate has a proposal attached. The portal page should query whether a proposal exists for the invoice.

**Step 2: Commit**

```bash
git add src/components/portal/ src/app/api/portal/
git commit -m "feat: add proposal PDF link to client portal estimate view"
```

---

### Task 10: Include proposalContent in Invoice Queries

**Files:**
- Modify: `src/server/routers/invoices.ts`

**Step 1: Add proposalContent include to invoice.get**

In the `invoices.get` procedure, add `proposalContent: true` to the Prisma `include` object so the frontend knows whether a proposal exists without a separate query.

**Step 2: Commit**

```bash
git add src/server/routers/invoices.ts
git commit -m "feat: include proposalContent in invoice.get response"
```

---

### Task 11: Final Integration Test

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass including new helpers tests.

**Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 3: Manual smoke test**

1. Go to Settings → Proposal Templates → Create a template
2. Create an estimate for a client
3. On the estimate detail, click "Generate Proposal"
4. Edit proposal sections
5. Download proposal PDF
6. Check portal link for proposal PDF

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration issues from smoke testing"
```
