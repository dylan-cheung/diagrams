import { Link } from "./router.tsx";

// The app's top-level places. Graphs and Guide are pages of this app. API opens the generated API docs in a new tab.
export const AppNav = ({ current }: { current: "list" | "guide" }) => (
  <nav className="app-nav" aria-label="App">
    <Link to={{ page: "list" }} aria-current={current === "list" ? "page" : undefined}>
      Graphs
    </Link>
    <Link to={{ page: "guide" }} aria-current={current === "guide" ? "page" : undefined}>
      Guide
    </Link>
    <a href="/docs" target="_blank" rel="noreferrer">
      API ↗
    </a>
  </nav>
);
