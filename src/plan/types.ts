// Geometry the renderer draws. Pure data in world units; no canvas types.

import type { FeatureKind, Point } from '../world/types';

export type Polygon = Point[];
export type Polyline = Point[];

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ───────────────────────── Cities ─────────────────────────

export interface Lot {
  /** Feature id this lot belongs to. */
  feature: string;
  /** The ground the lot occupies. */
  parcel: Polygon;
  /**
   * The building on it. One or more polygons: a main mass plus annexes for larger,
   * more mature features. Always inside `parcel`.
   */
  footprint: Polygon[];
  /** Centre of the main mass, for numerals and hit-testing. */
  center: Point;
  /** The edge of the parcel on its street, left to right as seen from the street. */
  front?: [Point, Point];
  /** Index into `CityPlan.blocks`. */
  block: number;
}

export interface Block {
  outline: Polygon;
  ward?: string;
}

/** How made a street is: a town's maturity shows in its streets before anything else. */
export type StreetGrade = 'track' | 'lane' | 'street' | 'avenue';

export interface Street {
  line: Polyline;
  grade?: StreetGrade;
  /** Main streets are drawn at massing scale; lanes only when buildings are. */
  main: boolean;
  name?: string;
}

export interface Ward {
  name: string;
  /** Where to letter the name, and along what angle (radians). */
  labelAt: Point;
  angle: number;
  /** Most common feature kind in the ward: used for massing wash. */
  dominant: FeatureKind;
}

export interface Dwelling {
  footprint: Polygon;
}

export interface CityPlan {
  place: string;
  center: Point;
  /** Rotation of the street grid, radians. Fixed per place. */
  angle: number;
  /** Radius that encloses everything drawn, for culling and framing. */
  radius: number;
  bounds: Bounds;
  blocks: Block[];
  streets: Street[];
  lots: Lot[];
  wards: Ward[];
  /** Ordinary fabric: terraces behind the frontages, from work invested and people using it. */
  dwellings: Dwelling[];
  /** The open middle, once the place has a crossing: a common, then a square, then a plaza. */
  square?: { outline: Polygon; grade: 'common' | 'square' | 'plaza' };
}

// ───────────────────────── Territory ─────────────────────────

export interface River {
  line: Polyline;
  /** Width in world units at the mouth; tapers toward the source. */
  width: number;
  name?: string;
}

export interface Hachure {
  /** A short downhill stroke. */
  a: Point;
  b: Point;
}

export interface Terrain {
  size: { width: number; height: number };
  /** Land outline(s). Everything outside is water. */
  land: Polygon[];
  /** Offset coastlines drawn in the water, nearest first. */
  shoals: Polyline[][];
  lakes: Polygon[];
  rivers: River[];
  /** Relief strokes. Drawn only near founded places. */
  hachures: Hachure[];
  /** Small marks for wooded ground. */
  woods: Point[];
  /** Height in 0–1 at a world point: lets layout avoid water. */
  heightAt(p: Point): number;
  isLand(p: Point): boolean;
}

export interface RoadPlan {
  link: string;
  /** A gently curved route between the two place edges. */
  line: Polyline;
  length: number;
}
