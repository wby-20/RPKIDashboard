import { useEffect, useMemo, useState } from 'react';
import { Info, MapPin, MousePointer2 } from 'lucide-react';

const MAP_WIDTH = 960;
const MAP_HEIGHT = 420;
const MIN_LATITUDE = -60;
const MAX_LATITUDE = 85;

function project(longitude, latitude) {
  const x = (longitude + 180) / 360 * MAP_WIDTH;
  const y = (MAX_LATITUDE - latitude) / (MAX_LATITUDE - MIN_LATITUDE) * MAP_HEIGHT;
  return [x, y];
}

function ringPath(ring) {
  return `${ring.map(([longitude, latitude], index) => {
    const [x, y] = project(longitude, latitude);
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join('')}Z`;
}

function geometryPath(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates.map(ringPath).join('');
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap((polygon) => polygon.map(ringPath)).join('');
  return '';
}

function clusterCollectors(collectors) {
  const clusters = new Map();
  for (const collector of collectors) {
    if (!Number.isFinite(collector.latitude) || !Number.isFinite(collector.longitude)) continue;
    const key = `${collector.latitude.toFixed(2)},${collector.longitude.toFixed(2)}`;
    const cluster = clusters.get(key) || { key, latitude: collector.latitude, longitude: collector.longitude, items: [] };
    cluster.items.push(collector);
    clusters.set(key, cluster);
  }
  return [...clusters.values()];
}

function CollectorDetail({ cluster, platform, language, compact, formatDate }) {
  if (!cluster) {
    return <div className="collector-map-empty"><MousePointer2 size={22} /><b>{language === 'zh' ? '点击地图圆点查看节点' : 'Select a point on the map'}</b><p>{language === 'zh' ? '地图用于快速判断基础设施分布；详细清单仍保留在下方。' : 'Use the map to inspect infrastructure distribution; the detailed inventory remains below.'}</p></div>;
  }

  const location = platform === 'ris'
    ? cluster.items[0].geographicalLocation
    : [...new Set(cluster.items.map((item) => item.country).filter(Boolean))].join(' · ');

  return <div className="collector-map-detail-content">
    <div className="collector-map-detail-head"><span><MapPin size={14} />{location || (language === 'zh' ? '位置未注明' : 'Unspecified location')}</span><b>{cluster.items.length > 1 ? `${cluster.items.length} ${language === 'zh' ? '个同址节点' : 'co-located nodes'}` : (language === 'zh' ? '节点详情' : 'Collector details')}</b></div>
    <div className="collector-map-detail-list">{cluster.items.map((collector) => {
      const current = platform === 'ris' ? collector.notDeactivated : collector.notRetired;
      return <section key={collector.name}>
        <div className="collector-map-node-title"><b>{collector.name}</b><em className={current ? 'current' : 'historical'}>{current ? (language === 'zh' ? '当前清单' : 'Current inventory') : (language === 'zh' ? '历史记录' : 'Historical')}</em></div>
        {platform === 'routeviews' ? <>
          <p>{collector.rirRegion || '—'} · {collector.multihop ? 'Multihop' : (collector.type || 'Collector')}</p>
          <dl><div><dt>{language === 'zh' ? 'IPv4 / IPv6 peer 数' : 'IPv4 / IPv6 peers'}</dt><dd>{collector.latestStats ? `${collector.latestStats.ipv4Peers} / ${collector.latestStats.ipv6Peers}` : '—'}</dd></div><div><dt>{language === 'zh' ? '唯一前缀 v4 / v6' : 'Unique prefixes v4 / v6'}</dt><dd>{collector.latestStats ? `${compact(collector.latestStats.ipv4Prefixes)} / ${compact(collector.latestStats.ipv6Prefixes)}` : '—'}</dd></div><div><dt>{language === 'zh' ? '统计时间' : 'Observed'}</dt><dd>{collector.latestStats ? formatDate(collector.latestStats.observedAt) : '—'}</dd></div></dl>
        </> : <>
          <p>{collector.topologicalLocation} · {collector.multihop ? 'Multihop' : 'IXP'}</p>
          <dl><div><dt>{language === 'zh' ? 'Peer 记录 / ASN' : 'Peer records / ASNs'}</dt><dd>{collector.peers} / {collector.uniquePeerAsns}</dd></div><div><dt>{language === 'zh' ? 'IPv4 每 peer 前缀中位数' : 'Median v4 prefixes per peer'}</dt><dd>{collector.prefixesPerPeer?.ipv4?.median == null ? '—' : compact(collector.prefixesPerPeer.ipv4.median)}</dd></div><div><dt>{language === 'zh' ? 'IPv6 每 peer 前缀中位数' : 'Median v6 prefixes per peer'}</dt><dd>{collector.prefixesPerPeer?.ipv6?.median == null ? '—' : compact(collector.prefixesPerPeer.ipv6.median)}</dd></div></dl>
        </>}
      </section>;
    })}</div>
  </div>;
}

