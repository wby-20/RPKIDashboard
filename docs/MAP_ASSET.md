# 收集器地图资源说明

## 文件位置

- 原始文件：`data/maps/world.geo.json`
- 前端运行时文件：`public/maps/world-countries.geojson`
- 生成脚本：`scripts/prepare-world-map.mjs`

原始文件不能放在 `dist/assets`：`dist` 是 Vite 构建输出，执行 `npm run build` 时会被清理。运行时文件放在 `public/maps`，仅进入收集器专题页后由浏览器按需加载，不会进入主 JavaScript bundle。

## 体积与简化

用户提供的原始 GeoJSON 包含 246 个国家/地区要素、73,328 个坐标点，大小约 1.40 MB。生成脚本采用 0.08° Douglas–Peucker 几何简化并保留所有要素和小型 polygon ring，输出约 482 KB、27,075 个坐标点；本次 gzip 测得约 168 KB。

重新生成：

```bash
npm run map:prepare
```

## 来源与使用边界

原始文件没有包含来源、版本或许可元数据。其结构类似常见的 Natural Earth 派生世界边界数据，但在来源确认前，项目不能把它表述为 Natural Earth 或其他机构的官方数据。它只作为非指标性的背景底图，不参与任何统计。

- RouteViews 圆点使用官方 collector API 返回的 `lat/lng`。
- RIPE RIS `rrc-info` 只提供城市名称，没有可靠的精确坐标；地图使用官方 `geographical_location` 对应的城市中心近似坐标，并显式标记为近似值。
- 地图点表示 collector 基础设施位置，不代表 peer、路由起源或观测覆盖范围；Multihop collector 尤其不能按所在城市解释其观测范围。

原始文件 SHA-256：`604ca4ac9993c38932d72bc69a309402e0f71afce0b2df4e6f728361c32ee93f`。
