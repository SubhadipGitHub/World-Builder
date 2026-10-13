// Clipboard adapter (SH-7, §21 J8): true when copied, false on any failure (the UI then shows the
// manual-copy fallback). Never throws.

export async function copyText(text: string): Promise<boolean> {
  try {
    // Missing outside secure contexts (e.g. file://) and in some embeds.
    const clipboard = (globalThis.navigator as { clipboard?: Pick<Clipboard, 'writeText'> } | undefined)?.clipboard;
    if (!clipboard) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
