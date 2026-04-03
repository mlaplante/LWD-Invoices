import { describe, it, expect, beforeEach, vi } from "vitest";
import { attachmentsRouter } from "@/server/routers/attachments";
import { commentsRouter } from "@/server/routers/comments";
import { discussionsRouter } from "@/server/routers/discussions";
import { expenseCategoriesRouter } from "@/server/routers/expenseCategories";
import { expenseSuppliersRouter } from "@/server/routers/expenseSuppliers";
import { milestonesRouter } from "@/server/routers/milestones";
import { notificationsRouter } from "@/server/routers/notifications";
import { portalRouter } from "@/server/routers/portal";
import { projectTemplatesRouter } from "@/server/routers/projectTemplates";
import { taskStatusesRouter } from "@/server/routers/taskStatuses";
import { taxesRouter } from "@/server/routers/taxes";
import { ticketsRouter } from "@/server/routers/tickets";
import { timersRouter } from "@/server/routers/timers";
import { createMockContext } from "./mocks/trpc-context";
import { AttachmentContext, TicketStatus, TicketPriority } from "@/generated/prisma";

// ============================================================================
// ATTACHMENTS ROUTER TESTS
// ============================================================================

describe("Attachments Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = attachmentsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns attachments for context and contextId", async () => {
      const mockAttachments = [
        {
          id: "att_1",
          organizationId: "test-org-123",
          context: AttachmentContext.INVOICE,
          contextId: "inv_1",
          fileName: "invoice.pdf",
          url: "https://example.com/invoice.pdf",
          createdAt: new Date(),
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.attachment.findMany.mockResolvedValue(mockAttachments);

      const result = await caller.list({
        context: AttachmentContext.INVOICE,
        contextId: "inv_1",
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.fileName).toBe("invoice.pdf");
    });

    it("filters by context and contextId", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.attachment.findMany.mockResolvedValue([]);

      await caller.list({
        context: AttachmentContext.INVOICE,
        contextId: "inv_123",
      });

      expect(ctx.db.attachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            context: AttachmentContext.INVOICE,
            contextId: "inv_123",
          }),
        })
      );
    });

    it("sorts by createdAt descending", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.attachment.findMany.mockResolvedValue([]);

      await caller.list({
        context: AttachmentContext.INVOICE,
        contextId: "inv_1",
      });

      expect(ctx.db.attachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        })
      );
    });

    it("throws NOT_FOUND when organization does not exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      await expect(
        caller.list({
          context: AttachmentContext.INVOICE,
          contextId: "inv_1",
        })
      ).rejects.toThrow("NOT_FOUND");
    });
  });
});

// ============================================================================
// COMMENTS ROUTER TESTS
// ============================================================================

describe("Comments Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = commentsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns comments for invoice", async () => {
      const mockComments = [
        {
          id: "comment_1",
          invoiceId: "inv_1",
          organizationId: "test-org-123",
          body: "Great invoice",
          isPrivate: false,
          createdAt: new Date(),
        },
      ];

      ctx.db.invoice.findUnique.mockResolvedValue({ id: "inv_1" });
      ctx.db.comment.findMany.mockResolvedValue(mockComments);

      const result = await caller.list({ invoiceId: "inv_1" });

      expect(result).toHaveLength(1);
      expect(result[0]?.body).toBe("Great invoice");
    });

    it("verifies invoice belongs to org", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      await expect(caller.list({ invoiceId: "inv_1" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });

    it("orders comments by createdAt ascending", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({ id: "inv_1" });
      ctx.db.comment.findMany.mockResolvedValue([]);

      await caller.list({ invoiceId: "inv_1" });

      expect(ctx.db.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "asc" },
        })
      );
    });
  });

  describe("add", () => {
    it("creates a comment on invoice", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({ id: "inv_1" });
      ctx.db.comment.create.mockResolvedValue({
        id: "comment_1",
        body: "Test comment",
      });

      const result = await caller.add({
        invoiceId: "inv_1",
        body: "Test comment",
      });

      expect(result.body).toBe("Test comment");
      expect(ctx.db.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceId: "inv_1",
            body: "Test comment",
            organizationId: "test-org-123",
          }),
        })
      );
    });

    it("throws NOT_FOUND for non-existent invoice", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      await expect(
        caller.add({ invoiceId: "inv_1", body: "Test comment" })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("allows isPrivate flag", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({ id: "inv_1" });
      ctx.db.comment.create.mockResolvedValue({ id: "comment_1" });

      await caller.add({
        invoiceId: "inv_1",
        body: "Private comment",
        isPrivate: true,
      });

      expect(ctx.db.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPrivate: true,
          }),
        })
      );
    });
  });

  describe("delete", () => {
    it("deletes comment by author", async () => {
      ctx.db.comment.findUnique.mockResolvedValue({
        id: "comment_1",
        authorUserId: "test-user-456",
      });
      ctx.db.comment.delete.mockResolvedValue({ id: "comment_1" });

      const result = await caller.delete({ id: "comment_1" });

      expect(result.id).toBe("comment_1");
    });

    it("throws NOT_FOUND for non-existent comment", async () => {
      ctx.db.comment.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: "comment_1" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });

    it("throws FORBIDDEN if not comment author", async () => {
      ctx.db.comment.findUnique.mockResolvedValue({
        id: "comment_1",
        authorUserId: "different-user",
      });

      await expect(caller.delete({ id: "comment_1" })).rejects.toThrow(
        "FORBIDDEN"
      );
    });
  });
});

