# dsh-openai-responses-web-search

This release requires DSH 0.2.1-alpha.1 or a compatible 0.2 release. See [compatibility details](docs/dsh-0.2-compatibility.md).

通过兼容 OpenAI Responses API 的服务为 DSH 提供联网搜索。

## 安装

锁定公开仓库的提交后，通过 DSH 官方入口安装：

```powershell
pnpm dsh plugin --profile web add github:vb2250158/dsh-openai-responses-web-search#<commit>
```

## 配置

地址、凭据环境变量名和模型保存在私有 profile 配置中：

```yaml
- id: openai-responses-web-search
  config:
    baseURL: https://api.example.test/v1
    apiKeyEnv: OPENAI_API_KEY
    model: your-model

- id: web
  config:
    searchProvider: model-native
```

`model-native` 根据当前发起工具调用的会话请求选择服务：`codex`、`grok`、`claude` 调用 Subscriptions 0.7.16 提供的原生搜索，使用当前模型 ID 和对应订阅登录；其他路由、没有发起会话的调用使用上述明确配置的 Responses 服务。`nativeProviders` 可配置参与原生搜索的订阅路由，默认三者都启用。保留 `searchProvider: openai-responses` 可继续固定使用 Responses 后端。缺少原生服务或登录时明确失败，不自动切回网关。

HTTP 错误保留服务地址与状态码；502 提示检查搜索网关的上游连通性及 `web_search` 支持。原生 Grok 与 Claude 协议分别见 [xAI Web Search](https://docs.x.ai/developers/tools/web-search) 和 [Claude Web Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)。源码和公开示例不保存真实地址或凭据。

## 验证

```powershell
pnpm test
npm pack --dry-run
```

## 许可证

MIT

## Plugin display metadata

The plugin list shows **Responses web search** in English and **Responses 联网搜索** in Chinese, following the DSH interface language. `locale/en.json` and `locale/zh.json` provide the title and description; `icon.svg` supplies self-contained artwork. The package exports and publishes these resources. The icon is adapted from Lucide; see [ICON_LICENSE.txt](ICON_LICENSE.txt).

The icon uses a centered 36 × 36 viewBox to leave more space around the artwork inside the plugin icon frame.
