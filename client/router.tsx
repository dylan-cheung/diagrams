import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

export type Mode = "view" | "edit";

export type Route = { page: "list" } | { page: "graph"; graphId: string; mode: Mode } | { page: "proposal"; graphId: string; proposalId: string };

export const parsePath = (pathname: string): Route => {
  const [root, graphId, part, proposalId] = pathname.split("/").filter((segment) => segment !== "").map(decodeURIComponent);
  if (root !== "graphs" || graphId == null) return { page: "list" };
  if (part === "proposals" && proposalId != null) return { page: "proposal", graphId, proposalId };
  return { page: "graph", graphId, mode: part === "edit" ? "edit" : "view" };
};

export const routePath = (route: Route) => {
  if (route.page === "list") return "/";
  const base = `/graphs/${encodeURIComponent(route.graphId)}`;
  if (route.page === "proposal") return `${base}/proposals/${encodeURIComponent(route.proposalId)}`;
  return route.mode === "edit" ? `${base}/edit` : base;
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