// ============================================================================
// DISCUSSIONS ROUTER TESTS
// ============================================================================

describe("Discussions Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = discussionsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns discussions for project", async () => {
      const mockDiscussions = [
        {
          id: "disc_1",
          projectId: "proj_1",
          organizationId: "test-org-123",
          subject: "Project kickoff",
          replies: [],
          createdAt: new Date(),
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.discussion.findMany.mockResolvedValue(mockDiscussions);

      const result = await caller.list({ projectId: "proj_1" });

      expect(result).toHaveLength(1);
      expect(result[0]?.subject).toBe("Project kickoff");
    });

    it("returns empty list when no discussions found", async () => {
      ctx.db.discussion.findMany.mockResolvedValue([]);

      const result = await caller.list({ projectId: "proj_1" });

      expect(result).toHaveLength(0);
    });

    it("includes replies in results", async () => {
      const mockDiscussions = [
        {
          id: "disc_1",
          subject: "Discussion",
          replies: [{ id: "reply_1", body: "Reply text" }],
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.discussion.findMany.mockResolvedValue(mockDiscussions);

      const result = await caller.list({ projectId: "proj_1" });

      expect(result[0]?.replies).toHaveLength(1);
    });
  });

  describe("create", () => {
    it("creates a discussion for project", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.project.findFirst.mockResolvedValue({ id: "proj_1" });
      ctx.db.discussion.create.mockResolvedValue({
        id: "disc_1",
        subject: "New discussion",
        body: "Discussion body",
        replies: [],
      });

      const result = await caller.create({
        projectId: "proj_1",
        subject: "New discussion",
        body: "Discussion body",
      });

      expect(result.subject).toBe("New discussion");
    });

    it("verifies project exists and belongs to org", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.project.findFirst.mockResolvedValue(null);

      await expect(
        caller.create({
          projectId: "proj_1",
          subject: "Discussion",
          body: "Body",
        })
      ).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("reply", () => {
    it("creates a reply to discussion", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.discussion.findFirst.mockResolvedValue({ id: "disc_1" });
      ctx.db.discussionReply.create.mockResolvedValue({
        id: "reply_1",
        body: "Reply",
      });

      const result = await caller.reply({
        discussionId: "disc_1",
        body: "Reply",
      });

      expect(result.body).toBe("Reply");
    });

    it("throws NOT_FOUND for non-existent discussion", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.discussion.findFirst.mockResolvedValue(null);

      await expect(
        caller.reply({
          discussionId: "disc_1",
          body: "Reply",
        })
      ).rejects.toThrow("NOT_FOUND");
    });
  });
});

// ============================================================================
// EXPENSE CATEGORIES ROUTER TESTS
// ============================================================================

describe("Expense Categories Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = expenseCategoriesRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns all categories for organization", async () => {
      const mockCategories = [
        { id: "cat_1", organizationId: "test-org-123", name: "Office Supplies" },
        { id: "cat_2", organizationId: "test-org-123", name: "Travel" },
      ];

      ctx.db.expenseCategory.findMany.mockResolvedValue(mockCategories);

      const result = await caller.list({});

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe("Office Supplies");
    });

    it("respects organization isolation", async () => {
      ctx.db.expenseCategory.findMany.mockResolvedValue([]);

      await caller.list({});

      expect(ctx.db.expenseCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "test-org-123" },
        })
      );
    });

    it("sorts by name ascending", async () => {
      ctx.db.expenseCategory.findMany.mockResolvedValue([]);

      await caller.list({});

      expect(ctx.db.expenseCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: "asc" },
        })
      );
    });
  });

  describe("create", () => {
    it("creates a new category", async () => {
      ctx.db.expenseCategory.create.mockResolvedValue({
        id: "cat_1",
        name: "Food",
        organizationId: "test-org-123",
      });

      const result = await caller.create({ name: "Food" });

      expect(result.name).toBe("Food");
      expect(ctx.db.expenseCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Food",
            organizationId: "test-org-123",
          }),
        })
      );
    });
  });

  describe("update", () => {
    it("updates category name", async () => {
      ctx.db.expenseCategory.findUnique.mockResolvedValue({
        id: "cat_1",
        name: "Old Name",
      });
      ctx.db.expenseCategory.update.mockResolvedValue({
        id: "cat_1",
        name: "New Name",
      });

      const result = await caller.update({
        id: "cat_1",
        name: "New Name",
      });

      expect(result.name).toBe("New Name");
    });

    it("throws NOT_FOUND for non-existent category", async () => {
      ctx.db.expenseCategory.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: "cat_1", name: "New Name" })
      ).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("delete", () => {
    it("deletes a category", async () => {
      ctx.db.expenseCategory.findUnique.mockResolvedValue({ id: "cat_1" });
      ctx.db.expenseCategory.delete.mockResolvedValue({ id: "cat_1" });

      const result = await caller.delete({ id: "cat_1" });

      expect(result.id).toBe("cat_1");
    });

    it("throws NOT_FOUND for non-existent category", async () => {
      ctx.db.expenseCategory.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: "cat_1" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });
  });
});

