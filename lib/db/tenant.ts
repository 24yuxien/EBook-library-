import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const globalDb = globalThis as unknown as { bookvaultDb?: PrismaClient };
const db = globalDb.bookvaultDb ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.bookvaultDb = db;

export function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function bookSourceKey(title: string, author?: string): string {
  return createHash("sha256").update(JSON.stringify([normalize(title), normalize(author ?? "")])).digest("hex");
}

export function forUser(userId: string) {
  if (!userId) throw new Error("User ID is required");
  const owned = async (bookId: string) => {
    if (!await db.book.findFirst({ where: { id: bookId, userId }, select: { id: true } })) throw new Error("Book not found");
  };
  return {
    listBooks: () => db.book.findMany({ where: { userId } }),
    getBook: (bookId: string) => db.book.findFirst({ where: { id: bookId, userId } }),
    async ensureKindleBook(title: string, author?: string) {
      const sourceKey = bookSourceKey(title, author);
      const result = await db.book.createMany({ data: [{ userId, platform: "kindle", sourceKey, title, author }], skipDuplicates: true });
      const book = await db.book.findUniqueOrThrow({ where: { userId_platform_sourceKey: { userId, platform: "kindle", sourceKey } } });
      return { book, created: result.count === 1 };
    },
    listHighlights: (bookId: string) => db.highlight.findMany({ where: { bookId, book: { userId } } }),
    async addHighlights(bookId: string, entries: { content: string; location: string; type: "highlight" | "note"; highlightedAt?: Date }[]) {
      await owned(bookId);
      return db.highlight.createMany({ data: entries.map(entry => ({ ...entry, bookId,
        contentHash: createHash("sha256").update(normalize(entry.content)).digest("hex") })), skipDuplicates: true });
    },
    getProgress: (bookId: string) => db.readingProgress.findFirst({ where: { bookId, book: { userId } } }),
    async applyProgress(bookId: string, incoming: { percentage: number; lastReadAt: Date }) {
      if (!Number.isFinite(incoming.percentage) || incoming.percentage < 0 || incoming.percentage > 100 || !Number.isFinite(incoming.lastReadAt.getTime())) {
        throw new Error("Invalid reading progress");
      }
      await owned(bookId);
      // The ownership predicate and timestamp comparison remain inside the atomic write.
      const count = await db.$executeRaw(Prisma.sql`
        INSERT INTO "ReadingProgress" ("id", "bookId", "percentage", "lastReadAt", "updatedAt")
        SELECT gen_random_uuid(), "id", ${incoming.percentage}, ${incoming.lastReadAt}, NOW()
        FROM "Book" WHERE "id" = ${bookId}::uuid AND "userId" = ${userId}::uuid
        ON CONFLICT ("bookId") DO UPDATE
        SET "percentage" = EXCLUDED."percentage", "lastReadAt" = EXCLUDED."lastReadAt", "updatedAt" = NOW()
        WHERE "ReadingProgress"."lastReadAt" < EXCLUDED."lastReadAt"
      `);
      return count === 1;
    },
  };
}
