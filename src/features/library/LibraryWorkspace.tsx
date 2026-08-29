import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type {
  LibraryAlbumArtistKey,
  LibraryAlbumArtistSummary,
  LibraryAlbumKey,
  LibraryAlbumSummary,
} from "@/bindings";
import {
  getLibraryAlbumArtist,
  getLibraryAlbumDetails,
  listLibraryAlbumArtistAlbums,
  listLibraryAlbumArtists,
  listLibraryAlbumTracks,
  listLibraryAlbums,
  listLibraryTracks,
} from "@/api/library";

export type LibraryPresentation = "albums" | "albumArtists" | "tracks";
export const libraryRetentionKey = {
  root: (presentation: LibraryPresentation) => `root:${presentation}`,
  frame: (id: string) => `frame:${id}`,
};
export type LibraryNavigationFrame = {
  id: string;
  kind: "album" | "albumArtist";
  key: LibraryAlbumKey | LibraryAlbumArtistKey;
  summary?: LibraryAlbumSummary | LibraryAlbumArtistSummary;
  originFocusId: string | null;
};
export interface LibraryBrowseClient {
  listAlbums: typeof import("@/api/library").listLibraryAlbums;
  listAlbumArtists: typeof import("@/api/library").listLibraryAlbumArtists;
  listArtistAlbums: typeof import("@/api/library").listLibraryAlbumArtistAlbums;
  getArtist: typeof import("@/api/library").getLibraryAlbumArtist;
  getAlbumDetails: typeof import("@/api/library").getLibraryAlbumDetails;
  listAlbumTracks: typeof import("@/api/library").listLibraryAlbumTracks;
  listTracks: typeof import("@/api/library").listLibraryTracks;
}
const productionClient: LibraryBrowseClient = {
  listAlbums: listLibraryAlbums,
  listAlbumArtists: listLibraryAlbumArtists,
  listArtistAlbums: listLibraryAlbumArtistAlbums,
  getArtist: getLibraryAlbumArtist,
  getAlbumDetails: getLibraryAlbumDetails,
  listAlbumTracks: listLibraryAlbumTracks,
  listTracks: (...args) => listLibraryTracks(...args),
};

export interface RetainedPagedLibrarySnapshot<TItem, TCursor> {
  ownerKey: string;
  pages: TItem[][];
  nextCursor: TCursor | null;
}
export interface LibraryQueryRetention {
  get<TItem, TCursor>(key: string): RetainedPagedLibrarySnapshot<TItem, TCursor> | undefined;
  set<TItem, TCursor>(key: string, snapshot: RetainedPagedLibrarySnapshot<TItem, TCursor>): void;
  delete(key: string): void;
  register: (key: string) => void;
  release: (key: string) => void;
}

interface RuntimeState {
  scrollRegistry: {
    get: (key: string) => number | undefined;
    set: (key: string, value: number) => void;
    delete: (key: string) => void;
    register: (key: string) => void;
    release: (key: string) => void;
  };
  queryRetention: LibraryQueryRetention;
  client: LibraryBrowseClient;
}
interface WorkspaceState {
  presentation: LibraryPresentation;
  selectPresentation: (value: LibraryPresentation) => void;
  rawSearch: Record<LibraryPresentation, string>;
  setRawSearch: (value: string) => void;
  committedSearch: Record<LibraryPresentation, string>;
  navigation: LibraryNavigationFrame[];
  currentFrame: LibraryNavigationFrame | null;
  openAlbum: (summary: LibraryAlbumSummary) => void;
  openAlbumArtist: (key: LibraryAlbumArtistKey, summary?: LibraryAlbumArtistSummary) => void;
  back: () => void;
  pendingFocusId: string | null;
  clearPendingFocus: () => void;
}
const RuntimeContext = createContext<RuntimeState | null>(null);
const WorkspaceContext = createContext<WorkspaceState | null>(null);