// ============================================================================
// EXPENSE SUPPLIERS ROUTER TESTS
// ============================================================================

describe("Expense Suppliers Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = expenseSuppliersRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns all suppliers for organization", async () => {
      const mockSuppliers = [
        { id: "sup_1", organizationId: "test-org-123", name: "Amazon" },
        { id: "sup_2", organizationId: "test-org-123", name: "Staples" },
      ];

      ctx.db.expenseSupplier.findMany.mockResolvedValue(mockSuppliers);

      const result = await caller.list({});

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe("Amazon");
    });

    it("respects organization isolation", async () => {
      ctx.db.expenseSupplier.findMany.mockResolvedValue([]);

      await caller.list({});

      expect(ctx.db.expenseSupplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "test-org-123" },
        })
      );
    });

    it("sorts by name ascending", async () => {
      ctx.db.expenseSupplier.findMany.mockResolvedValue([]);

      await caller.list({});

      expect(ctx.db.expenseSupplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: "asc" },
        })
      );
    });
  });

  describe("create", () => {
    it("creates a new supplier", async () => {
      ctx.db.expenseSupplier.create.mockResolvedValue({
        id: "sup_1",
        name: "Vendor Inc",
        organizationId: "test-org-123",
      });

      const result = await caller.create({ name: "Vendor Inc" });

      expect(result.name).toBe("Vendor Inc");
      expect(ctx.db.expenseSupplier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Vendor Inc",
            organizationId: "test-org-123",
          }),
        })
      );
    });
  });

  describe("update", () => {
    it("updates supplier name", async () => {
      ctx.db.expenseSupplier.findUnique.mockResolvedValue({
        id: "sup_1",
        name: "Old Name",
      });
      ctx.db.expenseSupplier.update.mockResolvedValue({
        id: "sup_1",
        name: "New Name",
      });

      const result = await caller.update({
        id: "sup_1",
        name: "New Name",
      });

      expect(result.name).toBe("New Name");
    });

    it("throws NOT_FOUND for non-existent supplier", async () => {
      ctx.db.expenseSupplier.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: "sup_1", name: "New Name" })
      ).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("delete", () => {
    it("deletes a supplier", async () => {
      ctx.db.expenseSupplier.findUnique.mockResolvedValue({ id: "sup_1" });
      ctx.db.expenseSupplier.delete.mockResolvedValue({ id: "sup_1" });

      const result = await caller.delete({ id: "sup_1" });

      expect(result.id).toBe("sup_1");
    });

    it("throws NOT_FOUND for non-existent supplier", async () => {
      ctx.db.expenseSupplier.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: "sup_1" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });
  });
});

// ============================================================================
// MILESTONES ROUTER TESTS
// ============================================================================

