import type { Suggestion } from "./types.js";

/**
 * Applies dismissal state to suggestions without mutating the originals.
 * Pure function — no side effects.
 */
export function applyDismissals(
  suggestions: Suggestion[],
  dismissedIds: Set<string>
): Suggestion[] {
  return suggestions.map((s) => ({
    ...s,
    dismissed: dismissedIds.has(s.id),
  }));
}

/**
 * Persistence interface for dismissed suggestion IDs.
 * Allows the core tracker to remain pure while the platform provides storage.
 */
export interface DismissalStore {
  load(): string[];
  save(ids: string[]): void;
}

/**
 * Creates a stateful dismissal tracker with auto-expiry.
 *
 * Dismissals are context-aware: when `apply()` runs, any dismissed IDs
 * not present in the current suggestions are pruned. This means if a user
 * dismisses "close-lock-file", closes the lock file, then reopens it later,
 * the warning reappears.
 */
export function createDismissalTracker(store?: DismissalStore) {
  const dismissed = new Set<string>(store?.load() ?? []);

  function persist(): void {
    store?.save([...dismissed]);
  }

  return {
    dismiss(id: string): void {
      dismissed.add(id);
      persist();
    },

    clear(): void {
      dismissed.clear();
      persist();
    },

    apply(suggestions: Suggestion[]): Suggestion[] {
      // Prune dismissed IDs that are no longer in the current suggestions.
      // This auto-expires dismissals when the underlying condition clears.
      const currentIds = new Set(suggestions.map((s) => s.id));
      let pruned = false;
      for (const id of dismissed) {
        if (!currentIds.has(id)) {
          dismissed.delete(id);
          pruned = true;
        }
      }
      if (pruned) {
        persist();
      }

      return applyDismissals(suggestions, dismissed);
    },
  };
}
