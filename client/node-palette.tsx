import { Panel, useReactFlow, useStore } from "@xyflow/react";
import type { DragEvent, ReactNode } from "react";
import { NODE_HEIGHT, NODE_WIDTH } from "../layout.ts";
import type { Position } from "../model.ts";
import { useEnabledLibraries, useVocabulary } from "./vocabulary.ts";

// The drag data type for a node type from the palette. The value is the type id, or "" for a node without a type.
export const NODE_TYPE_DRAG = "application/x-diagram-node-type";

const ICONS: Record<string, ReactNode> = {
  service: (
    <>
      <rect x="3" y="3" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="7" rx="2" />
      <path d="M7 6.5h.01M7 17.5h.01" />
    </>
  ),
  module: <path d="M21 8 12 3 3 8l9 5 9-5ZM3 8v8l9 5 9-5V8M12 13v8" />,
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  "external-system": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
    </>
  ),
  "user-interface": (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  decision: <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />,
  session: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M12 15h5" />
    </>
  ),
  "memory-file": (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  skill: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  plugin: <path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0ZM12 17v5" />,
  agent: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <path d="M12 4v4M9 13h.01M15 13h.01" />
    </>
  ),
  concept: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z" />
    </>
  ),
  domain: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </>
  ),
};

const NO_TYPE_ICON = <path d="M12 7v10M7 12h10" />;

const Icon = ({ id, name }: { id: string | null; name: string }) => {
  const icon = id == null ? NO_TYPE_ICON : ICONS[id];
  if (icon == null) return <span className="palette-letter">{name.slice(0, 1).toUpperCase()}</span>;
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icon}
    </svg>
  );
};

// A bar on the left of the canvas with one button for each node type. Drag a button onto the canvas to add a node of
// that type there, or click it to add the node in the middle of the view.
export const NodePalette = ({ onAdd, footer }: { onAdd: (type: string | null, position: Position) => void; footer?: ReactNode }) => {
  const vocabulary = useVocabulary();
  const enabled = useEnabledLibraries();
  const { getViewport, getNodes } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  // The middle of the view, moved down past any node that is already there, so two clicks do not stack two nodes.
  const freePlaceInView = (): Position => {
    const { x, y, zoom } = getViewport();
    const place = { x: Math.round((width / 2 - x) / zoom - NODE_WIDTH / 2), y: Math.round((height / 2 - y) / zoom - NODE_HEIGHT / 2) };
    const taken = getNodes();
    const covers = (p: Position) => taken.some(({ position }) => Math.abs(position.x - p.x) < NODE_WIDTH && Math.abs(position.y - p.y) < NODE_HEIGHT + 10);
    while (covers(place)) place.y += NODE_HEIGHT + 30;
    return place;
  };

  // One part for each library that the graph uses, and the node without a type (the General library) at the end.
  const parts = [
    ...(enabled ?? [{ id: "all", name: "", nodeTypes: vocabulary.nodeTypes }])
      .filter(({ nodeTypes }) => nodeTypes.length > 0)
      .map(({ id, name, nodeTypes }) => ({ id, name, items: nodeTypes.map((term) => ({ id: term.id as string | null, name: term.name, within: term.within })) })),
    { id: "general", name: "General", items: [{ id: null as string | null, name: "Node without a type", within: [] as string[] }] },
  ];
  const typeName = (id: string) => vocabulary.nodeTypes.find((term) => term.id === id)?.name ?? id;

  return (
    <Panel position="center-left" className="palette-stack">
      <div className="palette" role="group" aria-label="Add a node">
        {parts.map((part, index) => (
          <div key={part.id} className="palette-part" role="group" aria-label={part.name === "" ? undefined : part.name}>
            {index > 0 && <span className="palette-divider" title={part.name} />}
            {part.items.map(({ id, name, within }) => (
              <button
                key={id ?? ""}
                type="button"
                className={`palette-item${id == null ? "" : ` type-${id}`}${within.length > 0 ? " second-tier" : ""}`}
                title={
                  within.length > 0
                    ? `${name} (${part.name}): drop it onto a ${within.map(typeName).join(", ")}, or select one and click`
                    : `${name}${part.name === "" ? "" : ` (${part.name})`}: drag onto the canvas, or click to add`
                }
                aria-label={`Add ${name}`}
                draggable
                onDragStart={(event: DragEvent) => {
                  event.dataTransfer.setData(NODE_TYPE_DRAG, id ?? "");
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onAdd(id, freePlaceInView())}
              >
                <Icon id={id} name={name} />
              </button>
            ))}
          </div>
        ))}
      </div>
      {footer}
    </Panel>
  );
};
