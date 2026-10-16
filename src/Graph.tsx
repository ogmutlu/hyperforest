import { GraphVertex } from "./GraphVertex";
import { GraphEdge } from "./GraphEdge";
import { useFrameState } from "./useFrameState";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Action, GoalNode, State } from "./model";
import { Icon } from "./icons";

interface Props {
  editing: boolean;
  state: State;
  treeId: string;
  selected: string | null;
  time: Map<string, number>;
  select: (id: string) => void;
  start: (id: string, point: { x: number; y: number }) => Promise<void>;
  run: (action: Action) => Promise<boolean>;
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
  start,
  run,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
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
  const [camera, setCamera, , latestCamera] = useFrameState(fitCamera(compact));
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
          0.55,
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
      setCamera(fitCamera(media.matches));
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
  const nodes = useMemo(
    () =>
      position
        ? visibleNodes.map((node) =>
            node.id === position.id
              ? { ...node, x: position.x, y: position.y }
              : node,
          )
        : visibleNodes,
    [visibleNodes, position],
  );
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
  const down = useCallback(
    (event: ReactPointerEvent<SVGElement>, node?: GoalNode): void => {
      if (event.button !== 0) return;
      event.stopPropagation();
      if (node && (!editing || node.finishedAt !== undefined)) {
        select(node.id);
        return;
      }
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
      setPosition(null);
      setLink(null);
      setDragging(false);
    }
  }, [editing, setPosition, setLink]);
  const move = (event: ReactPointerEvent<SVGSVGElement>): void => {
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
    svg.current?.setPointerCapture(event.pointerId);
    setDragging(true);
    beginNavigation();
    if (current.id)
      setPosition({
        id: current.id,
        x: current.x + dx / latestCamera.current.scale,
        y: current.y + dy / latestCamera.current.scale,
      });
    else {
      setCamera((previous) => ({
        ...previous,
        x: current.x + dx,
        y: current.y + dy,
      }));
    }
  };
  const up = async (): Promise<void> => {
    endNavigation();
    const link = flushLink();
    const position = flushPosition();
    if (link) {
      const target = nodes.find(
        (node) =>
          node.finishedAt === undefined &&
          Math.hypot(node.x - link.x, node.y - link.y) <= 48,
      );
      setLink(null);
      await run({ type: "connect", id: link.id, parentId: target?.id ?? null });
      return;
    }
    const current = drag.current;
    drag.current = null;
    if (current?.id && current.moved && position)
      await run({ type: "move", ...position });
    setPosition(null);
    setDragging(false);
  };
  return (
    <div
      className={`graph ${navigating && nodes.length > 150 ? "is-navigating" : ""} ${editing ? "editing" : "frozen"} ${dragging ? "is-dragging" : ""}`}
    >
      <div className="canvas-grain" />
      <svg
        ref={svg}
        className="graph-svg"
        viewBox="0 0 1100 720"
        preserveAspectRatio={compact ? "xMidYMid slice" : "xMidYMid meet"}
        aria-label="Goal hypertree"
        onPointerDown={(event) => down(event)}
        onPointerMove={move}
        onPointerUp={() => {
          void up();
        }}
        onPointerCancel={() => {
          endNavigation();
          drag.current = null;
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
          {nodes.map((node) => (
            <GraphVertex
              key={node.id}
              node={node}
              treeId={treeId}
              selected={selected === node.id}
              isActive={state.focus?.nodeId === node.id}
              editing={editing}
              elapsed={time.get(node.id) ?? 0}
              down={down}
              linkDown={linkDown}
              select={select}
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
              scale: Math.max(0.55, previous.scale - 0.15),
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
          className="icon-button"
          aria-label="Fit graph"
          onClick={() => setCamera(fitCamera(compact))}
        >
          <Icon name="fit" />
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
