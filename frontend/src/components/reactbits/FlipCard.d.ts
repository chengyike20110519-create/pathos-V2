import type { ReactNode } from "react";
export interface FlipCardProps {
  front?: ReactNode;
  back?: ReactNode;
  flipped?: boolean;
  defaultFlipped?: boolean;
  onFlipChange?: (flipped: boolean) => void;
  axis?: "x" | "y";
  flipOnClick?: boolean;
  draggable?: boolean;
  tilt?: boolean;
  tiltMax?: number;
  glare?: boolean;
  glareOpacity?: number;
  hoverScale?: number;
  perspective?: number;
  stiffness?: number;
  damping?: number;
  width?: number;
  height?: number;
  radius?: number;
  background?: string;
  color?: string;
  shadow?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}
export default function FlipCard(props: FlipCardProps): ReactNode;
