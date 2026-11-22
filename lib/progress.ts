import { forUser } from "./db/tenant";

export function upsertProgress(userId: string, bookId: string, incoming: { percentage: number; lastReadAt: Date }) {
  return forUser(userId).applyProgress(bookId, incoming);
}
