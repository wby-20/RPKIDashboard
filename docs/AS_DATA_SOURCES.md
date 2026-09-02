# AS 信息模块的数据来源与口径

## 采用的数据源

首版数据使用 RIPEstat Data API 与 CAIDA AS Rank API。`data/as-watchlist.json` 中的 ASN 由同步任务预取到独立的懒加载资产：RIPEstat 字段按 medium 周期更新，AS Rank 按 daily 周期更新；任意其他 ASN 才由浏览器按需查询：

| 接口 | 页面用途 | 关键口径 |
| --- | --- | --- |
| `as-overview` | ASN holder、IANA 分配块、是否作为 origin 被观测 | `announced=true` 要求至少 10 个 RIS full-feed peer 看见该 ASN 作为 origin；纯 transit ASN 可能为 false |
| `routing-status` | IPv4/IPv6 公告前缀、唯一地址空间、RIS visibility、邻居总数 | 结果来自对齐到 00/08/16 UTC 的 RIS RIB 快照，不是全球无偏真值 |
| `rpki-history` | 以该 ASN 为 origin 的 IPv4/IPv6 VRP 月度历史 | VRP 是授权，不是活跃 BGP 前缀，也不证明 ROV 部署 |
| `asn-neighbours?lod=1` | 用户按需加载的邻居列表 | Left/Right 是 AS path 相对位置；`power/path_count` 是路径出现次数，不是商业关系强度 |
| CAIDA AS Rank GraphQL `asn` | AS Rank、customer cone、degree、组织映射 | Rank 基于推断的 customer cone，不是流量、收入、用户数、安全性或主观重要性排名 |
| CAIDA AS Rank GraphQL `organizations` | 按组织名搜索、成员 ASN | 是 CAIDA 面向拓扑分析的 AS-to-Organization 归并，不等同于工商登记或法律实体；同名可有多个 orgId |
| CAIDA AS Rank GraphQL `asnLinks` | provider/peer/customer 关系子图 | 关系由 CAIDA 使用 BGP、BGP community 与 traceroute 等数据推断，不是运营者确认的合同关系 |

当前 watchlist 为 AS13335、AS15169、AS4134 和 AS3356。打开这些示例不会产生 RIPEstat/AS Rank 浏览器请求。任意 ASN 的基础资料进入页面时并行发起 RIPEstat 与 AS Rank 请求，并在浏览器缓存 8 小时；RIS 邻居详情始终只有点击后才请求。修改 `data/as-watchlist.json` 后，下一次同步会预取新的研究对象。

Watchlist 资产位于 `public/data/as-watchlist-profiles.json`，不进入主 JavaScript bundle，仅在打开 AS 页面时加载。完整 provider/peer/customer 数量取自 `asnDegree`；关系接口最多预取 200 条边，前端再按路径出现次数为三类关系各绘制最多 6 条。未绘制的关系仍计入图例总数。最终 SVG 不超过 19 个节点和 18 条边，不运行力导向算法。

CAIDA AS Rank 的浏览器 CORS 响应在实测中不稳定，因此任意 ASN 和组织查询不再直接访问 CAIDA。开发环境由 Vite `/api/asrank` 转发；生产推荐运行 `npm run serve`，由 `scripts/serve_dashboard.py` 提供固定上游、最大 64 KB 请求体、8 小时磁盘缓存和 stale-if-error 回退。该代理不能访问任意 URL，不是通用开放代理。

RIPEstat 的各接口延迟也并不一致。2026-09-02 实测 AS3257 的 `as-overview` 和两条 `rpki-history` 约 1–1.4 秒，而 `routing-status` 一度需要 46 秒。因此前端只把 `as-overview` 作为身份页成功的必要条件；RPKI History、AS Rank 和 Routing Status 分别独立加载。Routing Status 最多等待 60 秒，失败后只在对应卡片显示重试，不再取消整页或暴露 `signal is aborted` 浏览器错误。

## 2026-09-01 请求成本实测

以 AS13335 为例：

| 请求 | 响应体 | 延迟 |
| --- | ---: | ---: |
| AS Overview | 667 B | 2.0 s |
| Routing Status | 1.1 KB | 1.0 s |
| RPKI History IPv4（月） | 17.8 KB | 2.1 s |
| RPKI History IPv6（月） | 17.0 KB | 2.1 s |
| ASN Neighbours `lod=1` | 176.6 KB | 2.2 s |
| PeeringDB `net?asn=` | 2.3 KB | 1.0 s |
| AS Rank ASN 概况 | 390 B | 0.7 s |
| AS Rank 前 200 条关系（AS13335） | 33.5 KB | 约 5 s |

不含关系边的 RIPEstat 基础查询总响应体约 37 KB；RIS 邻居详情约 177 KB。AS Rank 的 200 条关系在 AS13335 上约 34 KB。不同 ASN 的前缀、邻居和历史长度不同，数值不能视为固定上限。AS Rank 文档称数据按月更新，但页面必须显示 API 实际返回的 `date`；本次 AS13335 返回的是 `2026-04-01`，不能用当前 RIS 时间替代。

## 调研但未直接接入

- **PeeringDB API**：有正式 API，公开 GET 可匿名访问；网络类型、traffic、peering policy 等字段由网络运营者自报，覆盖不完整。浏览器跨域支持也不应作为静态前端的稳定依赖，因此首版只提供外链。未来若接入，应通过我们自己的缓存代理，并明确“self-reported”。
- **RDAP**：适合获得权威注册信息，但需要先按 IANA ASN bootstrap 选择对应 RIR，五个 RIR 的返回内容也不完全一致。RIPEstat AS Overview 已能满足首版身份摘要，暂不额外增加请求。
- **bgp.tools、Hurricane Electric BGP Toolkit 等网页**：适合人工交叉核对，但没有被本项目采用的稳定公开 API。不得通过页面抓取或 HTML 解析构建生产数据。
- **全量 ASN 镜像**：没有必要。AS 信息适合按需查询和热门/研究对象 watchlist 缓存；同步全部 ASN 会制造大量无用请求，并不能解决 RIS 观测偏差。
- **完整 CAIDA 月度关系文件进浏览器**：不采用。Serial-2 是完整 AS 图，受 CAIDA Public AUA 约束且规模远大于单 ASN 邻域。页面使用 AS Rank API 的有界子集；若未来做离线全图研究，应在后端下载月度 Serial-2、保留版本与引用，并只向前端输出裁剪结果。

## 官方文档

- RIPEstat AS Overview: https://stat.ripe.net/docs/data-api/api-endpoints/as-overview.html
- RIPEstat Routing Status: https://stat.ripe.net/docs/data-api/api-endpoints/routing-status.html
- RIPEstat ASN Neighbours: https://stat.ripe.net/docs/data-api/api-endpoints/asn-neighbours.html
- RIPEstat RPKI History: https://stat.ripe.net/docs/data-api/api-endpoints/rpki-history.html
- PeeringDB API: https://docs.peeringdb.com/api_specs/
- IANA ASN RDAP bootstrap: https://data.iana.org/rdap/asn.json
- CAIDA AS Rank API: https://asrank.caida.org/doc
- CAIDA AS Relationships: https://www.caida.org/catalog/datasets/as-relationships/
