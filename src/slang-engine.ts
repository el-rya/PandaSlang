import { slangEntries, type SlangEntry } from './slang-data';

export type SlangMatch = { entry: SlangEntry; start: number; end: number; text: string };
export const normalizeSearch = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ü/g, 'u').replace(/[^\p{L}\p{N}]/gu, '');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function aliasesFor(entry: SlangEntry): string[] {
  const aliases = entry.term.split('/');
  if (entry.term.endsWith('了') && Array.from(entry.term).length > 2) aliases.push(entry.term.slice(0, -1));
  return [...new Set(aliases)];
}

const patterns = slangEntries.flatMap(entry => aliasesFor(entry).map(alias => {
  let source = Array.from(alias).map(escape).join('\\s*');
  if (alias === '233') source = '2\\s*3(?:\\s*3)+';
  if (alias === '666') source = '6(?:\\s*6){2,}';
  if (alias.includes('X') && !/^[a-z]+$/i.test(alias)) source = source.replace('X', '[\\p{Script=Han}A-Za-z]{1,8}');
  const single = Array.from(alias).length === 1;
  if (single) source = `(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])`;
  else {
    if (/^[A-Za-z0-9]/.test(alias)) source = `(?<![A-Za-z0-9])${source}`;
    if (/[A-Za-z0-9]$/.test(alias)) source += '(?![A-Za-z0-9])';
  }
  return { entry, pattern: new RegExp(source, 'giu') };
}));

export function findSlang(text: string): SlangMatch[] {
  const candidates: SlangMatch[] = [];
  for (const { entry, pattern } of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      candidates.push({ entry, start: match.index!, end: match.index! + match[0].length, text: match[0] });
    }
  }
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const matches: SlangMatch[] = [];
  for (const match of candidates) {
    if (!matches.length || match.start >= matches[matches.length - 1].end) matches.push(match);
  }
  return matches;
}

export function searchEntries(query: string, source: SlangEntry[] = slangEntries): SlangEntry[] {
  const q = normalizeSearch(query);
  if (!q) return source;
  return source.filter(entry => [entry.term, entry.pinyin, entry.meaning, entry.literalTranslation, entry.exampleZh, entry.exampleRu, entry.goodContext, entry.badContext].some(value => normalizeSearch(value).includes(q)));
}

export function entryText(entry: SlangEntry): string {
  return `${entry.term} · ${entry.pinyin}\n\nЗначение: ${entry.meaning}\nБуквально: ${entry.literalTranslation}\n\n🟢 Где уместно: ${entry.goodContext}\n🔴 Где осторожно: ${entry.badContext}\n\n${entry.exampleZh}\n${entry.exampleRu}\n\nPanda Slang · база проекта, запись №${entry.id}`;
}

export function downloadText(name: string, text: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
