import { createContext, useContext } from "react";
import type { Library, Vocabulary } from "../model.ts";

// The vocabulary of all libraries. The editor uses it to show the name of any type, also one that a graph does not use.
export const VocabularyContext = createContext<Vocabulary>({ nodeTypes: [], relationshipTypes: [], statuses: [] });

export const useVocabulary = () => useContext(VocabularyContext);

export type LibrariesState = { libraries: Library[]; reload: () => Promise<void> };

export const LibrariesContext = createContext<LibrariesState>({ libraries: [], reload: async () => {} });

export const useLibraries = () => useContext(LibrariesContext);

// The libraries that the open graph uses. The palette and the inspector offer only their types.
export const EnabledLibrariesContext = createContext<Library[] | null>(null);

export const useEnabledVocabulary = (): Vocabulary => {
  const all = useVocabulary();
  const enabled = useContext(EnabledLibrariesContext);
  if (enabled == null) return all;
  return {
    nodeTypes: enabled.flatMap(({ nodeTypes }) => nodeTypes),
    relationshipTypes: enabled.flatMap(({ relationshipTypes }) => relationshipTypes),
    statuses: all.statuses,
  };
};

export const useEnabledLibraries = () => useContext(EnabledLibrariesContext);
