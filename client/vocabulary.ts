import { createContext, useContext } from "react";
import type { Vocabulary } from "../model.ts";

export const VocabularyContext = createContext<Vocabulary>({ nodeTypes: [], relationshipTypes: [], statuses: [] });

export const useVocabulary = () => useContext(VocabularyContext);
