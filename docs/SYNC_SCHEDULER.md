# 分层定时同步

## 同步档位

| Profile | 默认周期 | 强制刷新 | 其余来源 |
| --- | ---: | --- | --- |
| `fast` | 15 分钟 | 公共 Routinator 当前状态 | 使用 8 小时/24 小时本地 API 缓存 |
| `medium` | 8 小时 | Routinator、RIPEstat、NIST、Cloudflare | RouteViews、CAIDA AS Rank 和日级历史使用 24 小时缓存 |
| `daily` | 24 小时 | 所有公开来源，包括 CAIDA AS Rank | 请求失败时尝试上次成功响应 |

缓存位于 `.cache/api/`，不会进入版本库。每轮生成文件先写入临时文件，再原子替换；网络、解析、校验或构建失败不会更新调度完成时间。

## 接口失败回退

- 请求重试失败时读取上次成功的 API 响应，保持缓存时间及响应中的原始观测时间。
- Watchlist 的身份、路由状态、IPv4/IPv6 VRP 历史、AS Rank 分别更新。没有原始响应缓存时使用 `.cache/snapshots/as-profiles.json`，首次部署则使用仓库内的 watchlist。
- AS 子来源没有旧数据时记录为 `unavailable`；已有数据但刷新失败时记录为 `stale`。`sourceStatus` 保留最后成功时间和本次尝试时间，页面显示提示。
- 已完成的部分刷新仍可部署；失败信息进入 `provenance.sourceFailures`、`provenance.asSourceFailures` 和 Actions warning。
- 核心数据源没有可用响应缓存，或输出未通过一致性检查时，任务仍报错并保留线上版本。
- Actions 在刷新后保存成功响应和 AS 快照缓存，即使后续步骤失败也执行缓存保存。

## 运行方式

### GitHub Pages 发布

每天仍采集四次。采集后与线上 `data/deployment-state.json` 比较：忽略本地生成时间、请求时间、缓存计数和 Routinator 运行序号；保留指标数值、测量耗时、历史日期、上游采样时间及失败/恢复状态。无变化时跳过 npm 安装、构建、上传和 deploy job；Actions 仍保留采集运行记录。

对比基准随网站发布，失败的部署不会更新基准。基准缺失或读取失败时执行发布。仅修改 Markdown、`docs/` 或 LICENSE 不触发 Pages；代码修改正常发布，手动运行可选 `force_deploy`。工作流先恢复最近成功的数据缓存，避免普通代码部署覆盖为仓库内较旧的数据。

运行名称区分代码部署、定时数据更新和手动数据更新。仓库新日志及默认产物保留 30 天，Pages 上传产物保留 1 天；缓存沿用 GitHub 默认自动淘汰机制（默认 7 天未访问清理）。已发布网站不随上传产物过期而删除。

前台验证：

```bash
npm run sync:fast
npm run sync:medium
npm run sync:daily
```

常驻调度器：

```bash
npm run sync:daemon
```

调度器只使用 Python 标准库，包含非阻塞文件锁，避免两个刷新任务重叠。首次启动没有状态文件时会先执行一次 `daily`。状态写入 `.cache/sync-state.json`。

单次执行（适合 systemd timer 或 cron）：

```bash
python3 scripts/run_sync_scheduler.py --once --profile fast
python3 scripts/run_sync_scheduler.py --once --profile medium
python3 scripts/run_sync_scheduler.py --once --profile daily
```

测试数据流程但不构建前端：

```bash
python3 scripts/run_sync_scheduler.py --once --profile fast --no-build
```

可通过环境变量调整周期：

```text
SYNC_FAST_MINUTES=15
SYNC_MEDIUM_HOURS=8
SYNC_DAILY_HOURS=24
```

当前调度器更新本机 `dist/`。若线上使用 CDN、对象存储或另一台 Web 服务器，仍需在构建成功后接入相应部署步骤；项目没有擅自执行外部发布。
