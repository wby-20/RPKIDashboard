# RPKI 全球观测站

面向路由安全研究的 RPKI/BGP 数据看板，汇总 RPKI 对象、ROV 状态、发布基础设施、公共 BGP 收集器和 AS 拓扑数据。界面默认中文，支持中英文切换。

在线访问：https://wby-20.github.io/RPKIDashboard/

## 功能

- CA、ROA、VRP、ASPA 和 Publication Point 快照与历史趋势
- IPv4/IPv6 RPKI 覆盖和 Valid/Invalid/Not-Found 统计
- RouteViews BGP 前缀趋势
- RouteViews 与 RIPE RIS 收集器地图和元数据
- Repository、FQDN、RRDP/rsync 与验证状态
- 五个 RIR 的统一口径比较
- ASN 路由状态、地址空间、VRP 历史和 RIS 邻居查询
- CAIDA AS Rank、组织信息和 AS 关系子图
- CSV 导出、数据来源和指标定义

## 本地运行

要求：Node.js `>=22.12`、Python `>=3.10`、npm、`curl`。

```bash
git clone https://github.com/wby-20/RPKIDashboard.git
cd RPKIDashboard
npm ci
cp .env.example .env
npm run dev
```

构建生产文件：

```bash
npm run build
```

启动静态页面和 AS Rank 查询代理：

```bash
npm run serve
```

默认监听 `0.0.0.0:8000`。

## GitHub Pages

`.github/workflows/pages.yml` 负责构建和部署 GitHub Pages：

- 推送到 `main` 时部署当前数据
- 每天 4 次定时刷新和部署
- 支持在 Actions 页面手动运行

Cloudflare Radar 更新需要在仓库 Actions Secrets 中配置：

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Pages 模式提供完整看板、地图和 AS watchlist。任意 ASN 可查询 RIPEstat 数据；组织查询和非 watchlist CAIDA 实时查询由服务器模式提供。

## 数据同步

| Profile | 周期 | 数据 |
| --- | ---: | --- |
| fast | 15 分钟 | 公共 Routinator 当前快照 |
| medium | 8 小时 | RIPEstat、NIST、Cloudflare |
| daily | 24 小时 | RouteViews、CAIDA 和完整刷新 |

```bash
npm run sync:fast
npm run sync:medium
npm run sync:daily
npm run sync:daemon
```

同步缓存位于 `.cache/`。数据写入使用临时文件和原子替换。

## 数据来源

| 来源 | 数据 |
| --- | --- |
| RIPE NCC Public Routinator | RPKI 对象、VRP、ASPA、发布点和验证运行 |
| RIPE Trust Anchor Statistics | 五个 RIR 的长期历史 |
| RouteViews | BGP 前缀与 collector metadata |
| RIPEstat / RIPE RIS | RRC、peer、ASN 路由状态和邻居 |
| NIST RPKI Monitor | Valid、Invalid、Not-Found 历史 |
| Cloudflare Radar | RPKI 覆盖、路由快照和异常候选 |
| CAIDA AS Rank | AS/组织排名和推断关系 |

地图使用 **Natural Earth Admin 0 – Countries (China POV), version 5.1.1**。运行地图约 493 KB，进入收集器页面时加载。

## 网络检查

```bash
npm run network:check
```

该命令检查服务器到全部外部数据源的无代理连接。

## 目录

```text
data/      配置和地图源文件
docs/      数据与部署说明
public/    地图和 AS watchlist
scripts/   数据刷新、调度和服务脚本
src/       React 页面和生成数据
```

详细说明：

- [AS 数据来源](docs/AS_DATA_SOURCES.md)
- [地图资源](docs/MAP_ASSET.md)
- [网络连接](docs/NETWORK_ACCESS.md)
- [同步调度](docs/SYNC_SCHEDULER.md)

## License

项目代码使用 [MIT License](LICENSE)。

Natural Earth 地图数据属于 public domain，推荐署名 “Made with Natural Earth”。第三方数据说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
