export interface KindleEntry {
  title: string;
  author?: string;
  type: "highlight" | "note" | "bookmark";
  page?: string;
  location: string;
  addedAt?: Date;
  content: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function buildDate(y: number, m: number, d: number, h: number, min: number, s: number): Date | undefined {
  const date = new Date(y, m - 1, d, h, min, s);
  const valid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    && date.getHours() === h && date.getMinutes() === min && date.getSeconds() === s;
  return valid ? date : undefined;
}

function to24h(hour: number, period?: string): number | undefined {
  if (!period) return hour;
  if (hour < 1 || hour > 12) return undefined;
  return hour % 12 + (/^(下午|pm)$/i.test(period) ? 12 : 0);
}

function parseDate(value: string): Date | undefined {
  const time = String.raw`(上午|下午|AM|PM)?\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?`;
  const chinese = value.match(new RegExp(String.raw`(\d{4})年(\d{1,2})月(\d{1,2})日.*?` + time, "i"));
  const us = value.match(new RegExp(String.raw`([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+` + time, "i"));
  const uk = value.match(new RegExp(String.raw`(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+` + time, "i"));
  let y: number, m: number, d: number, rest: string[];
  if (chinese) {
    [y, m, d] = chinese.slice(1, 4).map(Number);
    rest = chinese.slice(4);
  } else if (us || uk) {
    const match = (us ?? uk)!;
    const [monthName, day] = us ? [match[1], match[2]] : [match[2], match[1]];
    m = MONTHS.indexOf(monthName.toLowerCase()) + 1;
    d = Number(day);
    y = Number(match[3]);
    rest = match.slice(4);
  } else {
    return undefined;
  }
  const [before, h, min, s, after] = rest;
  const hour = to24h(Number(h), before ?? after);
  if (!m || hour === undefined) return undefined;
  return buildDate(y, m, d, hour, Number(min), Number(s));
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
