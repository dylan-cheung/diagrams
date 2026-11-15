import { useEffect, useState } from "react";
import type { Vocabulary } from "../model.ts";
import { api } from "./api.ts";
import { GraphList } from "./graph-list.tsx";
import { GraphPage } from "./graph-page.tsx";
import { Guide } from "./guide.tsx";
import { useRoute } from "./router.tsx";
import { VocabularyContext } from "./vocabulary.ts";

export const App = () => {
  const route = useRoute();
  const [vocabulary, setVocabulary] = useState<Vocabulary>({ nodeTypes: [], relationshipTypes: [], statuses: [] });

  useEffect(() => {
    void api.vocabulary().then(setVocabulary);
  }, []);

  return (
    <VocabularyContext value={vocabulary}>
      {route.page === "list" ? <GraphList /> : route.page === "guide" ? <Guide /> : <GraphPage key={route.graphId} route={route} />}
    </VocabularyContext>
  );
};
