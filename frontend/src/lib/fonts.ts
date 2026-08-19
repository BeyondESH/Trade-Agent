/** Font stack string for Canvas contexts (klinecharts etc.).
 *
 * CANVAS SPECIFIC: `ctx.font` is a quoted string like `700 11px <family>`.
 * It does NOT resolve CSS `var()` and does NOT inherit from `font-family` on
 * an ancestor, so this constant must mirror the CSS `--font-sans` stack in
 * src/index.css. Keep the two in sync:
 *   Latin/digits -> "Google Sans Flex Variable" (no CJK glyphs)
 *   CJK          -> "Noto Sans SC Variable"   (contains Latin, must be second)
 *   then         -> system fallbacks.
 */
export const FONT_FAMILY_STACK =
  '"Google Sans Flex Variable", "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei", sans-serif';
