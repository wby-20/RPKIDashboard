import rpkiData from './generated/rpki-data.json';

export const COLORS = {
  blue: '#2563eb',
  cyan: '#0891b2',
  green: '#059669',
  amber: '#d97706',
  red: '#dc2626',
  violet: '#7c3aed',
  slate: '#64748b',
};

const rirMeta = {
  RIPE: { name: 'RIPE NCC', color: '#2563eb' },
  APNIC: { name: 'APNIC', color: '#0891b2' },
  ARIN: { name: 'ARIN', color: '#7c3aed' },
  LACNIC: { name: 'LACNIC', color: '#059669' },
  AFRINIC: { name: 'AFRINIC', color: '#d97706' },
};

export const snapshot = rpkiData;
export const current = rpkiData.current;
export const totals = rpkiData.current.totals;

export const rirRows = Object.entries(rirMeta).map(([code, meta]) => ({
  code,
  ...meta,
  ca: current.tals[code].validCACerts,
  invalidCerts: current.tals[code].invalidCerts,
  roa: current.tals[code].validROAs,
  invalidRoa: current.tals[code].invalidROAs,
  vrp: current.tals[code].vrpsFinal,
  vrpV4: current.tals[code].vrpsV4,
  vrpV6: current.tals[code].vrpsV6,
  aspa: current.tals[code].aspasFinal,
  pps: current.tals[code].validPublicationPoints,
  rejectedPps: current.tals[code].rejectedPublicationPoints,
  missingManifests: current.tals[code].missingManifests,
}));

export const repositoryRows = current.repositories.slice(0, 8).map((repository) => ({
  ...repository,
  share: repository.vrpsFinal / totals.vrpsFinal * 100,
}));

export const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);
