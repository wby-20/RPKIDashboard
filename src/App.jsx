import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Copy,
  Database,
  FileBadge2,
  FileClock,
  Filter,
  GitBranch,
  GitCompareArrows,
  Globe2,
  HelpCircle,
  Info,
  Languages,
  Layers3,
  Menu,
  Network,
  RadioTower,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Split,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  COLORS,
  current,
  formatNumber,
  repositoryRows,
  rirRows,
  snapshot,
  totals,
} from './data';
import { createTranslator } from './i18n';
import CollectorMap from './components/CollectorMap';
import AsProfile from './components/AsProfile';

const rirOptions = [
  ['global', 'All RIRs'],
  ['AFRINIC', 'AFRINIC'],
  ['APNIC', 'APNIC'],
  ['ARIN', 'ARIN'],
  ['LACNIC', 'LACNIC'],
  ['RIPE', 'RIPE NCC'],
];
const viewKeys = new Set(['overview', 'objects', 'bgp', 'as', 'collectors', 'infrastructure', 'retrieval', 'regional', 'sources']);
const viewFromHash = () => {
  const value = window.location.hash.replace(/^#\/?/, '');
  return viewKeys.has(value) ? value : 'overview';
};

function ChartTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((item) => (
        <div className="tooltip-row" key={item.dataKey}>
          <span className="tooltip-key">
            <i style={{ background: item.color }} />{item.name}
          </span>
          <strong>{typeof item.value === 'number' && item.value > 999 ? formatNumber(item.value) : item.value}{suffix}</strong>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, unit, change, color, note, meta, t, onInfo }) {
  return (
    <article className="metric-card">
      <div className="metric-head">
        <span className="metric-icon" style={{ color, background: `${color}12` }}><Icon size={16} /></span>
        <button className="metric-help" type="button" aria-label={`${t('definition', 'Definition')}: ${label}`} onClick={() => onInfo(label, note)} title={t('definition', 'Definition')}><HelpCircle size={14} /></button>
      </div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}<small>{unit}</small></div>
      <div className="metric-foot">
        <span className="metric-change">{change}</span>
        <span className="metric-period">{meta}</span>
      </div>
    </article>
  );
}

