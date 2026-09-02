import { Info } from 'lucide-react';

const WIDTH = 900;
const HEIGHT = 400;
const CENTER = { x: 450, y: 200 };
const MAX_PER_RELATIONSHIP = 6;

function invertRelationship(relationship) {
  if (relationship === 'provider') return 'customer';
  if (relationship === 'customer') return 'provider';
  return relationship;
}

function normalizeLinks(asn, connection) {
  return (connection?.edges || []).flatMap((edge) => {
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
    nodes.push({ ...link, x: distribute(groups.provider.length, 95, 805)[index], y: 62 });
  }
  for (const [index, link] of groups.customer.entries()) {
    nodes.push({ ...link, x: distribute(groups.customer.length, 95, 805)[index], y: 338 });
  }
  const leftPeers = groups.peer.slice(0, Math.ceil(groups.peer.length / 2));
  const rightPeers = groups.peer.slice(Math.ceil(groups.peer.length / 2));
  for (const [index, link] of leftPeers.entries()) {
    nodes.push({ ...link, x: 92, y: distribute(leftPeers.length, 145, 255)[index] });
  }
  for (const [index, link] of rightPeers.entries()) {
    nodes.push({ ...link, x: 808, y: distribute(rightPeers.length, 145, 255)[index] });
  }
  return { nodes, groups };
}

export default function AsRelationshipGraph({ asn, asName, connection, language, onSelectAsn }) {
  const normalized = normalizeLinks(asn, connection);
  const { nodes, groups } = buildLayout(normalized);

  if (!nodes.length) return <div className="as-topology-empty">{language === 'zh' ? '该 ASN 当前没有可用的 CAIDA 关系子图。' : 'No CAIDA relationship subset is available for this ASN.'}</div>;

  return <>
    <div className="as-topology-legend">
      <span><i className="provider" />{language === 'zh' ? '上游 Provider' : 'Providers'} <b>{groups.provider.length}</b></span>
      <span><i className="peer" />Peer <b>{groups.peer.length}</b></span>
      <span><i className="customer" />{language === 'zh' ? '下游 Customer' : 'Customers'} <b>{groups.customer.length}</b></span>
      <em>{language === 'zh' ? `展示 ${nodes.length} / CAIDA 推断总关系 ${connection?.totalCount || 0}` : `Showing ${nodes.length} of ${connection?.totalCount || 0} inferred CAIDA links`}</em>
    </div>
    <div className="as-topology-stage">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={language === 'zh' ? `AS${asn} 的 CAIDA 推断关系邻域` : `CAIDA inferred relationship neighbourhood for AS${asn}`}>
        <text className="as-topology-group-label" x="450" y="18">PROVIDERS</text>
        <text className="as-topology-group-label" x="450" y="394">CUSTOMERS</text>
        <g className="as-topology-edges">{nodes.map((node) => <line className={node.relationship} key={`edge-${node.asn}`} x1={CENTER.x} y1={CENTER.y} x2={node.x} y2={node.y}><title>{`${node.relationship} · ${node.numberPaths.toLocaleString()} paths`}</title></line>)}</g>
        <g className="as-topology-centre" transform={`translate(${CENTER.x} ${CENTER.y})`}><rect x="-65" y="-29" width="130" height="58" /><text className="asn" y="-2">AS{asn}</text><text className="name" y="15">{String(asName || '').slice(0, 20)}</text></g>
        <g className="as-topology-nodes">{nodes.map((node) => <g className={`as-topology-node ${node.relationship}`} key={`${node.relationship}-${node.asn}`} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex="0" aria-label={`AS${node.asn} ${node.name}`} onClick={() => onSelectAsn(node.asn)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectAsn(node.asn); } }}><title>{`AS${node.asn} · ${node.name} · ${node.relationship} · ${node.numberPaths.toLocaleString()} paths`}</title><rect x="-53" y="-22" width="106" height="44" /><text className="asn" y="-2">AS{node.asn}</text><text className="name" y="12">{node.name.slice(0, 16)}</text></g>)}</g>
      </svg>
    </div>
    <div className="as-card-note"><Info size={13} />{language === 'zh' ? '只从 AS Rank 返回的前 200 条关系中，按路径出现次数为 provider/peer/customer 各选最多 6 个。关系来自 CAIDA 的推断算法，不是运营商披露的合同；点击邻居可继续查询该 ASN。' : 'From the first 200 AS Rank links, at most six providers, peers, and customers are selected by path occurrence. Relationships are CAIDA inferences, not operator-disclosed contracts. Select a neighbour to open its ASN profile.'}</div>
  </>;
}