describe("Milestones Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = milestonesRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns milestones for project", async () => {
      const mockMilestones = [
        {
          id: "m_1",
          projectId: "proj_1",
          organizationId: "test-org-123",
          name: "Phase 1",
          sortOrder: 0,
        },
      ];

      ctx.db.milestone.findMany.mockResolvedValue(mockMilestones);

      const result = await caller.list({ projectId: "proj_1" });

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("Phase 1");
    });

    it("respects organization isolation", async () => {
      ctx.db.milestone.findMany.mockResolvedValue([]);

      await caller.list({ projectId: "proj_1" });

      expect(ctx.db.milestone.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
          }),
        })
      );
    });

    it("sorts by sortOrder ascending", async () => {
      ctx.db.milestone.findMany.mockResolvedValue([]);

      await caller.list({ projectId: "proj_1" });

      expect(ctx.db.milestone.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: "asc" },
        })
      );
    });
  });

  describe("create", () => {
    it("creates a new milestone", async () => {
      ctx.db.milestone.create.mockResolvedValue({
        id: "m_1",
        projectId: "proj_1",
        name: "Launch",
        organizationId: "test-org-123",
      });

      const result = await caller.create({
        projectId: "proj_1",
        name: "Launch",
      });

      expect(result.name).toBe("Launch");
      expect(ctx.db.milestone.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: "proj_1",
            name: "Launch",
            organizationId: "test-org-123",
          }),
        })
      );
    });

    it("uses default color if not provided", async () => {
      ctx.db.milestone.create.mockResolvedValue({
        id: "m_1",
        color: "#3b82f6",
      });

      const result = await caller.create({
        projectId: "proj_1",
        name: "Milestone",
      });

      expect(ctx.db.milestone.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            color: "#3b82f6",
          }),
        })
      );
    });
  });

  describe("update", () => {
    it("updates milestone properties", async () => {
      ctx.db.milestone.findUnique.mockResolvedValue({ id: "m_1" });
      ctx.db.milestone.update.mockResolvedValue({
        id: "m_1",
        name: "Updated",
      });

      const result = await caller.update({
        id: "m_1",
        name: "Updated",
      });

      expect(result.name).toBe("Updated");
    });

    it("throws NOT_FOUND for non-existent milestone", async () => {
      ctx.db.milestone.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: "m_1", name: "Updated" })
      ).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("delete", () => {
    it("deletes milestone and nulls references", async () => {
      ctx.db.milestone.findUnique.mockResolvedValue({ id: "m_1" });
      ctx.db.projectTask.updateMany.mockResolvedValue({ count: 2 });
      ctx.db.milestone.delete.mockResolvedValue({ id: "m_1" });

      const result = await caller.delete({ id: "m_1" });

      expect(result.id).toBe("m_1");
      expect(ctx.db.projectTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { milestoneId: "m_1", organizationId: "test-org-123" },
          data: { milestoneId: null },
        })
      );
    });

    it("throws NOT_FOUND for non-existent milestone", async () => {
      ctx.db.milestone.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: "m_1" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });
  });

  describe("reorder", () => {
    it("updates sort order for milestone array", async () => {
      ctx.db.$transaction.mockResolvedValue([
        { count: 1 },
        { count: 1 },
      ]);

      await caller.reorder(["m_1", "m_2"]);

      expect(ctx.db.$transaction).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// NOTIFICATIONS ROUTER TESTS
// ============================================================================

describe("Notifications Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = notificationsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns user notifications for organization", async () => {
      const mockNotifications = [
        {
          id: "notif_1",
          organizationId: "test-org-123",
          userId: "test-user-456",
          message: "Invoice created",
          isRead: false,
          createdAt: new Date(),
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.notification.findMany.mockResolvedValue(mockNotifications);

      const result = await caller.list({ limit: 20 });

      expect(result).toHaveLength(1);
      expect(result[0]?.message).toBe("Invoice created");
    });

    it("respects limit parameter", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.notification.findMany.mockResolvedValue([]);

      await caller.list({ limit: 50 });

      expect(ctx.db.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it("throws NOT_FOUND when organization missing", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      await expect(caller.list({ limit: 20 })).rejects.toThrow(
        "NOT_FOUND"
      );
    });

    it("returns empty array on database error", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.notification.findMany.mockRejectedValue(new Error("DB Error"));

      const result = await caller.list({ limit: 20 });

      expect(result).toEqual([]);
    });
  });

  describe("unreadCount", () => {
    it("returns unread notification count", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.notification.count.mockResolvedValue(3);

      const result = await caller.unreadCount();

      expect(result).toBe(3);
      expect(ctx.db.notification.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRead: false,
          }),
        })
      );
    });

    it("returns 0 on error", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.notification.count.mockRejectedValue(new Error("DB Error"));

      const result = await caller.unreadCount();

      expect(result).toBe(0);
    });
  });

  describe("markRead", () => {
    it("marks notification as read", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await caller.markRead({ id: "notif_1" });

      expect(ctx.db.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "notif_1",
          }),
          data: { isRead: true },
        })
      );
    });

    it("throws NOT_FOUND when organization missing", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      await expect(caller.markRead({ id: "notif_1" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });
  });

  describe("markAllRead", () => {
    it("marks all unread notifications as read", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await caller.markAllRead();

      expect(ctx.db.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isRead: true },
        })
      );
    });

    it("throws NOT_FOUND when organization missing", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      await expect(caller.markAllRead()).rejects.toThrow("NOT_FOUND");
    });
  });
});

