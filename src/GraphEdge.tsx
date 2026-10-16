import { memo } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { GoalNode } from "./model";
import { assignedNodeColor } from "./presentation";

interface Props {
  node: GoalNode;
  parent: GoalNode;
  treeId: string;
  editing: boolean;
  linkDown: (event: ReactPointerEvent<SVGElement>, node: GoalNode) => void;
}
export const GraphEdge = memo(function GraphEdge({
  node,
  parent,
  treeId,
  editing,
  linkDown,
}: Props) {
  const color = assignedNodeColor(node);
  const d = `M${parent.x},${parent.y + (parent.id === treeId ? 24 : 18)} C${parent.x},${(parent.y + node.y) / 2} ${node.x},${(parent.y + node.y) / 2} ${node.x},${node.y - (node.id === treeId ? 24 : 18)}`;
  return (
    <g
      className={node.finishedAt !== undefined ? "edge finished-edge" : "edge"}
      data-testid={`edge-${node.id}`}
      onPointerDown={(event) => linkDown(event, node)}
    >
      {editing && node.finishedAt === undefined && (
        <>
          <path
            d={d}
            stroke="transparent"
            strokeWidth="18"
            fill="none"
            className="edge-handle"
            onPointerDown={(event) => linkDown(event, node)}
          />
          <circle
            cx={(parent.x + node.x) / 2}
            cy={(parent.y + node.y) / 2}
            r="8"
            fill="#101820"
            stroke={color}
            strokeWidth="2"
            className="edge-handle"
            data-testid={`edge-handle-${node.id}`}
            onPointerDown={(event) => linkDown(event, node)}
          />
        </>
      )}
      <path d={d} stroke={color} strokeWidth="1.2" opacity=".55" fill="none" />
    </g>
  );
});
