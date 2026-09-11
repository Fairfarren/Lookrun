export type LineHits = Map<number, number>;
export type FileHits = Map<string, LineHits>;

export function normalizeSourcePath(filePath: string) {
  const posix = filePath.replaceAll("\\", "/");
  const cwd = `${process.cwd().replaceAll("\\", "/")}/`;
  if (posix.startsWith(cwd)) {
    return posix.slice(cwd.length);
  }
  if (posix.startsWith("./")) {
    return posix.slice(2);
  }
  return posix;
}

export function parseLcov(text: string) {
  const files: FileHits = new Map();
  let currentFile = "";
  let currentLines: LineHits = new Map();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      currentFile = normalizeSourcePath(line.slice(3));
      currentLines = new Map();
      continue;
    }
    if (line.startsWith("DA:")) {
      const [lineNo, hits] = line.slice(3).split(",");
      currentLines.set(Number(lineNo), Number(hits));
      continue;
    }
    if (line === "end_of_record" && currentFile) {
      files.set(currentFile, currentLines);
      currentFile = "";
    }
  }
  return files;
}

export function coverageInRange(hits: LineHits, range: { startLine: number; endLine: number }) {
  let total = 0;
  let covered = 0;
  for (const [line, count] of hits) {
    if (line < range.startLine || line > range.endLine) {
      continue;
    }
    total += 1;
    if (count > 0) {
      covered += 1;
    }
  }
  if (total === 0) {
    return 0;
  }
  return covered / total;
}