// ============================================================================
// PORTAL ROUTER TESTS
// ============================================================================

describe("Portal Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = portalRouter.createCaller(ctx);
  });

  describe("getInvoice", () => {
    it("returns invoice with gateway settings and comments", async () => {
      const mockInvoice = {
        id: "inv_1",
        portalToken: "token_123",
        organizationId: "org_1",
        client: { id: "cli_1" },
        currency: { code: "USD" },
        lines: [],
        payments: [],
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.gatewaySetting.findMany.mockResolvedValue([
        { gatewayType: "STRIPE", surcharge: 2.9 },
      ]);
      ctx.db.comment.findMany.mockResolvedValue([
        { id: "comment_1", body: "Public comment" },
      ]);

      const result = await caller.getInvoice({ token: "token_123" });

      expect(result.invoice.id).toBe("inv_1");
      expect(result.gateways).toBeDefined();
      expect(result.comments).toBeDefined();
    });

    it("throws NOT_FOUND for invalid token", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      await expect(caller.getInvoice({ token: "invalid" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });

    it("includes enabled gateway settings", async () => {
      const mockInvoice = {
        id: "inv_1",
        portalToken: "token_123",
        organizationId: "org_1",
        client: { id: "cli_1" },
        currency: { code: "USD" },
        lines: [],
        payments: [],
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.gatewaySetting.findMany.mockResolvedValue([
        { gatewayType: "STRIPE", surcharge: 2.9 },
      ]);
      ctx.db.comment.findMany.mockResolvedValue([]);

      const result = await caller.getInvoice({ token: "token_123" });

      expect(ctx.db.gatewaySetting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isEnabled: true,
          }),
        })
      );
    });

    it("filters to public comments only", async () => {
      const mockInvoice = {
        id: "inv_1",
        portalToken: "token_123",
        organizationId: "org_1",
        client: { id: "cli_1" },
        currency: { code: "USD" },
        lines: [],
        payments: [],
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.gatewaySetting.findMany.mockResolvedValue([]);
      ctx.db.comment.findMany.mockResolvedValue([
        { id: "comment_1", body: "Public comment" },
      ]);

      await caller.getInvoice({ token: "token_123" });

      expect(ctx.db.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPrivate: false,
          }),
        })
      );
    });
  });
});

// ============================================================================
// PROJECT TEMPLATES ROUTER TESTS
// ============================================================================

describe("Project Templates Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = projectTemplatesRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns all templates for organization", async () => {
      const mockTemplates = [
        {
          id: "tpl_1",
          organizationId: "test-org-123",
          name: "Standard Project",
          tasks: [],
        },
      ];

      ctx.db.projectTemplate.findMany.mockResolvedValue(mockTemplates);

      const result = await caller.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("Standard Project");
    });

    it("respects organization isolation", async () => {
      ctx.db.projectTemplate.findMany.mockResolvedValue([]);

      await caller.list();

      expect(ctx.db.projectTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "test-org-123" },
        })
      );
    });

    it("includes tasks in results", async () => {
      const mockTemplates = [
        {
          id: "tpl_1",
          name: "Template",
          tasks: [{ id: "task_1", name: "Setup" }],
        },
      ];

      ctx.db.projectTemplate.findMany.mockResolvedValue(mockTemplates);

      const result = await caller.list();

      expect(result[0]?.tasks).toHaveLength(1);
    });
  });

  describe("get", () => {
    it("returns template by id", async () => {
      const mockTemplate = {
        id: "tpl_1",
        organizationId: "test-org-123",
        name: "Template",
        tasks: [],
      };

      ctx.db.projectTemplate.findUnique.mockResolvedValue(mockTemplate);

      const result = await caller.get({ id: "tpl_1" });

      expect(result.name).toBe("Template");
    });

    it("throws NOT_FOUND for non-existent template", async () => {
      ctx.db.projectTemplate.findUnique.mockResolvedValue(null);

      await expect(caller.get({ id: "tpl_1" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });
  });

  describe("create", () => {
    it("creates a new template", async () => {
      ctx.db.projectTemplate.create.mockResolvedValue({
        id: "tpl_1",
        name: "New Template",
        organizationId: "test-org-123",
      });

      const result = await caller.create({
        name: "New Template",
      });

      expect(result.name).toBe("New Template");
      expect(ctx.db.projectTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "New Template",
            organizationId: "test-org-123",
          }),
        })
      );
    });
  });
});

// ============================================================================
// TASK STATUSES ROUTER TESTS
// ============================================================================

