import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { CHANGE_VIEWS, type ChangeView } from "../change-items.ts";

export type Route =
  | { page: "list" }
  | { page: "guide" }
  | { page: "graph"; graphId: string }
  | { page: "proposal"; graphId: string; proposalId: string }
  | { page: "changes" }
  | { page: "libraries" }
  | { page: "library"; libraryId: string }
  | { page: "change"; changeId: string; view: ChangeView };

export const parsePath = (pathname: string): Route => {
  const [root, graphId, part, proposalId] = pathname.split("/").filter((segment) => segment !== "").map(decodeURIComponent);
  if (root === "guide") return { page: "guide" };
  if (root === "libraries") return graphId == null ? { page: "libraries" } : { page: "library", libraryId: graphId };
  if (root === "changes") {
    if (graphId == null) return { page: "changes" };
    const view = CHANGE_VIEWS.find((item) => item.view === part)?.view ?? "idea";
    return { page: "change", changeId: graphId, view };
  }
  if (root !== "graphs" || graphId == null) return { page: "list" };
  if (part === "proposals" && proposalId != null) return { page: "proposal", graphId, proposalId };
  // A graph has one page. Old links to /graphs/{id}/edit open it too.
  return { page: "graph", graphId };
};

export const routePath = (route: Route) => {
  if (route.page === "list") return "/";
  if (route.page === "guide") return "/guide";
  if (route.page === "changes") return "/changes";
  if (route.page === "libraries") return "/libraries";
  if (route.page === "library") return `/libraries/${encodeURIComponent(route.libraryId)}`;
  if (route.page === "change") return `/changes/${encodeURIComponent(route.changeId)}/${route.view}`;
  const base = `/graphs/${encodeURIComponent(route.graphId)}`;
  if (route.page === "proposal") return `${base}/proposals/${encodeURIComponent(route.proposalId)}`;
  return base;
};

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
};

const navigate = (to: string, replace: boolean) => {
  if (to === location.pathname) return;
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  for (const listener of listeners) listener();
};

export const go = (route: Route, replace = false) => navigate(routePath(route), replace);

export const useRoute = () => {
  const pathname = useSyncExternalStore(subscribe, () => location.pathname);
  return useMemo(() => parsePath(pathname), [pathname]);
};

const plainClick = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export const Link = ({ to, replace = false, onClick, ...props }: { to: Route; replace?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) => {
  const href = routePath(to);
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !plainClick(event)) return;
        event.preventDefault();
        navigate(href, replace);
      }}
    />
  );
};
