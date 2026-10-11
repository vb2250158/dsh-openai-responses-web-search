# Changelog

## 0.1.5 (2026-10-11)

- Add the `model-native` backend: route Codex, Grok, and Claude subscription requests to their own native web search service; retain configured Responses search for other routes. Preserve HTTP status and service identity in gateway errors, and require the hosted search tool.
- 增加随当前模型路由的 `model-native` 搜索后端；订阅模型调用各自原生搜索，其余路由保留配置的 Responses 服务；网关错误保留 HTTP 状态与服务身份。

## 0.1.4 (2026-10-07)

- 缩小图标绘制内容约三分之一，增加方框内的留白。
- Reduce icon artwork by one third with a centered, padded viewBox.

## 0.1.3 (2026-10-07)

- 为插件列表提供中英文名称与说明，并发布独立的 SVG 图标。
- Publish English and Chinese plugin display metadata and a dedicated SVG icon.
