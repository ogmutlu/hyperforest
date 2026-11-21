import { GraphVertex } from "./GraphVertex";
import { GraphEdge } from "./GraphEdge";
import { useFrameState } from "./useFrameState";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Action, GoalNode, State } from "./model";
import { Icon } from "./icons";
import {
  vertexGeometry,
  snapThought,
  bucketAt,
  resizedVertex,
} from "./vertices";

interface Props {
  editing: boolean;
  state: State;
  treeId: string;
  selected: string | null;
  time: Map<string, number>;
  select: (id: string) => void;
  openThought: (id: string) => void;
  contextMenu: (id: string, point: { x: number; y: number }) => void;
  start: (id: string, point: { x: number; y: number }) => Promise<void>;
  run: (action: Action) => Promise<boolean>;
  emptyClick: () => void;
  rememberView?: boolean;
}
interface Drag {
  id: string | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}
export const Graph = memo(function Graph({
  editing,
  state,
  treeId,
  selected,
  time,
  select,
  openThought,
  contextMenu,
  emptyClick,
  start,
  run,
  rememberView = true,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [initialHeight] = useState(() => {
    if (!rememberView) return undefined;
    try {
      const height = Number(localStorage.getItem("hyperforest.graph-height"));
      return Number.isFinite(height) && height >= 530 ? height : undefined;
    } catch {
      return undefined;
    }
  });
  useEffect(() => {
    const element = container.current;
    if (!rememberView || !element) return;
    let previous = initialHeight;
    const observer = new ResizeObserver(() => {
      // Native CSS resizing writes an inline height. Responsive default heights
      // do not, and must not overwrite the user's explicit preference.
      if (!element.style.height) return;
      const height = element.getBoundingClientRect().height;
      if (!Number.isFinite(height) || height < 530 || height === previous)
        return;
      try {
        localStorage.setItem("hyperforest.graph-height", String(height));
        previous = height;
      } catch {
        // Resizing remains available when device preference storage is blocked.
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [initialHeight, rememberView]);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const resize = useRef<{
    node: GoalNode;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null>(null);
  const [resizing, setResizing, flushResizing] = useFrameState<{
    id: string;
    x: number;
    y: number;
    size: { width: number; height: number };
  } | null>(null);
  const [link, setLink, flushLink, latestLink] = useFrameState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [position, setPosition, flushPosition] = useFrameState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [navigating, setNavigating] = useState(false);
  const navigationEnd = useRef<number | null>(null);
  const endNavigation = useCallback(() => {
    if (navigationEnd.current !== null)
      window.clearTimeout(navigationEnd.current);
    navigationEnd.current = null;
    setNavigating(false);
  }, []);
  const beginNavigation = useCallback(() => {
    setNavigating(true);
    if (navigationEnd.current !== null)
      window.clearTimeout(navigationEnd.current);
    navigationEnd.current = window.setTimeout(endNavigation, 300);
  }, [endNavigation]);
  useEffect(
    () => () => {
      if (navigationEnd.current !== null)
        window.clearTimeout(navigationEnd.current);
    },
    [],
  );
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const fitCamera = (
    small: boolean,
  ): { x: number; y: number; scale: number } =>
    small ? { x: 264, y: 172.8, scale: 0.52 } : { x: 0, y: 0, scale: 1 };
  const viewKey = `hyperforest.graph-view.${treeId}`;
  const [initialCamera] = useState(() => {
    const fallback = fitCamera(compact);
    if (!rememberView) return fallback;
    try {
      const saved = JSON.parse(localStorage.getItem(viewKey) ?? "null") as {
        x?: unknown;
        y?: unknown;
        scale?: unknown;
      } | null;
      if (
        saved &&
        typeof saved.x === "number" &&
        Number.isFinite(saved.x) &&
        typeof saved.y === "number" &&
        Number.isFinite(saved.y) &&
        typeof saved.scale === "number" &&
        Number.isFinite(saved.scale) &&
        saved.scale > 0 &&
        saved.scale <= 2.5
      ) {
        return { x: saved.x, y: saved.y, scale: saved.scale };
      }
      // Migrate the previous device-wide zoom preference for unvisited tabs.
      const scale = Number(localStorage.getItem("hyperforest.graph-zoom"));
      return Number.isFinite(scale) && scale > 0 && scale <= 2.5
        ? { ...fallback, scale }
        : fallback;
    } catch {
      return fallback;
    }
  });
  const [camera, setCamera, , latestCamera] = useFrameState(initialCamera);
  const persistCamera = useCallback(
    (view: typeof initialCamera) => {
      if (!rememberView) return;
      try {
        localStorage.setItem(viewKey, JSON.stringify(view));
        localStorage.setItem("hyperforest.graph-zoom", String(view.scale));
      } catch {
        // Navigation remains usable when device preference storage is blocked.
      }
    },
    [rememberView, viewKey],
  );
  useEffect(() => persistCamera(camera), [camera, persistCamera]);
  useEffect(
    () => () => persistCamera(latestCamera.current),
    [persistCamera, latestCamera],
  );
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      beginNavigation();
      setCamera((previous) => ({
        ...previous,
        scale: Math.max(
          0.04,
          Math.min(2.5, previous.scale - event.deltaY * 0.001),
        ),
      }));
    };
    // A non-passive listener prevents Ctrl+wheel from zooming the browser.
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [beginNavigation, setCamera]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const changed = (): void => {
      setCompact(media.matches);
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const [dragging, setDragging] = useState(false);
  const showFinished = state.trees.find(
    (tree) => tree.id === treeId,
  )?.showFinished;
  const visibleNodes = useMemo(
    () =>
      state.nodes.filter(
        (node) =>
          node.treeId === treeId &&
          (node.finishedAt === undefined || showFinished),
      ),
    [state.nodes, treeId, showFinished],
  );
  const nodes = useMemo(() => {
    if (resizing)
      return visibleNodes.map((node) =>
        node.id === resizing.id ? { ...node, ...resizing } : node,
      );
    if (!position) return visibleNodes;
    const moving = visibleNodes.find((node) => node.id === position.id);
    if (!moving) return visibleNodes;
    const bucketId = bucketAt(moving, position, visibleNodes);
    return visibleNodes.map((node) => {
      if (node.id === position.id) {
        const moved = { ...node, x: position.x, y: position.y };
        delete moved.bucketId;
        if (bucketId) moved.bucketId = bucketId;
        return moved;
      }
      return node.bucketId === position.id
        ? {
            ...node,
            x: node.x + position.x - moving.x,
            y: node.y + position.y - moving.y,
          }
        : node;
    });
  }, [visibleNodes, position, resizing]);
  const movingNode = position
    ? visibleNodes.find((node) => node.id === position.id)
    : undefined;
  const dropBucketId =
    movingNode && position
      ? bucketAt(movingNode, position, visibleNodes)
      : undefined;
  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const coordinate = (x: number, y: number): DOMPoint => {
    const matrix = svg.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(x, y).matrixTransform(matrix.inverse())
      : new DOMPoint(x, y);
  };
  const fitAll = (): void => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportStart = coordinate(rect.left + 24, rect.top + 24);
    const viewportEnd = coordinate(
      rect.right - (editing ? 84 : 24),
      rect.bottom - 56,
    );
    if (!nodes.length) return;
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const node of nodes) {
      const { rx, ry } = vertexGeometry(node, nodes);
      left = Math.min(left, node.x - Math.max(rx, 100) - 24);
      right = Math.max(right, node.x + Math.max(rx, 100) + 24);
      top = Math.min(top, node.y - ry - 24);
      bottom = Math.max(bottom, node.y + ry + 90);
    }
    const width = viewportEnd.x - viewportStart.x;
    const height = viewportEnd.y - viewportStart.y;
    const scale = Math.min(1, width / (right - left), height / (bottom - top));
    setCamera({
      x: viewportStart.x + (width - (right - left) * scale) / 2 - left * scale,
      y: viewportStart.y + (height - (bottom - top) * scale) / 2 - top * scale,
      scale,
    });
  };
  const down = useCallback(
    (event: ReactPointerEvent<SVGElement>, node?: GoalNode): void => {
      if (event.button !== 0) return;
      dragged.current = false;
      event.stopPropagation();
      if (node && (!editing || node.finishedAt !== undefined)) {
        select(node.id);
        return;
      }
      event.preventDefault();
      const point = coordinate(event.clientX, event.clientY);
      drag.current = {
        id: node?.id ?? null,
        startX: point.x,
        startY: point.y,
        x: node?.x ?? latestCamera.current.x,
        y: node?.y ?? latestCamera.current.y,
        moved: false,
      };
      if (node) select(node.id);
    },
    [editing, select, latestCamera],
  );
  const resizeDown = useCallback(
    (event: ReactPointerEvent<SVGElement>, node: GoalNode) => {
      if (!editing || node.finishedAt !== undefined || event.button !== 0)
        return;
      event.stopPropagation();
      event.preventDefault();
      dragged.current = true;
      select(node.id);
      const point = coordinate(event.clientX, event.clientY);
      const geometry = vertexGeometry(node, state.nodes);
      resize.current = {
        node,
        startX: point.x,
        startY: point.y,
        width: geometry.rx * 2,
        height: geometry.ry * 2,
      };
      svg.current?.setPointerCapture(event.pointerId);
    },
    [editing, select, state.nodes],
  );
  const resizeByKeyboard = useCallback(
    (node: GoalNode, dx: number, dy: number) => {
      const geometry = vertexGeometry(node, state.nodes);
      const next = resizedVertex(
        node,
        geometry.rx * 2 + dx,
        geometry.ry * 2 + dy,
        state.nodes,
      );
      void run({
        type: "resizeVertex",
        id: node.id,
        x: next.x,
        y: next.y,
        ...next.size,
      });
    },
    [state.nodes, run],
  );
  const linkDown = useCallback(
    (event: ReactPointerEvent<SVGElement>, node: GoalNode): void => {
      if (!editing || node.finishedAt !== undefined || event.button !== 0)
        return;
      event.stopPropagation();
      const point = coordinate(event.clientX, event.clientY);
      setLink({
        id: node.id,
        x: (point.x - latestCamera.current.x) / latestCamera.current.scale,
        y: (point.y - latestCamera.current.y) / latestCamera.current.scale,
      });
      svg.current?.setPointerCapture(event.pointerId);
    },
    [editing, setLink, latestCamera],
  );
  useEffect(() => {
    if (!editing) {
      drag.current = null;
      resize.current = null;
      setResizing(null);
      setPosition(null);
      setLink(null);
      setDragging(false);
    }
  }, [editing, setPosition, setLink, setResizing]);
  const move = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (resize.current) {
      const current = resize.current;
      const point = coordinate(event.clientX, event.clientY);
      const next = resizedVertex(
        current.node,
        current.width + (point.x - current.startX) / latestCamera.current.scale,
        current.height +
          (point.y - current.startY) / latestCamera.current.scale,
        visibleNodes,
      );
      setResizing({ id: current.node.id, ...next });
      setDragging(true);
      return;
    }
    if (latestLink.current) {
      const point = coordinate(event.clientX, event.clientY);
      setLink({
        ...latestLink.current,
        x: (point.x - latestCamera.current.x) / latestCamera.current.scale,
        y: (point.y - latestCamera.current.y) / latestCamera.current.scale,
      });
      return;
    }
    const current = drag.current;
    if (!current) return;
    const point = coordinate(event.clientX, event.clientY);
    const dx = point.x - current.startX,
      dy = point.y - current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
    if (!current.moved) return;
    dragged.current = true;
    svg.current?.setPointerCapture(event.pointerId);
    setDragging(true);
    beginNavigation();
    if (current.id) {
      const node = visibleNodes.find((item) => item.id === current.id);
      if (!node) return;
      const point = {
        x: current.x + dx / latestCamera.current.scale,
        y: current.y + dy / latestCamera.current.scale,
      };
      const bucketId = bucketAt(node, point, visibleNodes);
      const snapped = snapThought(
        node,
        point,
        visibleNodes,
        16 / latestCamera.current.scale,
        bucketId ?? null,
      );
      setPosition({ id: current.id, ...snapped });
    } else {
      setCamera((previous) => ({
        ...previous,
        x: current.x + dx,
        y: current.y + dy,
      }));
    }
  };
  const up = async (): Promise<void> => {
    endNavigation();
    if (resize.current) {
      resize.current = null;
      const next = flushResizing();
      if (next)
        await run({
          type: "resizeVertex",
          id: next.id,
          x: next.x,
          y: next.y,
          ...next.size,
        });
      setResizing(null);
      setDragging(false);
      return;
    }
    const link = flushLink();
    const position = flushPosition();
    if (link) {
      const target = [...nodes]
        .sort(
          (a, b) =>
            Number(a.vertex?.kind === "bucket") -
            Number(b.vertex?.kind === "bucket"),
        )
        .find((node) => {
          const { rx, ry } = vertexGeometry(node, nodes);
          return (
            node.finishedAt === undefined &&
            (node.vertex?.kind === "thought" || node.vertex?.kind === "bucket"
              ? Math.abs(node.x - link.x) <= rx &&
                Math.abs(node.y - link.y) <= ry
              : ((node.x - link.x) / Math.max(48, rx)) ** 2 +
                  ((node.y - link.y) / Math.max(48, ry)) ** 2 <=
                1)
          );
        });
      setLink(null);
      await run({ type: "connect", id: link.id, parentId: target?.id ?? null });
      return;
    }
    const current = drag.current;
    drag.current = null;
    if (current && !current.id && !current.moved) emptyClick();
    if (current?.id && current.moved && position) {
      const node = visibleNodes.find((item) => item.id === current.id);
      const bucketId = node
        ? bucketAt(node, position, visibleNodes)
        : undefined;
      await run({
        type: "move",
        ...position,
        ...(bucketId ? { bucketId } : {}),
      });
    }
    setPosition(null);
    setDragging(false);
  };
  return (
    <div
      ref={container}
      style={
        initialHeight === undefined ? undefined : { height: initialHeight }
      }
      className={`graph ${navigating && nodes.length > 150 ? "is-navigating" : ""} ${editing ? "editing" : "frozen"} ${dragging ? "is-dragging" : ""}`}
    >
      <div className="canvas-grain" />
      <svg
        ref={svg}
        className="graph-svg"
        viewBox="0 0 1100 720"
        preserveAspectRatio={compact ? "xMidYMid slice" : "xMidYMid meet"}
        aria-label="Goal hypertree"
        onPointerDown={(event) => {
          if (
            event.target instanceof Element &&
            !event.target.closest(".goal, .edge")
          )
            down(event);
        }}
        onPointerMove={move}
        onPointerUp={() => {
          void up();
        }}
        onPointerCancel={() => {
          endNavigation();
          drag.current = null;
          resize.current = null;
          setResizing(null);
          setPosition(null);
          setLink(null);
          setDragging(false);
        }}
      >
        <defs>
          <pattern
            id="dots"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".8" fill="#5a6d7e" opacity=".2" />
          </pattern>
        </defs>
        <rect width="1100" height="720" fill="url(#dots)" />
        <g
          transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}
        >
          {nodes
            .filter((node) => node.vertex?.kind === "bucket")
            .map((node) => (
              <GraphVertex
                key={node.id}
                node={node}
                habitState={node.vertex?.kind === "habit" ? state : undefined}
                geometry={vertexGeometry(node, nodes)}
                dropTarget={dropBucketId === node.id}
                treeId={treeId}
                selected={selected === node.id}
                isActive={state.focus?.nodeId === node.id}
                editing={editing}
                elapsed={time.get(node.id) ?? 0}
                down={down}
                linkDown={linkDown}
                resizeDown={resizeDown}
                resizeByKeyboard={resizeByKeyboard}
                select={select}
                contextMenu={contextMenu}
                openThought={(id, keyboard) => {
                  if (keyboard || !dragged.current) openThought(id);
                }}
                start={start}
              />
            ))}
          {nodes.map((node) => {
            const parent = nodesById.get(node.parentId ?? "");
            return parent ? (
              <GraphEdge
                key={node.id}
                node={node}
                parent={parent}
                treeId={treeId}
                editing={editing}
                linkDown={linkDown}
              />
            ) : null;
          })}
          {link &&
            (() => {
              const child = nodesById.get(link.id);
              return child ? (
                <path
                  d={`M${link.x},${link.y} L${child.x},${child.y}`}
                  stroke="#dfc491"
                  strokeWidth="2"
                  strokeDasharray="6 5"
                  pointerEvents="none"
                />
              ) : null;
            })()}
          {nodes
            .filter((node) => node.vertex?.kind !== "bucket")
            .map((node) => (
              <GraphVertex
                key={node.id}
                node={node}
                habitState={node.vertex?.kind === "habit" ? state : undefined}
                geometry={vertexGeometry(node, nodes)}
                dropTarget={dropBucketId === node.id}
                treeId={treeId}
                selected={selected === node.id}
                isActive={state.focus?.nodeId === node.id}
                editing={editing}
                elapsed={time.get(node.id) ?? 0}
                down={down}
                linkDown={linkDown}
                resizeDown={resizeDown}
                resizeByKeyboard={resizeByKeyboard}
                select={select}
                contextMenu={contextMenu}
                openThought={(id, keyboard) => {
                  if (keyboard || !dragged.current) openThought(id);
                }}
                start={start}
              />
            ))}
        </g>
      </svg>
      <div className="canvas-controls">
        <button
          className="icon-button"
          aria-label="Zoom out"
          onClick={() =>
            setCamera((previous) => ({
              ...previous,
              scale: Math.max(0.04, previous.scale - 0.15),
            }))
          }
        >
          −
        </button>
        <button
          className="icon-button"
          aria-label="Zoom in"
          onClick={() =>
            setCamera((previous) => ({
              ...previous,
              scale: Math.min(2.5, previous.scale + 0.15),
            }))
          }
        >
          +
        </button>
        <button
          className="icon-button fit-graph-button"
          aria-label="Fit graph"
          title="Show entire graph"
          onClick={fitAll}
        >
          <Icon name="fit" /> <span>Show all</span>
        </button>
        <button
          className="icon-button"
          aria-label="Arrange vertices"
          disabled={!editing}
          onClick={() => {
            setCamera(fitCamera(compact));
            void run({ type: "layout", treeId });
          }}
        >
          <Icon name="tree" />
        </button>
      </div>
    </div>
  );
});