function createScrollRegistry() {
  const positions = new Map<string, number>();
  const liveKeys = new Set([
    libraryRetentionKey.root("albums"),
    libraryRetentionKey.root("albumArtists"),
    libraryRetentionKey.root("tracks"),
  ]);
  return {
    get: (key: string) => positions.get(key),
    set: (key: string, value: number) => {
      if (liveKeys.has(key)) positions.set(key, value);
    },
    delete: (key: string) => positions.delete(key),
    register: (key: string) => liveKeys.add(key),
    release: (key: string) => {
      liveKeys.delete(key);
      positions.delete(key);
    },
  };
}
function createQueryRetention(): LibraryQueryRetention {
  const snapshots = new Map<string, RetainedPagedLibrarySnapshot<unknown, unknown>>();
  const liveKeys = new Set([
    libraryRetentionKey.root("albums"),
    libraryRetentionKey.root("albumArtists"),
    libraryRetentionKey.root("tracks"),
  ]);
  return {
    get: <TItem, TCursor>(key: string) =>
      snapshots.get(key) as RetainedPagedLibrarySnapshot<TItem, TCursor> | undefined,
    set: <TItem, TCursor>(key: string, snapshot: RetainedPagedLibrarySnapshot<TItem, TCursor>) => {
      if (liveKeys.has(key)) {
        snapshots.set(key, snapshot as RetainedPagedLibrarySnapshot<unknown, unknown>);
      }
    },
    delete: (key: string) => snapshots.delete(key),
    register: (key: string) => liveKeys.add(key),
    release: (key: string) => {
      liveKeys.delete(key);
      snapshots.delete(key);
    },
  };
}
function focusAvailable(element: HTMLElement) {
  return element.isConnected && !element.inert && element.closest('[aria-hidden="true"]') === null;
}
function restoreFocus(id: string | null) {
  if (!id) return false;
  const target = Array.from(document.querySelectorAll<HTMLElement>("[data-library-focus-id]")).find(
    (element) => element.dataset.libraryFocusId === id && focusAvailable(element),
  );
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}
type NavigationState = {
  presentation: LibraryPresentation;
  navigation: LibraryNavigationFrame[];
};
type NavigationAction =
  | { type: "select"; presentation: LibraryPresentation }
  | { type: "push"; frame: LibraryNavigationFrame }
  | { type: "pop" };
function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  if (action.type === "select") {
    if (action.presentation === state.presentation) return state;
    return {
      ...state,
      presentation: action.presentation,
    };
  }
  if (action.type === "push") {
    return { ...state, navigation: [...state.navigation, action.frame] };
  }
  if (state.navigation.length === 0) return state;
  return { ...state, navigation: state.navigation.slice(0, -1) };
}

