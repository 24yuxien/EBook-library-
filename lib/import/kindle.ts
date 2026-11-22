import { forUser, bookSourceKey } from "../db/tenant";
import { parseKindleClippings, type KindleEntry } from "../parsers/kindle";

export async function importKindleClippings(userId: string, fileText: string) {
  const tenant = forUser(userId);
  const groups = new Map<string, KindleEntry[]>();
  for (const entry of parseKindleClippings(fileText)) {
    if (entry.type === "bookmark" || !entry.content.trim()) continue;
    const key = bookSourceKey(entry.title, entry.author);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  let booksCreated = 0, highlightsCreated = 0, highlightsSkipped = 0;
  for (const entries of groups.values()) {
    const { book, created } = await tenant.ensureKindleBook(entries[0].title, entries[0].author);
    if (created) booksCreated++;
    const result = await tenant.addHighlights(book.id, entries.map(entry => ({
      content: entry.content, location: entry.location, type: entry.type as "highlight" | "note", highlightedAt: entry.addedAt,
    })));
    highlightsCreated += result.count;
    highlightsSkipped += entries.length - result.count;
  }
  return { booksCreated, highlightsCreated, highlightsSkipped };
}
