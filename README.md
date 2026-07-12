# 可配置 AI 聊天模板

这是一个可开源发布的 AI 聊天 Web 模板。仓库中不内置 API Key、管理员密码、JWT 密钥或固定角色提示词；所有私密内容和角色内容都由部署者在本地填写。

## 目录说明

- `public/`：前端静态页面、样式和浏览器端逻辑。
- `server/`：Express 后端，负责登录、历史记录、用量限制和模型接口转发。
- `server/.env.example`：环境变量模板，包含所有可填写参数的中文注释。
- `server/config/character.example.json`：角色配置模板，包含角色名、用户称呼、开场白和系统提示词。
- `server/data/`：运行后自动生成的用户、历史和用量数据，不应提交。

## 部署步骤

1. 进入服务端目录：

```bash
cd server
```

2. 安装依赖：

```bash
npm install
```

3. 复制环境变量模板：

```bash
copy .env.example .env
```

macOS 或 Linux 使用：

```bash
cp .env.example .env
```

4. 打开 `server/.env`，填写模型接口、密钥、JWT 密钥等参数。

5. 复制角色配置模板：

```bash
copy config\character.example.json config\character.json
```

macOS 或 Linux 使用：

```bash
cp config/character.example.json config/character.json
```

6. 打开 `server/config/character.json`，填写你的角色名称、头像、开场白和系统提示词。

7. 启动服务：

```bash
npm run dev
```

8. 浏览器访问：

```text
http://localhost:3000
```

如果你在 `.env` 中修改了 `PORT`，请访问对应端口。

## `.env` 参数说明

`PORT`：服务端监听端口。留空默认 `3000`。

`LLM_API_KEY`：模型供应商的 API Key。必须填写，且不要提交到公开仓库。

`LLM_BASE_URL`：OpenAI 兼容接口地址。示例格式：`https://api.example.com/v1`。不同供应商地址不同，请以供应商文档为准。

`DEFAULT_MODEL`：默认模型名称。必须是供应商支持的真实模型名。

`ALLOWED_MODELS`：前端下拉框允许选择的模型列表，多个模型用英文逗号分隔，例如 `model-a,model-b`。建议包含 `DEFAULT_MODEL`。

`DEFAULT_TEMPERATURE`：默认温度，控制回复随机性。常用范围是 `0.2` 到 `1.0`；越高越发散，越低越稳定。留空默认 `0.8`。

`DEFAULT_MAX_TOKENS`：单次回复最大 token 数。按模型限制填写，留空默认 `4096`。

`JWT_SECRET`：登录令牌签名密钥。必须填写，建议使用 32 位以上随机字符串。没有它服务端会拒绝启动。

`ADMIN_USERNAME`：初始管理员用户名。留空则不自动创建管理员账号。

`ADMIN_PASSWORD`：初始管理员密码。只有同时填写 `ADMIN_USERNAME` 时才会创建管理员。

`ADMIN_RESET_KEY`：管理员重置用户密码和当日用量时使用的独立密钥。需要重置功能时填写。

`ALLOWED_ORIGINS`：允许跨域访问的前端来源，多个地址用英文逗号分隔。留空表示允许任意来源；生产环境建议填写明确域名。

`ACCESS_TOKEN_EXPIRE`：Access Token 有效期，例如 `15m`、`1h`。留空默认 `15m`。

`REFRESH_TOKEN_EXPIRE`：Refresh Token 有效期，例如 `7d`、`30d`。留空默认 `7d`。

`DAILY_TOKEN_LIMIT`：普通用户每日 token 上限。管理员不受此限制。留空默认 `30000`。

`MAX_REGISTER_PER_IP`：同一 IP 最多注册账号数。留空默认 `3`。

`CHARACTER_CONFIG_PATH`：自定义角色配置文件路径。留空时读取 `server/config/character.json`。

## 角色配置说明

复制 `server/config/character.example.json` 为 `server/config/character.json` 后再改。示例文件中的 `__说明` 和 `__字段说明` 是注释字段，服务端会忽略。

`id`：角色唯一标识。建议只使用英文、数字、下划线或短横线，例如 `assistant`、`writing-coach`。

`displayName`：助手显示名，例如 `Assistant`、`写作助手`、`客服助手`。

`userLabel`：用户称呼，例如 `User`、`访客`、`管理员`。

`appTitle`：应用标题，会显示在浏览器标题和顶部栏。

`moduleLabel`：模块副标题，用于描述当前角色或项目。

`bootText`：登录后的加载提示文字。

`avatarUrl`：助手头像地址。可以填 `./assets/avatar.png`，也可以填 HTTPS 图片地址。留空时前端显示角色名首字母。

`initialAssistantMessage`：首次进入且没有历史记录时显示的助手开场白。

`hiddenStateReminder`：每次用户输入后附加给模型的隐藏提醒。可用于提醒模型保持某种输出格式；不需要时留空。

`systemPrompt`：最重要的角色提示词。建议写清楚角色身份、能力边界、语气风格、禁止事项、输出格式和安全要求。

## 开源前检查

- 不要提交 `server/.env`。
- 不要提交 `server/config/character.json`，除非你确认里面没有私密角色设定。
- 不要提交 `server/data/`。
- 发布前运行：

```bash
rg -n "api_key|apikey|secret|password|token|Bearer|Authorization|密钥|密码" .
```

检查结果里只应出现变量名、说明文字或登录逻辑，不应出现真实密钥和密码。
