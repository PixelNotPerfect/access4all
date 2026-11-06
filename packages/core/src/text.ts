/** Retire la syntaxe Markdown (liens vers le glossaire, code, emphase) d'un texte RGAA. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*]+)\*/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
