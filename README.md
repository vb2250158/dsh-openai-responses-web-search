# dsh-openai-responses-web-search

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
