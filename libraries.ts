import type { LibraryInput, NodeTypeTerm } from "./model.ts";

export const GENERAL_LIBRARY_ID = "general";

const firstTier = (id: string, name: string, description: string): NodeTypeTerm => ({ id, name, description, within: [] });

export const GENERAL_LIBRARY = {
  id: GENERAL_LIBRARY_ID,
  name: "General",
  description: "The node and the edge without a type. Every graph has this library, so every graph can be a basic graph.",
  nodeTypes: [],
  relationshipTypes: [],
} satisfies LibraryInput;

export const SYSTEMS_LIBRARY = {
  id: "systems",
  name: "Systems",
  description: "The parts of a software system: services, modules, databases, other systems, user interfaces and decisions.",
  nodeTypes: [
    firstTier("service", "Service", "A deployable unit that runs on its own and serves requests."),
    firstTier("module", "Module", "A part of the code inside a service or an app, such as a package or a library."),
    firstTier("database", "Database", "A store that keeps data, such as a SQL database, a cache or a queue."),
    firstTier("external-system", "External System", "A system that another team or company owns and runs."),
    firstTier("user-interface", "User Interface", "A screen, page or app that people use."),
    firstTier("decision", "Decision", "A point where the flow takes one of two or more paths."),
  ],
  relationshipTypes: [
    { id: "calls", name: "Calls", description: "The source sends a request to the target and waits for the response." },
    { id: "publishes-event", name: "Publishes Event", description: "The source sends an event to the target, which is a topic, queue or bus." },
    { id: "consumes-event", name: "Consumes Event", description: "The source receives events from the target, which is a topic, queue or bus." },
    { id: "reads-from", name: "Reads From", description: "The source reads data from the target." },
    { id: "writes-to", name: "Writes To", description: "The source writes data to the target." },
    { id: "depends-on", name: "Depends On", description: "The source needs the target to work, for example as a library or at build time." },
  ],
} satisfies LibraryInput;

const CLAUDE_PARTS = [
  firstTier("session", "Session", "A running Claude Code agent: a CLI session, a background job or a subagent run."),
  firstTier("memory-file", "Memory File", "A file that a session loads into its context at start: a CLAUDE.md, an @import or the auto-memory MEMORY.md."),
  firstTier("settings-file", "Settings File", "A settings.json: permissions, hooks, environment variables, the model and MCP servers."),
  firstTier("skill", "Skill", "A folder with a SKILL.md. The Skill tool loads it when a task needs it."),
  firstTier("plugin", "Plugin", "A package from a marketplace that provides skills, agents, commands, hooks or MCP servers."),
  firstTier("agent", "Agent", "A subagent definition: a file in .claude/agents with its prompt, its model and its tools."),
  firstTier("slash-command", "Slash Command", "A command file that the user runs with /name."),
  firstTier("hook", "Hook", "A command that the harness runs on an event, for example before a tool call or at the start of a session."),
  firstTier("mcp-server", "MCP Server", "A server that gives a session tools: a local server or a claude.ai connector."),
  firstTier("output-style", "Output Style", "A file that changes how a session writes its replies."),
];

export const CLAUDE_CODE_LIBRARY = {
  id: "claude-code",
  name: "Claude Code",
  description:
    "The parts of a Claude Code setup: sessions, memory files, settings, skills, plugins, agents, commands, hooks, MCP servers and output styles. A concept is one idea inside one of these parts.",
  nodeTypes: [
    ...CLAUDE_PARTS,
    {
      id: "concept",
      name: "Concept",
      description: "One idea that a part of the setup defines or uses, for example a rule in a memory file or a step of a skill. A concept is always within a part.",
      within: CLAUDE_PARTS.map(({ id }) => id),
    },
  ],
  relationshipTypes: [
    { id: "loads", name: "Loads", description: "The source puts the target into its context, for example a session loads a memory file at start." },
    { id: "invokes", name: "Invokes", description: "The source runs the target, for example a session runs a skill, an agent or a command." },
    { id: "provides", name: "Provides", description: "The source ships the target, for example a plugin provides a skill." },
    { id: "references", name: "References", description: "The source points to the target, for example a CLAUDE.md links to a document." },
    { id: "configures", name: "Configures", description: "The source sets how the target behaves, for example a settings.json turns on a hook." },
    { id: "connects-to", name: "Connects To", description: "The source reaches the target through an MCP server or an API." },
  ],
} satisfies LibraryInput;

const IN_DOMAIN = ["domain"];

export const CODEBASE_LIBRARY = {
  id: "codebase",
  name: "Codebase",
  description: "The structure of a code base: domains that send HTTP requests to each other, and the controller, service and repository layers inside each domain.",
  nodeTypes: [
    firstTier("domain", "Domain", "A part of the code base that owns one business area and serves it over HTTP, for example orders or billing."),
    { id: "controller-layer", name: "Controller Layer", description: "The HTTP handlers of a domain. They read the request, call the service layer and write the response.", within: IN_DOMAIN },
    { id: "service-layer", name: "Service Layer", description: "The business logic of a domain. It applies the rules and calls the repository layer.", within: IN_DOMAIN },
    { id: "repository-layer", name: "Repository Layer", description: "The data access of a domain. It reads and writes the database.", within: IN_DOMAIN },
  ],
  relationshipTypes: [
    { id: "http-request", name: "HTTP Request", description: "The source sends an HTTP request to the target. Put the method and the path in the label, for example POST /orders." },
    { id: "in-process-call", name: "In-Process Call", description: "The source calls the target in the same process, for example a controller calls a service." },
  ],
} satisfies LibraryInput;

// The libraries that a database gets when it has none yet. The graphs that exist then get Systems, so their types stay valid.
export const SEED_LIBRARIES = [GENERAL_LIBRARY, SYSTEMS_LIBRARY, CLAUDE_CODE_LIBRARY, CODEBASE_LIBRARY];