function SectionHeading({ number, title, description, id }) {
  return (
    <div className={`section-heading ${number == null ? 'no-number' : ''}`} id={id}>
      {number != null && <div className="section-number">{String(number).padStart(2, '0')}</div>}
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function ChartActions({ onCopy, href, t }) {
  return (
    <div className="chart-actions">
      <button aria-label={t('copyCitation', 'Copy figure citation')} title={t('copyCitation', 'Copy figure citation')} onClick={onCopy}><Copy size={14} /></button>
      <a aria-label={t('openSource', 'Open source dataset')} title={t('openSource', 'Open source dataset')} href={href} target="_blank" rel="noreferrer"><ArrowUpRight size={14} /></a>
    </div>
  );
}

function SourceLine({ children }) {
  return <div className="source-line"><Database size={12} /> {children}</div>;
}

function ViewIntro({ eyebrow, title, description, meta, action }) {
  return (
    <div className="view-intro">
      <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      <div className="view-intro-side">{meta}{action}</div>
    </div>
  );
}

function ViewTabs({ items, value, onChange }) {
  return <div className="view-tabs" role="tablist">{items.map((item) => <button key={item.value} role="tab" aria-selected={value === item.value} className={value === item.value ? 'active' : ''} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

function RirSelector({ value, onChange, language, t, id }) {
  return <label className="view-rir-selector" htmlFor={id}><span>{language === 'zh' ? 'RIR 范围' : 'RIR scope'}</span><div><Globe2 size={14} /><select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{rirOptions.map(([option, label]) => <option value={option} key={option}>{option === 'global' ? t('allRirs', 'All RIRs') : label}</option>)}</select><ChevronDown size={13} /></div></label>;
}

function Modal({ modal, onClose, t }) {
  if (!modal) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <div><span>{modal.eyebrow || t('definition', 'Definition')}</span><h2 id="modal-title">{modal.title}</h2></div>
          <button aria-label={t('close', 'Close')} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-content">{modal.content}</div>
      </section>
    </div>
  );
}

function SearchPanel({ open, onClose, onNavigate, t, entries }) {
  const [query, setQuery] = useState('');
  if (!open) return null;
  const normalized = query.trim().toLowerCase();
  const results = normalized ? entries.filter((item) => `${item.title} ${item.keywords}`.toLowerCase().includes(normalized)) : entries;
  const visit = (view) => {
    onClose();
    onNavigate(view);
  };
  return (
    <div className="search-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="search-panel" role="dialog" aria-modal="true" aria-label={t('searchTitle', 'Search measurements')}>
        <div className="search-input-wrap"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchPlaceholder', 'Search metrics, protocols, or data sources…')} /><button aria-label={t('close', 'Close')} onClick={onClose}><X size={17} /></button></div>
        <div className="search-results">
          {results.length ? results.map((item) => <button key={item.id} onClick={() => visit(item.view)}><span>{item.index}</span><div><b>{item.title}</b><small>{item.subtitle}</small></div><ArrowUpRight size={14} /></button>) : <p>{t('noSearchResults', 'No matching content.')}</p>}
        </div>
      </section>
    </div>
  );
}

function App() {
  const [language, setLanguage] = useState('zh');
  const [rir, setRir] = useState('global');
  const [activeView, setActiveView] = useState(viewFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chainSelection, setChainSelection] = useState('p1');
  const [objectTab, setObjectTab] = useState('growth');
  const [bgpTab, setBgpTab] = useState('overview');
  const [coverageBasis, setCoverageBasis] = useState('prefix');
  const [collectorPlatform, setCollectorPlatform] = useState('routeviews');
  const [collectorStatus, setCollectorStatus] = useState('current');
  const [collectorTableExpanded, setCollectorTableExpanded] = useState(false);
  const t = useMemo(() => createTranslator(language), [language]);
  const compactNumber = (value) => new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en', { notation: 'compact', maximumFractionDigits: 2 }).format(value);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = t('heroTitle', 'RPKI Global Observatory');
  }, [language, t]);

  useEffect(() => setCollectorTableExpanded(false), [collectorPlatform, collectorStatus]);

  useEffect(() => {
    const syncView = () => {
      const nextView = viewFromHash();
      if (nextView === 'regional') setRir('global');
      setActiveView(nextView);
    };
    window.addEventListener('popstate', syncView);
    window.addEventListener('hashchange', syncView);
    return () => {
      window.removeEventListener('popstate', syncView);
      window.removeEventListener('hashchange', syncView);
    };
  }, []);

  const selectedRir = rirRows.find((row) => row.code === rir);
  const fullHistory = rir === 'global' ? snapshot.history.global : snapshot.history.byRir[rir];
  const visibleHistory = fullHistory;
  const latestHistory = fullHistory.at(-1);
  const previousYearHistory = fullHistory.at(-13);
  const percentChange = (field) => previousYearHistory?.[field]
    ? `${((latestHistory[field] / previousYearHistory[field] - 1) * 100) >= 0 ? '+' : ''}${((latestHistory[field] / previousYearHistory[field] - 1) * 100).toFixed(1)}%`
    : '—';
  const formatUtc = (value) => new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai',
  }).format(new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`));

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  };

  const navigateTo = (view) => {
    if (view === 'regional') setRir('global');
    setActiveView(view);
    setMenuOpen(false);
    if (window.location.hash !== `#/${view}`) window.history.pushState(null, '', `#/${view}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const copyCitation = async (figure) => {
    const text = language === 'zh'
      ? `RPKI 全球观测站——${figure}。数据时间：${formatUtc(current.observedAt)}。来源：RIPE NCC 公共 Routinator 与 RIR Trust Anchor Statistics。`
      : `RPKI Global Observatory — ${figure}. Data time: ${formatUtc(current.observedAt)}. Sources: RIPE NCC public Routinator and RIR Trust Anchor Statistics.`;
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard is optional */ }
    notify(t('citationCopied', 'Figure citation copied'));
  };

  const exportCsv = () => {
    const headers = ['date', 'valid_certificates', 'valid_roas', 'ipv4_roa_prefixes', 'ipv4_/24_units', 'ipv6_roa_prefixes', 'ipv6_/48_units'];
    const body = visibleHistory.map((d) => [d.date, d.certs, d.roas, d.roaV4, d.roaV4Units, d.roaV6, d.roaV6Units].join(','));
    const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ripe-rpki-trust-anchor-history-${rir}-all.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(t('csvDownloaded', 'CSV dataset downloaded'));
  };

  const openDefinition = (title, definition, source) => setModal({
    title,
    eyebrow: t('definition', 'Definition'),
    content: <><p>{definition}</p>{source && <div className="modal-source"><Database size={13} /><span><b>{t('dataSource', 'Suggested source')}</b>{source}</span></div>}</>,
  });

  const openManifest = () => setModal({
    title: language === 'zh' ? '数据采集记录' : 'Data acquisition record',
    eyebrow: t('methodology', 'Methodology'),
    content: <>
      <p>{language === 'zh' ? '当前页面由数据刷新脚本从以下公开端点生成，没有使用人工录入或插值。' : 'The page is generated by a refresh script from the following public endpoints without manual values or interpolation.'}</p>
      <div className="manifest-box"><FileClock size={17} /><span>rpki-validator.ripe.net/api/v1/status<br />lirportal.ripe.net/.../statistics/*.tal.txt<br />api.routeviews.org/timeseries/ · /collector/ · /rib/collectors<br />stat.ripe.net/data/rrc-info · /ris-peers<br />stat.ripe.net/data/as-overview · /routing-status · /rpki-history · /asn-neighbours<br />api.asrank.caida.org/v2/graphql · AS Rank / organization / inferred relationships<br />rpki-monitor.antd.nist.gov/ROV · api.cloudflare.com/client/v4/radar/bgp/*<br />{current.version} · serial {current.serial}</span></div>
      <div className="modal-notice real"><Check size={14} />{language === 'zh' ? `当前数据已从公开接口生成，快照时间为 ${formatUtc(current.observedAt)}。` : `The current data was generated from public endpoints at ${formatUtc(current.observedAt)}.`}</div>
    </>,
  });

  const openProjectInfo = () => setModal({
    title: t('implementationTitle', 'Project implementation'),
    eyebrow: t('projectInfo', 'Project information'),
    content: <><p>{t('implementationBody', 'This version is a React single-page application. Node.js is used only to install dependencies and build static assets; the built files can be served by Nginx, FastAPI, Flask, or any static file server.')}</p><div className="code-paths"><code>src/App.jsx</code><code>src/data.js</code><code>src/i18n.js</code><code>src/styles.css</code></div></>,
  });

  const searchEntries = [
    { id: 'overview', view: 'overview', index: '00', title: t('overview', 'Overview'), subtitle: language === 'zh' ? '核心指标与研究入口' : 'Core metrics and research entry points', keywords: 'overview summary 总览 核心' },
    { id: 'coverage', view: 'objects', index: '01', title: language === 'zh' ? 'RPKI 对象与生态' : 'RPKI Objects & Ecosystem', subtitle: language === 'zh' ? '有效证书、ROA、VRP 与 RIR 分布' : 'Certificates, ROAs, VRPs, and RIR distribution', keywords: 'ROA certificate history CA VRP ASPA RIR 历史 证书 对象 生态' },
    { id: 'bgp', view: 'bgp', index: '02', title: language === 'zh' ? 'BGP 与 ROV' : 'BGP & ROV', subtitle: language === 'zh' ? '前缀数量与 RPKI-valid 比例' : 'Prefix counts and RPKI-valid ratios', keywords: 'BGP prefix IPv4 IPv6 NIST Cloudflare 前缀 覆盖' },
    { id: 'as', view: 'as', index: '03A', title: language === 'zh' ? 'AS 信息查询' : 'AS Profile', subtitle: language === 'zh' ? '路由、VRP、AS Rank 与关系邻域' : 'Routing, VRPs, AS Rank, and relationships', keywords: 'ASN autonomous system AS profile neighbour prefix VRP AS Rank CAIDA organization relationship 自治系统 组织 邻居 前缀' },
    { id: 'collectors', view: 'collectors', index: '03', title: language === 'zh' ? 'BGP 公共收集器' : 'Public BGP Collectors', subtitle: 'RouteViews · RIPE RIS', keywords: 'collector RRC RouteViews RIPE RIS peer 收集器 观测点' },
    { id: 'infrastructure', view: 'infrastructure', index: '04', title: t('secInfrastructure', 'Publication Infrastructure'), subtitle: t('topRepositories', 'Repository payload counts'), keywords: 'RRDP rsync repository FQDN 发布 仓库' },
    { id: 'retrieval', view: 'retrieval', index: '05', title: t('secRetrieval', 'RP Retrieval & Validation'), subtitle: language === 'zh' ? '最近一次公共验证器运行' : 'Latest public validator run', keywords: 'validator sync fetch failure 验证器 同步 失败' },
    { id: 'regional', view: 'regional', index: '06', title: t('secRegional', 'Regional Breakdown'), subtitle: t('rirMatrix', 'RIR comparative matrix'), keywords: 'AFRINIC APNIC ARIN LACNIC RIPE 区域' },
    { id: 'datasets', view: 'sources', index: '07', title: t('secSources', 'Data Sources & Reproducibility'), subtitle: t('viewManifest', 'View collection manifest'), keywords: 'NIST Cloudflare Routinator RPKIviews 数据 方法' },
  ];

  const navGroups = [
    { label: language === 'zh' ? '概览' : 'OVERVIEW', items: [
      { key: 'overview', label: t('overview', 'Overview'), sub: language === 'zh' ? '核心指标' : 'Core metrics', icon: Activity },
    ] },
    { label: language === 'zh' ? '观测专题' : 'MEASUREMENTS', items: [
      { key: 'objects', label: language === 'zh' ? 'RPKI 对象' : 'RPKI Objects', sub: language === 'zh' ? '证书与 ROA 历史' : 'Certificate & ROA history', icon: FileClock },
      { key: 'bgp', label: language === 'zh' ? 'BGP 与 ROV' : 'BGP & ROV', sub: language === 'zh' ? '路由覆盖与前缀' : 'Coverage & prefixes', icon: RadioTower },
      { key: 'as', label: language === 'zh' ? 'AS 信息查询' : 'AS Profile', sub: language === 'zh' ? '路由 · AS Rank · 关系' : 'Routing · AS Rank · links', icon: CircleDot },
      { key: 'collectors', label: language === 'zh' ? 'BGP 公共收集器' : 'BGP Collectors', sub: 'RouteViews · RIPE RIS', icon: Network },
    ] },
    { label: language === 'zh' ? '基础设施' : 'INFRASTRUCTURE', items: [
      { key: 'infrastructure', label: t('secInfrastructure', 'Publication'), sub: language === 'zh' ? '仓库与发布点' : 'Repositories & PPs', icon: Server },
      { key: 'retrieval', label: language === 'zh' ? '依赖方验证' : 'RP Validation', sub: language === 'zh' ? '获取与验证运行' : 'Retrieval & runs', icon: RefreshCw },
    ] },
    { label: language === 'zh' ? '比较与资料' : 'COMPARE & DATA', items: [
      { key: 'regional', label: t('secRegional', 'Regional'), sub: language === 'zh' ? '五个 RIR 对比' : 'Five-RIR comparison', icon: Globe2 },
      { key: 'sources', label: language === 'zh' ? '数据与方法' : 'Data & Method', sub: language === 'zh' ? '来源与可复现性' : 'Sources & reproducibility', icon: Database },
    ] },
  ];

  const counts = selectedRir ? {
    ca: selectedRir.ca, roa: selectedRir.roa, vrp: selectedRir.vrp, pps: selectedRir.pps,
    aspa: selectedRir.aspa, rejectedPps: selectedRir.rejectedPps,
  } : {
    ca: totals.validCACerts, roa: totals.validROAs, vrp: totals.vrpsFinal,
    pps: totals.validPublicationPoints, aspa: totals.aspasFinal, rejectedPps: totals.rejectedPublicationPoints,
  };
  const payloadData = [
    { name: 'IPv4 VRP', value: selectedRir?.vrpV4 ?? totals.vrpsV4, color: COLORS.blue },
    { name: 'IPv6 VRP', value: selectedRir?.vrpV6 ?? totals.vrpsV6, color: COLORS.cyan },
  ];
  const rrdpRepositoryCount = current.repositories.filter((item) => item.type === 'RRDP').length;
  const rsyncRepositoryCount = current.repositories.filter((item) => item.type === 'Rsync').length;
  const slowRetrievals = [...current.retrieval.rrdp.map((item) => ({ ...item, protocol: 'RRDP' })), ...current.retrieval.rsync.map((item) => ({ ...item, protocol: 'rsync' }))]
    .sort((a, b) => b.duration - a.duration).slice(0, 12);
  const cloudflareCoverage = snapshot.cloudflare?.coverage || [];
  const addressSpaceCoverage = snapshot.cloudflare?.addressSpaceCoverage || [];
  const aspaHistory = snapshot.cloudflare?.aspa || [];
  const coverageDisplay = coverageBasis === 'prefix' ? cloudflareCoverage : addressSpaceCoverage;
  const cloudflareStats = snapshot.cloudflare?.routeStats?.stats;
  const nistRov = snapshot.bgp.nistRov;
  const latestNistRov = nistRov.at(-1);
  const routeViewsHistory = snapshot.bgp.routeViews;
  const anomalyData = snapshot.cloudflare?.anomalies || { hijacks: [], leaks: [], invalidMoas: [] };
  const routeViewsCollectorInventory = snapshot.collectors?.routeViews?.entries || [];
  const risCollectorInventory = snapshot.collectors?.ripeRis?.entries || [];
  const currentRouteViewsCollectors = routeViewsCollectorInventory.filter((collector) => collector.notRetired);
  const currentRisCollectors = risCollectorInventory.filter((collector) => collector.notDeactivated);
  const filteredRouteViewsCollectors = collectorStatus === 'current' ? currentRouteViewsCollectors : routeViewsCollectorInventory;
  const filteredRisCollectors = collectorStatus === 'current' ? currentRisCollectors : risCollectorInventory;
  const visibleRouteViewsCollectors = collectorTableExpanded ? filteredRouteViewsCollectors : filteredRouteViewsCollectors.slice(0, 12);
  const visibleRisCollectors = collectorTableExpanded ? filteredRisCollectors : filteredRisCollectors.slice(0, 12);
  const routeViewsSummary = {
    current: currentRouteViewsCollectors.length,
    total: routeViewsCollectorInventory.length,
    countries: new Set(currentRouteViewsCollectors.map((collector) => collector.country).filter(Boolean)).size,
    ipv4: currentRouteViewsCollectors.filter((collector) => collector.ipv4).length,
    ipv6: currentRouteViewsCollectors.filter((collector) => collector.ipv6).length,
    multihop: currentRouteViewsCollectors.filter((collector) => collector.multihop).length,
    currentRibApi: snapshot.collectors?.routeViews?.currentRibApiCollectors?.length || 0,
  };
  const routeViewsRegionCounts = ['AFRINIC', 'APNIC', 'ARIN', 'LACNIC', 'RIPE NCC'].map((region) => ({
    region,
    count: currentRouteViewsCollectors.filter((collector) => collector.rirRegion === region).length,
  }));
  const risPeerSnapshot = snapshot.collectors?.ripeRis?.peerSnapshot || {};
  const risSummary = {
    current: currentRisCollectors.length,
    total: risCollectorInventory.length,
    ixp: currentRisCollectors.filter((collector) => !collector.multihop).length,
    multihop: currentRisCollectors.filter((collector) => collector.multihop).length,
    peers: risPeerSnapshot.peerRecords || 0,
    uniquePeerAsns: risPeerSnapshot.uniquePeerAsns || 0,
    ipv4Peers: risPeerSnapshot.ipv4PeerRecords || 0,
    ipv6Peers: risPeerSnapshot.ipv6PeerRecords || 0,
  };
  const nistRovHistory = nistRov.map((row) => ({
    date: row.date,
    v4Valid: row.ipv4.validRatio, v4Invalid: row.ipv4.invalidRatio, v4Unknown: row.ipv4.notFoundRatio,
    v6Valid: row.ipv6.validRatio, v6Invalid: row.ipv6.invalidRatio, v6Unknown: row.ipv6.notFoundRatio,
  }));
  const routeStateRows = cloudflareStats ? [
    { family: 'IPv4', valid: cloudflareStats.routes_valid_ipv4, invalid: cloudflareStats.routes_invalid_ipv4, unknown: cloudflareStats.routes_unknown_ipv4 },
    { family: 'IPv6', valid: cloudflareStats.routes_valid_ipv6, invalid: cloudflareStats.routes_invalid_ipv6, unknown: cloudflareStats.routes_unknown_ipv6 },
  ] : [];
  const rirRoaAsnRows = rirRows.map((row) => ({
    ...row,
    roaAsn: snapshot.history.byRir[row.code]?.at(-1)?.roaAsn || 0,
  }));

  const chainNodes = [
    {
      id: 'p0', code: 'P0', icon: Globe2, tone: 'slate',
      title: language === 'zh' ? '运营意图' : 'Operator Intent',
      subtitle: language === 'zh' ? '资源持有者 / 网络运营者' : 'Resource holder / operator',
      description: language === 'zh' ? '资源持有者决定需要授权的前缀、起源 ASN、maxLength 或上游关系。当前数据无法直接观察“意图”，这里只提供 BGP 中实际出现的起源与前缀作为外部背景。' : 'The resource holder decides the prefix, origin ASN, maxLength, or provider relationship to authorize. Operator intent is not directly observable; BGP origins and prefixes are shown only as external context.',
      status: 'unmeasured', view: 'bgp', source: language === 'zh' ? '无意图级直接观测；仅列 BGP 背景' : 'No intent-level observation; BGP context only',
      metrics: [
        [language === 'zh' ? '观测起源 ASN' : 'Observed origin ASNs', compactNumber(cloudflareStats?.distinct_origins || 0)],
        [language === 'zh' ? '唯一 BGP 前缀' : 'Distinct BGP prefixes', compactNumber(cloudflareStats?.distinct_prefixes || 0)],
      ],
    },
    {
      id: 'p1', code: 'P1', icon: ShieldCheck, tone: 'blue',
      title: language === 'zh' ? 'CA 与签名授权' : 'CA & Signed Authorization',
      subtitle: 'Certificate · ROA · ASPA',
      description: language === 'zh' ? 'RIR/NIR/LIR 等 CA 在证书层级中授权资源，并签发 ROA、ASPA 等对象。这里的数据描述通过验证的对象，不将 CA 数量解释为组织数量。' : 'RIR, NIR, and LIR CAs authorize resources through the certificate hierarchy and issue ROA or ASPA objects. Counts describe validated objects, not organizations.',
      status: 'partial', view: 'objects', source: 'RIPE NCC public Routinator',
      metrics: [[language === 'zh' ? '有效 CA 证书' : 'Valid CA certificates', formatNumber(totals.validCACerts)], [language === 'zh' ? '有效 ROA' : 'Valid ROAs', formatNumber(totals.validROAs)], ['ASPA', formatNumber(totals.aspasFinal)]],
    },
    {
      id: 'p2', code: 'P2', icon: Database, tone: 'violet',
      title: language === 'zh' ? '发布点' : 'Publication Point',
      subtitle: 'PP · Repository · FQDN',
      description: language === 'zh' ? 'CA 将证书、ROA、清单和 CRL 发布到逻辑发布点。发布点、仓库端点和服务器 FQDN 是不同层级的计数，不能互相替代。' : 'CAs publish certificates, ROAs, manifests, and CRLs at logical publication points. Publication points, repository endpoints, and server FQDNs are distinct layers.',
      status: 'partial', view: 'infrastructure', source: 'Routinator repository inventory',
      metrics: [[language === 'zh' ? '有效发布点' : 'Valid PPs', formatNumber(totals.validPublicationPoints)], [language === 'zh' ? '仓库端点' : 'Repository endpoints', totals.repositoryEndpoints], ['FQDN', totals.distinctFqdns]],
    },
    {
      id: 'p3', code: 'P3', icon: Server, tone: 'cyan',
      title: language === 'zh' ? '依赖方 RP' : 'Relying Party',
      subtitle: language === 'zh' ? '获取 · 验证 · 缓存' : 'Fetch · validate · cache',
      description: language === 'zh' ? 'RP 通过 RRDP 或 rsync 获取对象，完成证书链、清单、CRL 和签名验证，最终生成可供路由器使用的 VRP 集合。当前运行数据仅代表 RIPE NCC 公共 Routinator 实例。' : 'The RP retrieves objects over RRDP or rsync, validates certificate chains, manifests, CRLs, and signatures, and produces VRPs for routers. Run data covers only the RIPE NCC public Routinator instance.',
      status: 'partial', view: 'retrieval', source: 'RIPE NCC public Routinator run',
      metrics: [[language === 'zh' ? '最终 VRP' : 'Final VRPs', formatNumber(totals.vrpsFinal)], [language === 'zh' ? '验证耗时' : 'Validation duration', `${current.lastUpdateDuration.toFixed(2)}s`], [language === 'zh' ? '缺失清单' : 'Missing manifests', totals.missingManifests]],
    },
    {
      id: 'p4', code: 'P4', icon: RadioTower, tone: 'amber',
      title: language === 'zh' ? '路由器 / RTR' : 'Router / RTR',
      subtitle: language === 'zh' ? '验证缓存 → 路由器' : 'Validated cache → router',
      description: language === 'zh' ? 'RP 通常通过 RPKI-to-Router（RTR）协议向路由器分发 VRP。当前快照保留了最终 VRP 和 Router Key 数量，但没有持续采集 RTR 会话、serial 同步或路由器接收状态。' : 'The RP normally distributes VRPs to routers over RPKI-to-Router (RTR). The snapshot includes final VRPs and Router Keys but does not continuously collect RTR sessions, serial synchronization, or router receipt state.',
      status: 'unmeasured', view: 'retrieval', source: language === 'zh' ? '无路由器或 RTR 会话遥测；仅列 RP 输出背景' : 'No router or RTR-session telemetry; RP output shown as context',
      metrics: [[language === 'zh' ? 'RP 生成的最终 VRP' : 'RP-produced final VRPs', formatNumber(totals.vrpsFinal)], ['Router Keys (RP)', totals.routerKeysFinal], [language === 'zh' ? 'RTR 会话' : 'RTR sessions', language === 'zh' ? '未采集' : 'Not collected']],
    },
    {
      id: 'p5', code: 'P5', icon: Check, tone: 'green',
      title: language === 'zh' ? 'ROV 与选路' : 'ROV & Route Selection',
      subtitle: 'Valid · Invalid · Unknown',
      description: language === 'zh' ? '路由器将 BGP 前缀—起源 ASN 与 VRP 比较，得到 Valid、Invalid 或 Unknown 状态；运营策略再决定这些状态如何影响选路。Invalid 不等同于攻击。' : 'Routers compare BGP prefix–origin pairs with VRPs to obtain Valid, Invalid, or Unknown states. Local policy determines how those states affect route selection. Invalid does not mean attack.',
      status: 'partial', view: 'bgp', source: 'Cloudflare Radar and NIST RPKI Monitor',
      metrics: [['IPv4 Valid', `${cloudflareCoverage.at(-1)?.ipv4.toFixed(1)}%`], ['IPv6 Valid', `${cloudflareCoverage.at(-1)?.ipv6.toFixed(1)}%`], [language === 'zh' ? 'Invalid 路由' : 'Invalid routes', formatNumber(cloudflareStats?.routes_invalid || 0)]],
    },
    {
      id: 'p6', code: 'P6', icon: Network, tone: 'gray',
      title: language === 'zh' ? '数据面结果' : 'Data-Plane Outcome',
      subtitle: language === 'zh' ? '可达性 · 转发路径 · 用户影响' : 'Reachability · forwarding · impact',
      description: language === 'zh' ? '最终结果需要主动探测、流量或数据面可达性测量才能确认。当前看板没有这类数据，因此不能从 ROA 覆盖率或 Invalid 比例推断真实的过滤和用户影响。' : 'Confirming the outcome requires active probes, traffic, or data-plane reachability measurements. The dashboard currently has no such dataset, so filtering and user impact cannot be inferred from ROA coverage or Invalid ratios.',
      status: 'unmeasured', view: 'sources', source: language === 'zh' ? '当前无数据源' : 'No current data source',
      metrics: [[language === 'zh' ? '数据面探针' : 'Data-plane probes', language === 'zh' ? '未接入' : 'Not connected'], [language === 'zh' ? '用户影响' : 'User impact', language === 'zh' ? '不可推断' : 'Not inferable']],
    },
  ];

  const chainEdges = [
    { id: 'e01', from: 'P0', to: 'P1', label: language === 'zh' ? '签名授权' : 'Sign / authorize', status: 'partial', view: 'objects', source: 'Routinator object snapshot', description: language === 'zh' ? '将运营意图编码为受资源证书约束的 ROA 或 ASPA 等签名对象。看板能观察最终有效对象，但不能直接证明其是否准确表达原始运营意图。' : 'Encodes operator intent into signed ROA or ASPA objects constrained by resource certificates. The dashboard observes validated objects but cannot prove that they perfectly reflect the original intent.', metrics: [[language === 'zh' ? '有效 ROA' : 'Valid ROAs', formatNumber(totals.validROAs)], ['ASPA', formatNumber(totals.aspasFinal)]] },
    { id: 'e12', from: 'P1', to: 'P2', label: language === 'zh' ? '对象发布' : 'Publish objects', status: 'partial', view: 'infrastructure', source: language === 'zh' ? 'RP 下游验证结果；不是直接发布事件日志' : 'Downstream RP validation result; not direct publication-event logs', description: language === 'zh' ? 'CA 将证书、ROA、清单和 CRL 放入发布点。这里可观察有效、被拒绝和缺失清单等下游验证结果，但它们不是 CA 与发布点的简单一一映射。' : 'CAs place certificates, ROAs, manifests, and CRLs at publication points. Downstream valid, rejected, and missing states are observable, but CA and publication-point counts are not a simple one-to-one mapping.', metrics: [[language === 'zh' ? '有效发布点' : 'Valid PPs', formatNumber(totals.validPublicationPoints)], [language === 'zh' ? '被拒绝发布点' : 'Rejected PPs', totals.rejectedPublicationPoints], [language === 'zh' ? '缺失清单' : 'Missing manifests', totals.missingManifests]] },
    { id: 'e23', from: 'P2', to: 'P3', label: 'RRDP / rsync', status: 'partial', view: 'retrieval', source: 'Routinator latest retrieval records', description: language === 'zh' ? 'RP 通过 RRDP 或 rsync 同步各仓库。本页展示的是单次公共 Routinator 运行的原始状态和耗时；整轮验证耗时包含获取、解析与验证，不是该链路的下载耗时。' : 'The RP synchronizes repositories over RRDP or rsync. Values are raw records from one public Routinator run; full-run duration includes retrieval, parsing, and validation and is not link download latency.', metrics: [['RRDP', `${totals.rrdpSuccessful}/${totals.rrdpAttempts}`], ['rsync', `${totals.rsyncSuccessful}/${totals.rsyncAttempts}`], [language === 'zh' ? '整轮运行耗时' : 'Full-run duration', `${current.lastUpdateDuration.toFixed(2)}s`]] },
    { id: 'e34', from: 'P3', to: 'P4', label: language === 'zh' ? 'RTR 分发' : 'RTR delivery', status: 'unmeasured', view: 'retrieval', source: language === 'zh' ? '无 RTR 会话或路由器端遥测' : 'No RTR-session or router-side telemetry', description: language === 'zh' ? 'RP 通常通过 RTR 向路由器提供验证后的 payload。当前仅有 RP 生成的最终 VRP 上游背景，没有 RTR 会话、serial/reset、同步延迟或路由器接收数据。' : 'The RP normally provides validated payloads to routers over RTR. Only RP-produced final VRPs are available as upstream context; RTR sessions, serial/reset events, latency, and router receipt are not collected.', metrics: [[language === 'zh' ? 'RP 生成的最终 VRP' : 'RP-produced final VRPs', formatNumber(totals.vrpsFinal)], [language === 'zh' ? 'RTR 会话/同步' : 'RTR sessions/sync', language === 'zh' ? '未采集' : 'Not collected']] },
    { id: 'e45', from: 'P4', to: 'P5', label: language === 'zh' ? '起源验证' : 'Origin validation', status: 'partial', view: 'bgp', source: 'Cloudflare Radar routing stats', description: language === 'zh' ? '外部平台将当前 BGP 路由与 VRP 比较并得到 Valid、Invalid、Unknown；我们没有测量某台路由器的本地 ROV 策略和实际选路。' : 'External platforms compare BGP routes with VRPs to produce Valid, Invalid, or Unknown. The dashboard does not observe any router’s local ROV policy or actual route-selection decision.', metrics: [['Valid', formatNumber(cloudflareStats?.routes_valid || 0)], ['Invalid', formatNumber(cloudflareStats?.routes_invalid || 0)], ['Unknown', formatNumber(cloudflareStats?.routes_unknown || 0)]] },
    { id: 'e56', from: 'P5', to: 'P6', label: language === 'zh' ? '策略执行' : 'Policy enforcement', status: 'unmeasured', view: 'sources', source: language === 'zh' ? '需要主动测量' : 'Requires active measurement', description: language === 'zh' ? 'ROV 状态是否真正导致拒绝路由，以及最终是否改变数据面可达性，需要独立的主动测量。当前看板不从控制面数据推断该结果。' : 'Whether ROV state actually causes route rejection and changes data-plane reachability requires independent active measurement. The dashboard does not infer this outcome from control-plane data.', metrics: [[language === 'zh' ? '过滤部署' : 'Filtering deployment', language === 'zh' ? '未测量' : 'Not measured'], [language === 'zh' ? '数据面结果' : 'Data-plane outcome', language === 'zh' ? '未测量' : 'Not measured']] },
  ];
  const selectedChainItem = [...chainNodes, ...chainEdges].find((item) => item.id === chainSelection) || chainNodes[1];
  const chainSequence = chainNodes.flatMap((node, index) => chainEdges[index]
    ? [{ type: 'node', item: node }, { type: 'edge', item: chainEdges[index] }]
    : [{ type: 'node', item: node }]);
  const chainStatusLabel = {
    measured: language === 'zh' ? '有直接观测字段' : 'Direct fields available',
    partial: language === 'zh' ? '部分可观测' : 'Partially observed',
    unmeasured: language === 'zh' ? '未直接观测' : 'Not directly observed',
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#/overview" onClick={(event) => { event.preventDefault(); navigateTo('overview'); }} aria-label={t('homeAria', 'RPKI Global Observatory home')}>
            <span className="brand-mark"><Globe2 size={19} /><i /></span>
            <span><strong>RPKI</strong> {language === 'zh' ? '全球观测站' : 'Global Observatory'}</span>
            <em>RESEARCH</em>
          </a>
          <div className="header-view-context"><span>/</span>{searchEntries.find((item) => item.view === activeView)?.title}</div>
          <div className="header-tools">
            <div className="language-switch" aria-label="Language"><Languages size={14} /><button className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>中</button><i /> <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button></div>
            <button className="icon-btn" aria-label={t('searchDatasets', 'Search datasets')} title={t('searchDatasets', 'Search datasets')} onClick={() => setSearchOpen(true)}><Search size={17} /></button>
            <button className="icon-btn" aria-label={t('projectInfo', 'Project information')} title={t('projectInfo', 'Project information')} onClick={openProjectInfo}><GitBranch size={17} /></button>
            <span className="v-rule" />
            <button className="menu-btn" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className={`dashboard-sidebar ${menuOpen ? 'open' : ''}`} aria-label={language === 'zh' ? '数据专题导航' : 'Data topic navigation'}>
          <div className="sidebar-mobile-head"><span>{language === 'zh' ? '数据专题' : 'Data topics'}</span><button aria-label={t('close', 'Close')} onClick={() => setMenuOpen(false)}><X size={17} /></button></div>
          <nav className="sidebar-nav">
            {navGroups.map((group) => <div className="sidebar-group" key={group.label}>
              <span className="sidebar-group-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return <button key={item.key} className={activeView === item.key ? 'active' : ''} onClick={() => navigateTo(item.key)}><Icon size={16} /><span><b>{item.label}</b><small>{item.sub}</small></span></button>;
              })}
            </div>)}
          </nav>
          <div className="sidebar-foot">
            <span className="sidebar-live"><i />{language === 'zh' ? '数据快照' : 'Data snapshot'}</span>
            <b>{formatUtc(current.observedAt)}</b>
            <small>{current.version} · serial {current.serial}</small>
          </div>
        </aside>

      <main id="top" className="dashboard-main">
        {activeView === 'overview' && <div className="dashboard-view overview-view">
        <section className="hero">
          <div>
            <div className="eyebrow"><span className="live-dot" /> {language === 'zh' ? `真实数据快照 · ${formatUtc(current.observedAt)} · 北京时间 UTC+8` : `VERIFIED DATA SNAPSHOT · ${formatUtc(current.observedAt)} · UTC+8`}</div>
            <h1>{t('heroTitle', 'Global RPKI Observatory')}</h1>
            <p>{language === 'zh' ? '以“授权意图 → CA → 发布点 → RP → 路由器 → ROV → 数据面”为主线，组织可核验的 RPKI、BGP 与验证器数据。' : 'Organizing verifiable RPKI, BGP, and validator data along the path from authorization intent to CA, publication, RP, router, ROV, and data-plane outcome.'}</p>
          </div>
          <div className="hero-meta">
            <span><RefreshCw size={13} /> {language === 'zh' ? `最近验证用时：${current.lastUpdateDuration.toFixed(2)} 秒` : `Latest validation: ${current.lastUpdateDuration.toFixed(2)} seconds`}</span>
            <span><ShieldCheck size={13} /> {current.version} · serial {current.serial}</span>
          </div>
        </section>

        <section className="metrics-grid overview-metrics" aria-label="Core RPKI metrics">
          <MetricCard icon={ShieldCheck} label={language === 'zh' ? 'IPv4 RPKI-valid 前缀' : 'IPv4 RPKI-valid prefixes'} value={cloudflareCoverage.at(-1)?.ipv4.toFixed(1)} unit="%" change={language === 'zh' ? '全球 BGP' : 'global BGP'} meta="Cloudflare" color={COLORS.blue} note={language === 'zh' ? '全球 BGP 视图中被判定为 RPKI-valid 的 IPv4 前缀比例。' : 'Share of IPv4 prefixes classified RPKI-valid in the global BGP view.'} t={t} onInfo={(title, note) => openDefinition(title, note, 'Cloudflare Radar API')} />
          <MetricCard icon={ShieldCheck} label={language === 'zh' ? 'IPv6 RPKI-valid 前缀' : 'IPv6 RPKI-valid prefixes'} value={cloudflareCoverage.at(-1)?.ipv6.toFixed(1)} unit="%" change={language === 'zh' ? '全球 BGP' : 'global BGP'} meta="Cloudflare" color={COLORS.cyan} note={language === 'zh' ? '全球 BGP 视图中被判定为 RPKI-valid 的 IPv6 前缀比例。' : 'Share of IPv6 prefixes classified RPKI-valid in the global BGP view.'} t={t} onInfo={(title, note) => openDefinition(title, note, 'Cloudflare Radar API')} />
          <MetricCard icon={Layers3} label={t('metricVrp', 'Final VRPs')} value={compactNumber(totals.vrpsFinal)} change={language === 'zh' ? '当前快照' : 'snapshot'} meta="Routinator" color={COLORS.violet} note={t('metricVrpNote', 'Validated ROA payloads after duplicate removal and local filtering.')} t={t} onInfo={(title, note) => openDefinition(title, note, 'RIPE NCC public Routinator /api/v1/status')} />
          <MetricCard icon={FileBadge2} label={t('metricRoa', 'Valid ROA objects')} value={compactNumber(totals.validROAs)} change={language === 'zh' ? '当前快照' : 'snapshot'} meta="Routinator" color={COLORS.green} note={t('metricRoaNote', 'Cryptographically valid Route Origin Authorization objects.')} t={t} onInfo={(title, note) => openDefinition(title, note, 'RIPE NCC public Routinator /api/v1/status')} />
          <MetricCard icon={ShieldCheck} label={t('metricCa', 'Valid CA certificates')} value={compactNumber(totals.validCACerts)} change={language === 'zh' ? '当前快照' : 'snapshot'} meta="Routinator" color={COLORS.slate} note={t('metricCaNote', 'Valid CA certificates chained to the five RIR trust anchors.')} t={t} onInfo={(title, note) => openDefinition(title, note, 'RIPE NCC public Routinator /api/v1/status')} />
        </section>

        <div className="scope-note">
          <Info size={15} />
          <span><strong>{language === 'zh' ? '数据口径。' : 'Data scope.'}</strong> {language === 'zh' ? '核心指标与仓库数据来自同一轮 RIPE NCC 公共 Routinator 验证；历史曲线来自 RIPE NCC 五个 RIR 信任锚逐日统计，按月取当月最后一个观测值。两种来源不强制拼接为同一序列。' : 'Core metrics and repository data come from one RIPE NCC public Routinator run. Historical series come from RIPE NCC daily statistics for the five RIR trust anchors, sampled at the last observation of each month.'}</span>
          <button onClick={() => navigateTo('sources')}>{t('readMethodology', 'Read methodology')} <ArrowUpRight size={13} /></button>
        </div>

        <section className="chain-card" aria-label={language === 'zh' ? 'RPKI 端到端链路' : 'End-to-end RPKI chain'}>
          <div className="chain-header">
            <div><span>RPKI END-TO-END CHAIN</span><h2>{language === 'zh' ? '从授权意图到数据面结果' : 'From Authorization Intent to Data-Plane Outcome'}</h2><p>{language === 'zh' ? '点击任一实体或实体之间的链路，查看其定义、当前数据覆盖和对应专题。' : 'Select any entity or link to inspect its meaning, current data coverage, and related topic.'}</p></div>
            <div className="chain-legend"><span><i className="partial" />{chainStatusLabel.partial}</span><span><i className="unmeasured" />{chainStatusLabel.unmeasured}</span></div>
          </div>
          <div className="chain-scroll">
            <div className="chain-map">
              {chainSequence.map(({ type, item }) => {
                if (type === 'node') {
                  const Icon = item.icon;
                  return <button key={item.id} className={`chain-node chain-${item.id} ${item.tone} ${chainSelection === item.id ? 'active' : ''}`} aria-pressed={chainSelection === item.id} onClick={() => setChainSelection(item.id)}>
                    <span className="chain-code">{item.code}</span><span className="chain-node-icon"><Icon size={18} /></span><b>{item.title}</b><small>{item.subtitle}</small><i className={`chain-status ${item.status}`} />
                  </button>;
                }
                return <button key={item.id} className={`chain-edge chain-${item.id} ${chainSelection === item.id ? 'active' : ''}`} aria-label={`${item.from} → ${item.to}: ${item.label}`} aria-pressed={chainSelection === item.id} onClick={() => setChainSelection(item.id)}><span>{item.label}</span><i /></button>;
              })}
            </div>
            <div className="chain-aux-inputs">
              <button onClick={() => setChainSelection('p3')}><ShieldCheck size={13} /><span><b>TAL / 5 RIR Trust Anchors</b><small>{language === 'zh' ? '信任锚输入 → RP 验证' : 'Trust-anchor input → RP validation'}</small></span></button>
              <button onClick={() => setChainSelection('p5')}><RadioTower size={13} /><span><b>BGP UPDATE</b><small>{language === 'zh' ? 'prefix · origin ASN · AS_PATH → ROV' : 'prefix · origin ASN · AS_PATH → ROV'}</small></span></button>
            </div>
            <p className="chain-caption"><Info size={12} />{language === 'zh' ? '这是逻辑角色链，不表示 RPKI 对象会“变成”BGP 路由或数据包。RPKI 授权信息与独立的 BGP UPDATE 在 ROV 环节汇合；同一组织也可能同时承担多个角色。' : 'This is a logical role chain: RPKI objects do not become BGP routes or packets. Authorization data and independent BGP UPDATEs converge at ROV, and one organization may perform multiple roles.'}</p>
          </div>
          <div className={`chain-detail ${selectedChainItem.status}`}>
            <div className="chain-detail-copy">
              <div className="chain-detail-meta"><span>{selectedChainItem.id.startsWith('p') ? (language === 'zh' ? '实体' : 'ENTITY') : (language === 'zh' ? '链路' : 'LINK')}</span><i /> <em>{chainStatusLabel[selectedChainItem.status]}</em></div>
              <h3>{selectedChainItem.code ? `${selectedChainItem.code} · ${selectedChainItem.title}` : `${selectedChainItem.from}→${selectedChainItem.to} · ${selectedChainItem.label}`}</h3>
              <p>{selectedChainItem.description}</p>
              <span className="chain-source"><Database size={12} />{selectedChainItem.source}</span>
            </div>
            <div className="chain-detail-data">
              <span className="chain-data-label">{language === 'zh' ? '当前可用数据' : 'CURRENT DATA'}</span>
              <div>{selectedChainItem.metrics.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
              <button onClick={() => navigateTo(selectedChainItem.view)}>{selectedChainItem.status === 'unmeasured' ? (language === 'zh' ? '查看数据边界' : 'View data boundary') : (language === 'zh' ? '进入对应专题' : 'Open related topic')}<ArrowUpRight size={14} /></button>
            </div>
          </div>
        </section>
        </div>}

        {activeView === 'objects' && <div className="dashboard-view">
        <ViewIntro eyebrow="01 · RPKI OBJECTS" title={language === 'zh' ? 'RPKI 对象与生态' : 'RPKI Objects & Ecosystem'} description={language === 'zh' ? '使用五个 RIR 信任锚的历史与当前快照，观察有效证书、ROA、VRP 及区域构成。' : 'Historical and current measurements of valid certificates, ROAs, VRPs, and regional composition under the five RIR trust anchors.'} meta={<RirSelector id="objects-rir-scope" value={rir} onChange={setRir} language={language} t={t} />} action={<button className="view-export" onClick={exportCsv}><ArrowDownToLine size={14} />{t('exportCsv', 'Export CSV')}</button>} />
        <ViewTabs value={objectTab} onChange={setObjectTab} items={[{ value: 'growth', label: language === 'zh' ? '对象规模与 RIR' : 'Objects & RIRs' }, { value: 'address', label: language === 'zh' ? 'ROA 地址族与空间' : 'ROA Address Families' }, { value: 'aspa', label: language === 'zh' ? 'ASPA 部署' : 'ASPA Deployment' }]} />
        {objectTab === 'growth' && <>
        <div className="two-col wide-left">
          <article className="chart-card">
            <div className="card-header">
              <div><h3>{language === 'zh' ? '有效证书与 ROA 对象长期趋势' : 'Valid certificates and ROA objects over time'}</h3><p>{language === 'zh' ? '每月最后一个可用观测值 · 五个信任锚求和' : 'Last available observation in each month · sum over five trust anchors'}</p></div>
              <ChartActions t={t} onCopy={() => copyCitation(language === 'zh' ? '图 1：有效证书与 ROA 对象长期趋势' : 'Figure 1: Valid certificates and ROA objects')} href="https://www.ripe.net/manage-ips-and-asns/resource-management/rpki/rir-trust-anchor-statistics/" />
            </div>
            <div className="chart-legend custom-legend">
              <span><i style={{ background: COLORS.blue }} /> {language === 'zh' ? '有效证书' : 'Valid certificates'}</span>
              <span><i style={{ background: COLORS.cyan }} /> {language === 'zh' ? '有效 ROA 对象' : 'Valid ROAs'}</span>
              <span className="legend-note">{t('currentSelection', 'Current selection')}: <b>{rir === 'global' ? t('allRirs', 'All RIRs') : rirOptions.find(([v]) => v === rir)?.[1]}</b></span>
            </div>
            <div className="chart-wrap coverage-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visibleHistory} margin={{ top: 10, right: 12, left: 2, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 3" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#7b8794' }} minTickGap={38} />
                  <YAxis yAxisId="certs" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <YAxis yAxisId="roas" orientation="right" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line yAxisId="certs" type="monotone" dataKey="certs" name={language === 'zh' ? '有效证书' : 'Valid certificates'} stroke={COLORS.blue} strokeWidth={2} dot={false} />
                  <Line yAxisId="roas" type="monotone" dataKey="roas" name={language === 'zh' ? '有效 ROA 对象' : 'Valid ROAs'} stroke={COLORS.cyan} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <SourceLine>{language === 'zh' ? 'RIPE NCC RIR Trust Anchor Statistics · 原始频率：每日 · 页面采样：每月末' : 'RIPE NCC RIR Trust Anchor Statistics · source: daily · display: month-end'}</SourceLine>
          </article>

          <article className="chart-card validation-card">
            <div className="card-header">
              <div><h3>{language === 'zh' ? '当前 VRP 地址族构成' : 'Current VRPs by address family'}</h3><p>{language === 'zh' ? '最终有效载荷 · 已去除重复项' : 'Final payloads · duplicates removed'}</p></div>
              <span className="fresh-badge">{formatUtc(current.observedAt)}</span>
            </div>
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={payloadData} dataKey="value" nameKey="name" innerRadius={63} outerRadius={83} paddingAngle={1} startAngle={90} endAngle={-270} stroke="none">
                    {payloadData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center"><strong>{compactNumber(counts.vrp)}</strong><span>{language === 'zh' ? '最终 VRP' : 'final VRPs'}</span></div>
            </div>
            <div className="validation-list two-items">
              {payloadData.map((item) => <div key={item.name}><span><i style={{ background: item.color }} />{item.name}</span><strong>{formatNumber(item.value)}</strong></div>)}
            </div>
            <div className="mini-insight"><CalendarDays size={14} /><span>{language === 'zh' ? `当前筛选历史范围：${visibleHistory[0]?.date} 至 ${visibleHistory.at(-1)?.date}` : `Selected history: ${visibleHistory[0]?.date} to ${visibleHistory.at(-1)?.date}`}</span></div>
            <SourceLine>{language === 'zh' ? 'RIPE NCC 公共 Routinator · /api/v1/status · 同一轮验证快照' : 'RIPE NCC public Routinator · /api/v1/status · single validation snapshot'}</SourceLine>
          </article>
        </div>
        </>}

        {objectTab === 'address' && <div className="two-col equal tab-panel-grid">
          <article className="chart-card">
            <div className="card-header"><div><h3>{language === 'zh' ? 'IPv4 / IPv6 ROA 前缀数量' : 'IPv4 / IPv6 ROA Prefix Counts'}</h3><p>{language === 'zh' ? '信任锚统计中的不同地址族 ROA 前缀条目' : 'Address-family ROA prefix entries in trust-anchor statistics'}</p></div><ChartActions t={t} onCopy={() => copyCitation(language === 'zh' ? 'ROA 地址族前缀趋势' : 'ROA address-family prefix trend')} href="https://www.ripe.net/manage-ips-and-asns/resource-management/rpki/rir-trust-anchor-statistics/" /></div>
            <div className="chart-wrap ecosystem-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={visibleHistory} margin={{ top: 14, right: 8, left: -2, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 3" /><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={40} tick={{ fontSize: 13, fill: '#7b8794' }} /><YAxis yAxisId="v4" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 13, fill: '#7b8794' }} /><YAxis yAxisId="v6" orientation="right" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 13, fill: '#7b8794' }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 9 }} /><Line yAxisId="v4" type="monotone" dataKey="roaV4" name="IPv4 ROA prefixes" stroke={COLORS.blue} strokeWidth={2} dot={false} /><Line yAxisId="v6" type="monotone" dataKey="roaV6" name="IPv6 ROA prefixes" stroke={COLORS.cyan} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
            <SourceLine>{language === 'zh' ? 'RIPE Trust Anchor Statistics · roa-v4 / roa-v6 · 两个地址族分别计数' : 'RIPE Trust Anchor Statistics · roa-v4 / roa-v6 · counted separately'}</SourceLine>
          </article>
          <article className="chart-card">
            <div className="card-header"><div><h3>{language === 'zh' ? 'ROA 授权地址空间单位' : 'ROA-Authorized Address-Space Units'}</h3><p>{language === 'zh' ? 'IPv4 使用 /24 等价单位；IPv6 使用 /48 等价单位' : 'IPv4 in /24 equivalents; IPv6 in /48 equivalents'}</p></div></div>
            <div className="chart-wrap ecosystem-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={visibleHistory} margin={{ top: 14, right: 8, left: -2, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 3" /><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={40} tick={{ fontSize: 13, fill: '#7b8794' }} /><YAxis yAxisId="v4" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 13, fill: '#7b8794' }} /><YAxis yAxisId="v6" orientation="right" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 13, fill: '#7b8794' }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 9 }} /><Line yAxisId="v4" type="monotone" dataKey="roaV4Units" name="IPv4 /24 units" stroke={COLORS.violet} strokeWidth={2} dot={false} /><Line yAxisId="v6" type="monotone" dataKey="roaV6Units" name="IPv6 /48 units" stroke={COLORS.amber} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
            <div className="collector-note"><Info size={14} /><span>{language === 'zh' ? 'IPv4 /24 与 IPv6 /48 是不同的归一化单位，不能相加，也不能把绝对量直接解释为 BGP 中的有效覆盖率。' : 'IPv4 /24 and IPv6 /48 equivalents are different normalization units. They must not be summed or interpreted directly as BGP valid-coverage ratios.'}</span></div>
            <SourceLine>{language === 'zh' ? 'RIPE Trust Anchor Statistics · roa-v4u / roa-v6u' : 'RIPE Trust Anchor Statistics · roa-v4u / roa-v6u'}</SourceLine>
          </article>
          <article className="chart-card full-span compact-comparison-card">
            <div className="card-header"><div><h3>{language === 'zh' ? 'ROA 中出现的唯一 ASN（按信任锚）' : 'Distinct ASNs Referenced in ROAs by Trust Anchor'}</h3><p>{language === 'zh' ? '各信任锚独立去重；同一 ASN 可能出现在多个信任锚中，因此不能求和作为全球唯一值' : 'Deduplicated within each trust anchor; values must not be summed into a global distinct count'}</p></div></div>
            <div className="chart-wrap compact-horizontal-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rirRoaAsnRows} layout="vertical" margin={{ top: 2, right: 24, left: 8, bottom: 0 }}><CartesianGrid horizontal={false} stroke="#edf1f5" /><XAxis type="number" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 13, fill: '#7b8794' }} /><YAxis type="category" dataKey="code" width={65} axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#4b5968', fontWeight: 600 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="roaAsn" name="Distinct ASNs in ROAs" radius={[0, 2, 2, 0]} barSize={16}>{rirRoaAsnRows.map((row) => <Cell key={row.code} fill={row.color} />)}</Bar></BarChart></ResponsiveContainer></div>
            <SourceLine>{language === 'zh' ? 'RIPE Trust Anchor Statistics · roa-asn · 每个信任锚内部唯一 ASN 数' : 'RIPE Trust Anchor Statistics · roa-asn · distinct within each trust anchor'}</SourceLine>
          </article>
        </div>}

        {objectTab === 'aspa' && <div className="two-col equal tab-panel-grid">
          <article className="chart-card">
            <div className="card-header"><div><h3>{language === 'zh' ? 'ASPA 对象数量趋势' : 'ASPA Object Count Trend'}</h3><p>{language === 'zh' ? '全球活动 ASPA 对象月末观测' : 'Global active ASPA objects, month-end observations'}</p></div><ChartActions t={t} onCopy={() => copyCitation(language === 'zh' ? 'ASPA 对象趋势' : 'ASPA object trend')} href="https://radar.cloudflare.com/routing/rpki" /></div>
            <div className="chart-wrap ecosystem-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={aspaHistory} margin={{ top: 14, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="aspaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={COLORS.amber} stopOpacity=".22" /><stop offset="1" stopColor={COLORS.amber} stopOpacity=".02" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 3" /><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={40} tick={{ fontSize: 13, fill: '#7b8794' }} /><YAxis axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 13, fill: '#7b8794' }} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="count" name="ASPA objects" stroke={COLORS.amber} strokeWidth={2} fill="url(#aspaFill)" /></AreaChart></ResponsiveContainer></div>
            <SourceLine>{language === 'zh' ? `Cloudflare Radar ASPA API · 数据时间 ${snapshot.cloudflare?.aspaDataTime ? formatUtc(snapshot.cloudflare.aspaDataTime) : '—'}` : `Cloudflare Radar ASPA API · data ${snapshot.cloudflare?.aspaDataTime ? formatUtc(snapshot.cloudflare.aspaDataTime) : '—'}`}</SourceLine>
          </article>
          <article className="chart-card">
            <div className="card-header"><div><h3>{language === 'zh' ? '当前 ASPA 按信任锚分布' : 'Current ASPA by Trust Anchor'}</h3><p>{language === 'zh' ? '公共 Routinator 同一轮验证快照' : 'Single public Routinator validation snapshot'}</p></div></div>
            <div className="chart-wrap ecosystem-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rirRows} layout="vertical" margin={{ top: 12, right: 20, left: 8, bottom: 0 }}><CartesianGrid horizontal={false} stroke="#edf1f5" /><XAxis type="number" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 13, fill: '#7b8794' }} /><YAxis type="category" dataKey="code" width={65} axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#4b5968', fontWeight: 600 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="aspa" name="Final ASPA payloads" radius={[0, 2, 2, 0]} barSize={17}>{rirRows.map((row) => <Cell key={row.code} fill={row.color} />)}</Bar></BarChart></ResponsiveContainer></div>
            <div className="collector-note"><Info size={14} /><span>{language === 'zh' ? 'ASPA 描述授权上游关系，不等同于路由器已经部署 ASPA 验证，也不表示路径已被接受或拒绝。' : 'ASPA expresses authorized provider relationships. It does not prove that routers enforce ASPA validation or that a path was accepted or rejected.'}</span></div>
            <SourceLine>{language === 'zh' ? 'RIPE NCC 公共 Routinator · tals.*.payload.aspas.final' : 'RIPE NCC public Routinator · final ASPA payloads per trust anchor'}</SourceLine>
          </article>
        </div>}

        </div>}

        {activeView === 'bgp' && bgpTab === 'events' && <div className="dashboard-view">
          <ViewIntro eyebrow="02 · BGP / ROV" title={language === 'zh' ? 'BGP 基础数据与地址族覆盖' : 'BGP Baseline & Address-Family Coverage'} description={language === 'zh' ? '固定采集器的前缀数量、ROV 状态，以及第三方 BGP 异常候选。' : 'Fixed-collector prefix counts, ROV states, and third-party BGP anomaly candidates.'} meta={<span className="view-scope global"><Globe2 size={13} />{language === 'zh' ? '全球固定视图' : 'Global fixed view'}</span>} />
          {cloudflareStats && <div className="bgp-summary"><div><span>{language === 'zh' ? '唯一前缀' : 'Distinct prefixes'}</span><strong>{compactNumber(cloudflareStats.distinct_prefixes)}</strong><em>{formatUtc(snapshot.cloudflare.routeStats.meta.data_time)}</em></div><div><span>IPv4 Prefix</span><strong>{compactNumber(cloudflareStats.distinct_prefixes_ipv4)}</strong><em>{cloudflareStats.routes_total_ipv4.toLocaleString()} routes</em></div><div><span>IPv6 Prefix</span><strong>{compactNumber(cloudflareStats.distinct_prefixes_ipv6)}</strong><em>{cloudflareStats.routes_total_ipv6.toLocaleString()} routes</em></div><div><span>{language === 'zh' ? '唯一起源 ASN' : 'Distinct origin ASNs'}</span><strong>{compactNumber(cloudflareStats.distinct_origins)}</strong><em>{snapshot.cloudflare.routeStats.meta.total_peers} peers</em></div></div>}
          <ViewTabs value={bgpTab} onChange={setBgpTab} items={[{ value: 'overview', label: language === 'zh' ? '覆盖与 BGP 基线' : 'Coverage & BGP Baseline' }, { value: 'rov', label: language === 'zh' ? 'ROV 状态历史' : 'ROV State History' }, { value: 'events', label: language === 'zh' ? '第三方异常候选' : 'Third-party Anomaly Candidates' }]} />
          <div className="events-panel">
          <div className="event-disclaimer"><TriangleAlert size={16} /><span><b>{language === 'zh' ? '第三方检测候选，不是已确认攻击。' : 'Third-party detection candidates, not confirmed attacks.'}</b>{language === 'zh' ? 'Cloudflare 根据路由传播、消息和证据标签生成候选事件；MOAS、路由泄漏或 RPKI-invalid 都可能存在合法运营原因。' : 'Cloudflare produces candidates from route propagation, messages, and evidence tags. MOAS, route leaks, and RPKI-invalid states can have legitimate operational causes.'}</span></div>
          <div className="event-summary">
            <div><span>{language === 'zh' ? '近 7 日 Hijack 候选' : '7-day hijack candidates'}</span><strong>{anomalyData.hijackResultInfo?.total_count ?? anomalyData.hijacks.length}</strong><em>{anomalyData.totalMonitors || '—'} monitors</em></div>
            <div><span>{language === 'zh' ? '近 7 日 Route Leak 候选' : '7-day route-leak candidates'}</span><strong>{anomalyData.leakResultInfo?.total_count ?? anomalyData.leaks.length}</strong><em>Cloudflare Radar</em></div>
            <div><span>{language === 'zh' ? 'RPKI-invalid MOAS（最多载入 100）' : 'RPKI-invalid MOAS (up to 100 loaded)'}</span><strong>{anomalyData.invalidMoas.length}</strong><em>{anomalyData.invalidMoasMeta?.total_peers || '—'} peers</em></div>
          </div>
          <div className="two-col equal event-grid">
            <article className="chart-card event-table-card">
              <div className="card-header"><div><h3>{language === 'zh' ? '近期 Origin Hijack 候选' : 'Recent Origin-Hijack Candidates'}</h3><p>{language === 'zh' ? '按事件时间排序；保留 Cloudflare 置信度' : 'Sorted by event time; Cloudflare confidence retained'}</p></div></div>
              <div className="event-table table-scroll"><div className="event-row hijack event-head"><span>{language === 'zh' ? '时间' : 'Time'}</span><span>Prefix</span><span>{language === 'zh' ? '疑似 Hijacker' : 'Potential hijacker'}</span><span>{language === 'zh' ? '受影响 ASN' : 'Victim ASN'}</span><span>{language === 'zh' ? '置信度' : 'Confidence'}</span></div>{anomalyData.hijacks.slice(0, 8).map((event) => <div className="event-row hijack" key={event.id}><span>{formatUtc(event.min_hijack_ts || event.max_hijack_ts)}</span><span className="mono">{event.prefixes?.slice(0, 2).join(', ') || '—'}</span><span>AS{event.hijacker_asn || '—'}</span><span>{event.victim_asns?.slice(0, 2).map((asn) => `AS${asn}`).join(', ') || '—'}</span><span><b className={`confidence ${event.confidence_score >= 8 ? 'high' : event.confidence_score >= 5 ? 'mid' : 'low'}`}>{event.confidence_score}</b></span></div>)}</div>
              <SourceLine>{language === 'zh' ? 'Cloudflare Radar hijacks/events · 第三方候选检测' : 'Cloudflare Radar hijacks/events · third-party candidate detection'}</SourceLine>
            </article>
            <article className="chart-card event-table-card">
              <div className="card-header"><div><h3>{language === 'zh' ? '近期 Route Leak 候选' : 'Recent Route-Leak Candidates'}</h3><p>{language === 'zh' ? '当前接口主要覆盖 provider-customer-provider 型泄漏' : 'The current detector primarily covers provider-customer-provider leaks'}</p></div></div>
              <div className="event-table table-scroll"><div className="event-row leak event-head"><span>{language === 'zh' ? '检测时间' : 'Detected'}</span><span>Leaker</span><span>Prefixes</span><span>Origins</span><span>Peers</span></div>{anomalyData.leaks.slice(0, 8).map((event) => <div className="event-row leak" key={event.id}><span>{formatUtc(event.detected_ts || event.min_ts)}</span><span>AS{event.leak_asn || '—'}</span><span>{formatNumber(event.prefix_count || 0)}</span><span>{formatNumber(event.origin_count || 0)}</span><span>{formatNumber(event.peer_count || 0)}</span></div>)}</div>
              <SourceLine>{language === 'zh' ? 'Cloudflare Radar leaks/events · 第三方候选检测' : 'Cloudflare Radar leaks/events · third-party candidate detection'}</SourceLine>
            </article>
            <article className="chart-card full-span event-table-card">
              <div className="card-header"><div><h3>{language === 'zh' ? '当前 RPKI-invalid MOAS 前缀' : 'Current RPKI-invalid MOAS Prefixes'}</h3><p>{language === 'zh' ? '同一前缀被多个起源 ASN 宣告，且至少一个起源为 RPKI-invalid' : 'A prefix has multiple origins and at least one origin is RPKI-invalid'}</p></div><span className="snapshot-label"><Clock3 size={13} />{anomalyData.invalidMoasMeta?.data_time ? formatUtc(anomalyData.invalidMoasMeta.data_time) : '—'}</span></div>
              <div className="event-table moas-table table-scroll"><div className="event-row moas event-head"><span>Prefix</span><span>{language === 'zh' ? '起源与 ROV 状态（可见 peer）' : 'Origins and ROV state (visible peers)'}</span></div>{anomalyData.invalidMoas.slice(0, 12).map((item) => <div className="event-row moas" key={item.prefix}><span className="mono">{item.prefix}</span><span>{item.origins.map((origin) => <em className={`origin-state ${origin.rpki_validation.toLowerCase()}`} key={origin.origin}>AS{origin.origin} · {origin.rpki_validation} · {origin.peer_count}</em>)}</span></div>)}</div>
              <SourceLine>{language === 'zh' ? 'Cloudflare Radar routes/moas?invalid_only=true · MOAS 不等同于劫持' : 'Cloudflare Radar routes/moas?invalid_only=true · MOAS does not imply hijack'}</SourceLine>
            </article>
          </div>
          </div>
        </div>}

        {activeView === 'bgp' && bgpTab !== 'events' && <div className="dashboard-view">
        <ViewIntro eyebrow="02 · BGP / ROV" title={language === 'zh' ? 'BGP 基础数据与地址族覆盖' : 'BGP Baseline & Address-Family Coverage'} description={language === 'zh' ? '固定采集器的前缀数量、Cloudflare Radar 的 RPKI-valid 比例，以及 NIST 的 ROV 状态交叉核对。' : 'Prefix counts from fixed collectors, Cloudflare Radar RPKI-valid ratios, and a NIST ROV cross-check.'} meta={<span className="view-scope global"><Globe2 size={13} />{language === 'zh' ? '全球固定视图' : 'Global fixed view'}</span>} />
        {cloudflareStats && <div className="bgp-summary">
          <div><span>{language === 'zh' ? '唯一前缀' : 'Distinct prefixes'}</span><strong>{compactNumber(cloudflareStats.distinct_prefixes)}</strong><em>{formatUtc(snapshot.cloudflare.routeStats.meta.data_time)}</em></div>
          <div><span>IPv4 Prefix</span><strong>{compactNumber(cloudflareStats.distinct_prefixes_ipv4)}</strong><em>{cloudflareStats.routes_total_ipv4.toLocaleString()} routes</em></div>
          <div><span>IPv6 Prefix</span><strong>{compactNumber(cloudflareStats.distinct_prefixes_ipv6)}</strong><em>{cloudflareStats.routes_total_ipv6.toLocaleString()} routes</em></div>
          <div><span>{language === 'zh' ? '唯一起源 ASN' : 'Distinct origin ASNs'}</span><strong>{compactNumber(cloudflareStats.distinct_origins)}</strong><em>{snapshot.cloudflare.routeStats.meta.total_peers} peers</em></div>
        </div>}
        <ViewTabs value={bgpTab} onChange={setBgpTab} items={[{ value: 'overview', label: language === 'zh' ? '覆盖与 BGP 基线' : 'Coverage & BGP Baseline' }, { value: 'rov', label: language === 'zh' ? 'ROV 状态历史' : 'ROV State History' }, { value: 'events', label: language === 'zh' ? '第三方异常候选' : 'Third-party Anomaly Candidates' }]} />
        {bgpTab === 'overview' &&
        <div className="two-col equal">
          <article className="chart-card">
            <div className="card-header">
              <div><h3>{coverageBasis === 'prefix' ? (language === 'zh' ? 'RPKI-valid 前缀比例（IPv4 / IPv6）' : 'RPKI-valid Prefix Ratio (IPv4 / IPv6)') : (language === 'zh' ? 'RPKI-valid 地址空间比例（IPv4 / IPv6）' : 'RPKI-valid Address-Space Ratio (IPv4 / IPv6)')}</h3><p>{coverageBasis === 'prefix' ? (language === 'zh' ? '按 BGP 公告前缀数量计算' : 'Calculated over announced BGP prefixes') : (language === 'zh' ? 'IPv4 按 /24、IPv6 按 /48 等价空间计算' : 'IPv4 in /24s and IPv6 in /48 equivalents')}</p></div>
              <div className="chart-header-controls"><div className="segmented small"><button className={coverageBasis === 'prefix' ? 'active' : ''} onClick={() => setCoverageBasis('prefix')}>{language === 'zh' ? '前缀比例' : 'Prefixes'}</button><button className={coverageBasis === 'space' ? 'active' : ''} onClick={() => setCoverageBasis('space')}>{language === 'zh' ? '地址空间' : 'Address space'}</button></div><ChartActions t={t} onCopy={() => copyCitation(language === 'zh' ? 'RPKI-valid 地址族趋势' : 'RPKI-valid address-family trend')} href="https://radar.cloudflare.com/routing/rpki" /></div>
            </div>
            <div className="chart-wrap bgp-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={coverageDisplay} margin={{ top: 12, right: 10, left: -3, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 3" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={40} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <Tooltip content={<ChartTooltip suffix="%" />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="ipv4" name="IPv4" stroke={COLORS.blue} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ipv6" name="IPv6" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {latestNistRov && <div className="nist-crosscheck">
              <div className="nist-title"><span>NIST RPKI Monitor · {latestNistRov.date}</span><b>{language === 'zh' ? '交叉核对：唯一前缀—起源 ASN 对' : 'Cross-check: unique prefix–origin pairs'}</b></div>
              {['ipv4', 'ipv6'].map((family) => <div className="nist-row" key={family}><strong>{family.toUpperCase()}</strong><span>Valid <b>{latestNistRov[family].validRatio.toFixed(2)}%</b></span><span>Invalid <b>{latestNistRov[family].invalidRatio.toFixed(2)}%</b></span><span>Not-Found <b>{latestNistRov[family].notFoundRatio.toFixed(2)}%</b></span></div>)}
            </div>}
            <SourceLine>{language === 'zh' ? `Cloudflare Radar API · 数据时间 ${formatUtc(snapshot.cloudflare.coverageDataTime)}；NIST 为独立口径，仅作交叉核对` : `Cloudflare Radar API · data ${formatUtc(snapshot.cloudflare.coverageDataTime)}; NIST uses an independent methodology`}</SourceLine>
          </article>
          <article className="chart-card">
            <div className="card-header">
              <div><h3>{language === 'zh' ? 'BGP 前缀数量趋势' : 'BGP prefix-count trend'}</h3><p>{language === 'zh' ? '固定采集器：RouteViews2（IPv4）与 RouteViews6（IPv6）' : 'Fixed collectors: RouteViews2 (IPv4) and RouteViews6 (IPv6)'}</p></div>
              <ChartActions t={t} onCopy={() => copyCitation(language === 'zh' ? '图 3：BGP 前缀数量趋势' : 'Figure 3: BGP prefix-count trend')} href="https://api.routeviews.org/docs/" />
            </div>
            <div className="chart-wrap bgp-chart tall">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={routeViewsHistory} margin={{ top: 12, right: 4, left: -3, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 3" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={40} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <YAxis yAxisId="v4" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <YAxis yAxisId="v6" orientation="right" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line yAxisId="v4" type="monotone" dataKey="ipv4" name="IPv4 · RouteViews2" stroke={COLORS.violet} strokeWidth={2} dot={false} />
                  <Line yAxisId="v6" type="monotone" dataKey="ipv6" name="IPv6 · RouteViews6" stroke={COLORS.amber} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="collector-note"><Info size={14} /><span>{language === 'zh' ? '该曲线是固定采集器收到的前缀数，不是多个采集器的求和，也不等同于理论上的“全网唯一前缀”。月度点取当月最后一次观测。' : 'Counts are from fixed collectors, not a sum across collectors or a claim of theoretical global uniqueness. Monthly points use the last observation.'}</span></div>
            <SourceLine>{language === 'zh' ? 'RouteViews API · timeseries · collector=route-views2 / route-views6' : 'RouteViews API · timeseries · collector=route-views2 / route-views6'}</SourceLine>
          </article>
        </div>
        }

        {bgpTab === 'rov' && <div className="two-col equal tab-panel-grid">
          {['v4', 'v6'].map((family) => <article className="chart-card" key={family}>
            <div className="card-header"><div><h3>{family.toUpperCase()} · Valid / Invalid / Not-Found</h3><p>{language === 'zh' ? '唯一前缀—起源 ASN 对占比 · 月末观测' : 'Share of unique prefix–origin pairs · month-end observation'}</p></div></div>
            <div className="chart-wrap rov-history-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={nistRovHistory} margin={{ top: 12, right: 8, left: -4, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 3" /><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={40} tick={{ fontSize: 13, fill: '#7b8794' }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 13, fill: '#7b8794' }} /><Tooltip content={<ChartTooltip suffix="%" />} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 9 }} /><Area type="monotone" dataKey={`${family}Valid`} name="Valid" stackId={family} stroke={COLORS.green} fill={COLORS.green} fillOpacity=".22" /><Area type="monotone" dataKey={`${family}Invalid`} name="Invalid" stackId={family} stroke={COLORS.red} fill={COLORS.red} fillOpacity=".30" /><Area type="monotone" dataKey={`${family}Unknown`} name="Not-Found" stackId={family} stroke="#94a3b8" fill="#cbd5e1" fillOpacity=".58" /></AreaChart></ResponsiveContainer></div>
            <SourceLine>{language === 'zh' ? `NIST RPKI Monitor · ${family.toUpperCase()} · 原始频率六小时` : `NIST RPKI Monitor · ${family.toUpperCase()} · original six-hour cadence`}</SourceLine>
          </article>)}
          <article className="chart-card full-span compact-comparison-card">
            <div className="card-header"><div><h3>{language === 'zh' ? '当前 BGP 路由验证状态（按地址族）' : 'Current BGP Route Validation State by Address Family'}</h3><p>{language === 'zh' ? 'Cloudflare 路由快照中的绝对路由数量' : 'Absolute route counts in the Cloudflare routing snapshot'}</p></div><span className="snapshot-label"><Clock3 size={13} />{formatUtc(snapshot.cloudflare.routeStats.meta.data_time)}</span></div>
            <div className="chart-wrap compact-horizontal-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={routeStateRows} layout="vertical" margin={{ top: 2, right: 20, left: 5, bottom: 0 }}><CartesianGrid horizontal={false} stroke="#edf1f5" /><XAxis type="number" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 13, fill: '#7b8794' }} /><YAxis type="category" dataKey="family" width={60} axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#4b5968', fontWeight: 600 }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 7 }} /><Bar dataKey="valid" name="Valid" stackId="routes" fill={COLORS.green} /><Bar dataKey="invalid" name="Invalid" stackId="routes" fill={COLORS.red} /><Bar dataKey="unknown" name="Unknown" stackId="routes" fill="#cbd5e1" /></BarChart></ResponsiveContainer></div>
            <div className="collector-note"><Info size={14} /><span>{language === 'zh' ? 'NIST 使用 Not-Found，Cloudflare 使用 Unknown；两者都表示当前路由没有可用于判定 Valid/Invalid 的覆盖授权，但数据源、采集器和统计对象不同，不能逐点合并。' : 'NIST uses Not-Found while Cloudflare uses Unknown. Both indicate no covering authorization for a Valid/Invalid decision, but the sources, collectors, and statistical populations differ and must not be merged point-by-point.'}</span></div>
            <SourceLine>{language === 'zh' ? `Cloudflare Radar routes/stats · ${snapshot.cloudflare.routeStats.meta.total_peers} 个 peer` : `Cloudflare Radar routes/stats · ${snapshot.cloudflare.routeStats.meta.total_peers} peers`}</SourceLine>
          </article>
        </div>}

        </div>}

        {activeView === 'as' && <div className="dashboard-view">
          <ViewIntro eyebrow="AS · LOOKUP" title={language === 'zh' ? 'AS 信息查询' : 'Autonomous System Profile'} description={language === 'zh' ? '按 ASN 或组织查询注册概况、RIS 路由状态、RPKI VRP 历史、AS Rank 和裁剪关系邻域。' : 'Query by ASN or organization for registration, RIS routing state, RPKI VRP history, AS Rank, and a clipped relationship neighbourhood.'} meta={<span className="view-scope global"><Database size={13} />RIPEstat · CAIDA AS Rank</span>} />
          <AsProfile language={language} />
        </div>}

        {activeView === 'collectors' && <div className="dashboard-view">
          <ViewIntro eyebrow="03 · PUBLIC BGP COLLECTORS" title={language === 'zh' ? 'BGP 公共收集器' : 'Public BGP Collectors'} description={language === 'zh' ? '分别查看 RouteViews 与 RIPE RIS 的官方 collector 清单、地理部署、地址族能力，以及按 RIB 时点对齐的 RIS peer 快照。' : 'Official RouteViews and RIPE RIS inventories, geographic deployment, address-family support, and a RIB-aligned RIS peer snapshot.'} meta={<span className="view-scope global"><RadioTower size={13} />RouteViews · RIPE RIS</span>} />
          <div className="collector-controls"><ViewTabs value={collectorPlatform} onChange={setCollectorPlatform} items={[{ value: 'routeviews', label: 'RouteViews' }, { value: 'ris', label: 'RIPE RIS' }]} /><div className="segmented"><button className={collectorStatus === 'current' ? 'active' : ''} onClick={() => setCollectorStatus('current')}>{collectorPlatform === 'routeviews' ? (language === 'zh' ? '未标记退役' : 'Not retired') : (language === 'zh' ? '未标记停用' : 'Not deactivated')}</button><button className={collectorStatus === 'all' ? 'active' : ''} onClick={() => setCollectorStatus('all')}>{language === 'zh' ? '全部清单' : 'Full inventory'}</button></div></div>

          {collectorPlatform === 'routeviews' && <>
            <div className="collector-platform-intro"><span className="collector-platform-logo rv">RV</span><div><h2>RouteViews</h2><p>{language === 'zh' ? '由 University of Oregon 运营的全球 BGP 数据收集项目。完整 inventory 与“当前 RIB API 支持的 collector 子集”是两个不同口径。' : 'A global BGP data collection project operated by the University of Oregon. The full inventory and the current-RIB API collector subset are different scopes.'}</p></div><a href="https://api.routeviews.org/docs/" target="_blank" rel="noreferrer">{language === 'zh' ? '官方 API 文档' : 'Official API docs'}<ArrowUpRight size={14} /></a></div>
            <CollectorMap collectors={filteredRouteViewsCollectors} platform="routeviews" status={collectorStatus} language={language} />
            <div className="collector-summary five"><div><span>{language === 'zh' ? '未标记退役 / 全部' : 'Not retired / all'}</span><strong>{routeViewsSummary.current} / {routeViewsSummary.total}</strong></div><div><span>{language === 'zh' ? '国家/地区代码' : 'Country codes'}</span><strong>{routeViewsSummary.countries}</strong></div><div><span>IPv4 / IPv6</span><strong>{routeViewsSummary.ipv4} / {routeViewsSummary.ipv6}</strong></div><div><span>Multihop</span><strong>{routeViewsSummary.multihop}</strong></div><div><span>{language === 'zh' ? '近实时 RIB API 子集' : 'Near-real-time RIB API subset'}</span><strong>{routeViewsSummary.currentRibApi}</strong></div></div>
            <div className="collector-region-strip"><span>{language === 'zh' ? '按 collector 基础设施所在 RIR 区域' : 'By collector infrastructure RIR region'}</span><div>{routeViewsRegionCounts.map((item) => <i key={item.region}><b>{item.region}</b>{item.count}</i>)}</div></div>
            <article className="chart-card collector-table-card"><div className="card-header"><div><h3>{language === 'zh' ? 'RouteViews Collector 清单' : 'RouteViews Collector Inventory'}</h3><p>{language === 'zh' ? '软件、位置、RIR 区域、地址族接口和采集能力' : 'Software, location, RIR region, interface families, and collection capabilities'}</p></div><span className="snapshot-label"><Clock3 size={13} />{formatUtc(snapshot.provenance.generatedAt)}</span></div><div className="collector-table table-scroll"><div className="collector-row routeviews collector-head"><span>Collector</span><span>{language === 'zh' ? '清单状态' : 'Inventory state'}</span><span>{language === 'zh' ? '国家 / RIR' : 'Country / RIR'}</span><span>{language === 'zh' ? '软件' : 'Software'}</span><span>IPv4</span><span>IPv6</span><span>{language === 'zh' ? '能力' : 'Capabilities'}</span><span>{language === 'zh' ? '安装时间' : 'Installed'}</span></div>{visibleRouteViewsCollectors.map((collector) => <div className="collector-row routeviews" key={collector.name}><span><b>{collector.name}</b><small>{collector.label}</small></span><span><em className={`collector-status ${collector.notRetired ? 'active' : 'inactive'}`}>{collector.notRetired ? (language === 'zh' ? '未标记退役' : 'Not retired') : (language === 'zh' ? '已退役' : 'Retired')}</em></span><span>{collector.country || '—'}<small>{collector.rirRegion || '—'}</small></span><span>{collector.type || '—'}</span><span className="mono">{collector.ipv4 || '—'}</span><span className="mono">{collector.ipv6 || '—'}</span><span className="capability-tags">{collector.bmp && <i>BMP</i>}{collector.rpki && <i>RPKI</i>}{collector.scamper && <i>Scamper</i>}{collector.multihop && <i>Multihop</i>}</span><span>{collector.installed?.slice(0, 10) || '—'}</span></div>)}</div><div className="collector-caveat"><Info size={14} /><span>{language === 'zh' ? 'removed 为空只表示官方清单没有给出退役日期，不代表 collector 此刻在线或健康。近实时 RIB API 仅覆盖一个子集，也不能把该子集数量当作 RouteViews 的完整规模。' : 'An empty removed field only means that the official inventory gives no retirement date; it does not prove that a collector is online or healthy. The near-real-time RIB API covers only a subset.'}</span></div><SourceLine>{language === 'zh' ? 'RouteViews API · /collector/ 与 /rib/collectors · 官方清单' : 'RouteViews API · /collector/ and /rib/collectors · official inventory'}</SourceLine></article>
            {filteredRouteViewsCollectors.length > 12 && <button className="collector-table-toggle" onClick={() => setCollectorTableExpanded((expanded) => !expanded)}>{collectorTableExpanded ? (language === 'zh' ? '收起详细清单' : 'Collapse inventory') : (language === 'zh' ? `展开全部 ${filteredRouteViewsCollectors.length} 个 collector` : `Show all ${filteredRouteViewsCollectors.length} collectors`)}</button>}
          </>}

          {collectorPlatform === 'ris' && <>
            <div className="collector-platform-intro"><span className="collector-platform-logo ris">RIS</span><div><h2>RIPE Routing Information Service</h2><p>{language === 'zh' ? 'RIPE NCC 运营的全球 Remote Route Collector（RRC）网络。peer 数是 BGP 会话记录，不等同于唯一 AS 数。' : 'RIPE NCC’s global Remote Route Collector network. Peer counts refer to BGP session records, not unique autonomous systems.'}</p></div><a href="https://stat.ripe.net/docs/data-api/api-endpoints/rrc-info.html" target="_blank" rel="noreferrer">{language === 'zh' ? '官方 API 文档' : 'Official API docs'}<ArrowUpRight size={14} /></a></div>
            <CollectorMap collectors={filteredRisCollectors} platform="ris" status={collectorStatus} language={language} />
            <div className="collector-summary five"><div><span>{language === 'zh' ? '未标记停用 / 全部' : 'Not deactivated / all'}</span><strong>{risSummary.current} / {risSummary.total}</strong></div><div><span>IXP / Multihop</span><strong>{risSummary.ixp} / {risSummary.multihop}</strong></div><div><span>{language === 'zh' ? 'Peer 记录' : 'Peer records'}</span><strong>{formatNumber(risSummary.peers)}</strong></div><div><span>{language === 'zh' ? '去重 Peer ASN' : 'Unique peer ASNs'}</span><strong>{formatNumber(risSummary.uniquePeerAsns)}</strong></div><div><span>IPv4 / IPv6 peers</span><strong>{risSummary.ipv4Peers} / {risSummary.ipv6Peers}</strong></div></div>
            <article className="chart-card collector-table-card"><div className="card-header"><div><h3>{language === 'zh' ? 'RIPE RIS RRC 清单' : 'RIPE RIS RRC Inventory'}</h3><p>{language === 'zh' ? 'RRC 元数据与最新 8 小时 RIB 时点对齐的 peer 记录' : 'RRC metadata and peer records aligned to the latest eight-hour RIB collection point'}</p></div><span className="snapshot-label"><Clock3 size={13} />{snapshot.collectors?.ripeRis?.queryTime ? formatUtc(snapshot.collectors.ripeRis.queryTime) : '—'}</span></div><div className="collector-table table-scroll"><div className="collector-row ris collector-head"><span>RRC</span><span>{language === 'zh' ? '清单状态' : 'Inventory state'}</span><span>{language === 'zh' ? '地理位置' : 'Geographic location'}</span><span>{language === 'zh' ? '拓扑位置' : 'Topological location'}</span><span>{language === 'zh' ? 'Peer / ASN' : 'Peers / ASNs'}</span><span>IPv4 / IPv6</span><span>{language === 'zh' ? '启用时间' : 'Activated'}</span></div>{visibleRisCollectors.map((collector) => <div className="collector-row ris" key={collector.name}><span><b>{collector.name}</b></span><span><em className={`collector-status ${collector.notDeactivated ? 'active' : 'inactive'}`}>{collector.notDeactivated ? (language === 'zh' ? '未标记停用' : 'Not deactivated') : (language === 'zh' ? '历史 RRC' : 'Historical')}</em></span><span>{collector.geographicalLocation}</span><span>{collector.topologicalLocation}<small>{collector.multihop ? 'Multihop' : 'IXP'}</small></span><span>{collector.peers}<small>{collector.uniquePeerAsns} unique ASN</small></span><span>{collector.ipv4Peers} / {collector.ipv6Peers}</span><span>{collector.activatedOn || '—'}</span></div>)}</div><div className="collector-caveat"><Info size={14} /><span>{language === 'zh' ? 'deactivated_on 为空是清单生命周期状态，不代表 RRC 或其 peer 实时在线。Peer 以 collector 与 peer IP 为记录单位；同一 ASN 可在多个 RRC 或地址族出现，因此 peer、IPv4/IPv6 记录和去重 ASN 不能混用。' : 'An empty deactivated_on field is an inventory lifecycle state, not proof that an RRC or peer is online. Peers are records keyed by collector and peer IP; one ASN may appear at multiple RRCs or address families.'}</span></div><SourceLine>{language === 'zh' ? 'RIPEstat Data API · rrc-info 与 ris-peers · 官方 RRC/peer 数据' : 'RIPEstat Data API · rrc-info and ris-peers · official RRC/peer data'}</SourceLine></article>
            {filteredRisCollectors.length > 12 && <button className="collector-table-toggle" onClick={() => setCollectorTableExpanded((expanded) => !expanded)}>{collectorTableExpanded ? (language === 'zh' ? '收起详细清单' : 'Collapse inventory') : (language === 'zh' ? `展开全部 ${filteredRisCollectors.length} 个 RRC` : `Show all ${filteredRisCollectors.length} RRCs`)}</button>}
          </>}
        </div>}

        {activeView === 'objects' && objectTab === 'growth' && <div className="dashboard-view objects-ecosystem-continuation">
        <SectionHeading title={language === 'zh' ? '当前生态构成' : 'Current Ecosystem Composition'} description={t('secEcosystemDesc', 'Growth and regional composition of cryptographic objects published under the five RIR trust anchors.')} />
        <div className="two-col equal">
          <article className="chart-card">
            <div className="card-header">
              <div><h3>{language === 'zh' ? '各 RIR 的 CA 证书与发布点' : 'CA certificates and publication points by RIR'}</h3><p>{language === 'zh' ? '同一轮验证快照 · 绝对数量' : 'Single validation snapshot · absolute counts'}</p></div>
              <ChartActions t={t} onCopy={() => copyCitation(language === 'zh' ? '图 2：各 RIR 的 CA 证书与发布点' : 'Figure 2: CA certificates and publication points by RIR')} href="https://rpki-validator.ripe.net/ui/metrics" />
            </div>
            <div className="chart-wrap ecosystem-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rirRows} margin={{ top: 18, right: 8, left: -5, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 3" />
                  <XAxis dataKey="code" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Bar dataKey="ca" name={language === 'zh' ? '有效 CA 证书' : 'Valid CA certificates'} fill={COLORS.blue} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="pps" name={language === 'zh' ? '有效发布点' : 'Valid publication points'} fill={COLORS.cyan} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <SourceLine>{language === 'zh' ? 'RIPE NCC 公共 Routinator · 按信任锚统计 · 数据时间与页面顶部一致' : 'RIPE NCC public Routinator · per trust anchor · timestamp shown at page top'}</SourceLine>
          </article>

          <article className="chart-card">
            <div className="card-header">
              <div><h3>{t('vrpDistribution', 'VRP distribution by trust anchor')}</h3><p>{t('vrpDistributionSubtitle', 'Unique validated ROA payloads · latest snapshot')}</p></div>
              <ChartActions t={t} onCopy={() => copyCitation(language === 'zh' ? '图 3：按 RIR 划分的 VRP 分布' : 'Figure 3: VRP distribution by RIR')} href="https://rpki-validator.ripe.net/ui/metrics" />
            </div>
            <div className="rir-bar-total"><strong>{formatNumber(totals.vrpsFinal)}</strong><span>{t('finalVrpsAll', 'final VRPs across all RIRs')}</span></div>
            <div className="chart-wrap rir-bar-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rirRows} layout="vertical" margin={{ top: 2, right: 30, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#eef1f5" />
                  <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 12, fill: '#7b8794' }} />
                  <YAxis type="category" dataKey="code" axisLine={false} tickLine={false} width={65} tick={{ fontSize: 12, fill: '#4b5968', fontWeight: 600 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="vrp" name={t('finalVrps', 'Final VRPs')} radius={[0, 4, 4, 0]} barSize={15}>{rirRows.map((row) => <Cell key={row.code} fill={row.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="distribution-foot">
              <div><span>IPv4 VRP</span><b>{formatNumber(totals.vrpsV4)}</b></div>
              <div><span>IPv6 VRP</span><b>{formatNumber(totals.vrpsV6)}</b></div>
            </div>
            <SourceLine>{language === 'zh' ? 'RIPE NCC 公共 Routinator · 最终 VRP = 总数 − 重复项 − 本地过滤项' : 'RIPE NCC public Routinator · final VRPs exclude duplicates and local filters'}</SourceLine>
          </article>
        </div>

        </div>}

        {activeView === 'infrastructure' && <div className="dashboard-view">
        <ViewIntro eyebrow="04 · PUBLICATION" title={t('secInfrastructure', 'Publication Infrastructure')} description={language === 'zh' ? '对象发布在哪里、有哪些逻辑发布点与仓库端点，以及每个仓库当前产生多少有效对象。' : 'Where objects are published, which repository endpoints exist, and the current validated-object counts per repository.'} meta={<span className="view-scope global"><Server size={13} />{language === 'zh' ? '公共 Routinator 快照' : 'Public Routinator snapshot'}</span>} />
        <div className="infra-summary">
          <div><Network size={17} /><span>{t('logicalPp', 'Logical publication points')} <button className="inline-help" aria-label={language === 'zh' ? '解释 CA 与发布点数量差异' : 'Explain CA and publication-point count differences'} onClick={() => openDefinition(language === 'zh' ? '为什么 CA 证书与发布点数量不同？' : 'Why do CA and publication-point counts differ?', language === 'zh' ? '有效 CA 证书统计通过证书链验证的 CA；有效发布点统计本轮验证中具有可用发布内容的逻辑发布点。二者处于不同验证层级，不要求一一相等。缺失清单、被拒绝发布点以及信任锚结构都会造成差异。' : 'Valid CA certificates count CAs accepted through certificate-chain validation. Valid publication points count logical publication points with usable published content in this run. They are different validation layers and are not required to match; missing manifests, rejected points, and trust-anchor structure create differences.', 'RIPE NCC public Routinator tals fields')}><HelpCircle size={12} /></button></span><strong>{formatNumber(totals.validPublicationPoints)}</strong><em>{language === 'zh' ? '有效发布点' : 'valid publication points'}</em></div>
          <div><Server size={17} /><span>{t('repoEndpoints', 'Repository endpoints')}</span><strong>{totals.repositoryEndpoints}</strong><em>{rrdpRepositoryCount} RRDP · {rsyncRepositoryCount} rsync</em></div>
          <div><Globe2 size={17} /><span>{t('distinctFqdn', 'Distinct server FQDNs')}</span><strong>{totals.distinctFqdns}</strong><em>{language === 'zh' ? '由仓库 URI 去重' : 'deduplicated from URIs'}</em></div>
          <div><Clock3 size={17} /><span>{language === 'zh' ? '最近一轮验证耗时' : 'Latest validation duration'} <button className="inline-help" aria-label={language === 'zh' ? '解释验证耗时口径' : 'Explain validation-duration definition'} onClick={() => openDefinition(language === 'zh' ? '验证耗时的口径' : 'Validation-duration definition', language === 'zh' ? '该数值直接取自公共 Routinator 的 lastUpdateDuration，表示该实例最近一轮完整更新的总耗时，包括仓库获取、对象解析和验证等阶段；它不是各仓库 duration 的简单求和。' : 'This is Routinator lastUpdateDuration: total elapsed time for the public instance’s latest complete update, including repository retrieval, parsing, and validation. It is not the sum of repository durations.', 'RIPE NCC public Routinator /api/v1/status')}><HelpCircle size={12} /></button></span><strong>{current.lastUpdateDuration.toFixed(2)}s</strong><em>{current.version}</em></div>
        </div>
        <div className="definition-strip"><Info size={14} /><span>{language === 'zh' ? `当前有效 CA 为 ${formatNumber(totals.validCACerts)}，有效发布点为 ${formatNumber(totals.validPublicationPoints)}。同一快照还记录了 ${totals.rejectedPublicationPoints} 个被拒绝发布点和 ${totals.missingManifests} 个缺失清单；这些计数描述不同对象状态，不能互相直接相减解释。` : `This snapshot contains ${formatNumber(totals.validCACerts)} valid CAs, ${formatNumber(totals.validPublicationPoints)} valid publication points, ${totals.rejectedPublicationPoints} rejected points, and ${totals.missingManifests} missing manifests. These describe different validation states and should not be interpreted by direct subtraction.`}</span></div>
        <div className="infrastructure-grid">
          <article className="chart-card repository-card">
            <div className="card-header">
              <div><h3>{language === 'zh' ? '最终 VRP 数量最高的仓库' : 'Repositories with the most final VRPs'}</h3><p>{language === 'zh' ? '按仓库通知 URI 统计 · 非下载对象总量' : 'Grouped by repository notification URI · not total downloaded objects'}</p></div>
              <ChartActions t={t} onCopy={() => copyCitation(language === 'zh' ? '表 1：最终 VRP 数量最高的仓库' : 'Table 1: repositories by final VRPs')} href="https://rpki-validator.ripe.net/ui/repositories" />
            </div>
            <div className="repo-table table-scroll">
              <div className="table-row table-head"><span>{t('endpoint', 'Endpoint')}</span><span>{language === 'zh' ? '类型' : 'Type'}</span><span>{t('finalVrps', 'Final VRPs')}</span><span>{language === 'zh' ? '有效 ROA' : 'Valid ROAs'}</span><span>{language === 'zh' ? '有效 CA' : 'Valid CAs'}</span><span>{language === 'zh' ? '发布点' : 'Pub. points'}</span></div>
              {repositoryRows.map((row, index) => (
                <div className="table-row" key={row.uri} title={row.uri}>
                  <span className="repo-name"><b>{String(index + 1).padStart(2, '0')}</b>{row.hostname}</span>
                  <span className="region-tag">{row.type}</span>
                  <span className="mono">{formatNumber(row.vrpsFinal)}</span>
                  <span className="mono">{formatNumber(row.validROAs)}</span><span className="mono">{formatNumber(row.validCACerts)}</span><span className="mono">{formatNumber(row.validPublicationPoints)}</span>
                </div>
              ))}
            </div>
            <SourceLine>{language === 'zh' ? 'RIPE NCC 公共 Routinator · repositories 字段 · 所有列均为原始计数' : 'RIPE NCC public Routinator · repositories field · all columns are raw counts'}</SourceLine>
          </article>
        </div>

        </div>}

        {activeView === 'retrieval' && <div className="dashboard-view">
        <ViewIntro eyebrow="05 · RELYING PARTY" title={t('secRetrieval', 'RP Retrieval & Validation')} description={language === 'zh' ? 'RIPE NCC 公共 Routinator 最近一次运行的仓库获取状态、耗时和对象异常原始计数。' : 'Raw repository-retrieval status, duration, and object anomalies from the latest RIPE NCC public Routinator run.'} meta={<span className="view-scope"><Clock3 size={13} />{formatUtc(current.lastUpdateDone)}</span>} />
        <div className="two-col wide-left">
          <article className="chart-card">
            <div className="card-header">
              <div><h3>{language === 'zh' ? '本轮耗时最高的仓库获取操作' : 'Slowest repository retrievals in this run'}</h3><p>{language === 'zh' ? 'RRDP 与 rsync 原始状态记录 · 按持续时间排序' : 'Raw RRDP and rsync status records ranked by duration'}</p></div>
              <div className="headline-stat"><span>{language === 'zh' ? '整轮验证' : 'full validation'}</span><b>{current.lastUpdateDuration.toFixed(2)}s</b></div>
            </div>
            <div className="retrieval-table table-scroll">
              <div className="retrieval-row retrieval-head"><span>{language === 'zh' ? '仓库主机' : 'Repository host'}</span><span>{language === 'zh' ? '协议' : 'Protocol'}</span><span>{language === 'zh' ? '原始状态' : 'Raw status'}</span><span>{language === 'zh' ? '耗时' : 'Duration'}</span></div>
              {slowRetrievals.map((item) => {
                const successful = item.protocol === 'RRDP' ? item.status >= 200 && item.status < 400 : item.status === 0;
                return <div className="retrieval-row" key={`${item.protocol}-${item.uri}`} title={item.uri}><span>{item.hostname}</span><span className={`protocol-tag ${item.protocol.toLowerCase()}`}>{item.protocol}</span><span className={successful ? 'status-raw ok' : 'status-raw fail'}>{item.status}</span><span className="mono">{item.duration.toFixed(3)}s</span></div>;
              })}
            </div>
            <div className="run-summary"><span>RRDP <b>{totals.rrdpSuccessful} / {totals.rrdpAttempts}</b></span><span>rsync <b>{totals.rsyncSuccessful} / {totals.rsyncAttempts}</b></span><span>Serial <b>{current.serial}</b></span><span>VRP <b>{compactNumber(totals.vrpsFinal)}</b></span></div>
            <div className="timeout-note"><Info size={14} /><span>{language === 'zh' ? '多个耗时接近 30 秒的 RRDP 记录来自同一超时上限，因此数值会聚集；这不是平滑或构造数据。状态 200/304 表示 HTTP 成功或未修改，负值以及非零 rsync 退出码保留验证器原始值。' : 'RRDP records clustered near 30 seconds hit the same timeout ceiling; the values are not smoothed. HTTP 200/304 indicate success or not modified. Negative values and non-zero rsync exit codes are retained as raw validator output.'}</span></div>
            <SourceLine>{language === 'zh' ? 'RIPE NCC 公共 Routinator · rrdp / rsync 字段 · 仅代表该公共实例本轮运行' : 'RIPE NCC public Routinator · rrdp / rsync fields · this public instance and this run only'}</SourceLine>
          </article>
          <article className="chart-card health-card">
            <div className="card-header"><div><h3>{language === 'zh' ? '最近一次验证运行' : 'Latest validation run'}</h3><p>{language === 'zh' ? '原始计数，不计算综合健康分' : 'Raw counts; no composite health score'}</p></div><span className="status-pill neutral">{language === 'zh' ? '单次观测' : 'ONE RUN'}</span></div>
            <div className="run-identity"><Clock3 size={17} /><span><b>{formatUtc(current.lastUpdateDone)}</b><small>{current.version} · serial {current.serial}</small></span></div>
            <div className="health-list">
              <div><span className="health-icon neutral"><Layers3 size={13} /></span><span><b>{t('finalVrps', 'Final VRPs')}</b><small>IPv4 + IPv6</small></span><strong>{formatNumber(totals.vrpsFinal)}</strong></div>
              <div><span className="health-icon warn"><TriangleAlert size={13} /></span><span><b>{language === 'zh' ? '无有效清单的发布点' : 'Missing manifests'}</b><small>{language === 'zh' ? '五个信任锚求和' : 'sum over five trust anchors'}</small></span><strong>{totals.missingManifests}</strong></div>
              <div><span className="health-icon bad"><FileBadge2 size={13} /></span><span><b>{language === 'zh' ? '无效证书 / 无效 ROA' : 'Invalid certificates / ROAs'}</b><small>{language === 'zh' ? '验证器对象计数' : 'validator object counts'}</small></span><strong>{totals.invalidCerts} / {totals.invalidROAs}</strong></div>
              <div><span className="health-icon neutral"><FileClock size={13} /></span><span><b>{t('staleManifests', 'Stale manifests')}</b><small>{t('allTrustAnchors', 'across all trust anchors')}</small></span><strong>{totals.staleManifests}</strong></div>
            </div>
            <a className="log-link" href="https://rpki-validator.ripe.net/ui/connections" target="_blank" rel="noreferrer">{language === 'zh' ? '打开公共验证器连接明细' : 'Open public validator connection details'} <ArrowUpRight size={13} /></a>
            <SourceLine>{language === 'zh' ? 'RIPE NCC 公共 Routinator · status / tals 字段 · 无自建探针' : 'RIPE NCC public Routinator · status / tals fields · no self-operated probes'}</SourceLine>
          </article>
        </div>

        </div>}

        {activeView === 'regional' && <div className="dashboard-view">
        <ViewIntro eyebrow="06 · REGIONAL" title={t('secRegional', 'Regional Breakdown')} description={t('secRegionalDesc', 'Side-by-side comparison of the five RIR ecosystems using a consistent measurement snapshot.')} meta={<RirSelector id="regional-rir-scope" value={rir} onChange={setRir} language={language} t={t} />} />
        <article className="chart-card regional-card">
          <div className="card-header">
            <div><h3>{t('rirMatrix', 'RIR comparative matrix')}</h3><p>{t('clickRow', 'Click a row to open that RIR’s object details')}</p></div>
            <span className="snapshot-label"><Clock3 size={13} /> {formatUtc(current.observedAt)}</span>
          </div>
          <div className="regional-table table-scroll">
            <div className="regional-row regional-head"><span>{t('registryHead', 'Registry')}</span><span>{t('validCas', 'Valid CAs')}</span><span>{t('roaObjects', 'ROA objects')}</span><span>{t('finalVrps', 'Final VRPs')}</span><span>IPv4 VRP</span><span>IPv6 VRP</span><span>ASPA</span><span>{language === 'zh' ? '发布点' : 'Pub. points'}</span><span /></div>
            {(rir === 'global' ? rirRows : rirRows.filter((row) => row.code === rir)).map((row) => (
              <button className={`regional-row ${rir === row.code ? 'selected' : ''}`} key={row.code} onClick={() => { setRir(row.code); setObjectTab('growth'); navigateTo('objects'); }}>
                <span className="registry-name"><i style={{ background: row.color }} /><b>{row.name}</b><small>{row.code}</small></span>
                <span className="mono">{formatNumber(row.ca)}</span><span className="mono">{formatNumber(row.roa)}</span><span className="mono">{formatNumber(row.vrp)}</span>
                <span className="mono">{formatNumber(row.vrpV4)}</span><span className="mono">{formatNumber(row.vrpV6)}</span><span className="mono">{formatNumber(row.aspa)}</span><span className="mono">{formatNumber(row.pps)}</span><span><ArrowUpRight size={14} /></span>
              </button>
            ))}
          </div>
          <SourceLine>{language === 'zh' ? 'RIPE NCC 公共 Routinator · tals 字段 · 所有列来自同一轮验证' : 'RIPE NCC public Routinator · tals field · all columns from one validation run'}</SourceLine>
        </article>

        </div>}

        {activeView === 'sources' && <div className="dashboard-view">
        <section className="datasets-section" id="datasets">
          <ViewIntro eyebrow="07 · DATA & METHOD" title={t('secSources', 'Data Sources & Reproducibility')} description={t('secSourcesDesc', 'A transparent collection plan separating direct measurements, external data APIs, and methodology-only references.')} meta={<button className="view-export" onClick={openManifest}><BookOpen size={14} />{t('viewManifest', 'View collection manifest')}</button>} />
          <div className="source-grid" id="methodology">
            <a href="https://www.ripe.net/manage-ips-and-asns/resource-management/rpki/rir-trust-anchor-statistics/" target="_blank" rel="noreferrer" className="source-card">
              <div className="source-card-head"><span className="source-logo dark">RS</span><span className="source-type measured">{language === 'zh' ? '已使用' : 'IN USE'}</span></div>
              <h3>RIR Trust Anchor Statistics</h3><p>{language === 'zh' ? '五个 RIR 信任锚的逐日有效证书、ROA、IPv4/IPv6 ROA 前缀及地址空间单位。' : 'Daily certificates, ROAs, IPv4/IPv6 ROA prefixes, and address-space units for all five trust anchors.'}</p>
              <span className="source-frequency"><RefreshCw size={12} /> {language === 'zh' ? '逐日统计' : 'daily statistics'}</span><ArrowUpRight className="source-arrow" size={15} />
            </a>
            <a href="https://rpki-validator.ripe.net/ui/metrics" target="_blank" rel="noreferrer" className="source-card">
              <div className="source-card-head"><span className="source-logo blue">RT</span><span className="source-type measured">{language === 'zh' ? '已使用' : 'IN USE'}</span></div>
              <h3>RIPE NCC Public Routinator</h3><p>{language === 'zh' ? '当前对象、VRP、ASPA、发布点、仓库及最近一次 RRDP/rsync 获取状态。' : 'Current objects, VRPs, ASPAs, publication points, repositories, and latest RRDP/rsync retrieval status.'}</p>
              <span className="source-frequency"><RefreshCw size={12} /> {formatUtc(current.observedAt)}</span><ArrowUpRight className="source-arrow" size={15} />
            </a>
            <a href="https://radar.cloudflare.com/routing/rpki" target="_blank" rel="noreferrer" className="source-card">
              <div className="source-card-head"><span className="source-logo orange">CF</span><span className="source-type measured">{language === 'zh' ? '已使用' : 'IN USE'}</span></div>
              <h3>Cloudflare Radar API</h3><p>{language === 'zh' ? 'IPv4/IPv6 RPKI-valid 前缀比例，以及当前 BGP 前缀、路由和起源 ASN 快照。' : 'IPv4/IPv6 RPKI-valid prefix ratios and current BGP prefix, route, and origin-AS snapshots.'}</p>
              <span className="source-frequency"><RefreshCw size={12} /> {formatUtc(snapshot.cloudflare.coverageDataTime)}</span><ArrowUpRight className="source-arrow" size={15} />
            </a>
            <a href="https://api.routeviews.org/docs/" target="_blank" rel="noreferrer" className="source-card">
              <div className="source-card-head"><span className="source-logo green">RV</span><span className="source-type measured">{language === 'zh' ? '已使用' : 'IN USE'}</span></div>
              <h3>RouteViews API</h3><p>{language === 'zh' ? '固定 collector 的前缀数量时间序列，以及 collector inventory 与近实时 RIB API 覆盖清单。' : 'Fixed-collector prefix-count series, collector inventory, and the near-real-time RIB API coverage list.'}</p>
              <span className="source-frequency"><RefreshCw size={12} /> {formatUtc(snapshot.provenance.generatedAt)}</span><ArrowUpRight className="source-arrow" size={15} />
            </a>
            <a href="https://stat.ripe.net/docs/data-api/api-endpoints/rrc-info.html" target="_blank" rel="noreferrer" className="source-card">
              <div className="source-card-head"><span className="source-logo blue">RIS</span><span className="source-type measured">{language === 'zh' ? '已使用' : 'IN USE'}</span></div>
              <h3>RIPE RIS / RIPEstat</h3><p>{language === 'zh' ? 'RRC 生命周期与位置元数据，以及按 8 小时 RIB 时点对齐的 peer、ASN 和地址族记录。' : 'RRC lifecycle/location metadata and peer, ASN, and address-family records aligned to an eight-hour RIB point.'}</p>
              <span className="source-frequency"><RefreshCw size={12} /> {snapshot.collectors?.ripeRis?.queryTime ? formatUtc(snapshot.collectors.ripeRis.queryTime) : '—'}</span><ArrowUpRight className="source-arrow" size={15} />
            </a>
            <a href="https://stat.ripe.net/docs/data-api/api-endpoints/as-overview.html" target="_blank" rel="noreferrer" className="source-card">
              <div className="source-card-head"><span className="source-logo violet">AS</span><span className="source-type measured">{language === 'zh' ? '已使用' : 'IN USE'}</span></div>
              <h3>RIPEstat AS Profile APIs</h3><p>{language === 'zh' ? 'AS 注册概况、RIS 路由状态、以 ASN 为 origin 的 VRP 历史，以及按需加载的 AS 邻居。' : 'AS registration summary, RIS routing state, origin-AS VRP history, and on-demand AS neighbours.'}</p>
              <span className="source-frequency"><RefreshCw size={12} /> {language === 'zh' ? 'watchlist 8 小时；任意 ASN 按需' : '8-hour watchlist; arbitrary ASNs on demand'}</span><ArrowUpRight className="source-arrow" size={15} />
            </a>
            <a href="https://asrank.caida.org/doc" target="_blank" rel="noreferrer" className="source-card">
              <div className="source-card-head"><span className="source-logo violet">CA</span><span className="source-type measured">{language === 'zh' ? '已使用' : 'IN USE'}</span></div>
              <h3>CAIDA AS Rank API</h3><p>{language === 'zh' ? 'Customer-cone 排名、AS-to-Organization 映射，以及 provider/peer/customer 推断关系。' : 'Customer-cone ranking, AS-to-Organization mapping, and inferred provider/peer/customer relationships.'}</p>
              <span className="source-frequency"><RefreshCw size={12} /> {language === 'zh' ? 'watchlist 每日；组织与任意 ASN 按需' : 'daily watchlist; organizations and arbitrary ASNs on demand'}</span><ArrowUpRight className="source-arrow" size={15} />
            </a>
            <a href="https://rpki-monitor.antd.nist.gov/Methodology" target="_blank" rel="noreferrer" className="source-card">
              <div className="source-card-head"><span className="source-logo red">NI</span><span className="source-type measured">{language === 'zh' ? '已使用' : 'IN USE'}</span></div>
              <h3>NIST RPKI Monitor</h3><p>{language === 'zh' ? 'IPv4/IPv6 唯一前缀—起源 ASN 对的 Valid、Invalid 与 Not-Found 六小时历史。' : 'Six-hour IPv4/IPv6 Valid, Invalid, and Not-Found history for unique prefix–origin pairs.'}</p>
              <span className="source-frequency"><BookOpen size={12} /> {language === 'zh' ? '月末采样' : 'month-end sample'}</span><ArrowUpRight className="source-arrow" size={15} />
            </a>
          </div>
          <div className="repro-strip">
            <div><Boxes size={18} /><span><b>{language === 'zh' ? '数据来源可复核' : 'Traceable data sources'}</b>{language === 'zh' ? `生成时间 ${formatUtc(snapshot.provenance.generatedAt)}；保留来源 URL、Routinator 版本、serial 与原始观测时间。` : `Generated ${formatUtc(snapshot.provenance.generatedAt)} with source URLs, Routinator version, serial, and source timestamps retained.`}</span></div>
            <button onClick={openManifest}>{t('viewManifest', 'View collection manifest')} <ArrowUpRight size={14} /></button>
          </div>
        </section>
        </div>}
      </main>
      </div>

      <footer>
        <div className="footer-brand"><span className="brand-mark small"><Globe2 size={16} /><i /></span><span><b>{t('heroTitle', 'RPKI Global Observatory')}</b><small>{t('footerTagline', 'An open measurement project for routing-security research.')}</small></span></div>
        <div className="footer-links"><button onClick={() => navigateTo('sources')}>{t('methodology', 'Methodology')}</button><button onClick={() => navigateTo('sources')}>{t('dataAccess', 'Data access')}</button><button onClick={openProjectInfo}>{t('projectInfo', 'Project information')}</button></div>
        <span className="footer-license">{language === 'zh' ? '数据来源：RIPE NCC · RouteViews · CAIDA · NIST · Cloudflare' : 'Data sources: RIPE NCC · RouteViews · CAIDA · NIST · Cloudflare'}</span>
      </footer>

      <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={navigateTo} t={t} entries={searchEntries} />
      <Modal modal={modal} onClose={() => setModal(null)} t={t} />
      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </div>
  );
}

export default App;