describe("Task Statuses Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = taskStatusesRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns all task statuses for organization", async () => {
      const mockStatuses = [
        {
          id: "ts_1",
          organizationId: "test-org-123",
          title: "Todo",
          sortOrder: 0,
        },
        {
          id: "ts_2",
          organizationId: "test-org-123",
          title: "Done",
          sortOrder: 1,
        },
      ];

      ctx.db.taskStatus.findMany.mockResolvedValue(mockStatuses);

      const result = await caller.list();

      expect(result).toHaveLength(2);
      expect(result[0]?.title).toBe("Todo");
    });

    it("respects organization isolation", async () => {
      ctx.db.taskStatus.findMany.mockResolvedValue([]);

      await caller.list();

      expect(ctx.db.taskStatus.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "test-org-123" },
        })
      );
    });

    it("sorts by sortOrder ascending", async () => {
      ctx.db.taskStatus.findMany.mockResolvedValue([]);

      await caller.list();

      expect(ctx.db.taskStatus.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: "asc" },
        })
      );
    });
  });

  describe("create", () => {
    it("creates a custom task status", async () => {
      ctx.db.taskStatus.create.mockResolvedValue({
        id: "ts_1",
        title: "In Review",
        organizationId: "test-org-123",
      });

      const result = await caller.create({
        title: "In Review",
      });

      expect(result.title).toBe("In Review");
      expect(ctx.db.taskStatus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "In Review",
            organizationId: "test-org-123",
          }),
        })
      );
    });

    it("uses default colors if not provided", async () => {
      ctx.db.taskStatus.create.mockResolvedValue({
        id: "ts_1",
        backgroundColor: "#e5e7eb",
        fontColor: "#111827",
      });

      const result = await caller.create({ title: "Status" });

      expect(ctx.db.taskStatus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            backgroundColor: "#e5e7eb",
            fontColor: "#111827",
          }),
        })
      );
    });
  });

  describe("update", () => {
    it("updates task status", async () => {
      ctx.db.taskStatus.findUnique.mockResolvedValue({ id: "ts_1" });
      ctx.db.taskStatus.update.mockResolvedValue({
        id: "ts_1",
        title: "Updated",
      });

      const result = await caller.update({
        id: "ts_1",
        title: "Updated",
      });

      expect(result.title).toBe("Updated");
    });

    it("throws NOT_FOUND for non-existent status", async () => {
      ctx.db.taskStatus.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: "ts_1", title: "Updated" })
      ).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("delete", () => {
    it("deletes a task status", async () => {
      ctx.db.taskStatus.findUnique.mockResolvedValue({ id: "ts_1" });
      ctx.db.taskStatus.delete.mockResolvedValue({ id: "ts_1" });

      const result = await caller.delete({ id: "ts_1" });

      expect(result.id).toBe("ts_1");
    });

    it("throws NOT_FOUND for non-existent status", async () => {
      ctx.db.taskStatus.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: "ts_1" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });
  });
});

// ============================================================================
// TAXES ROUTER TESTS
// ============================================================================

describe("Taxes Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = taxesRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns all taxes for organization", async () => {
      const mockTaxes = [
        { id: "tax_1", organizationId: "test-org-123", name: "GST", rate: 10 },
        { id: "tax_2", organizationId: "test-org-123", name: "PST", rate: 7 },
      ];

      ctx.db.tax.findMany.mockResolvedValue(mockTaxes);

      const result = await caller.list();

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe("GST");
    });

    it("respects organization isolation", async () => {
      ctx.db.tax.findMany.mockResolvedValue([]);

      await caller.list();

      expect(ctx.db.tax.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "test-org-123" },
        })
      );
    });

    it("sorts by name ascending", async () => {
      ctx.db.tax.findMany.mockResolvedValue([]);

      await caller.list();

      expect(ctx.db.tax.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: "asc" },
        })
      );
    });
  });

  describe("create", () => {
    it("creates a new tax", async () => {
      ctx.db.tax.create.mockResolvedValue({
        id: "tax_1",
        name: "HST",
        rate: 15,
        organizationId: "test-org-123",
      });

      const result = await caller.create({
        name: "HST",
        rate: 15,
      });

      expect(result.name).toBe("HST");
      expect(result.rate).toBe(15);
    });

    it("uses isCompound default of false", async () => {
      ctx.db.tax.create.mockResolvedValue({
        id: "tax_1",
        isCompound: false,
      });

      const result = await caller.create({
        name: "Tax",
        rate: 10,
      });

      expect(ctx.db.tax.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCompound: false,
          }),
        })
      );
    });
  });

  describe("update", () => {
    it("updates tax properties", async () => {
      ctx.db.tax.update.mockResolvedValue({
        id: "tax_1",
        name: "Updated Tax",
        rate: 20,
      });

      const result = await caller.update({
        id: "tax_1",
        rate: 20,
      });

      expect(result.rate).toBe(20);
    });
  });

  describe("delete", () => {
    it("deletes a tax", async () => {
      ctx.db.tax.delete.mockResolvedValue({ id: "tax_1" });

      const result = await caller.delete({ id: "tax_1" });

      expect(result.id).toBe("tax_1");
    });
  });
});

