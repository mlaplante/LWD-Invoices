# Phase 6: Service Function Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add comprehensive tests for critical service functions (audit, notifications, invoice-numbering, stripe, gateway-config, storage) to reach 50%+ coverage.

**Architecture:** Create isolated unit tests for service layer functions using established mock patterns. Test business logic, error handling, and database interactions.

**Tech Stack:** Vitest, Prisma Client (mocked), TypeScript, Stripe SDK

---

## Task 1: Audit Service Tests

**Files:**
- Create: `src/test/services-audit.test.ts`

**Implementation:**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { logAudit } from "@/server/services/audit";
import { db } from "@/server/db";
import { AuditAction } from "@/generated/prisma";

vi.mock("@/server/db", () => ({
  db: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

describe("Audit Service", () => {
  describe("logAudit", () => {
    it("creates audit log with all fields", async () => {
      const mockAuditLog = {
        id: "audit_1",
        action: AuditAction.CREATED,
        entityType: "invoice",
        entityId: "inv_123",
        entityLabel: "INV-2026-0001",
        userId: "user_1",
        userLabel: "John Doe",
        organizationId: "org_123",
        diff: { amount: 1000 },
        createdAt: new Date(),
      };

      (db.auditLog.create as any).mockResolvedValue(mockAuditLog);

      const input = {
        action: AuditAction.CREATED,
        entityType: "invoice",
        entityId: "inv_123",
        entityLabel: "INV-2026-0001",
        userId: "user_1",
        userLabel: "John Doe",
        organizationId: "org_123",
        diff: { amount: 1000 },
      };

      await logAudit(input);

      expect(db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: AuditAction.CREATED,
            entityType: "invoice",
            entityId: "inv_123",
          }),
        })
      );
    });

    it("handles optional fields", async () => {
      (db.auditLog.create as any).mockResolvedValue({});

      await logAudit({
        action: AuditAction.DELETED,
        entityType: "client",
        entityId: "c_1",
        organizationId: "org_123",
      });

      expect(db.auditLog.create).toHaveBeenCalled();
    });

    it("converts diff to InputJsonValue correctly", async () => {
      (db.auditLog.create as any).mockResolvedValue({});

      const diff = { field1: "old_value", field2: { nested: true } };

      await logAudit({
        action: AuditAction.UPDATED,
        entityType: "invoice",
        entityId: "inv_123",
        organizationId: "org_123",
        diff,
      });

      expect(db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            diff: diff as any,
          }),
        })
      );
    });

    it("handles undefined diff", async () => {
      (db.auditLog.create as any).mockResolvedValue({});

      await logAudit({
        action: AuditAction.VIEWED,
        entityType: "report",
        entityId: "r_1",
        organizationId: "org_123",
      });

      expect(db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            diff: undefined,
          }),
        })
      );
    });

    it("logs all AuditAction types", async () => {
      (db.auditLog.create as any).mockResolvedValue({});

      const actions = Object.values(AuditAction);

      for (const action of actions) {
        await logAudit({
          action,
          entityType: "test",
          entityId: "t_1",
          organizationId: "org_123",
        });
      }

      expect(db.auditLog.create).toHaveBeenCalledTimes(actions.length);
    });
  });
});
```

**Tests:** 5 tests
**Commit:** "test: add audit service tests"

---

## Task 2: Invoice Numbering Service Tests

**Files:**
- Create: `src/test/services-invoice-numbering.test.ts`

**Implementation:**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateInvoiceNumber } from "@/server/services/invoice-numbering";

describe("Invoice Numbering Service", () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      organization: {
        update: vi.fn(),
      },
    };
  });

  describe("generateInvoiceNumber", () => {
    it("generates invoice number with correct format", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "INV",
        invoiceNextNumber: 1,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`INV-${year}-0001`);
    });

    it("increments invoice number atomically", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "INV",
        invoiceNextNumber: 42,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`INV-${year}-0042`);
      expect(mockDb.organization.update).toHaveBeenCalledWith({
        where: { id: "org_123" },
        data: { invoiceNextNumber: { increment: 1 } },
        select: { invoicePrefix: true, invoiceNextNumber: true },
      });
    });

    it("pads invoice numbers to 4 digits", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`INV-${year}-0100`);
    });

    it("handles large invoice numbers", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "INV",
        invoiceNextNumber: 9999,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`INV-${year}-9999`);
    });

    it("uses organization's custom prefix", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "ACME",
        invoiceNextNumber: 1,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`ACME-${year}-0001`);
    });

    it("generates sequential numbers", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update
        .mockResolvedValueOnce({
          invoicePrefix: "INV",
          invoiceNextNumber: 1,
        })
        .mockResolvedValueOnce({
          invoicePrefix: "INV",
          invoiceNextNumber: 2,
        })
        .mockResolvedValueOnce({
          invoicePrefix: "INV",
          invoiceNextNumber: 3,
        });

      const num1 = await generateInvoiceNumber(mockDb, "org_123");
      const num2 = await generateInvoiceNumber(mockDb, "org_123");
      const num3 = await generateInvoiceNumber(mockDb, "org_123");

      expect(num1).toBe(`INV-${year}-0001`);
      expect(num2).toBe(`INV-${year}-0002`);
      expect(num3).toBe(`INV-${year}-0003`);
    });
  });
});
```

