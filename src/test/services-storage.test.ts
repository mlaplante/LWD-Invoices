import { describe, it, expect, beforeEach, vi } from "vitest";
import { uploadFile, deleteFile } from "@/server/services/storage";
import { createClient } from "@supabase/supabase-js";

// Mock Supabase
vi.mock("@supabase/supabase-js");
vi.mock("@/lib/env", () => ({
  env: {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key-123456",
  },
}));

describe("Storage Service", () => {
  let mockSupabaseClient: any;
  let mockStorageFrom: any;
  let mockUpload: any;
  let mockRemove: any;
  let mockGetPublicUrl: any;
  let mockCreateBucket: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock functions
    mockUpload = vi.fn();
    mockRemove = vi.fn();
    mockGetPublicUrl = vi.fn();
    mockCreateBucket = vi.fn();

    // Setup storage.from chain
    mockStorageFrom = vi.fn(() => ({
      upload: mockUpload,
      remove: mockRemove,
      getPublicUrl: mockGetPublicUrl,
    }));

    // Setup storage mock
    mockSupabaseClient = {
      storage: {
        createBucket: mockCreateBucket,
        from: mockStorageFrom,
      },
    };

    // Mock createClient to return our mock
    (createClient as any).mockReturnValue(mockSupabaseClient);
  });

  describe("uploadFile", () => {
    it("uploads file successfully and returns object URL", async () => {
      const filename = "invoice.pdf";
      const pathname = "org_123/invoices";
      const file = new Blob(["test content"], { type: "application/pdf" });

      // Mock successful bucket creation
      mockCreateBucket.mockResolvedValue({ error: null });

      // Mock successful upload
      mockUpload.mockResolvedValue({ error: null });

      // Mock public URL generation
      const publicUrl = "https://test.supabase.co/storage/v1/object/public/attachments/org_123/invoices/invoice.pdf";
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl },
      });

      const result = await uploadFile(filename, file, pathname);

      expect(result).toEqual({ url: publicUrl });
      expect(mockStorageFrom).toHaveBeenCalledWith("attachments");
      expect(mockUpload).toHaveBeenCalledWith(
        "org_123/invoices/invoice.pdf",
        expect.any(ArrayBuffer),
        {
          contentType: "application/pdf",
          upsert: true,
        }
      );
    });

    it("throws error when upload fails due to permissions", async () => {
      const filename = "document.pdf";
      const pathname = "org_123/files";
      const file = new Blob(["content"], { type: "application/pdf" });

      // Mock successful bucket creation
      mockCreateBucket.mockResolvedValue({ error: null });

      // Mock upload failure
      const uploadError = new Error("Permission denied: User does not have write access");
      mockUpload.mockResolvedValue({ error: uploadError });

      await expect(uploadFile(filename, file, pathname)).rejects.toThrow(
        "Permission denied: User does not have write access"
      );
    });

    it("throws error when bucket creation fails (non-exists)", async () => {
      const filename = "test.txt";
      const pathname = "org_123/docs";
      const file = new Blob(["test"], { type: "text/plain" });

      // Mock bucket creation failure
      const bucketError = new Error("Storage bucket error");
      mockCreateBucket.mockResolvedValue({ error: bucketError });

      await expect(uploadFile(filename, file, pathname)).rejects.toThrow(
        "Storage bucket error"
      );
    });

    it("ignores 'already exists' error during bucket creation", async () => {
      const filename = "invoice.pdf";
      const pathname = "org_123/invoices";
      const file = new Blob(["content"], { type: "application/pdf" });

      // Mock bucket creation with "already exists" error (should be ignored)
      mockCreateBucket.mockResolvedValue({
        error: { message: "bucket already exists" },
      });

      // Mock successful upload
      mockUpload.mockResolvedValue({ error: null });

      // Mock public URL
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: "https://test.supabase.co/storage/v1/object/public/attachments/org_123/invoices/invoice.pdf" },
      });

      const result = await uploadFile(filename, file, pathname);

      expect(result).toHaveProperty("url");
      expect(mockUpload).toHaveBeenCalled();
    });

    it("converts Blob to ArrayBuffer correctly", async () => {
      const filename = "document.docx";
      const pathname = "org_123/documents";
      const fileContent = "binary content";
      const file = new Blob([fileContent], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: "https://test.supabase.co/storage/v1/object/public/attachments/org_123/documents/document.docx" },
      });

      await uploadFile(filename, file, pathname);

      // Verify upload was called with ArrayBuffer
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(ArrayBuffer),
        expect.any(Object)
      );
    });

    it("constructs correct storage path from pathname and filename", async () => {
      const filename = "invoice-2026-001.pdf";
      const pathname = "org_456/invoices/2026-feb";
      const file = new Blob(["content"], { type: "application/pdf" });

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: "https://test.supabase.co/storage/v1/object/public/attachments/org_456/invoices/2026-feb/invoice-2026-001.pdf" },
      });

      await uploadFile(filename, file, pathname);

      expect(mockUpload).toHaveBeenCalledWith(
        "org_456/invoices/2026-feb/invoice-2026-001.pdf",
        expect.any(ArrayBuffer),
        expect.any(Object)
      );
    });
  });

  describe("deleteFile", () => {
    it("deletes file from storage successfully", async () => {
      const storageUrl = "https://test.supabase.co/storage/v1/object/public/attachments/org_123/invoices/invoice.pdf";

      mockRemove.mockResolvedValue({ error: null });

      await deleteFile(storageUrl);

      expect(mockStorageFrom).toHaveBeenCalledWith("attachments");
      expect(mockRemove).toHaveBeenCalledWith(["org_123/invoices/invoice.pdf"]);
    });

    it("throws error when delete fails", async () => {
      const storageUrl = "https://test.supabase.co/storage/v1/object/public/attachments/org_123/files/document.pdf";

      const deleteError = new Error("File not found");
      mockRemove.mockResolvedValue({ error: deleteError });

      await expect(deleteFile(storageUrl)).rejects.toThrow("File not found");
    });

    it("extracts correct path from Supabase public URL", async () => {
      const storageUrl = "https://test.supabase.co/storage/v1/object/public/attachments/org_789/documents/2026/contract.pdf";

      mockRemove.mockResolvedValue({ error: null });

      await deleteFile(storageUrl);

      expect(mockRemove).toHaveBeenCalledWith(["org_789/documents/2026/contract.pdf"]);
    });

    it("handles URLs with special characters in path", async () => {
      const storageUrl = "https://test.supabase.co/storage/v1/object/public/attachments/org_123/files/document%20with%20spaces.pdf";

      mockRemove.mockResolvedValue({ error: null });

      await deleteFile(storageUrl);

      expect(mockRemove).toHaveBeenCalledWith(["org_123/files/document%20with%20spaces.pdf"]);
    });

    it("skips deletion for non-matching URL format", async () => {
      const invalidUrl = "https://example.com/some/other/path/file.pdf";

      await deleteFile(invalidUrl);

      expect(mockRemove).not.toHaveBeenCalled();
    });

    it("handles nested directory paths correctly", async () => {
      const storageUrl = "https://test.supabase.co/storage/v1/object/public/attachments/org_123/invoices/2026/february/INV-2026-001.pdf";

      mockRemove.mockResolvedValue({ error: null });

      await deleteFile(storageUrl);

      expect(mockRemove).toHaveBeenCalledWith(["org_123/invoices/2026/february/INV-2026-001.pdf"]);
    });
  });

  describe("URL generation", () => {
    it("returns correctly formatted public URL", async () => {
      const filename = "statement.pdf";
      const pathname = "org_123/statements";
      const file = new Blob(["content"], { type: "application/pdf" });

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

      const expectedUrl = "https://test.supabase.co/storage/v1/object/public/attachments/org_123/statements/statement.pdf";
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: expectedUrl },
      });

      const result = await uploadFile(filename, file, pathname);

      expect(result.url).toBe(expectedUrl);
      expect(result.url).toMatch(/^https:\/\/.*\/storage\/v1\/object\/public\/attachments\//);
    });

    it("includes bucket name in generated URL", async () => {
      const filename = "receipt.pdf";
      const pathname = "org_123/receipts";
      const file = new Blob(["content"], { type: "application/pdf" });

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

      const urlWithBucket = "https://test.supabase.co/storage/v1/object/public/attachments/org_123/receipts/receipt.pdf";
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: urlWithBucket },
      });

      const result = await uploadFile(filename, file, pathname);

      expect(result.url).toContain("attachments");
    });

    it("preserves file path segments in URL", async () => {
      const filename = "2026-02-invoice.pdf";
      const pathname = "org_123/invoices/2026/02";
      const file = new Blob(["content"], { type: "application/pdf" });

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

      const expectedUrl = "https://test.supabase.co/storage/v1/object/public/attachments/org_123/invoices/2026/02/2026-02-invoice.pdf";
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: expectedUrl },
      });

      const result = await uploadFile(filename, file, pathname);

      expect(result.url).toContain("2026/02");
      expect(result.url).toContain("2026-02-invoice.pdf");
    });
  });

  describe("edge cases and error handling", () => {
    it("handles empty filename", async () => {
      const filename = "";
      const pathname = "org_123/files";
      const file = new Blob(["content"], { type: "text/plain" });

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: "https://test.supabase.co/storage/v1/object/public/attachments/org_123/files/" },
      });

      const result = await uploadFile(filename, file, pathname);

      expect(result).toHaveProperty("url");
    });

    it("handles large filename", async () => {
      const filename = "a".repeat(255) + ".pdf";
      const pathname = "org_123/files";
      const file = new Blob(["content"], { type: "application/pdf" });

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({
        data: {
          publicUrl: `https://test.supabase.co/storage/v1/object/public/attachments/org_123/files/${filename}`,
        },
      });

      const result = await uploadFile(filename, file, pathname);

      expect(result).toHaveProperty("url");
    });

    it("preserves file MIME type during upload", async () => {
      const mimeTypes = [
        "application/pdf",
        "application/vnd.ms-excel",
        "text/csv",
        "image/png",
        "image/jpeg",
      ];

      for (const mimeType of mimeTypes) {
        mockCreateBucket.mockResolvedValue({ error: null });
        mockUpload.mockResolvedValue({ error: null });
        mockGetPublicUrl.mockReturnValue({
          data: { publicUrl: "https://test.supabase.co/storage/v1/object/public/attachments/org_123/files/file" },
        });

        const file = new Blob(["content"], { type: mimeType });
        await uploadFile("file", file, "org_123/files");

        expect(mockUpload).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(ArrayBuffer),
          expect.objectContaining({ contentType: mimeType })
        );
      }
    });

    it("uses upsert option to allow file replacement", async () => {
      const filename = "invoice.pdf";
      const pathname = "org_123/invoices";
      const file = new Blob(["content"], { type: "application/pdf" });

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: "https://test.supabase.co/storage/v1/object/public/attachments/org_123/invoices/invoice.pdf" },
      });

      await uploadFile(filename, file, pathname);

      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(ArrayBuffer),
        expect.objectContaining({ upsert: true })
      );
    });
  });
});