// ============================================================================
// TICKETS ROUTER TESTS
// ============================================================================

describe("Tickets Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = ticketsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns tickets for organization", async () => {
      const mockTickets = [
        {
          id: "ticket_1",
          organizationId: "test-org-123",
          subject: "Bug report",
          status: TicketStatus.OPEN,
          messages: [],
          client: null,
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.ticket.findMany.mockResolvedValue(mockTickets);

      const result = await caller.list({});

      expect(result).toHaveLength(1);
      expect(result[0]?.subject).toBe("Bug report");
    });

    it("filters by status when provided", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.ticket.findMany.mockResolvedValue([]);

      await caller.list({ status: TicketStatus.OPEN });

      expect(ctx.db.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: TicketStatus.OPEN,
          }),
        })
      );
    });

    it("filters by clientId when provided", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.ticket.findMany.mockResolvedValue([]);

      await caller.list({ clientId: "cli_1" });

      expect(ctx.db.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clientId: "cli_1",
          }),
        })
      );
    });

    it("returns empty list when no tickets found", async () => {
      ctx.db.ticket.findMany.mockResolvedValue([]);

      const result = await caller.list({});

      expect(result).toHaveLength(0);
    });
  });

  describe("get", () => {
    it("returns ticket by id", async () => {
      const mockTicket = {
        id: "ticket_1",
        organizationId: "test-org-123",
        subject: "Issue",
        messages: [],
        client: null,
      };

      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.ticket.findFirst.mockResolvedValue(mockTicket);

      const result = await caller.get({ id: "ticket_1" });

      expect(result.subject).toBe("Issue");
    });

    it("throws NOT_FOUND for non-existent ticket", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.ticket.findFirst.mockResolvedValue(null);

      await expect(caller.get({ id: "ticket_1" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });
  });

  describe("create", () => {
    it("creates a new ticket with auto-incremented number", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.ticket.findFirst.mockResolvedValueOnce({ number: 5 });
      ctx.db.ticket.create.mockResolvedValue({
        id: "ticket_1",
        number: 6,
        subject: "New issue",
        body: "Description",
        organizationId: "test-org-123",
        messages: [{ id: "msg_1", body: "Description" }],
      });

      const result = await caller.create({
        subject: "New issue",
        body: "Description",
      });

      expect(result.subject).toBe("New issue");
    });

    it("starts numbering at 1 when no prior tickets exist", async () => {
      ctx.db.ticket.findFirst.mockResolvedValueOnce(null);
      ctx.db.ticket.create.mockResolvedValue({
        id: "ticket_1",
        number: 1,
        subject: "First issue",
        body: "Description",
        organizationId: "test-org-123",
        messages: [{ id: "msg_1", body: "Description" }],
      });

      const result = await caller.create({
        subject: "First issue",
        body: "Description",
      });

      expect(result.number).toBe(1);
    });
  });

  describe("reply", () => {
    it("adds reply to ticket", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.ticket.findFirst.mockResolvedValue({ id: "ticket_1" });
      ctx.db.ticketMessage.create.mockResolvedValue({
        id: "msg_1",
        body: "Response",
      });

      const result = await caller.reply({
        ticketId: "ticket_1",
        body: "Response",
      });

      expect(result.body).toBe("Response");
    });

    it("throws NOT_FOUND for non-existent ticket", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.ticket.findFirst.mockResolvedValue(null);

      await expect(
        caller.reply({
          ticketId: "ticket_1",
          body: "Response",
        })
      ).rejects.toThrow("NOT_FOUND");
    });
  });
});

// ============================================================================
// TIMERS ROUTER TESTS
// ============================================================================

