import { Info } from 'lucide-react';

const WIDTH = 1200;
const HEIGHT = 330;
const CENTER = { x: 600, y: 165 };
const MAX_PER_RELATIONSHIP = 6;

function invertRelationship(relationship) {
  if (relationship === 'provider') return 'customer';
  if (relationship === 'customer') return 'provider';
  return relationship;
}

function normalizeLinks(asn, connection) {
  const links = (connection?.edges || []).flatMap((edge) => {
    const link = edge.node;
    const currentIsAsn0 = String(link.asn0?.asn) === String(asn);
    const neighbour = currentIsAsn0 ? link.asn1 : link.asn0;
    if (!neighbour?.asn) return [];
    return [{
      asn: Number(neighbour.asn),
      name: neighbour.asnName || `AS${neighbour.asn}`,
      rank: neighbour.rank,
      relationship: currentIsAsn0 ? link.relationship : invertRelationship(link.relationship),
      numberPaths: link.numberPaths || 0,
    }];
  });
  const uniqueLinks = new Map();
  for (const link of links) {
    const key = `${link.relationship}:${link.asn}`;
    const previous = uniqueLinks.get(key);
    if (!previous || link.numberPaths > previous.numberPaths) uniqueLinks.set(key, link);
  }
  return [...uniqueLinks.values()];
}

function distribute(count, min, max) {
  if (count <= 1) return [(min + max) / 2];
  return Array.from({ length: count }, (_, index) => min + index * (max - min) / (count - 1));
}

function buildLayout(links) {
  const groups = Object.fromEntries(['provider', 'peer', 'customer'].map((relationship) => [relationship,
    links.filter((link) => link.relationship === relationship)
      .sort((left, right) => right.numberPaths - left.numberPaths)
      .slice(0, MAX_PER_RELATIONSHIP),
  ]));
  const nodes = [];

  for (const [index, link] of groups.provider.entries()) {
    nodes.push({ ...link, x: 125, y: distribute(groups.provider.length, 50, 280)[index] });
  }
  for (const [index, link] of groups.customer.entries()) {
    nodes.push({ ...link, x: 1075, y: distribute(groups.customer.length, 50, 280)[index] });
  }
  const topPeers = groups.peer.slice(0, Math.ceil(groups.peer.length / 2));
  const bottomPeers = groups.peer.slice(Math.ceil(groups.peer.length / 2));
  for (const [index, link] of topPeers.entries()) {
    nodes.push({ ...link, x: distribute(topPeers.length, 380, 820)[index], y: 55 });
  }
  for (const [index, link] of bottomPeers.entries()) {
    nodes.push({ ...link, x: distribute(bottomPeers.length, 380, 820)[index], y: 275 });
  }
  return { nodes, groups };
}

function countLabel(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count.toLocaleString() : '—';
}

export default function AsRelationshipGraph({ asn, asName, connection, degrees, language, onSelectAsn }) {
  const normalized = normalizeLinks(asn, connection);
  const { nodes } = buildLayout(normalized);
  const completeCounts = {
    provider: degrees?.provider,
    peer: degrees?.peer,
    customer: degrees?.customer,
  };

  if (!nodes.length) return <div className="as-topology-empty">{language === 'zh' ? '该 ASN 当前没有可用的 CAIDA 关系子图。' : 'No CAIDA relationship subset is available for this ASN.'}</div>;

  return <>
    <div className="as-topology-legend">
      <span><i className="provider" />{language === 'zh' ? '上游 Provider 总数' : 'All providers'} <b>{countLabel(completeCounts.provider)}</b></span>
      <span><i className="peer" />{language === 'zh' ? '对等 Peer 总数' : 'All peers'} <b>{countLabel(completeCounts.peer)}</b></span>
      <span><i className="customer" />{language === 'zh' ? '下游 Customer 总数' : 'All customers'} <b>{countLabel(completeCounts.customer)}</b></span>
      <em>{language === 'zh' ? `图中显示 ${nodes.length} 个 · 全部推断关系 ${countLabel(degrees?.total ?? connection?.totalCount)}` : `${nodes.length} shown · ${countLabel(degrees?.total ?? connection?.totalCount)} inferred links in total`}</em>
    </div>
    <div className="as-topology-stage">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={language === 'zh' ? `AS${asn} 的 CAIDA 推断关系邻域` : `CAIDA inferred relationship neighbourhood for AS${asn}`}>
        <text className="as-topology-group-label" x="125" y="20">{language === 'zh' ? '上游 PROVIDERS' : 'PROVIDERS'}</text>
        <text className="as-topology-group-label" x="600" y="20">{language === 'zh' ? '对等 PEERS' : 'PEERS'}</text>
        <text className="as-topology-group-label" x="1075" y="20">{language === 'zh' ? '下游 CUSTOMERS' : 'CUSTOMERS'}</text>
        <g className="as-topology-edges">{nodes.map((node) => <line className={node.relationship} key={`edge-${node.asn}`} x1={CENTER.x} y1={CENTER.y} x2={node.x} y2={node.y}><title>{`${node.relationship} · ${node.numberPaths.toLocaleString()} paths`}</title></line>)}</g>
        <g className="as-topology-centre" transform={`translate(${CENTER.x} ${CENTER.y})`}><rect x="-78" y="-32" width="156" height="64" /><text className="asn" y="-3">AS{asn}</text><text className="name" y="17">{String(asName || '').slice(0, 22)}</text></g>
        <g className="as-topology-nodes">{nodes.map((node) => <g className={`as-topology-node ${node.relationship}`} key={`${node.relationship}-${node.asn}`} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex="0" aria-label={`AS${node.asn} ${node.name}`} onClick={() => onSelectAsn(node.asn)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectAsn(node.asn); } }}><title>{`AS${node.asn} · ${node.name} · ${node.relationship} · ${node.numberPaths.toLocaleString()} paths`}</title><rect x="-64" y="-21" width="128" height="42" /><text className="asn" y="-2">AS{node.asn}</text><text className="name" y="14">{node.name.slice(0, 18)}</text></g>)}</g>
      </svg>
    </div>
    <div className="as-card-note"><Info size={13} />{language === 'zh' ? `图例总数来自 CAIDA asnDegree；图中只从 AS Rank 返回的前 200 条关系里，按路径出现次数为三类关系各选最多 ${MAX_PER_RELATIONSHIP} 个。未画出的关系仍计入总数。关系是 CAIDA 推断结果，不是运营商披露的合同；点击节点可继续查询。` : `Complete counts come from CAIDA asnDegree. The graph selects at most ${MAX_PER_RELATIONSHIP} links of each type by path occurrence from the first 200 AS Rank links; omitted links remain included in the totals. Relationships are CAIDA inferences, not operator-disclosed contracts.`}</div>
  </>;
}
