import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  uploadFile,
  deleteFile,
  createAttachmentSignedUrl,
  storagePathFromUrl,
} from "@/server/services/storage";
import { createClient } from "@supabase/supabase-js";

// Mock Supabase
vi.mock("@supabase/supabase-js");
vi.mock("@/lib/env", () => ({
  env: {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key-123456",
  },
}));

function makeBlob(mimeType: string): Blob {
  switch (mimeType) {
    case "application/pdf":
      return new Blob(["%PDF-1.7\n"], { type: mimeType });
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], { type: mimeType });
    case "image/png":
      return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: mimeType });
    case "image/jpeg":
      return new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: mimeType });
    case "text/plain":
      return new Blob(["plain content"], { type: mimeType });
    default:
      return new Blob(["content"], { type: mimeType });
  }
}

describe("Storage Service", () => {
  let mockSupabaseClient: any;
  let mockStorageFrom: any;
  let mockUpload: any;
  let mockRemove: any;
  let mockCreateSignedUrl: any;
  let mockCreateBucket: any;
  let mockUpdateBucket: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000000");

    // Setup mock functions
    mockUpload = vi.fn();
    mockRemove = vi.fn();
    mockCreateSignedUrl = vi.fn();
    mockCreateBucket = vi.fn();
    mockUpdateBucket = vi.fn().mockResolvedValue({ error: null });

    // Setup storage.from chain
    mockStorageFrom = vi.fn(() => ({
      upload: mockUpload,
      remove: mockRemove,
      createSignedUrl: mockCreateSignedUrl,
    }));

    // Setup storage mock
    mockSupabaseClient = {
      storage: {
        createBucket: mockCreateBucket,
        updateBucket: mockUpdateBucket,
        from: mockStorageFrom,
      },
    };

    // Mock createClient to return our mock
    (createClient as any).mockReturnValue(mockSupabaseClient);
  });

  describe("uploadFile", () => {
    it("uploads file successfully and returns the storage path", async () => {
      const filename = "invoice.pdf";
      const pathname = "org_123/invoices";
      const file = makeBlob("application/pdf");

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

      const result = await uploadFile(filename, file, pathname);

      expect(result).toEqual({
        path: "org_123/invoices/00000000-0000-4000-8000-000000000000-invoice.pdf",
      });
      expect(mockStorageFrom).toHaveBeenCalledWith("attachments");
      expect(mockUpload).toHaveBeenCalledWith(
        "org_123/invoices/00000000-0000-4000-8000-000000000000-invoice.pdf",
        expect.any(ArrayBuffer),
        {
          contentType: "application/pdf",
          upsert: false,
        }
      );
    });

    it("creates the bucket as PRIVATE", async () => {
      const file = makeBlob("application/pdf");
      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

      await uploadFile("invoice.pdf", file, "org_123/invoices");

      expect(mockCreateBucket).toHaveBeenCalledWith("attachments", { public: false });
      expect(mockUpdateBucket).not.toHaveBeenCalled();
    });

    it("flips a pre-existing bucket private", async () => {
      const file = makeBlob("application/pdf");
      mockCreateBucket.mockResolvedValue({
        error: { message: "bucket already exists" },
      });
      mockUpload.mockResolvedValue({ error: null });

      await uploadFile("invoice.pdf", file, "org_123/invoices");

      expect(mockUpdateBucket).toHaveBeenCalledWith("attachments", { public: false });
    });

    it("throws error when upload fails due to permissions", async () => {
      const filename = "document.pdf";
      const pathname = "org_123/files";
      const file = makeBlob("application/pdf");

      mockCreateBucket.mockResolvedValue({ error: null });

      const uploadError = new Error("Permission denied: User does not have write access");
      mockUpload.mockResolvedValue({ error: uploadError });

      await expect(uploadFile(filename, file, pathname)).rejects.toThrow(
        "Permission denied: User does not have write access"
      );
    });

    it("throws error when bucket creation fails (non-exists)", async () => {
      const filename = "test.txt";
      const pathname = "org_123/docs";
      const file = makeBlob("text/plain");

      const bucketError = new Error("Storage bucket error");
      mockCreateBucket.mockResolvedValue({ error: bucketError });

      await expect(uploadFile(filename, file, pathname)).rejects.toThrow(
        "Storage bucket error"
      );
    });

    it("converts Blob to ArrayBuffer correctly", async () => {
      const filename = "document.docx";
      const pathname = "org_123/documents";
      const file = makeBlob("application/vnd.openxmlformats-officedocument.wordprocessingml.document");

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

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
      const file = makeBlob("application/pdf");

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

      const result = await uploadFile(filename, file, pathname);

      expect(mockUpload).toHaveBeenCalledWith(
        "org_456/invoices/2026-feb/00000000-0000-4000-8000-000000000000-invoice-2026-001.pdf",
        expect.any(ArrayBuffer),
        expect.any(Object)
      );
      expect(result.path).toContain("2026-feb");
      expect(result.path).toContain("invoice-2026-001.pdf");
    });
  });

  describe("storagePathFromUrl", () => {
    it("extracts the path from a legacy public URL", () => {
      expect(
        storagePathFromUrl(
          "https://test.supabase.co/storage/v1/object/public/attachments/org_123/invoices/invoice.pdf",
        ),
      ).toBe("org_123/invoices/invoice.pdf");
    });

    it("passes through a bare storage path", () => {
      expect(storagePathFromUrl("org_123/invoices/invoice.pdf")).toBe(
        "org_123/invoices/invoice.pdf",
      );
    });

    it("returns null for foreign URLs", () => {
      expect(storagePathFromUrl("https://example.com/some/other/path/file.pdf")).toBeNull();
    });
  });

  describe("createAttachmentSignedUrl", () => {
    it("signs a bare storage path", async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/attachments/org_123/invoices/invoice.pdf?token=abc" },
        error: null,
      });

      const url = await createAttachmentSignedUrl("org_123/invoices/invoice.pdf");

      expect(mockStorageFrom).toHaveBeenCalledWith("attachments");
      expect(mockCreateSignedUrl).toHaveBeenCalledWith("org_123/invoices/invoice.pdf", 60);
      expect(url).toContain("token=abc");
    });

    it("signs a legacy public URL by extracting its path", async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: "https://signed.example/x" },
        error: null,
      });

      await createAttachmentSignedUrl(
        "https://test.supabase.co/storage/v1/object/public/attachments/org_123/files/doc.pdf",
      );

      expect(mockCreateSignedUrl).toHaveBeenCalledWith("org_123/files/doc.pdf", 60);
    });

    it("returns null for foreign URLs without calling Supabase", async () => {
      const url = await createAttachmentSignedUrl("https://example.com/file.pdf");

      expect(url).toBeNull();
      expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    });

    it("returns null when Supabase declines", async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: null, error: new Error("not found") });

      const url = await createAttachmentSignedUrl("org_123/files/gone.pdf");

      expect(url).toBeNull();
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

    it("deletes by bare storage path (new rows)", async () => {
      mockRemove.mockResolvedValue({ error: null });

      await deleteFile("org_123/invoices/invoice.pdf");

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

  describe("edge cases and error handling", () => {
    it("handles empty filename", async () => {
      const filename = "";
      const pathname = "org_123/files";
      const file = makeBlob("text/plain");

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

      const result = await uploadFile(filename, file, pathname);

      expect(result).toHaveProperty("path");
    });

    it("handles large filename", async () => {
      const filename = "a".repeat(255) + ".pdf";
      const pathname = "org_123/files";
      const file = makeBlob("application/pdf");

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

      const result = await uploadFile(filename, file, pathname);

      expect(result).toHaveProperty("path");
    });

    it("preserves file MIME type during upload", async () => {
      const mimeTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "image/png",
        "image/jpeg",
      ];

      for (const mimeType of mimeTypes) {
        mockCreateBucket.mockResolvedValue({ error: null });
        mockUpload.mockResolvedValue({ error: null });

        const file = makeBlob(mimeType);
        await uploadFile("file", file, "org_123/files");

        expect(mockUpload).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(ArrayBuffer),
          expect.objectContaining({ contentType: mimeType })
        );
      }
    });

    it("disables upsert so duplicate filenames cannot overwrite earlier uploads", async () => {
      const filename = "invoice.pdf";
      const pathname = "org_123/invoices";
      const file = makeBlob("application/pdf");

      mockCreateBucket.mockResolvedValue({ error: null });
      mockUpload.mockResolvedValue({ error: null });

      await uploadFile(filename, file, pathname);

      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(ArrayBuffer),
        expect.objectContaining({ upsert: false })
      );
    });
  });
});
