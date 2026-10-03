You are building the core computational geometry foundation for an open-source 2D CAD floor plan engine. Do not write any UI or canvas rendering code in this step.

### Objectives
1. Configure Vitest in this project if not already set up.
2. Define the core data types for a normalized 2D planar floor plan graph.
3. Implement pure 2D vector, line, and polygon math functions.
4. Write comprehensive Vitest unit tests covering all edge cases (collinear segments, parallel lines, T-junctions, acute angles, and polygon areas).

### 1. Data Contracts (`src/core/types.ts`)
Create strict TypeScript types using millimeters as the base unit:
- `Point2D`: `{ x: number; y: number }`
- `Vertex`: `{ id: string; x: number; y: number }`
- `Wall`: `{ id: string; startId: string; endId: string; thickness: number }`
- `OpeningType`: `'single_door' | 'double_door' | 'window' | 'opening'`
- `Opening`: `{ id: string; wallId: string; offsetRatio: number; width: number; type: OpeningType; flipH: boolean; flipV: boolean }`
- `RoomFace`: `{ id: string; vertexIds: string[]; wallIds: string[]; areaMm2: number }`
- `FloorPlanState`: Normalized store holding `{ vertices: Record<string, Vertex>; walls: Record<string, Wall>; openings: Record<string, Opening>; rooms: Record<string, RoomFace> }`

### 2. Geometry Engine (`src/core/math/`)
Implement pure, zero-dependency mathematical utilities:

- `src/core/math/vector.ts`:
  - `add(a: Point2D, b: Point2D): Point2D`
  - `sub(a: Point2D, b: Point2D): Point2D`
  - `scale(v: Point2D, s: number): Point2D`
  - `dot(a: Point2D, b: Point2D): number`
  - `cross(a: Point2D, b: Point2D): number`
  - `length(v: Point2D): number`
  - `distance(a: Point2D, b: Point2D): number`
  - `normalize(v: Point2D): Point2D`
  - `normal(v: Point2D): Point2D` (perpendicular vector `(-y, x)`)
  - `angleBetween(a: Point2D, b: Point2D): number` (in radians)

- `src/core/math/line.ts`:
  - `getLineIntersection(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): Point2D | null`
    - Computes intersection point of infinite lines passing through p1-p2 and p3-p4. Returns null if parallel or collinear.
  - `getSegmentIntersection(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): Point2D | null`
    - Computes intersection restricted strictly to the line segments.
  - `projectPointOnSegment(p: Point2D, a: Point2D, b: Point2D): { point: Point2D; t: number; distance: number }`
    - `t` clamped between 0.0 and 1.0 representing offset ratio along segment.
  - `computeParallelOffset(start: Point2D, end: Point2D, distance: number): [Point2D, Point2D]`
    - Offsets a line segment outward along its normal by `distance`.

- `src/core/math/polygon.ts`:
  - `calculateShoelaceArea(points: Point2D[]): number`
    - Returns area in square millimeters. Must return positive for counter-clockwise and negative for clockwise.
  - `isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean` (Ray-casting algorithm).
  - `getPolygonCentroid(points: Point2D[]): Point2D`

### 3. Verification Suite (`tests/math.test.ts`)
Write unit tests covering:
1. `distance` and `length` on simple 3-4-5 triangles.
2. `getLineIntersection` for:
   - Orthogonal crossing lines at (50, 50).
   - Parallel lines returning `null`.
   - Collinear overlapping lines returning `null`.
3. `projectPointOnSegment`:
   - Point exactly on segment (`t = 0.5`).
   - Point beyond endpoints clamping to `t = 0` or `t = 1`.
4. `calculateShoelaceArea`:
   - A $4000 \times 3000\,\text{mm}$ rectangle producing exactly $12,000,000\,\text{mm}^2$ ($12\,\text{m}^2$).
   - Clockwise vs counter-clockwise signed area detection.

### Requirements:
- Strict TypeScript (`noImplicitAny: true`).
- No external geometry libraries; all formulas must use standard linear algebra.
- Ensure `npm run test` passes 100%.