# 外部数据源直连要求

## 结论

项目使用的运行时数据源都是公开 HTTPS API，没有任何接口在协议或账号层面要求 VPN/代理。但中国大陆云服务器到海外学术与运营网络的可达性、延迟和丢包取决于具体地域、运营商和时间段，必须在目标实例上做无代理实测。

运行：

```bash
python3 scripts/check_external_access.py --timeout 20
```

脚本显式禁用 `HTTP_PROXY/HTTPS_PROXY`，检查 DNS、TCP/TLS 和 HTTP；不会打印 Cloudflare Token。全部显示 `PASS` 后再启用 `sync:daemon`。

## 必需域名

| 域名 | 使用位置 | 失败影响 |
| --- | --- | --- |
| `rpki-validator.ripe.net` | 15 分钟 fast sync | 当前 RPKI/仓库/验证器快照停止更新 |
| `lirportal.ripe.net` | daily sync | RIR 长期对象历史停止更新 |
| `api.routeviews.org` | daily sync | Collector 清单和 BGP 前缀趋势停止更新 |
| `stat.ripe.net` | medium sync；任意 ASN 浏览器查询 | RIS/AS 数据停止更新；watchlist 静态资料仍可显示 |
| `rpki-monitor.antd.nist.gov` | medium sync | NIST ROV 历史停止更新 |
| `api.cloudflare.com` | medium sync | Radar coverage、异常候选和 route stats 停止更新 |
| `api.asrank.caida.org` | daily watchlist；Python `/api/asrank` | AS Rank、组织查询和任意 ASN 的 CAIDA 拓扑不可更新；已有缓存可回退 |

页面中列出的数百个 RRDP/rsync 仓库 URI 来自公共 Routinator 的结果；当前项目没有自建 RP，因此同步脚本不会逐个访问这些仓库。

## 部署建议

若云服务器位于中国大陆且任一必需域名持续失败，不建议在服务器上配置不透明的“梯子”。更稳妥的架构是：

1. 在香港、新加坡、日本或其他直连稳定的节点运行 `sync:daemon` 和 AS Rank 代理。
2. 将生成的 `dist/`、JSON 和地图资产同步到境内 Web 服务器或对象存储。
3. 境内服务器只提供静态文件，不直接访问七个海外数据源。

如果必须在境内单机部署，可以保留 watchlist 静态资料并关闭任意 ASN/组织实时查询；数据刷新失败时系统会保留上一版快照，不会写入半成品。
