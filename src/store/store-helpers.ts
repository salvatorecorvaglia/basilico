import { INITIAL_LOADING_STATES, type RepoState } from "./types";

type Get = () => RepoState;
type Write = (state: Partial<RepoState>) => void;
type Domain = keyof RepoState["loadingStates"];

interface Scope {
  path: string | null;
  generation: number;
  requests: Map<string, symbol>;
  loading: Map<Domain, Set<symbol>>;
  refreshing: Set<symbol>;
}
interface Coordinator {
  scope: Scope;
  globalLoading: Map<Domain, Set<symbol>>;
}
const coordinators = new WeakMap<Get, Coordinator>();

function coordinator(get: Get): Coordinator {
  const state = get();
  let owner = coordinators.get(get);
  if (!owner) {
    owner = { scope: makeScope(state), globalLoading: new Map() };
    coordinators.set(get, owner);
  } else if (
    owner.scope.path !== state.activeTabId ||
    owner.scope.generation !== state.refreshGeneration
  ) {
    owner.scope = makeScope(state);
  }
  return owner;
}
function makeScope(state: RepoState): Scope {
  return {
    path: state.activeTabId,
    generation: state.refreshGeneration,
    requests: new Map(),
    loading: new Map(),
    refreshing: new Set(),
  };
}

export interface RepoContext {
  path: string | null;
  isCurrent: () => boolean;
}
export function captureRepoContext(get: Get): RepoContext {
  const scope = coordinator(get).scope;
  return {
    path: scope.path,
    isCurrent: () => coordinator(get).scope === scope,
  };
}

/** Responses may write only while both their repository session and resource ticket are current. */
export function beginRequest(get: Get, resource: string): RepoContext {
  const scope = coordinator(get).scope;
  const ticket = Symbol(resource);
  scope.requests.set(resource, ticket);
  return {
    path: scope.path,
    isCurrent: () =>
      coordinator(get).scope === scope &&
      scope.requests.get(resource) === ticket,
  };
}

/** Observe a resource version without issuing a competing request. */
export function watchRequest(get: Get, resource: string): RepoContext {
  const scope = coordinator(get).scope;
  const ticket = scope.requests.get(resource);
  return {
    path: scope.path,
    isCurrent: () =>
      coordinator(get).scope === scope &&
      scope.requests.get(resource) === ticket,
  };
}

/** Each operation releases only its own loading token, once. */
export function beginLoading(get: Get, set: Write, domain: Domain): () => void {
  const owner = coordinator(get);
  const scope = owner.scope;
  const global = domain === "global" || domain === "settings";
  const map = global ? owner.globalLoading : scope.loading;
  let tokens = map.get(domain);
  if (!tokens || !get().loadingStates[domain]) {
    tokens = new Set();
    map.set(domain, tokens);
  }
  const ownTokens = tokens;
  const token = Symbol(domain);
  tokens.add(token);
  const update = () => {
    const loadingStates = {
      ...get().loadingStates,
      [domain]: ownTokens.size > 0,
    };
    set({
      loadingStates,
      isLoading: Object.values(loadingStates).some(Boolean),
    });
  };
  update();
  return () => {
    if (!ownTokens.delete(token)) return;
    if (
      (!global && coordinator(get).scope !== scope) ||
      map.get(domain) !== ownTokens
    )
      return;
    update();
  };
}

export function beginRefresh(get: Get, set: Write): () => void {
  const scope = coordinator(get).scope;
  if (!get().isRefreshing) scope.refreshing = new Set();
  const tokens = scope.refreshing;
  const token = Symbol("refresh");
  tokens.add(token);
  set({ isRefreshing: true });
  return () => {
    if (
      !tokens.delete(token) ||
      coordinator(get).scope !== scope ||
      scope.refreshing !== tokens
    )
      return;
    set({ isRefreshing: tokens.size > 0 });
  };
}

export function resetRepoLoading(state: RepoState): Partial<RepoState> {
  const loadingStates = {
    ...INITIAL_LOADING_STATES,
    global: state.loadingStates.global,
    settings: state.loadingStates.settings,
  };
  return {
    loadingStates,
    isLoading: Object.values(loadingStates).some(Boolean),
    isRefreshing: false,
  };
}

export async function withActiveRepo<T>(
  get: Get,
  set: Write,
  domain: Domain,
  errorLabel: string,
  fn: (path: string, context: RepoContext) => Promise<T>,
): Promise<T | undefined> {
  const context = captureRepoContext(get);
  const path = context.path;
  if (!path) return undefined;
  return withLoading(get, set, domain, errorLabel, () => fn(path, context));
}

export async function withLoading<T>(
  get: Get,
  set: Write,
  domain: Domain,
  errorLabel: string,
  fn: (context: RepoContext) => Promise<T>,
): Promise<T> {
  const context = captureRepoContext(get);
  const finish = beginLoading(get, set, domain);
  try {
    return await fn(context);
  } catch (err) {
    console.error(`${errorLabel}:`, err);
    throw err;
  } finally {
    finish();
  }
}
