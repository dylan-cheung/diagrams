import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

export type Route =
  | { page: "list" }
  | { page: "guide" }
  | { page: "graph"; graphId: string; flowId?: string; runId?: string }
  | { page: "proposal"; graphId: string; proposalId: string };

export const parsePath = (pathname: string): Route => {
  const [root, graphId, part, id, subPart, subId] = pathname.split("/").filter((segment) => segment !== "").map(decodeURIComponent);
  if (root === "guide") return { page: "guide" };
  if (root !== "graphs" || graphId == null) return { page: "list" };
  if (part === "proposals" && id != null) return { page: "proposal", graphId, proposalId: id };
  if (part === "flows" && id != null) return subPart === "runs" && subId != null ? { page: "graph", graphId, flowId: id, runId: subId } : { page: "graph", graphId, flowId: id };
  // A graph has one page. Old links to /graphs/{id}/edit open it too.
  return { page: "graph", graphId };
};

export const routePath = (route: Route) => {
  if (route.page === "list") return "/";
  if (route.page === "guide") return "/guide";
  const base = `/graphs/${encodeURIComponent(route.graphId)}`;
  if (route.page === "proposal") return `${base}/proposals/${encodeURIComponent(route.proposalId)}`;
  if (route.flowId == null) return base;
  const flow = `${base}/flows/${encodeURIComponent(route.flowId)}`;
  return route.runId == null ? flow : `${flow}/runs/${encodeURIComponent(route.runId)}`;
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
