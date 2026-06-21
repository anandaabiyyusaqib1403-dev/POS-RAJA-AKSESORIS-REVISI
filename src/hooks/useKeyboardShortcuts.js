import { useEffect, useRef } from "react";

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesShortcut(event, shortcut) {
  const key = normalizeKey(shortcut.key);
  return (
    normalizeKey(event.key) === key &&
    Boolean(shortcut.ctrlKey) === event.ctrlKey &&
    Boolean(shortcut.altKey) === event.altKey &&
    Boolean(shortcut.shiftKey) === event.shiftKey &&
    Boolean(shortcut.metaKey) === event.metaKey
  );
}

function isTypingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target?.isContentEditable
  );
}

export function useKeyboardShortcuts(shortcuts, enabled = true) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      const activeShortcuts = shortcutsRef.current || [];
      const shortcut = activeShortcuts.find((item) => {
        if (!item || item.disabled) return false;
        if (item.allowInInput !== true && isTypingTarget(event.target)) {
          return false;
        }
        return matchesShortcut(event, item);
      });

      if (!shortcut) return;

      event.preventDefault();
      shortcut.action?.(event);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
