import { useEffect, useRef, useState, type FormEvent } from "react";
import { GROUP_COLORS, type Group, type GroupInput } from "../model.ts";
import { NO_FILL, TextAreaField, TextField } from "./fields.tsx";
import { PanelSection } from "./view-panel.tsx";

type Member = { id: string; name: string };

export type GroupActions = {
  update: (groupId: string, patch: Partial<GroupInput>) => void;
  remove: (groupId: string) => void;
  showNode: (nodeId: string) => void;
};

// The groups of the graph. The panel shows them when nothing is selected.
export const GroupsSection = ({
  groups,
  sizes,
  onOpen,
  onCreate,
}: {
  groups: Group[];
  sizes: Map<string, number>;
  onOpen: (groupId: string) => void;
  onCreate?: (input: GroupInput) => void;
}) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onCreate == null || name.trim() === "") return;
    onCreate({ name: name.trim() });
    setName("");
    setAdding(false);
  };
  return (
    <PanelSection
      id="groups"
      title="Groups"
      count={groups.length}
      about="A group is a named box that holds a set of nodes, for example the parts that one file defines. A node is in at most one group."
      action={
        onCreate != null && (
          <button type="button" className="panel-action" onClick={() => setAdding(!adding)} aria-label="New group" title="New group">
            +
          </button>
        )
      }
    >
      {adding && (
        <form className="flow-new" autoComplete="off" onSubmit={submit}>
          <input
            value={name}
            placeholder="Name of the new group"
            aria-label="Name of the new group"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false);
            }}
            autoFocus
            {...NO_FILL}
          />
          <button type="submit" disabled={name.trim() === ""}>
            Add
          </button>
        </form>
      )}
      {groups.length === 0 ? (
        !adding && <p className="meta">No groups. {onCreate != null && "Click + to make one, then pick it for nodes in their inspector."}</p>
      ) : (
        <ul className="versions">
          {groups.map((group) => (
            <li key={group.id}>
              <button type="button" className="link" onClick={() => onOpen(group.id)} title={group.description}>
                {group.name}
              </button>
              <span className="meta">{sizes.get(group.id) ?? 0} nodes</span>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
};

const isHex = (color: string | null): color is string => color?.startsWith("#") === true;

// Any color from the system color picker. The picker saves the color when it closes, not at each move, so a drag through
// the colors does not save each one.
const CustomColor = ({ value, onPick }: { value: string | null; onPick: (color: string) => void }) => {
  const input = useRef<HTMLInputElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    const element = input.current;
    const changed = () => element != null && pick.current(element.value);
    element?.addEventListener("change", changed);
    return () => element?.removeEventListener("change", changed);
  }, []);
  return (
    <label className={`swatch custom${isHex(value) ? " current" : ""}`} style={isHex(value) ? { background: value } : undefined} title="Any color">
      <input ref={input} type="color" defaultValue={isHex(value) ? value : "#888888"} aria-label="Any color" />
    </label>
  );
};

// The color of a group's box: Auto takes the named colors in the order of the groups.
const ColorField = ({ value, onPick }: { value: string | null; onPick: (color: string | null) => void }) => (
  <div className="field">
    <span>Color</span>
    <div className="color-swatches">
      <button type="button" className={`swatch auto${value == null ? " current" : ""}`} onClick={() => onPick(null)} aria-pressed={value == null} title="Auto: the next color in order">
        Auto
      </button>
      {GROUP_COLORS.map((name) => (
        <button
          key={name}
          type="button"
          className={`swatch${value === name ? " current" : ""}`}
          style={{ background: `var(--group-${name})` }}
          onClick={() => onPick(name)}
          aria-pressed={value === name}
          aria-label={name}
          title={name}
        />
      ))}
      <CustomColor key={value ?? "auto"} value={value} onPick={onPick} />
    </div>
  </div>
);

// One group: its name, its description and its nodes. In a published version it is read-only.
export const GroupInspector = ({ group, members, readOnly, actions }: { group: Group; members: Member[]; readOnly: boolean; actions: GroupActions }) => (
  <section className="section">
    <h2>Group</h2>
    {readOnly ? (
      <>
        <p className="endpoints">{group.name}</p>
        {group.description !== "" && <p className="hint">{group.description}</p>}
      </>
    ) : (
      <>
        <TextField label="Name" value={group.name} onCommit={(name) => name.trim() !== "" && actions.update(group.id, { name })} />
        <TextAreaField
          label="Description"
          placeholder="What the nodes in this group have in common"
          value={group.description}
          onCommit={(description) => actions.update(group.id, { description })}
        />
        <ColorField value={group.color} onPick={(color) => actions.update(group.id, { color })} />
      </>
    )}
    <div className="field">
      <span>Nodes · {members.length}</span>
      {members.length === 0 ? (
        <p className="meta">No nodes. {!readOnly && "Select a node and pick this group in its inspector."}</p>
      ) : (
        <ul className="versions">
          {members.map((member) => (
            <li key={member.id}>
              <button type="button" className="link" onClick={() => actions.showNode(member.id)}>
                {member.name}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="link"
                  onClick={() => actions.update(group.id, { nodeIds: members.filter(({ id }) => id !== member.id).map(({ id }) => id) })}
                  aria-label={`Take ${member.name} out of the group`}
                  title="Take this node out of the group"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
    {!readOnly && (
      <button
        type="button"
        className="danger"
        onClick={() => {
          if (confirm(`Delete the group "${group.name}"? Its nodes stay in the graph.`)) actions.remove(group.id);
        }}
      >
        Delete group
      </button>
    )}
    <p className="mono">{group.id}</p>
  </section>
);
