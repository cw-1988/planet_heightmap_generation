// The plate-edit key: Ctrl, or ⌘ on a Mac. Only that one: the Windows key (also `metaKey`) is the system's, and held it
// lit up the plates (owner, 2026-11-20: "that is what ctrl is for").

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform ?? navigator.platform ?? '');

/** Whether the edit key is held in this pointer or key event. */
export const editHeld = (e) => (IS_MAC ? e.metaKey : e.ctrlKey);

/** Whether `key` (a KeyboardEvent's key) is the edit key itself. */
export const isEditKey = (key) => key === (IS_MAC ? 'Meta' : 'Control');