export default function CollectorMap({ collectors, platform, status, language }) {
  const [world, setWorld] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const compact = useMemo(() => new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format, [language]);
  const formatDate = useMemo(() => (value) => value ? new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '—', [language]);

  useEffect(() => {
    let mounted = true;
    fetch(`${import.meta.env.BASE_URL}maps/world-countries.geojson`)
      .then((response) => {
        if (!response.ok) throw new Error(`Map request failed: ${response.status}`);
        return response.json();
      })
      .then((data) => mounted && setWorld(data))
      .catch(() => mounted && setLoadError(true));
    return () => { mounted = false; };
  }, []);

  useEffect(() => setSelectedKey(null), [platform, status]);

  const countryPaths = useMemo(() => world?.features?.map((feature, index) => ({
    key: `${feature.properties?.name || 'feature'}-${index}`,
    path: geometryPath(feature.geometry),
  })) || [], [world]);
  const clusters = useMemo(() => clusterCollectors(collectors), [collectors]);
  const selectedCluster = clusters.find((cluster) => cluster.key === selectedKey) || null;
  const markerClass = platform === 'ris' ? 'ris' : 'routeviews';

  return <article className="collector-map-card">
    <div className="collector-map-header"><div><h3>{language === 'zh' ? '全球收集器分布' : 'Global collector distribution'}</h3><p>{language === 'zh' ? `当前筛选共 ${collectors.length} 条清单记录，聚合为 ${clusters.length} 个地图位置。` : `${collectors.length} inventory records in the current filter, grouped into ${clusters.length} map locations.`}</p></div><div className="collector-map-legend"><span><i className={markerClass} />{platform === 'ris' ? 'RIPE RIS' : 'RouteViews'}</span><span><i className="multihop" />Multihop</span><span><i className="historical" />{language === 'zh' ? '历史' : 'Historical'}</span></div></div>
    <div className="collector-map-layout">
      <div className="collector-map-stage">
        {!world && !loadError && <div className="collector-map-loading">{language === 'zh' ? '正在加载简化世界底图…' : 'Loading simplified world map…'}</div>}
        {loadError && <div className="collector-map-loading error">{language === 'zh' ? '底图加载失败；收集器表格不受影响。' : 'The basemap could not be loaded; the inventory remains available.'}</div>}
        {world && <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label={language === 'zh' ? `${platform === 'ris' ? 'RIPE RIS' : 'RouteViews'} 收集器全球分布地图` : `Global ${platform === 'ris' ? 'RIPE RIS' : 'RouteViews'} collector map`}>
          <defs><clipPath id="collector-map-clip"><rect width={MAP_WIDTH} height={MAP_HEIGHT} /></clipPath></defs>
          <g className="collector-map-grid">{[-120, -60, 0, 60, 120].map((longitude) => { const [x] = project(longitude, 0); return <line key={`lon-${longitude}`} x1={x} x2={x} y1="0" y2={MAP_HEIGHT} />; })}{[-30, 0, 30, 60].map((latitude) => { const [, y] = project(0, latitude); return <line key={`lat-${latitude}`} x1="0" x2={MAP_WIDTH} y1={y} y2={y} />; })}</g>
          <g className="collector-map-land" clipPath="url(#collector-map-clip)">{countryPaths.map((country) => <path key={country.key} d={country.path} />)}</g>
          <g className="collector-map-markers">{clusters.map((cluster) => {
            const [x, y] = project(cluster.longitude, cluster.latitude);
            const historical = cluster.items.every((collector) => platform === 'ris' ? !collector.notDeactivated : !collector.notRetired);
            const multihop = cluster.items.some((collector) => collector.multihop);
            const selected = selectedKey === cluster.key;
            const label = cluster.items.map((collector) => collector.name).join(', ');
            return <g key={cluster.key} className={`collector-map-marker ${markerClass} ${historical ? 'historical' : ''} ${multihop ? 'multihop' : ''} ${selected ? 'selected' : ''}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} role="button" tabIndex="0" aria-label={label} onClick={() => setSelectedKey(cluster.key)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedKey(cluster.key); } }}>
              <title>{label}</title><circle className="marker-halo" r={cluster.items.length > 1 ? 11 : 9} /><circle className="marker-core" r={cluster.items.length > 1 ? 7 : 5.5} />{cluster.items.length > 1 && <text y="3">{cluster.items.length}</text>}
            </g>;
          })}</g>
        </svg>}
      </div>
      <aside className="collector-map-detail"><CollectorDetail cluster={selectedCluster} platform={platform} language={language} compact={compact} formatDate={formatDate} /></aside>
    </div>
    <div className="collector-map-note"><Info size={14} /><span>{platform === 'routeviews'
      ? (language === 'zh' ? '圆点坐标来自 RouteViews collector API。唯一前缀数取自该 collector 最新 timeseries 的 prefix_count，不是 Announcement 事件数或 RIB 路由记录数，也不能跨 collector 求和。底图：Natural Earth 5.1.1 China POV。' : 'Coordinates come from the RouteViews collector API. Unique-prefix counts are the latest per-collector timeseries prefix_count values, not announcement events or RIB route records, and must not be summed across collectors. Basemap: Natural Earth 5.1.1 China POV.')
      : (language === 'zh' ? '位置名称来自 RIPE RIS 官方清单；圆点使用城市中心近似坐标，不代表机房精确位置或 peer 覆盖范围。每 peer 前缀数来自同一 RIB 快照的中位数。底图：Natural Earth 5.1.1 China POV。' : 'Location names come from the official RIPE RIS inventory; points use approximate city centroids, not exact facilities or peer coverage. Per-peer prefix values are medians from one RIB snapshot. Basemap: Natural Earth 5.1.1 China POV.')}</span></div>
  </article>;
}
