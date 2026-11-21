import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { forUser } from "../lib/db/tenant";
import { importKindleClippings } from "../lib/import/kindle";
import { upsertProgress } from "../lib/progress";

const db = new PrismaClient();
const fixture = readFileSync(new URL("./fixtures/My Clippings.txt", import.meta.url), "utf8");
let a: string, b: string;
beforeEach(async () => {
  await db.user.deleteMany();
  a = (await db.user.create({ data: { email: "a@example.com" } })).id;
  b = (await db.user.create({ data: { email: "b@example.com" } })).id;
});
afterAll(() => db.$disconnect());
const incoming = (year: number, percentage = 50) => ({ percentage, lastReadAt: new Date(year, 0, 1) });

describe("Postgres imports and tenancy", () => {
  it("deduplicates in one file, across imports, and with missing locations", async () => {
    expect(await importKindleClippings(a, fixture + fixture)).toEqual({ booksCreated: 5, highlightsCreated: 6, highlightsSkipped: 6 });
    expect(await importKindleClippings(a, fixture)).toEqual({ booksCreated: 0, highlightsCreated: 0, highlightsSkipped: 6 });
    expect(await db.book.count()).toBe(5);
    expect(await db.highlight.count()).toBe(6);
  });
  it("isolates the same books, highlights and progress for different users", async () => {
    await importKindleClippings(a, fixture);
    const book = (await forUser(a).listBooks())[0];
    expect(await forUser(b).listBooks()).toEqual([]);
    expect(await forUser(b).getBook(book.id)).toBeNull();
    expect(await forUser(b).listHighlights(book.id)).toEqual([]);
    expect(await forUser(b).getProgress(book.id)).toBeNull();
    await expect(forUser(b).addHighlights(book.id, [{ content: "attack", location: "", type: "highlight" }])).rejects.toThrow("Book not found");
    await expect(upsertProgress(b, book.id, incoming(2024))).rejects.toThrow("Book not found");
    await upsertProgress(a, book.id, incoming(2024));
    expect(await forUser(b).getProgress(book.id)).toBeNull();
    await expect(upsertProgress(b, book.id, incoming(2025))).rejects.toThrow("Book not found");
    expect((await forUser(a).getProgress(book.id))?.lastReadAt).toEqual(incoming(2024).lastReadAt);
    expect(await importKindleClippings(b, fixture)).toEqual({ booksCreated: 5, highlightsCreated: 6, highlightsSkipped: 0 });
    expect(await db.book.count()).toBe(10);
    expect(await db.highlight.count()).toBe(12);
  });
  it("ignores empty, malformed, bookmark-only and empty-highlight imports", async () => {
    for (const text of ["", "bad data", "Book\n- Your Bookmark at Location 1\n", "Book\n- Your Highlight at Location 1\n"]) {
      expect(await importKindleClippings(a, text)).toEqual({ booksCreated: 0, highlightsCreated: 0, highlightsSkipped: 0 });
    }
    expect(await db.book.count()).toBe(0);
  });
  it("normalizes source identities and long highlight content without oversized indexes", async () => {
    const content = "Long content ".repeat(3000);
    const text = `BOOK (AUTHOR)\n- Your Highlight at Location 1\n\n${content}\n==========\n book (author)\n- Your Highlight at Location 1\n\n${content.toLowerCase()}\n`;
    expect(await importKindleClippings(a, text)).toEqual({ booksCreated: 1, highlightsCreated: 1, highlightsSkipped: 1 });
  });
  it("handles concurrent imports without duplicate books or highlights", async () => {
    const results = await Promise.all([importKindleClippings(a, fixture), importKindleClippings(a, fixture)]);
    expect(results.reduce((sum, result) => sum + result.booksCreated, 0)).toBe(5);
    expect(results.reduce((sum, result) => sum + result.highlightsCreated, 0)).toBe(6);
  });
  it("rejects imports for a nonexistent user", async () => {
    await expect(importKindleClippings("00000000-0000-0000-0000-000000000000", fixture)).rejects.toThrow();
    expect(await db.book.count()).toBe(0);
    expect(await db.highlight.count()).toBe(0);
  });
});

describe("atomic progress", () => {
  it("creates once, rejects older/equal timestamps, applies newer", async () => {
    const { book } = await forUser(a).ensureKindleBook("Book");
    expect(await upsertProgress(a, book.id, incoming(2024, 40))).toBe(true);
    expect(await upsertProgress(a, book.id, incoming(2023, 10))).toBe(false);
    expect(await upsertProgress(a, book.id, incoming(2024, 90))).toBe(false);
    expect((await forUser(a).getProgress(book.id))?.percentage).toBe(40);
    expect(await upsertProgress(a, book.id, incoming(2025, 80))).toBe(true);
    expect((await forUser(a).getProgress(book.id))?.percentage).toBe(80);
  });
  it("keeps the newest value during concurrent initial creation and updates", async () => {
    const { book } = await forUser(a).ensureKindleBook("Book");
    await Promise.all([2024, 2022, 2025, 2023].map(year => upsertProgress(a, book.id, incoming(year, year - 2000))));
    expect((await forUser(a).getProgress(book.id))?.percentage).toBe(25);
    const results = await Promise.all([upsertProgress(a, book.id, incoming(2026)), upsertProgress(a, book.id, incoming(2026))]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("rejects invalid progress and unknown owners/books", async () => {
    const { book } = await forUser(a).ensureKindleBook("Book");
    await expect(upsertProgress(a, book.id, incoming(2024, -1))).rejects.toThrow("Invalid");
    await expect(upsertProgress(a, book.id, incoming(2024, 101))).rejects.toThrow("Invalid");
    await expect(upsertProgress(a, book.id, { percentage: 10, lastReadAt: new Date("invalid") })).rejects.toThrow("Invalid");
    await expect(upsertProgress(a, "00000000-0000-0000-0000-000000000000", incoming(2024))).rejects.toThrow("Book not found");
    expect(() => forUser("")).toThrow("User ID");
    expect(await forUser(a).getProgress(book.id)).toBeNull();
  });
});
