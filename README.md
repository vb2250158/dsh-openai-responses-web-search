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
    searchProvider: openai-responses
```

源码和公开示例不保存真实地址或凭据。

## 验证

```powershell
pnpm test
npm pack --dry-run
```

## 许可证

MIT

## Plugin display metadata

The plugin list shows **Responses web search** in English and **Responses 联网搜索** in Chinese, following the DSH interface language. `locale/en.json` and `locale/zh.json` provide the title and description; `icon.svg` supplies self-contained artwork. The package exports and publishes these resources. The icon is adapted from Lucide; see [ICON_LICENSE.txt](ICON_LICENSE.txt).