describe("Timers Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = timersRouter.createCaller(ctx);
  });

  describe("getActive", () => {
    it("returns active timer for task", async () => {
      const mockTimer = {
        id: "timer_1",
        taskId: "task_1",
        organizationId: "test-org-123",
        isOver: false,
        startedAt: new Date(),
      };

      ctx.db.timer.findFirst.mockResolvedValue(mockTimer);

      const result = await caller.getActive({ taskId: "task_1" });

      expect(result.id).toBe("timer_1");
      expect(result.isOver).toBe(false);
    });

    it("returns null if no active timer", async () => {
      ctx.db.timer.findFirst.mockResolvedValue(null);

      const result = await caller.getActive({ taskId: "task_1" });

      expect(result).toBeNull();
    });
  });

  describe("getUserTimers", () => {
    it("returns user's active timers", async () => {
      const mockTimers = [
        {
          id: "timer_1",
          userId: "test-user-456",
          organizationId: "test-org-123",
          isOver: false,
          task: { id: "task_1", name: "Task 1", project: { id: "proj_1", name: "Project 1" } },
        },
      ];

      ctx.db.timer.findMany.mockResolvedValue(mockTimers);

      const result = await caller.getUserTimers();

      expect(result).toHaveLength(1);
      expect(result[0]?.task.name).toBe("Task 1");
    });

    it("respects organization isolation", async () => {
      ctx.db.timer.findMany.mockResolvedValue([]);

      await caller.getUserTimers();

      expect(ctx.db.timer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
          }),
        })
      );
    });

    it("filters for active timers only", async () => {
      ctx.db.timer.findMany.mockResolvedValue([]);

      await caller.getUserTimers();

      expect(ctx.db.timer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isOver: false,
          }),
        })
      );
    });
  });

  describe("start", () => {
    it("starts a new timer for task", async () => {
      ctx.db.timer.findFirst.mockResolvedValue(null);
      ctx.db.timer.create.mockResolvedValue({
        id: "timer_1",
        taskId: "task_1",
        organizationId: "test-org-123",
        isPaused: false,
      });

      const result = await caller.start({ taskId: "task_1" });

      expect(result.taskId).toBe("task_1");
      expect(ctx.db.timer.create).toHaveBeenCalled();
    });

    it("resumes paused timer instead of creating new", async () => {
      const existingTimer = {
        id: "timer_1",
        taskId: "task_1",
        isPaused: true,
        isOver: false,
      };

      ctx.db.timer.findFirst.mockResolvedValue(existingTimer);
      ctx.db.timer.update.mockResolvedValue({
        ...existingTimer,
        isPaused: false,
      });

      const result = await caller.start({ taskId: "task_1" });

      expect(result.taskId).toBe("task_1");
      expect(ctx.db.timer.update).toHaveBeenCalled();
    });

    it("returns running timer if already active", async () => {
      const runningTimer = {
        id: "timer_1",
        taskId: "task_1",
        isPaused: false,
        isOver: false,
      };

      ctx.db.timer.findFirst.mockResolvedValue(runningTimer);

      const result = await caller.start({ taskId: "task_1" });

      expect(result.isPaused).toBe(false);
      expect(ctx.db.timer.create).not.toHaveBeenCalled();
    });
  });

  describe("pause", () => {
    it("pauses active timer", async () => {
      ctx.db.timer.findFirst.mockResolvedValue({
        id: "timer_1",
        isPaused: false,
        currentSeconds: 100,
        lastModifiedAt: new Date(),
        pausesJson: "[]",
      });
      ctx.db.timer.update.mockResolvedValue({
        id: "timer_1",
        isPaused: true,
      });

      const result = await caller.pause({ taskId: "task_1" });

      expect(result.isPaused).toBe(true);
    });

    it("throws error if no active timer", async () => {
      ctx.db.timer.findFirst.mockResolvedValue(null);

      await expect(caller.pause({ taskId: "task_1" })).rejects.toThrow();
    });
  });

  describe("resume", () => {
    it("resumes paused timer", async () => {
      ctx.db.timer.findFirst.mockResolvedValue({
        id: "timer_1",
        isPaused: true,
        isOver: false,
      });
      ctx.db.timer.update.mockResolvedValue({
        id: "timer_1",
        isPaused: false,
      });

      const result = await caller.resume({ taskId: "task_1" });

      expect(result.isPaused).toBe(false);
    });

    it("throws error if no paused timer", async () => {
      ctx.db.timer.findFirst.mockResolvedValue(null);

      await expect(caller.resume({ taskId: "task_1" })).rejects.toThrow();
    });
  });

  describe("stop", () => {
    it("stops active timer", async () => {
      ctx.db.timer.findFirst.mockResolvedValue({
        id: "timer_1",
        isPaused: false,
        currentSeconds: 3600,
        lastModifiedAt: new Date(Date.now() - 3600000),
        taskId: "task_1",
        organizationId: "test-org-123",
      });
      ctx.db.projectTask.findUnique.mockResolvedValue({
        id: "task_1",
        projectId: "proj_1",
      });
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        timeRounding: "NONE",
      });
      ctx.db.$transaction.mockResolvedValue({ id: "entry_1" });

      const result = await caller.stop({ taskId: "task_1" });

      expect(ctx.db.$transaction).toHaveBeenCalled();
    });

    it("throws error if no active timer", async () => {
      ctx.db.timer.findFirst.mockResolvedValue(null);

      await expect(caller.stop({ taskId: "task_1" })).rejects.toThrow();
    });
  });
});
