"use client";

import {
  BookOpen,
  Box,
  Link2,
  Map,
  Mountain,
  Package,
  Settings2,
  Swords,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  scene: Mountain,
  level: Map,
  character: Swords,
  item: Package,
  skill: Zap,
  storyline: BookOpen,
  mechanic: Settings2,
  reference: Link2,
};

export function NodeTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICONS[type] ?? Box;
  return <Icon className={className} aria-hidden="true" />;
}
