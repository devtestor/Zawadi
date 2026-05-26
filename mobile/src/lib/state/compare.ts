import { create } from "zustand";

const MAX = 3;

interface CompareState {
  ids: string[];
  add: (id: string) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  ids: [],
  add: (id) => {
    const cur = get().ids;
    if (cur.includes(id)) return true;
    if (cur.length >= MAX) return false;
    set({ ids: [...cur, id] });
    return true;
  },
  remove: (id) => set({ ids: get().ids.filter((x) => x !== id) }),
  clear: () => set({ ids: [] }),
  has: (id) => get().ids.includes(id),
}));

export const MAX_COMPARE = MAX;
