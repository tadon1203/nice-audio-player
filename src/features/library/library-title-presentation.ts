const latinMediaTitle = /^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\p{Mark}]+$/u;

export function usesCharacterTitle(title: string) {
  return latinMediaTitle.test(title) && title.trim().split(/\s+/u).length <= 6;
}
