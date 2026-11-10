import type { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type PillarIcon = ComponentProps<typeof MaterialIcons>['name'];

/**
 * A life area (Finance, Home, Health, …). The top of the hierarchy:
 * Pillar → Goal → Project/Habit → Task. See Notion "Core Concept".
 * Pillars are deliberately simple: they only categorise.
 */
export interface Pillar {
  id: string;
  name: string;
  description?: string;
  icon: PillarIcon;
  color: string;      // hex, e.g. '#22C55E'
  order: number;      // display position, ascending
  createdAt: string;
}

export const PILLAR_COLORS = [
  '#3B82F6', '#22C55E', '#EAB308', '#F97316',
  '#EF4444', '#EC4899', '#A855F7', '#14B8A6',
];

export const PILLAR_ICONS: PillarIcon[] = [
  'favorite', 'fitness-center', 'savings', 'home', 'people', 'work',
  'school', 'self-improvement', 'palette', 'psychology', 'eco', 'travel-explore',
  'restaurant', 'local-florist', 'pets', 'music-note', 'volunteer-activism', 'star',
];

/** Offered as a one-tap starting set when the user has no pillars yet. */
export const SUGGESTED_PILLARS: Omit<Pillar, 'id' | 'createdAt' | 'order'>[] = [
  { name: 'Health',        icon: 'favorite',   color: '#22C55E' },
  { name: 'Finance',       icon: 'savings',    color: '#EAB308' },
  { name: 'Home',          icon: 'home',       color: '#F97316' },
  { name: 'Relationships', icon: 'people',     color: '#EC4899' },
  { name: 'Career',        icon: 'work',       color: '#3B82F6' },
];
