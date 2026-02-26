# Tasks Router Procedure Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add integration tests for tasks router procedures (list, create, update, complete) to reach 55%+ coverage.

**Architecture:** Create comprehensive tests for task CRUD operations using mock tRPC context. Test filtering by project, milestone, and completion status. Validate parent-child relationships and authorization checks. Mock Prisma database operations to test business logic without database.

**Tech Stack:** Vitest, Prisma Client (mocked), tRPC v11, TypeScript

---

## Task 1: Set Up Tasks Test Scaffold

**Files:**
- Create: `src/test/routers-tasks-procedures.test.ts`

**Step 1: Write test file with placeholder tests**

Create `src/test/routers-tasks-procedures.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { tasksRouter } from "@/server/routers/tasks";
import { createMockContext } from "./mocks/trpc-context";

describe("Tasks Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = tasksRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("create", () => {
    it("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("update", () => {
    it("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("complete", () => {
    it("placeholder", () => {
      expect(true).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify scaffold**

Run: `npm run test -- src/test/routers-tasks-procedures.test.ts`
Expected: All 4 placeholder tests pass

**Step 3: Commit**

```bash
git add src/test/routers-tasks-procedures.test.ts
git commit -m "test: scaffold tasks router procedure tests"
```

---

## Task 2: Test list Procedure - Basic Filtering

**Files:**
- Modify: `src/test/routers-tasks-procedures.test.ts`

**Step 1: Add tests for task listing**

Add to `list` describe block:
```typescript
it("returns tasks for project with included relations", async () => {
  const mockTasks = [
    {
      id: "task_1",
      projectId: "proj_123",
      organizationId: "test-org-123",
      name: "Task 1",
      taskStatus: { id: "ts_1", name: "Todo" },
      milestone: { id: "m_1", name: "v1.0" },
      timer: null,
      _count: { timeEntries: 0, children: 0 },
    },
  ];

  ctx.db.projectTask.findMany.mockResolvedValue(mockTasks);

  const result = await caller.list({
    projectId: "proj_123",
  });

  expect(result).toHaveLength(1);
  expect(result[0]?.name).toBe("Task 1");
  expect(result[0]?.taskStatus).toBeDefined();
  expect(result[0]?.milestone).toBeDefined();
});

it("filters by milestone when provided", async () => {
  ctx.db.projectTask.findMany.mockResolvedValue([]);

  await caller.list({
    projectId: "proj_123",
    milestoneId: "m_1",
  });

  expect(ctx.db.projectTask.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        milestoneId: "m_1",
      }),
    })
  );
});

it("respects includeCompleted flag", async () => {
  ctx.db.projectTask.findMany.mockResolvedValue([]);

  await caller.list({
    projectId: "proj_123",
    includeCompleted: false,
  });

  expect(ctx.db.projectTask.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        isCompleted: false,
      }),
    })
  );
});
```

**Step 2: Run tests**

Run: `npm run test -- src/test/routers-tasks-procedures.test.ts`
Expected: All list tests pass (3 total)

**Step 3: Commit**

```bash
git add src/test/routers-tasks-procedures.test.ts
git commit -m "test: add tasks list filtering tests"
```

---

## Task 3: Test create Procedure

**Files:**
- Modify: `src/test/routers-tasks-procedures.test.ts`

**Step 1: Add tests for task creation**

Add to `create` describe block:
```typescript
it("creates task with required fields", async () => {
  const mockTask = {
    id: "task_1",
    projectId: "proj_123",
    organizationId: "test-org-123",
    name: "New Task",
    notes: null,
    sortOrder: 0,
    projectedHours: 0,
    rate: 0,
    dueDate: null,
    parentId: null,
    milestoneId: null,
    taskStatusId: null,
    assignedUserId: null,
    isFlatRate: false,
    isViewable: false,
    isTimesheetViewable: false,
    isCompleted: false,
    taskStatus: null,
    milestone: null,
  };

  ctx.db.projectTask.create.mockResolvedValue(mockTask);

  const result = await caller.create({
    projectId: "proj_123",
    name: "New Task",
  });

  expect(result.id).toBe("task_1");
  expect(result.organizationId).toBe("test-org-123");
  expect(ctx.db.projectTask.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        projectId: "proj_123",
        name: "New Task",
        organizationId: "test-org-123",
      }),
    })
  );
});

