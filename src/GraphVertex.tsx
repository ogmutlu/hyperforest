import { memo } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { GoalNode, State } from "./model";
import { assignedNodeColors, shortTime } from "./presentation";
import { Icon } from "./icons";
import { DeadlineTimer, HabitProgress } from "./Clock";
import { thoughtLines, thoughtPreview } from "./vertices";

interface Props {
  node: GoalNode;
  habitState?: State | undefined;
  geometry: { rx: number; ry: number };
  dropTarget: boolean;
  treeId: string;
  selected: boolean;
  isActive: boolean;
  editing: boolean;
  elapsed: number;
  down: (event: ReactPointerEvent<SVGElement>, node?: GoalNode) => void;
  linkDown: (event: ReactPointerEvent<SVGElement>, node: GoalNode) => void;
  resizeDown: (event: ReactPointerEvent<SVGElement>, node: GoalNode) => void;
  resizeByKeyboard: (node: GoalNode, dx: number, dy: number) => void;
  select: (id: string) => void;
  contextMenu: (id: string, point: { x: number; y: number }) => void;
  openThought: (id: string, keyboard?: boolean) => void;
  start: (id: string, point: { x: number; y: number }) => Promise<void>;
}
export const GraphVertex = memo(function GraphVertex({
  node,
  habitState,
  geometry,
  dropTarget,
  treeId,
  selected,
  isActive,
  editing,
  elapsed,
  down,
  linkDown,
  resizeDown,
  resizeByKeyboard,
  select,
  contextMenu,
  openThought,
  start,
}: Props) {
  const colors = assignedNodeColors(node);
  const color = colors[0] ?? "#dfc491";
  const { rx, ry: radius } = geometry;
  const kind = node.vertex?.kind ?? "vanilla";
  const thought = kind === "thought";
  const wrapped = thought
    ? thoughtLines(
        thoughtPreview(node),
        node.size ? Math.max(8, Math.floor((rx * 2 - 40) / 8.5)) : 26,
      )
    : [];
  const lineCount = Math.max(1, Math.floor((radius * 2 - 24) / 22));
  const lines = wrapped.slice(0, lineCount);
  if (wrapped.length > lineCount)
    lines[lineCount - 1] = `${lines[lineCount - 1]!.slice(0, -1)}…`;
  const bucket = kind === "bucket";
  const rectangular = thought || bucket;
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className={`goal ${dropTarget ? "bucket-drop-target" : ""} ${node.id === treeId ? "root-goal" : ""} ${selected ? "selected" : ""} ${isActive ? "active" : ""} ${node.finishedAt !== undefined ? "finished-ghost" : ""}`}
      data-testid={`node-${node.id}`}
      data-vertex-kind={kind}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget
          .querySelector<SVGGElement>("[role=button]")
          ?.focus();
        contextMenu(node.id, { x: event.clientX, y: event.clientY });
      }}
    >
      <g
        role="button"
        tabIndex={0}
        aria-label={`Select ${node.title}`}
        onPointerDown={(event) => down(event, node)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (thought) {
            openThought(node.id);
            return;
          }
          if (node.finishedAt !== undefined) return;
          void start(node.id, {
            x: event.clientX - innerWidth / 2,
            y: event.clientY - innerHeight / 2,
          });
        }}
        onKeyDown={(event) => {
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault();
            event.stopPropagation();
            const bounds = event.currentTarget.getBoundingClientRect();
            contextMenu(node.id, {
              x: bounds.left + bounds.width / 2,
              y: bounds.top + bounds.height / 2,
            });
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (thought) openThought(node.id, true);
            else select(node.id);
          }
        }}
      >
        {node.id === treeId && (
          <circle
            className="node-detail"
            r={radius + 5}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
        )}
        {rectangular ? (
          <>
            <rect
              x={-rx - 13}
              y={-radius - 13}
              width={(rx + 13) * 2}
              height={(radius + 13) * 2}
              rx="22"
              className="node-aura"
              fill={color}
            />
            <rect
              x={-rx - 7}
              y={-radius - 7}
              width={(rx + 7) * 2}
              height={(radius + 7) * 2}
              rx="18"
              className="selection-ring"
              stroke={color}
              strokeWidth=".8"
              strokeDasharray="2 5"
              fill="none"
            />
          </>
        ) : (
          <>
            <ellipse
              rx={rx + 13}
              ry={radius + 13}
              className="node-aura"
              fill={color}
            />
            <ellipse
              rx={rx + 7}
              ry={radius + 7}
              className="selection-ring"
              stroke={color}
              strokeWidth=".8"
              strokeDasharray="2 5"
              fill="none"
            />
          </>
        )}
        {rectangular ? (
          <rect
            x={-rx}
            y={-radius}
            width={rx * 2}
            height={radius * 2}
            rx="14"
            className={bucket ? "bucket-outline" : "thought-outline"}
            data-testid={`node-fill-${node.id}`}
            fill={
              bucket ? `${color}09` : node.filled ? `${color}18` : "#101820"
            }
            stroke={color}
            strokeWidth={selected ? "2" : "1.4"}
            strokeDasharray={bucket ? "8 5" : undefined}
          />
        ) : (
          <circle
            r={radius}
            data-testid={`node-fill-${node.id}`}
            fill={node.filled ? color : "#101820"}
            stroke={color}
            strokeWidth={selected ? "2" : "1.4"}
          />
        )}
        {colors.length > 1 && (
          <g data-testid={`node-colors-${node.id}`}>
            {colors.map((segment, index) => {
              const start =
                -Math.PI / 2 + (index * 2 * Math.PI) / colors.length;
              const end =
                -Math.PI / 2 + ((index + 1) * 2 * Math.PI) / colors.length;
              const arc = `M${radius * Math.cos(start)},${radius * Math.sin(start)} A${radius},${radius} 0 0 1 ${radius * Math.cos(end)},${radius * Math.sin(end)}`;
              return rectangular ? (
                <rect
                  key={segment}
                  data-color={segment}
                  x={-rx}
                  y={-radius}
                  width={rx * 2}
                  height={radius * 2}
                  rx="14"
                  fill="none"
                  stroke={segment}
                  strokeWidth={selected ? "2" : "1.4"}
                  pathLength={colors.length}
                  strokeDasharray={`1 ${colors.length - 1}`}
                  strokeDashoffset={-index}
                />
              ) : (
                <path
                  key={segment}
                  data-color={segment}
                  d={
                    node.filled && !thought
                      ? `M0,0 L${radius * Math.cos(start)},${radius * Math.sin(start)} ${arc.slice(arc.indexOf(" A") + 1)} Z`
                      : arc
                  }
                  fill={node.filled && !thought ? segment : "none"}
                  stroke={segment}
                  strokeWidth={selected ? "2" : "1.4"}
                />
              );
            })}
          </g>
        )}
        {!rectangular && (
          <circle
            className="node-detail"
            r={radius - 7}
            fill="none"
            stroke={color}
            opacity=".16"
            strokeWidth=".7"
          />
        )}
        {!rectangular && kind !== "vanilla" && (
          <g
            transform="translate(-9 -9)"
            style={{ color: node.filled ? "#101820" : color }}
            pointerEvents="none"
          >
            <Icon name={kind} size={18} />
          </g>
        )}
        {node.linkedTreeId && (
          <g
            transform={`translate(${-rx - 14} ${-radius - 10})`}
            role="img"
            aria-label="Link to another hypertree"
            style={{ color }}
          >
            <title>Link to another hypertree</title>
            <rect width="20" height="20" rx="4" fill="#101820" />
            <g transform="translate(2 2)">
              <Icon name="link" size={16} />
            </g>
          </g>
        )}
        {node.notes.trim().length > 0 && (
          <g
            transform={`translate(${rx - 2} ${-radius - 10})`}
            className="node-note-indicator"
            role="img"
            aria-label="Has notes"
            style={{ color }}
          >
            <title>Has notes</title>
            <rect width="18" height="18" rx="4" fill="#101820" />
            <g transform="translate(2 2)">
              <Icon name="notes" size={14} />
            </g>
          </g>
        )}
        <text
          y={
            bucket
              ? -radius + 30
              : thought
                ? -(lines.length - 1) * 11
                : radius + 23
          }
          textAnchor="middle"
          className="node-title"
          fill="#ffffff"
        >
          {thought
            ? lines.map((line, index) => (
                <tspan key={index} x="0" dy={index === 0 ? ".35em" : "22"}>
                  {line}
                </tspan>
              ))
            : node.title.length > 23
              ? `${node.title.slice(0, 22)}…`
              : node.title}
        </text>
        {!rectangular && (
          <text y={radius + 40} textAnchor="middle" className="node-time">
            {shortTime(elapsed)}
            {node.estimateMinutes
              ? ` / ${shortTime(node.estimateMinutes * 60000)}`
              : " focused"}
          </text>
        )}
        {node.vertex?.kind === "deadline" && (
          <text y={radius + 60} textAnchor="middle" className="node-deadline">
            <DeadlineTimer deadlineAt={node.vertex.deadlineAt} />
          </text>
        )}
        {node.vertex?.kind === "habit" && (
          <text y={radius + 60} textAnchor="middle" className="node-habit">
            <HabitProgress
              vertex={node.vertex}
              {...(habitState ? { state: habitState } : {})}
              nodeId={node.id}
            />
          </text>
        )}
      </g>
      {rectangular && editing && node.finishedAt === undefined && (
        <g
          role="button"
          tabIndex={0}
          aria-label={`Resize ${node.title}`}
          className="vertex-resize-handle"
          transform={`translate(${rx} ${radius})`}
          onPointerDown={(event) => resizeDown(event, node)}
          onKeyDown={(event) => {
            const direction = {
              ArrowRight: [1, 0],
              ArrowLeft: [-1, 0],
              ArrowDown: [0, 1],
              ArrowUp: [0, -1],
            }[event.key];
            if (!direction) return;
            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 40 : 10;
            resizeByKeyboard(node, direction[0]! * step, direction[1]! * step);
          }}
        >
          <title>
            Drag to resize; arrow keys resize, Shift for larger steps
          </title>
          <rect
            x="-16"
            y="-16"
            width="24"
            height="24"
            rx="5"
            fill="#101820"
            stroke={color}
          />
          <path
            d="M-11 1 1-11M-5 1 1-5"
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
        </g>
      )}
      {editing &&
        node.finishedAt === undefined &&
        node.id !== treeId &&
        node.parentId === null && (
          <circle
            cx="0"
            cy={-radius - 10}
            r="8"
            fill="#101820"
            stroke={color}
            strokeWidth="2"
            className="edge-handle"
            data-testid={`edge-handle-${node.id}`}
            onPointerDown={(event) => linkDown(event, node)}
          />
        )}
    </g>
  );
});
