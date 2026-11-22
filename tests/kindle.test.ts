import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKindleClippings } from "../lib/parsers/kindle";

const fixture = readFileSync(new URL("./fixtures/My Clippings.txt", import.meta.url), "utf8");
describe("Kindle parser", () => {
  it("handles BOM, CRLF, multiline content and last parenthesized author", () => {
    const entries = parseKindleClippings("\uFEFF" + fixture.replaceAll("\n", "\r\n"));
    expect(entries).toHaveLength(9);
    expect(entries[0]).toMatchObject({ title: "The Book (A Journey)", author: "Jane Author", type: "highlight", page: "12", location: "123-125", content: "First line.\nSecond line." });
    expect(entries[0].addedAt).toEqual(new Date(2024, 0, 1, 22, 0, 0));
  });
  it("handles UK dates, missing authors, and location-only notes", () => {
    const entry = parseKindleClippings(fixture)[1];
    expect(entry).toMatchObject({ title: "Anonymous Book", type: "note", location: "42", content: "A note." });
    expect(entry.author).toBeUndefined();
    expect(entry.page).toBeUndefined();
    expect(entry.addedAt).toEqual(new Date(2024, 0, 1, 22, 0, 0));
  });
  it("retains empty highlights and bookmarks", () => {
    const entries = parseKindleClippings(fixture);
    expect(entries[2]).toMatchObject({ type: "highlight", content: "", location: "" });
    expect(entries[3]).toMatchObject({ type: "bookmark", content: "", page: "3" });
  });
  it("handles Chinese highlights, notes, bookmarks, pages, locations and 12-hour dates", () => {
    const entries = parseKindleClippings(fixture);
    expect(entries[4]).toMatchObject({ title: "中文書", author: "作者", type: "highlight", page: "12", location: "123-125" });
    expect(entries[4].addedAt).toEqual(new Date(2020, 0, 1, 21));
    expect(entries[5]).toMatchObject({ type: "note", location: "126" });
    expect(entries[5].page).toBeUndefined();
    expect(entries[5].addedAt).toEqual(new Date(2020, 0, 1, 9));
    expect(entries[6]).toMatchObject({ type: "bookmark", location: "127", content: "" });
    expect(entries[6].addedAt).toEqual(new Date(2020, 0, 1));
  });
  it("supports absent locations and invalid dates without throwing", () => {
    const entries = parseKindleClippings(fixture);
    expect(entries[7]).toMatchObject({ location: "", content: "No location content" });
    expect(entries[8].addedAt).toBeUndefined();
  });
  it("rejects impossible calendar dates instead of rolling them over", () => {
    const block = (date: string) => parseKindleClippings(`Book (Author)\n- Your Highlight on Location 1 | Added on ${date}\n\nText`)[0].addedAt;
    expect(block("Friday, February 30, 2024 10:00:00 PM")).toBeUndefined();
    expect(block("Friday, 31 April 2024 22:00:00")).toBeUndefined();
    expect(block("Friday, 1 March 2024 25:00:00")).toBeUndefined();
    expect(block("Thursday, February 29, 2024 10:00:00 PM")).toEqual(new Date(2024, 1, 29, 22));
    expect(parseKindleClippings("書 (作者)\n- 您在位置 #1 的标注 | 添加于 2023年2月29日星期三 下午9:00:00\n\n文字")[0].addedAt).toBeUndefined();
  });
  it("skips malformed blocks and empty input", () => {
    expect(parseKindleClippings("")).toEqual([]);
    expect(parseKindleClippings("Broken\n==========\nTitle\n- Unrecognized header")).toEqual([]);
  });
});
