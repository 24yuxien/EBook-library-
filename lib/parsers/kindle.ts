export interface KindleEntry {
  title: string;
  author?: string;
  type: "highlight" | "note" | "bookmark";
  page?: string;
  location: string;
  addedAt?: Date;
  content: string;
}

function parseDate(value: string): Date | undefined {
  const chinese = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日.*?(上午|下午)?\s*(\d{1,2}):(\d{2}):(\d{2})/);
  let date: Date;
  if (chinese) {
    const [, y, m, d, period, h, min, s] = chinese;
    let hour = Number(h);
    if (period) hour = hour % 12 + (period === "下午" ? 12 : 0);
    date = new Date(Number(y), Number(m) - 1, Number(d), hour, Number(min), Number(s));
  } else {
    date = new Date(value.replace(/^[A-Za-z]+,\s*/, ""));
  }
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseKindleClippings(text: string): KindleEntry[] {
  const entries: KindleEntry[] = [];
  for (const block of text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/^==========\s*$/m)) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    const titleLine = lines[0].trim();
    const header = lines[1].trim();
    if (!header.startsWith("-")) continue;
    const type = /\bHighlight\b/i.test(header) || /标注|標註/.test(header) ? "highlight"
      : /\bNote\b/i.test(header) || /笔记|筆記/.test(header) ? "note"
      : /\bBookmark\b/i.test(header) || /书签|書籤/.test(header) ? "bookmark" : undefined;
    if (!type || !titleLine) continue;
    const authorMatch = titleLine.match(/^(.*)\s+\(([^()]*)\)$/);
    const title = (authorMatch?.[1] ?? titleLine).trim();
    if (!title) continue;
    const page = header.match(/\bpage\s+(\d+(?:-\d+)?)/i)?.[1] ?? header.match(/第\s*(\d+(?:-\d+)?)\s*[页頁]/)?.[1];
    const location = header.match(/(?:\bLocation\s*|位置\s*#?)(\d+(?:-\d+)?)/i)?.[1] ?? "";
    const dateText = header.match(/(?:Added on\s+|添加于\s*|新增於\s*)(.+)$/i)?.[1];
    entries.push({ title, author: authorMatch?.[2].trim() || undefined, type, page, location,
      addedAt: dateText ? parseDate(dateText) : undefined, content: lines.slice(2).join("\n").trim() });
  }
  return entries;
}
