import { Link } from "./router.tsx";
import { useLibraries } from "./vocabulary.ts";
import { PanelSection } from "./view-panel.tsx";

// The libraries that the graph uses. Each one gives the graph its node and relationship types. General is always on.
export const LibrariesSection = ({ libraryIds, onChange }: { libraryIds: string[]; onChange?: (libraryIds: string[]) => void }) => {
  const { libraries } = useLibraries();
  return (
    <PanelSection
      id="libraries"
      title="Libraries"
      count={libraryIds.length}
      about="A library is a set of node types and relationship types. The graph can use only the types of the libraries that are on. General, the node and the edge without a type, is always on."
      action={
        <Link className="panel-action" to={{ page: "libraries" }} title="Manage the libraries" aria-label="Manage the libraries">
          ⚙
        </Link>
      }
    >
      <ul className="library-list">
        {libraries.map((library) => (
          <li key={library.id}>
            <label className="check" title={library.description}>
              <input
                type="checkbox"
                checked={library.builtIn || libraryIds.includes(library.id)}
                disabled={library.builtIn || onChange == null}
                onChange={(e) => onChange?.(e.target.checked ? [...libraryIds, library.id] : libraryIds.filter((id) => id !== library.id))}
              />
              {library.name}
              <span className="meta">{library.builtIn ? "always on" : `${library.nodeTypes.length} node types`}</span>
            </label>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
};
