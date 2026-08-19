import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import type { Tile } from '../../shared/types.js';

export type TileLocation =
  | { zone: 'hand'; tileId: string }
  | { zone: 'group'; groupId: string; tileId: string };

interface TileCardProps {
  tile: Tile;
  location: TileLocation;
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
  overlay?: boolean;
}

const COLOR_LABELS = {
  red: '红',
  blue: '蓝',
  black: '黑',
  orange: '橙',
} as const;

export function TileCard({
  tile,
  location,
  interactive = false,
  selected = false,
  onClick,
  overlay = false,
}: TileCardProps) {
  const draggable = useDraggable({
    id: `drag:${tile.id}`,
    data: { location, tile },
    disabled: !interactive || overlay,
  });
  const droppable = useDroppable({
    id: `drop:tile:${tile.id}`,
    data: { location },
    disabled: !interactive || overlay,
  });
  const style: CSSProperties = draggable.transform
    ? {
        transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`,
      }
    : {};
  const setRef = (node: HTMLElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };
  const colorClass = tile.isJoker ? 'joker' : tile.color;
  return (
    <button
      ref={setRef}
      type="button"
      className={`tile tile--${colorClass}${selected ? ' tile--selected' : ''}${
        draggable.isDragging ? ' tile--dragging' : ''
      }${overlay ? ' tile--overlay' : ''}`}
      style={style}
      onClick={onClick}
      {...draggable.attributes}
      {...draggable.listeners}
      aria-pressed={selected}
      aria-label={tile.isJoker ? 'Joker' : `${COLOR_LABELS[tile.color!]}色 ${tile.number}`}
    >
      <span className="tile__corner">{tile.isJoker ? '★' : tile.number}</span>
      <span className="tile__value">{tile.isJoker ? 'J' : tile.number}</span>
      <span className="tile__dot">{tile.isJoker ? '万能' : COLOR_LABELS[tile.color!]}</span>
    </button>
  );
}
