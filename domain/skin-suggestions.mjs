const SKINS = new Set(['hadid', 'waraq', 'rukham']);

function blockKey(block) {
  return String(block ?? '');
}

/**
 * Return a proposed skin at a true block transition, without changing settings.
 * Applying the result is deliberately a separate, user-gesture-only action.
 */
export function suggestionForBlockBoundary({ previousBlock, currentBlock, settings }) {
  if (previousBlock == null || previousBlock === currentBlock) return null;
  if (settings?.block_auto_color === false) return null;

  const key = blockKey(currentBlock);
  const proposedSkin = settings?.block_skin_suggestions?.[key];
  if (!SKINS.has(proposedSkin)) return null;
  if (proposedSkin === settings?.skin) return null;
  if (settings?.block_skin_rejections?.[key]) return null;

  return { block: currentBlock, skin: proposedSkin };
}

export function rejectedSkinSuggestion(rejections, block) {
  return { ...(rejections || {}), [blockKey(block)]: true };
}
