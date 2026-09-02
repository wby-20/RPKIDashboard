# 收集器地图资源

## 来源

底图来自 **Natural Earth Admin 0 – Countries (China POV), version 5.1.1**，比例尺为 1:10m。China POV 是 Natural Earth 提供的 point-of-view 变体，用于表达中国法定及本地惯例下的行政边界视角。

- 数据集：https://www.naturalearthdata.com/blog/admin-0-countries-point-of-views/
- POV 说明：https://www.naturalearthdata.com/about/disputed-boundaries-policy/
- 使用条款：https://www.naturalearthdata.com/about/terms-of-use/

Natural Earth 声明其矢量和栅格数据属于 public domain，不强制署名。项目保留推荐署名：**Made with Natural Earth**。

## 文件

- `data/maps/world.geo.json`：原始 GeoJSON，约 1.4 MB，246 个国家/地区要素、73,328 个坐标点。
- `public/maps/world-countries.geojson`：前端运行版本，约 493 KB、27,075 个坐标点，gzip 后约 168 KB。
- `scripts/prepare-world-map.mjs`：地图简化脚本。

原始文件不能放在 `dist/`，因为 Vite 构建会清理该目录。运行版本位于 `public/maps/`，仅在打开公共收集器页面时加载。

重新生成：

```bash
npm run map:prepare
```

## 地图口径

- RouteViews 节点使用官方 collector API 返回的经纬度。
- RIPE RIS 使用官方城市名称对应的城市中心近似坐标，不表示机房精确位置。
- 地图点表示 collector 基础设施位置，不表示 peer、路由起源或观测覆盖范围。
- 同址 collector 聚合为一个带数量的圆点。

原始文件 SHA-256：`604ca4ac9993c38932d72bc69a309402e0f71afce0b2df4e6f728361c32ee93f`。
