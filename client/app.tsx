import { useCallback, useEffect, useMemo, useState } from "react";
import type { Library, Vocabulary } from "../model.ts";
import { api } from "./api.ts";
import { ChangeList } from "./change-list.tsx";
import { ChangePage } from "./change-page.tsx";
import { GraphList } from "./graph-list.tsx";
import { GraphPage } from "./graph-page.tsx";
import { Guide } from "./guide.tsx";
import { LibraryList, LibraryPage } from "./library-page.tsx";
import { useRoute } from "./router.tsx";
import { LibrariesContext, VocabularyContext } from "./vocabulary.ts";

export const App = () => {
  const route = useRoute();
  const [vocabulary, setVocabulary] = useState<Vocabulary>({ nodeTypes: [], relationshipTypes: [], statuses: [] });
  const [libraries, setLibraries] = useState<Library[]>([]);

  const reload = useCallback(async () => {
    const [nextVocabulary, nextLibraries] = await Promise.all([api.vocabulary(), api.listLibraries()]);
    setVocabulary(nextVocabulary);
    setLibraries(nextLibraries);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const librariesState = useMemo(() => ({ libraries, reload }), [libraries, reload]);

  return (
    <VocabularyContext value={vocabulary}>
      <LibrariesContext value={librariesState}>
      {route.page === "list" ? (
        <GraphList />
      ) : route.page === "libraries" ? (
        <LibraryList />
      ) : route.page === "library" ? (
        <LibraryPage key={route.libraryId} libraryId={route.libraryId} />
      ) : route.page === "guide" ? (
        <Guide />
      ) : route.page === "changes" ? (
        <ChangeList />
      ) : route.page === "change" ? (
        <ChangePage key={route.changeId} changeId={route.changeId} view={route.view} />
      ) : (
        <GraphPage key={route.graphId} route={route} />
      )}
      </LibrariesContext>
    </VocabularyContext>
  );
};