it("creates task with optional fields", async () => {
  const dueDate = new Date("2026-03-31");
  const mockTask = {
    id: "task_1",
    projectId: "proj_123",
    organizationId: "test-org-123",
    name: "Task with options",
    notes: "Some notes",
    sortOrder: 5,
    projectedHours: 8,
    rate: 100,
    dueDate,
    parentId: "parent_1",
    milestoneId: "m_1",
    taskStatusId: "ts_1",
    isFlatRate: true,
    isViewable: true,
    isTimesheetViewable: true,
    taskStatus: { id: "ts_1", name: "In Progress" },
    milestone: { id: "m_1", name: "v1.0" },
  };

  ctx.db.projectTask.create.mockResolvedValue(mockTask);

  const result = await caller.create({
    projectId: "proj_123",
    name: "Task with options",
    notes: "Some notes",
    sortOrder: 5,
    projectedHours: 8,
    rate: 100,
    dueDate,
    parentId: "parent_1",
    milestoneId: "m_1",
    taskStatusId: "ts_1",
    isFlatRate: true,
    isViewable: true,
    isTimesheetViewable: true,
  });

  expect(result.projectedHours).toBe(8);
  expect(result.dueDate).toEqual(dueDate);
  expect(result.isFlatRate).toBe(true);
});
```

**Step 2: Run tests**

Run: `npm run test -- src/test/routers-tasks-procedures.test.ts`
Expected: All create tests pass (2 total)

**Step 3: Commit**

```bash
git add src/test/routers-tasks-procedures.test.ts
git commit -m "test: add tasks create procedure tests"
```

---

## Task 4: Test update Procedure

**Files:**
- Modify: `src/test/routers-tasks-procedures.test.ts`

**Step 1: Add tests for task updates**

Add to `update` describe block:
```typescript
it("updates task fields", async () => {
  const mockTask = {
    id: "task_1",
    projectId: "proj_123",
    organizationId: "test-org-123",
    name: "Updated Task",
    notes: "Updated notes",
    taskStatus: { id: "ts_2", name: "In Progress" },
    milestone: null,
  };

  ctx.db.projectTask.findUnique.mockResolvedValue({
    id: "task_1",
    organizationId: "test-org-123",
  });
  ctx.db.projectTask.update.mockResolvedValue(mockTask);

  const result = await caller.update({
    id: "task_1",
    name: "Updated Task",
    notes: "Updated notes",
    taskStatusId: "ts_2",
  });

  expect(result.name).toBe("Updated Task");
  expect(result.notes).toBe("Updated notes");
  expect(ctx.db.projectTask.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: "task_1",
        organizationId: "test-org-123",
      },
      data: expect.objectContaining({
        name: "Updated Task",
        notes: "Updated notes",
        taskStatusId: "ts_2",
      }),
    })
  );
});

it("throws NOT_FOUND when task does not exist", async () => {
  ctx.db.projectTask.findUnique.mockResolvedValue(null);

  await expect(
    caller.update({
      id: "nonexistent",
      name: "Updated",
    })
  ).rejects.toThrow("NOT_FOUND");
});

it("allows partial updates", async () => {
  const mockTask = {
    id: "task_1",
    organizationId: "test-org-123",
    name: "Renamed Task",
    taskStatus: null,
    milestone: null,
  };

  ctx.db.projectTask.findUnique.mockResolvedValue({
    id: "task_1",
    organizationId: "test-org-123",
  });
  ctx.db.projectTask.update.mockResolvedValue(mockTask);

  const result = await caller.update({
    id: "task_1",
    name: "Renamed Task",
  });

  expect(result.name).toBe("Renamed Task");
});
```

**Step 2: Run tests**

Run: `npm run test -- src/test/routers-tasks-procedures.test.ts`
Expected: All update tests pass (3 total)

**Step 3: Commit**

```bash
git add src/test/routers-tasks-procedures.test.ts
git commit -m "test: add tasks update procedure tests"
```

---

## Task 5: Test complete Procedure

**Files:**
- Modify: `src/test/routers-tasks-procedures.test.ts`

**Step 1: Add tests for task completion**

Add to `complete` describe block:
```typescript
it("marks task as completed", async () => {
  const mockTask = {
    id: "task_1",
    organizationId: "test-org-123",
    isCompleted: true,
  };

  ctx.db.projectTask.findUnique.mockResolvedValue({
    id: "task_1",
    organizationId: "test-org-123",
  });
  ctx.db.projectTask.update.mockResolvedValue(mockTask);

  const result = await caller.complete({
    id: "task_1",
    isCompleted: true,
  });

  expect(result.isCompleted).toBe(true);
  expect(ctx.db.projectTask.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        isCompleted: true,
      },
    })
  );
});

it("marks task as incomplete", async () => {
  const mockTask = {
    id: "task_1",
    organizationId: "test-org-123",
    isCompleted: false,
  };

  ctx.db.projectTask.findUnique.mockResolvedValue({
    id: "task_1",
    organizationId: "test-org-123",
  });
  ctx.db.projectTask.update.mockResolvedValue(mockTask);

  const result = await caller.complete({
    id: "task_1",
    isCompleted: false,
  });

  expect(result.isCompleted).toBe(false);
});

it("throws NOT_FOUND when task does not exist", async () => {
  ctx.db.projectTask.findUnique.mockResolvedValue(null);

  await expect(
    caller.complete({
      id: "nonexistent",
      isCompleted: true,
    })
  ).rejects.toThrow("NOT_FOUND");
});
```

**Step 2: Run tests**

Run: `npm run test -- src/test/routers-tasks-procedures.test.ts`
Expected: All complete tests pass (3 total)

**Step 3: Commit**

```bash
git add src/test/routers-tasks-procedures.test.ts
git commit -m "test: add tasks complete procedure tests"
```

---

## Task 6: Verify Coverage Improvement

**Files:**
- Test: `src/test/routers-tasks-procedures.test.ts`

**Step 1: Run complete test suite**

Run: `npm run test`
Expected: All tests pass, including 11 new tasks router tests

**Step 2: Generate coverage report**

Run: `npm run test -- --coverage`
Expected: tasks.ts coverage significantly improved

**Step 3: Verify all tests pass**

Expected output should show:
- Total tests: 431+ (from 420)
- Test files: 24
- All passing

**Step 4: Final commit**

```bash
git add src/test/routers-tasks-procedures.test.ts
git commit -m "test: tasks router procedure testing complete - 11 new tests"
```

---

## Summary

**What Gets Built:**
- 11 comprehensive integration tests for tasks router
- Tests for all 4 major procedures: list, create, update, complete
- Success paths, error handling, and filtering validation
- Parent-child relationship and authorization checks

**Expected Results:**
- Total tests: 431+ (↑11 from 420)
- tasks.ts coverage: Significant improvement
- All tests passing
