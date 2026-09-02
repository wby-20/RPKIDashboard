# RPKI 全球观测站

RPKI Global Observatory 是一个面向路由安全研究的数据看板，用于汇总和展示 RPKI 对象、BGP/ROV 状态、发布基础设施、公共收集器和 AS 拓扑数据。界面默认中文，适合桌面端浏览和论文图表整理。

项目不是传统运维大屏，也不计算缺少明确依据的综合“健康分”。当前使用公开数据源和 RIPE NCC 公共 Routinator，尚未部署自建 RP。

## 主要功能

- CA、ROA、VRP、ASPA 和 Publication Point 当前快照与长期趋势
- IPv4/IPv6 RPKI-valid 覆盖及 NIST Valid/Invalid/Not-Found 对比
- RouteViews BGP 前缀趋势和 RIPE RIS/RouteViews 收集器地图
- Publication Point、repository endpoint、FQDN 与获取协议统计
- 五个 RIR 的统一口径比较
- 按 ASN 查询路由状态、地址空间、VRP 历史和 RIS 邻居
- CAIDA AS Rank、组织查询和裁剪后的 provider/peer/customer 关系图
- 中英文切换、CSV 导出、来源跳转和数据定义说明

## 快速开始

环境要求：Node.js `>=22.12`、Python `>=3.10`、npm 和 `curl`。

```bash
git clone https://github.com/wby-20/RPKIDashboard.git
cd RPKIDashboard
npm ci
cp .env.example .env
npm run dev
```

Cloudflare Radar 是可选数据源。如需刷新相关数据，在 `.env` 中填写：

```text
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

仓库已包含最近一次生成的数据快照；没有 Cloudflare Token 也可以直接查看页面。

## 构建与部署

构建静态文件：

```bash
npm run build
```

完整功能包含静态页面和 CAIDA AS Rank 同源缓存代理：

```bash
npm run serve
```

默认监听 `0.0.0.0:8000`。生产环境建议在前面配置 Nginx/Caddy，负责 HTTPS、压缩和接口限流。

如果只需要固定快照和 AS watchlist，也可以把 `dist/` 部署到 Nginx、对象存储或 GitHub Pages；纯静态部署不支持可靠的任意组织/CAIDA 查询。

### GitHub Pages

仓库包含 `.github/workflows/pages.yml`：推送到 `main` 会部署当前快照，定时任务每天执行 4 次数据刷新和重新部署。

1. 在仓库 `Settings → Pages` 中将 Source 设为 `GitHub Actions`。
2. 如需刷新 Cloudflare 数据，在 `Settings → Secrets and variables → Actions` 中添加 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN`。
3. 推送到 `main`，或在 Actions 中手动运行 `Deploy GitHub Pages`。

Pages 构建使用相对资源路径，可同时适配 `username.github.io/repository/` 和自定义域名。静态模式保留完整看板和 watchlist；任意组织查询会被禁用，任意 ASN 仍可显示 RIPEstat 数据。

地图运行文件约 493 KB，启用 gzip 后约 168 KB；原始地图约 1.4 MB，均远低于 GitHub Pages 的 1 GB 站点限制。地图目前更需要解决的是来源许可，而不是文件体积。

## 定时同步

| 档位 | 默认周期 | 主要更新内容 |
| --- | ---: | --- |
| fast | 15 分钟 | 公共 Routinator 当前快照 |
| medium | 8 小时 | RIPEstat、NIST、Cloudflare |
| daily | 24 小时 | RouteViews、CAIDA 与全部来源 |

执行一次同步：

```bash
npm run sync:fast
npm run sync:medium
npm run sync:daily
```

启动常驻调度器：

```bash
npm run sync:daemon
```

同步器使用本地缓存、文件锁和临时文件原子替换。失败时保留上一版有效快照。详细说明见 [docs/SYNC_SCHEDULER.md](docs/SYNC_SCHEDULER.md)。

## 数据来源

| 来源 | 用途 |
| --- | --- |
| RIPE NCC Public Routinator | 当前对象、VRP、ASPA、发布点和验证运行 |
| RIPE Trust Anchor Statistics | 五个 RIR 的长期历史 |
| RouteViews API | BGP 前缀趋势和 collector metadata |
| RIPEstat / RIPE RIS | RRC、peer、AS 路由状态和邻居 |
| NIST RPKI Monitor | Valid、Invalid、Not-Found 历史 |
| Cloudflare Radar | RPKI 覆盖、路由快照和异常候选 |
| CAIDA AS Rank | AS/组织排名和推断关系 |

不同来源保留各自观测时间。页面左下角显示的是公共 Routinator 返回的 `status.now`，不是本地构建时间。

## AS 查询

`data/as-watchlist.json` 中的 ASN 会被定时预取。目前包含 AS13335、AS15169、AS4134 和 AS3356。任意 ASN 的各类数据独立加载，一个接口超时不会取消整页。

CAIDA 关系图只保留目标 ASN 的小型邻域，最多显示 19 个节点，不会把完整全球 AS 图发送到浏览器。AS Rank 和 provider/peer/customer 均为拓扑推断结果，不代表流量排名或运营商确认的合同关系。

## 网络检查

部署到新服务器后，建议先检查能否无代理访问全部外部数据源：

```bash
npm run network:check
```

详细域名和失败影响见 [docs/NETWORK_ACCESS.md](docs/NETWORK_ACCESS.md)。

## 项目结构

```text
data/             配置和原始地图
docs/             数据口径与部署说明
public/           懒加载地图和 AS watchlist
scripts/          数据同步、调度、网络检查和 Python 服务
src/              React 页面、组件和生成快照
.github/workflows GitHub Actions 构建检查
```

`dist/`、`node_modules/`、`.cache/`、`.env` 和 Python bytecode 已加入 `.gitignore`。

## 重要限制

- 当前没有自建 RP，验证结果不能代表所有 RP 或全球仓库状态。
- Invalid、MOAS 或第三方 anomaly candidate 不等于攻击。
- Prefix、地址空间、ROA、VRP 和 Publication Point 是不同统计单位。
- AS Rank、组织映射和 AS Relationship 是 CAIDA 推断结果。
- 世界地图原文件没有附带明确来源和许可，公开发布前应确认或替换。
- 任意 ASN/组织查询仍可能受 RIPEstat 和 CAIDA 上游延迟影响。

## 文档

- [AS 数据来源与口径](docs/AS_DATA_SOURCES.md)
- [地图资源说明](docs/MAP_ASSET.md)
- [外部数据源连通性](docs/NETWORK_ACCESS.md)
- [定时同步说明](docs/SYNC_SCHEDULER.md)

## License

当前仓库尚未指定代码许可证。公开发布前请由项目维护者选择许可证，并确认第三方数据和地图资源的使用条款。
