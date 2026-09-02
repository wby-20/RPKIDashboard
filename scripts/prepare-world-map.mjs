import { mkdir, readFile, writeFile } from 'node:fs/promises';

const sourceUrl = new URL('../data/maps/world.geo.json', import.meta.url);
const targetUrl = new URL('../public/maps/world-countries.geojson', import.meta.url);
const tolerance = 0.08;
const squareTolerance = tolerance * tolerance;

function squareSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx || dy) {
    const projection = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (projection > 1) {
      x = end[0];
      y = end[1];
    } else if (projection > 0) {
      x += dx * projection;
      y += dy * projection;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyOpenLine(points) {
  if (points.length <= 2) return points;
  const kept = new Uint8Array(points.length);
  kept[0] = 1;
  kept[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let furthestIndex = -1;
    let furthestDistance = squareTolerance;
    for (let index = first + 1; index < last; index += 1) {
      const distance = squareSegmentDistance(points[index], points[first], points[last]);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex >= 0) {
      kept[furthestIndex] = 1;
      stack.push([first, furthestIndex], [furthestIndex, last]);
    }
  }

  return points.filter((_, index) => kept[index]);
}

const round = (value) => Math.round(value * 1000) / 1000;
const roundPoint = (point) => [round(point[0]), round(point[1])];
const samePoint = (left, right) => left[0] === right[0] && left[1] === right[1];

function simplifyRing(ring) {
  if (ring.length <= 4) return ring.map(roundPoint);
  const openRing = samePoint(ring[0], ring.at(-1)) ? ring.slice(0, -1) : [...ring];
  let splitIndex = 1;
  let splitDistance = -1;
  for (let index = 1; index < openRing.length; index += 1) {
    const dx = openRing[index][0] - openRing[0][0];
    const dy = openRing[index][1] - openRing[0][1];
    const distance = dx * dx + dy * dy;
    if (distance > splitDistance) {
      splitDistance = distance;
      splitIndex = index;
    }
  }

  const firstHalf = simplifyOpenLine(openRing.slice(0, splitIndex + 1));
  const secondHalf = simplifyOpenLine([...openRing.slice(splitIndex), openRing[0]]);
  const simplified = [...firstHalf, ...secondHalf.slice(1)].map(roundPoint)
    .filter((point, index, points) => index === 0 || !samePoint(point, points[index - 1]));
  if (!samePoint(simplified[0], simplified.at(-1))) simplified.push([...simplified[0]]);
  return simplified.length >= 4 ? simplified : ring.map(roundPoint);
}

function simplifyGeometry(geometry) {
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(simplifyRing) };
  }
  if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing)) };
  }
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function countPoints(featureCollection) {
  let total = 0;
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number') total += 1;
    else value.forEach(visit);
  };
  featureCollection.features.forEach((feature) => visit(feature.geometry.coordinates));
  return total;
}

const source = JSON.parse(await readFile(sourceUrl, 'utf8'));
if (source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
  throw new Error('Expected a GeoJSON FeatureCollection');
}

const output = {
  type: 'FeatureCollection',
  features: source.features.map((feature) => ({
    type: 'Feature',
    properties: {
      name: feature.properties.name,
      iso_a2: feature.properties.iso_a2,
      iso_a3: feature.properties.iso_a3,
      continent: feature.properties.continent,
    },
    geometry: simplifyGeometry(feature.geometry),
  })),
};

if (output.features.length !== source.features.length) {
  throw new Error('Map simplification changed the feature count');
}

await mkdir(new URL('../public/maps/', import.meta.url), { recursive: true });
await writeFile(targetUrl, `${JSON.stringify(output)}\n`);
console.log(`Prepared ${output.features.length} features: ${countPoints(source)} → ${countPoints(output)} coordinate pairs.`);
