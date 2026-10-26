import { memo } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { GoalNode } from "./model";
import { assignedNodeColors, shortTime } from "./presentation";
import { Icon } from "./icons";

interface Props {
  node: GoalNode;
  treeId: string;
  selected: boolean;
  isActive: boolean;
  editing: boolean;
  elapsed: number;
  down: (event: ReactPointerEvent<SVGElement>, node?: GoalNode) => void;
  linkDown: (event: ReactPointerEvent<SVGElement>, node: GoalNode) => void;
  select: (id: string) => void;
  start: (id: string, point: { x: number; y: number }) => Promise<void>;
}
export const GraphVertex = memo(function GraphVertex({
  node,
  treeId,
  selected,
  isActive,
  editing,
  elapsed,
  down,
  linkDown,
  select,
  start,
}: Props) {
  const colors = assignedNodeColors(node);
  const color = colors[0] ?? "#dfc491";
  const radius = node.id === treeId ? 24 : 18;
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className={`goal ${node.id === treeId ? "root-goal" : ""} ${selected ? "selected" : ""} ${isActive ? "active" : ""} ${node.finishedAt !== undefined ? "finished-ghost" : ""}`}
      data-testid={`node-${node.id}`}
    >
      <g
        role="button"
        tabIndex={0}
        aria-label={`Select ${node.title}`}
        onPointerDown={(event) => down(event, node)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (node.finishedAt !== undefined) return;
          void start(node.id, {
            x: event.clientX - innerWidth / 2,
            y: event.clientY - innerHeight / 2,
          });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select(node.id);
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
        <circle r={radius + 13} className="node-aura" fill={color} />
        <circle
          r={radius + 7}
          className="selection-ring"
          stroke={color}
          strokeWidth=".8"
          strokeDasharray="2 5"
          fill="none"
        />
        <circle
          r={radius}
          data-testid={`node-fill-${node.id}`}
          fill={node.filled ? color : "#101820"}
          stroke={color}
          strokeWidth={selected ? "2" : "1.4"}
        />
        {colors.length > 1 && (
          <g data-testid={`node-colors-${node.id}`}>
            {colors.map((segment, index) => {
              const start =
                -Math.PI / 2 + (index * 2 * Math.PI) / colors.length;
              const end =
                -Math.PI / 2 + ((index + 1) * 2 * Math.PI) / colors.length;
              const arc = `M${radius * Math.cos(start)},${radius * Math.sin(start)} A${radius},${radius} 0 0 1 ${radius * Math.cos(end)},${radius * Math.sin(end)}`;
              return (
                <path
                  key={segment}
                  data-color={segment}
                  d={
                    node.filled
                      ? `M0,0 L${radius * Math.cos(start)},${radius * Math.sin(start)} ${arc.slice(arc.indexOf(" A") + 1)} Z`
                      : arc
                  }
                  fill={node.filled ? segment : "none"}
                  stroke={segment}
                  strokeWidth={selected ? "2" : "1.4"}
                />
              );
            })}
          </g>
        )}
        <circle
          className="node-detail"
          r={radius - 7}
          fill="none"
          stroke={color}
          opacity=".16"
          strokeWidth=".7"
        />
        {node.notes.trim().length > 0 && (
          <g
            transform={`translate(${radius - 2} ${-radius - 10})`}
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
          y={radius + 23}
          textAnchor="middle"
          className="node-title"
          fill="#ffffff"
        >
          {node.title.length > 23 ? `${node.title.slice(0, 22)}…` : node.title}
        </text>
        <text y={radius + 40} textAnchor="middle" className="node-time">
          {shortTime(elapsed)}
          {node.estimateMinutes
            ? ` / ${shortTime(node.estimateMinutes * 60000)}`
            : " focused"}
        </text>
      </g>
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