**Tests:** 7 tests
**Commit:** "test: add invoice numbering service tests"

---

## Task 3: Notifications Service Tests

**Files:**
- Create: `src/test/services-notifications.test.ts`

**Implementation:**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createNotification, notifyOrgAdmins } from "@/server/services/notifications";
import { db } from "@/server/db";
import { NotificationType } from "@/generated/prisma";

vi.mock("@/server/db", () => ({
  db: {
    notification: { create: vi.fn() },
    organization: { findFirst: vi.fn() },
  },
}));

describe("Notifications Service", () => {
  describe("createNotification", () => {
    it("creates notification with all fields", async () => {
      const mockNotification = {
        id: "notif_1",
        type: NotificationType.INVOICE_SENT,
        title: "Invoice Sent",
        body: "Your invoice has been sent",
        link: "/invoices/inv_1",
        userId: "user_1",
        organizationId: "org_123",
      };

      (db.notification.create as any).mockResolvedValue(mockNotification);

      const result = await createNotification({
        type: NotificationType.INVOICE_SENT,
        title: "Invoice Sent",
        body: "Your invoice has been sent",
        link: "/invoices/inv_1",
        userId: "user_1",
        organizationId: "org_123",
      });

      expect(result.id).toBe("notif_1");
      expect(db.notification.create).toHaveBeenCalled();
    });

    it("handles notifications without links", async () => {
      (db.notification.create as any).mockResolvedValue({});

      await createNotification({
        type: NotificationType.PAYMENT_RECEIVED,
        title: "Payment Received",
        body: "You received a payment",
        userId: "user_1",
        organizationId: "org_123",
      });

      expect(db.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ link: expect.anything() }),
        })
      );
    });
  });

  describe("notifyOrgAdmins", () => {
    it("notifies all admin users in organization", async () => {
      const mockOrg = {
        id: "org_123",
        users: [
          { id: "u_1", supabaseId: "sub_1", role: "ADMIN" },
          { id: "u_2", supabaseId: "sub_2", role: "ADMIN" },
        ],
      };

      (db.organization.findFirst as any).mockResolvedValue(mockOrg);
      (db.notification.create as any).mockResolvedValue({});

      await notifyOrgAdmins("org_123", {
        type: NotificationType.INVOICE_OVERDUE,
        title: "Invoice Overdue",
        body: "An invoice is overdue",
      });

      expect(db.notification.create).toHaveBeenCalledTimes(2);
      expect(db.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "sub_1",
            organizationId: "org_123",
          }),
        })
      );
    });

    it("returns early if organization not found", async () => {
      (db.organization.findFirst as any).mockResolvedValue(null);

      await notifyOrgAdmins("nonexistent", {
        type: NotificationType.INVOICE_SENT,
        title: "Test",
        body: "Test",
      });

      expect(db.notification.create).not.toHaveBeenCalled();
    });

    it("uses supabaseId if available, falls back to id", async () => {
      const mockOrg = {
        id: "org_123",
        users: [
          { id: "u_1", supabaseId: "sub_1", role: "ADMIN" }, // Has supabaseId
          { id: "u_2", supabaseId: null, role: "ADMIN" }, // Fallback to id
        ],
      };

      (db.organization.findFirst as any).mockResolvedValue(mockOrg);
      (db.notification.create as any).mockResolvedValue({});

      await notifyOrgAdmins("org_123", {
        type: NotificationType.INVOICE_PAID,
        title: "Paid",
        body: "Invoice paid",
      });

      const calls = (db.notification.create as any).mock.calls;
      expect(calls[0][0].data.userId).toBe("sub_1");
      expect(calls[1][0].data.userId).toBe("u_2");
    });

    it("handles organizations with no admins", async () => {
      const mockOrg = {
        id: "org_123",
        users: [],
      };

      (db.organization.findFirst as any).mockResolvedValue(mockOrg);

      await notifyOrgAdmins("org_123", {
        type: NotificationType.INVOICE_SENT,
        title: "Test",
        body: "Test",
      });

      expect(db.notification.create).not.toHaveBeenCalled();
    });
  });
});
```

**Tests:** 6 tests
**Commit:** "test: add notifications service tests"

---

## Task 4: Stripe Service Tests

**Files:**
- Create: `src/test/services-stripe.test.ts`

**Implementation:**

Create tests for Stripe integration including:
- Payment intent creation
- Webhook event verification
- Error handling (invalid keys, failed payments, network errors)
- Retry logic for transient failures

**Tests:** 8 tests
**Commit:** "test: add stripe service tests"

---

## Task 5: Gateway Config Service Tests

**Files:**
- Create: `src/test/services-gateway-config.test.ts`

**Implementation:**

Create tests for gateway configuration including:
- Config encryption/decryption
- Stripe config parsing
- PayPal config parsing
- Manual payment config
- Invalid config handling

**Tests:** 6 tests
**Commit:** "test: add gateway config service tests"

---

## Task 6: Storage Service Tests

**Files:**
- Create: `src/test/services-storage.test.ts`

**Implementation:**

Create tests for file storage including:
- Upload success/failure
- File size validation
- Malware detection integration
- Cleanup and deletion
- URL generation

**Tests:** 6 tests
**Commit:** "test: add storage service tests"

---

## Task 7: Final Coverage Verification

**Files:**
- All new service test files

**Steps:**

1. Run complete test suite:
   ```bash
   npm run test
   ```
   Expected: 570+ tests passing

2. Generate coverage report:
   ```bash
   npm run test -- --coverage
   ```
   Expected: Coverage improved to 30-35%+

3. Verify metrics:
   - Total tests: 570+ (from 512)
   - Test files: 37 (from 31)
   - All passing

4. Final commit:
   ```bash
   git commit -m "test: service function testing complete - 30+ new tests"
   ```

---

## Summary

**What Gets Built:**
- 6 new service function test files
- 30+ comprehensive service tests
- Business logic protection for critical functions
- Error handling and edge case coverage

**Expected Coverage:**
- Total tests: 570+ (↑58 from 512)
- Test files: 37 (↑6 new)
- Coverage: 30-35%+ toward 50% goal

**Service Functions Tested:**
- Audit logging (all action types)
- Invoice number generation (formatting, sequencing)
- Notifications (creation, bulk sending)
- Stripe integration (payment processing)
- Gateway configuration (encryption, parsing)
- Storage operations (uploads, validation)

**Time Estimate:** 4-5 hours for full implementation