export function LibraryWorkspaceProvider({
  children,
  client = productionClient,
}: {
  children: ReactNode;
  client?: LibraryBrowseClient;
}) {
  const [navigationState, dispatchNavigation] = useReducer(navigationReducer, {
    presentation: "albums",
    navigation: [],
  });
  const [rawSearch, setRawSearchState] = useState<Record<LibraryPresentation, string>>({
    albums: "",
    albumArtists: "",
    tracks: "",
  });
  const [committedSearch, setCommittedSearch] = useState(rawSearch);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const nextFrameId = useRef(0);
  const searchTimers = useRef<Partial<Record<LibraryPresentation, number>>>({});
  const scrollRegistry = useMemo(() => createScrollRegistry(), []);
  const queryRetention = useMemo(() => createQueryRetention(), []);

  const setRawSearch = useCallback(
    (value: string) => {
      const presentation = navigationState.presentation;
      setRawSearchState((old) => ({ ...old, [presentation]: value }));
      const previous = searchTimers.current[presentation];
      if (previous !== undefined) window.clearTimeout(previous);
      searchTimers.current[presentation] = window.setTimeout(
        () => setCommittedSearch((old) => ({ ...old, [presentation]: value.trim() })),
        200,
      );
    },
    [navigationState.presentation],
  );
  const openAlbum = useCallback(
    (summary: LibraryAlbumSummary) => {
      nextFrameId.current += 1;
      const id = `album-${nextFrameId.current}`;
      dispatchNavigation({
        type: "push",
        frame: {
          id,
          kind: "album",
          key: summary.key,
          summary,
          originFocusId:
            document.activeElement instanceof HTMLElement
              ? (document.activeElement.dataset.libraryFocusId ?? null)
              : null,
        },
      });
      scrollRegistry.register(libraryRetentionKey.frame(id));
      queryRetention.register(libraryRetentionKey.frame(id));
    },
    [queryRetention, scrollRegistry],
  );
  const openAlbumArtist = useCallback(
    (key: LibraryAlbumArtistKey, summary?: LibraryAlbumArtistSummary) => {
      const originFocusId =
        document.activeElement instanceof HTMLElement
          ? (document.activeElement.dataset.libraryFocusId ?? null)
          : null;
      nextFrameId.current += 1;
      const id = `album-artist-${nextFrameId.current}`;
      dispatchNavigation({
        type: "push",
        frame: {
          id,
          kind: "albumArtist",
          key,
          summary,
          originFocusId,
        },
      });
      scrollRegistry.register(libraryRetentionKey.frame(id));
      queryRetention.register(libraryRetentionKey.frame(id));
    },
    [queryRetention, scrollRegistry],
  );
  const back = useCallback(() => {
    const popped = navigationState.navigation[navigationState.navigation.length - 1];
    if (!popped) return;
    setPendingFocusId(popped.originFocusId);
    queryRetention.release(libraryRetentionKey.frame(popped.id));
    scrollRegistry.release(libraryRetentionKey.frame(popped.id));
    dispatchNavigation({ type: "pop" });
  }, [navigationState.navigation, queryRetention, scrollRegistry]);
  const selectPresentation = useCallback(
    (next: LibraryPresentation) => dispatchNavigation({ type: "select", presentation: next }),
    [],
  );
  const clearPendingFocus = useCallback(() => setPendingFocusId(null), []);
  useEffect(
    () => () => {
      Object.values(searchTimers.current).forEach((timer) => {
        if (timer !== undefined) window.clearTimeout(timer);
      });
    },
    [],
  );
  const runtimeValue = useMemo<RuntimeState>(
    () => ({ scrollRegistry, queryRetention, client }),
    [client, queryRetention, scrollRegistry],
  );
  const value = useMemo<WorkspaceState>(
    () => ({
      presentation: navigationState.presentation,
      selectPresentation,
      rawSearch,
      setRawSearch,
      committedSearch,
      navigation: navigationState.navigation,
      currentFrame: navigationState.navigation[navigationState.navigation.length - 1] ?? null,
      openAlbum,
      openAlbumArtist,
      back,
      pendingFocusId,
      clearPendingFocus,
    }),
    [
      navigationState,
      rawSearch,
      setRawSearch,
      committedSearch,
      selectPresentation,
      openAlbum,
      openAlbumArtist,
      back,
      pendingFocusId,
      clearPendingFocus,
    ],
  );
  return (
    <RuntimeContext.Provider value={runtimeValue}>
      <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
    </RuntimeContext.Provider>
  );
}
export function useLibraryWorkspace(): WorkspaceState {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("LibraryWorkspaceProvider is required.");
  return value;
}
export function useOptionalLibraryWorkspace(): WorkspaceState | null {
  return useContext(WorkspaceContext);
}
export function useLibraryRuntime(): RuntimeState {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error("LibraryWorkspaceProvider is required.");
  return value;
}
export function useLibraryFocusRestore() {
  const { pendingFocusId, clearPendingFocus } = useLibraryWorkspace();
  useLayoutEffect(() => {
    if (!pendingFocusId) return;
    const frame = window.requestAnimationFrame(() => {
      restoreFocus(pendingFocusId);
      clearPendingFocus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [clearPendingFocus, pendingFocusId]);
}
