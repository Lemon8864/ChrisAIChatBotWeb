import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const HISTORY_FILE = path.join(DATA_DIR, "histories.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");
const PUBLIC_DIR = path.join(__dirname, "../public");
const DEFAULT_CHARACTER_CONFIG_FILE = path.join(__dirname, "config", "character.json");

function splitList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

const DEFAULT_MODEL = process.env.DEFAULT_MODEL?.trim() || "your-model-name";
const DEFAULT_TEMPERATURE = Number(process.env.DEFAULT_TEMPERATURE) || 0.8;
const DEFAULT_MAX_TOKENS = Number(process.env.DEFAULT_MAX_TOKENS) || 4096;
const ALLOWED_MODELS = new Set(splitList(process.env.ALLOWED_MODELS || DEFAULT_MODEL));
const LLM_API_KEY = (process.env.LLM_API_KEY || "").trim();
const LLM_BASE_URL = (process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || "").trim();
let llmClient = null;

const DEFAULT_CHARACTER_CONFIG = Object.freeze({
  id: "assistant",
  displayName: "Assistant",
  userLabel: "User",
  appTitle: "AI Chat Terminal",
  moduleLabel: "CUSTOM ASSISTANT MODULE",
  bootText: "Conversation module is ready.",
  avatarUrl: "",
  initialAssistantMessage: "Hello, I am your configurable assistant. Edit server/config/character.json to replace this opening message.",
  hiddenStateReminder: "",
  systemPrompt: "You are a helpful assistant. Replace this prompt in server/config/character.json before deploying your template."
});

let characterConfig = { ...DEFAULT_CHARACTER_CONFIG };

// 每日 token 上限（管理员不受限）
const DAILY_TOKEN_LIMIT = Number(process.env.DAILY_TOKEN_LIMIT) || 30000;

// 每 IP 最大注册数
const MAX_REGISTER_PER_IP = Number(process.env.MAX_REGISTER_PER_IP) || 3;

// JWT 密钥
const JWT_SECRET = (process.env.JWT_SECRET || "").trim();

// ---------- 速率限制 ----------
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, msg: "请求太频繁，请稍后再试" }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, msg: "对话请求太频繁，请稍后再试" }
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, msg: "操作太频繁，请稍后再试" }
});

// ---------- CORS 白名单 ----------
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim())
  : [];

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.static(PUBLIC_DIR));
app.use(cookieParser());
app.use("/api/", globalLimiter);
app.use("/api/chat", chatLimiter);
app.use("/api/login", authLimiter);
app.use("/api/register", authLimiter);

// ---------- UA 过滤 ----------
const CLIENT_HEADER_VALUE = "AI-Chat-Template";
const allowedUA = /^Mozilla\/5\.0|AI-Chat-Template/i;
app.use("/api/", (req, res, next) => {
  const ua = req.headers["user-agent"] || "";
  if (!allowedUA.test(ua) && !req.cookies.access_token) {
    return res.status(403).json({ msg: "Forbidden" });
  }
  next();
});

function getLLMClient() {
  if (!LLM_API_KEY || !LLM_BASE_URL) {
    throw new Error("LLM_API_KEY 和 LLM_BASE_URL 尚未配置，请在 .env 中填写后再发起对话请求");
  }

  if (!llmClient) {
    llmClient = new OpenAI({
      apiKey: LLM_API_KEY,
      baseURL: LLM_BASE_URL
    });
  }

  return llmClient;
}

// ---------- 文件初始化 ----------
async function ensureDataFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(HISTORY_FILE);
  } catch {
    await fs.writeFile(HISTORY_FILE, JSON.stringify({}, null, 2), "utf-8");
  }
}

async function ensureUsersFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

async function ensureUsageFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(USAGE_FILE);
  } catch {
    await fs.writeFile(USAGE_FILE, JSON.stringify({}, null, 2), "utf-8");
  }
}

// ---------- 历史记录 ----------
async function readHistories() {
  await ensureDataFile();
  const raw = await fs.readFile(HISTORY_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

async function writeHistories(data) {
  await ensureDataFile();
  await fs.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function getHistoryKey(userId, character) {
  return `${character || "default"}::${userId || "anonymous"}`;
}

// ---------- 用户管理 ----------
async function readUsers() {
  await ensureUsersFile();
  const raw = await fs.readFile(USERS_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await ensureUsersFile();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

async function initAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminUsername || !adminPassword) return;

  const users = await readUsers();
  const existingAdmin = users.find(u => u.isAdmin);
  if (existingAdmin) return;

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);
  users.push({
    id: "user_admin_" + Date.now().toString(36),
    username: adminUsername,
    passwordHash,
    isAdmin: true,
    createdAt: new Date().toISOString()
  });
  await writeUsers(users);
  console.log(`✅ 管理员账户已创建：${adminUsername}`);
}

// ---------- 用量管理 ----------
async function readUsage() {
  await ensureUsageFile();
  const raw = await fs.readFile(USAGE_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeUsage(usage) {
  await ensureUsageFile();
  await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), "utf-8");
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getTodayUsage(userId) {
  const all = await readUsage();
  const userUsage = all[userId] || {};
  return userUsage[getTodayKey()] || { total_tokens: 0 };
}

async function addTodayUsage(userId, tokens) {
  if (!tokens || tokens <= 0) return;
  const all = await readUsage();
  if (!all[userId]) all[userId] = {};
  const today = getTodayKey();
  const current = all[userId][today] || { total_tokens: 0 };
  current.total_tokens += tokens;
  all[userId][today] = current;
  await writeUsage(all);
}

async function resetTodayUsage(username) {
  const users = await readUsers();
  const user = users.find(u => u.username === username);
  if (!user) throw new Error("用户不存在");

  const all = await readUsage();
  if (all[user.id]) {
    delete all[user.id][getTodayKey()];
    await writeUsage(all);
  }
}

// ---------- 工具函数 ----------
function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") return null;
  const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
  if (!role) return null;
  const content = typeof item.content === "string" ? item.content : "";
  if (!content.trim()) return null;
  return {
    id: item.id || createMessageId(),
    role,
    content,
    time: item.time || new Date().toISOString(),
    usage: normalizeUsage(item.usage),
    model: typeof item.model === "string" ? item.model : "",
    settings: normalizeSettings(item.settings)
  };
}

function normalizeHistoryArray(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeHistoryItem).filter(Boolean);
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    prompt_tokens: Number(usage.prompt_tokens || usage.promptTokens || 0),
    completion_tokens: Number(usage.completion_tokens || usage.completionTokens || 0),
    total_tokens: Number(usage.total_tokens || usage.totalTokens || 0)
  };
}

function normalizeSettings(settings) {
  if (!settings || typeof settings !== "object") return null;
  return {
    model: typeof settings.model === "string" ? settings.model : DEFAULT_MODEL,
    temperature: clampNumber(settings.temperature, 0, 2, DEFAULT_TEMPERATURE),
    max_tokens: clampInteger(settings.max_tokens, 1, 8192, DEFAULT_MAX_TOKENS)
  };
}

function createMessageId() {
  return "msg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInteger(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeModel(model) {
  if (typeof model !== "string" || !ALLOWED_MODELS.has(model)) return DEFAULT_MODEL;
  return model;
}

function normalizeCharacterConfig(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const config = {
    ...DEFAULT_CHARACTER_CONFIG,
    ...source
  };

  for (const key of [
    "id",
    "displayName",
    "userLabel",
    "appTitle",
    "moduleLabel",
    "bootText",
    "avatarUrl",
    "initialAssistantMessage",
    "hiddenStateReminder",
    "systemPrompt"
  ]) {
    config[key] = typeof config[key] === "string" ? config[key].trim() : DEFAULT_CHARACTER_CONFIG[key];
  }

  if (!config.id) config.id = DEFAULT_CHARACTER_CONFIG.id;
  if (!config.displayName) config.displayName = DEFAULT_CHARACTER_CONFIG.displayName;
  if (!config.userLabel) config.userLabel = DEFAULT_CHARACTER_CONFIG.userLabel;
  if (!config.initialAssistantMessage) config.initialAssistantMessage = DEFAULT_CHARACTER_CONFIG.initialAssistantMessage;
  if (!config.systemPrompt) config.systemPrompt = DEFAULT_CHARACTER_CONFIG.systemPrompt;

  return config;
}

async function loadCharacterConfig() {
  const configuredPath = process.env.CHARACTER_CONFIG_PATH?.trim();
  const configPath = configuredPath ? path.resolve(configuredPath) : DEFAULT_CHARACTER_CONFIG_FILE;

  try {
    const raw = await fs.readFile(configPath, "utf-8");
    return normalizeCharacterConfig(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`角色配置读取失败，已使用默认模板：${error.message}`);
    } else {
      console.warn("未找到 server/config/character.json，已使用默认空白角色模板。");
    }
    return normalizeCharacterConfig();
  }
}

function getPublicClientConfig() {
  return {
    character: {
      id: characterConfig.id,
      displayName: characterConfig.displayName,
      userLabel: characterConfig.userLabel,
      appTitle: characterConfig.appTitle,
      moduleLabel: characterConfig.moduleLabel,
      bootText: characterConfig.bootText,
      avatarUrl: characterConfig.avatarUrl,
      initialAssistantMessage: characterConfig.initialAssistantMessage
    },
    models: [...ALLOWED_MODELS],
    defaultModel: DEFAULT_MODEL,
    defaultTemperature: DEFAULT_TEMPERATURE,
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    dailyTokenLimit: DAILY_TOKEN_LIMIT
  };
}

function validateSecurityConfig() {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET 尚未配置。请复制 .env.example 为 .env，并填写一个足够随机的密钥。");
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getClientIP(req) {
  return req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "未知";
}

// ---------- JWT 工具 ----------
const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRE || "15m";
const REFRESH_EXPIRES = process.env.REFRESH_TOKEN_EXPIRE || "7d";

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.isAdmin || false, type: "access" },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, type: "refresh" },
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );
}

// ---------- 中间件 ----------
function verifyClientHeader(req, res, next) {
  if (req.headers["x-requested-with"] !== CLIENT_HEADER_VALUE) {
    return res.status(403).json({ success: false, code: 403, msg: "非法请求" });
  }
  next();
}

async function requireAccess(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) {
    return res.status(401).json({ success: false, code: 401, msg: "未登录，请先登录" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = await readUsers();
    const user = users.find(u => u.id === decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, code: 401, msg: "用户不存在或已被删除" });
    }
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.isAdmin = decoded.isAdmin || false;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, code: 401, msg: "令牌无效或已过期" });
  }
}

// ---------- 系统提示词 ----------
function buildSystemPrompt() {
  return characterConfig.systemPrompt;
}

function normalizeMessagesForLLM(history, newMessage) {
  const messages = [{ role: "system", content: buildSystemPrompt() }];
  const normalizedHistory = normalizeHistoryArray(history);
  const recentHistory = normalizedHistory.slice(-20);

  if (!recentHistory.length) {
    messages.push({
      role: "assistant",
      content: characterConfig.initialAssistantMessage
    });
  }

  for (const item of recentHistory) {
    messages.push({ role: item.role, content: item.content });
  }

  messages.push({
    role: "user",
    content: characterConfig.hiddenStateReminder
      ? `${newMessage}\n\n${characterConfig.hiddenStateReminder}`
      : newMessage
  });
  return messages;
}


// ---------- 路由 ----------
app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/api/client-config", (req, res) => {
  res.json({ success: true, ...getPublicClientConfig() });
});

// 注册（增加 IP 限制）
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, msg: "用户名和密码不能为空" });
    }
    const trimmedUsername = String(username).trim();
    if (trimmedUsername.length < 3) {
      return res.status(400).json({ success: false, msg: "用户名至少3个字符" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, msg: "密码至少6个字符" });
    }

    const users = await readUsers();
    if (users.find(u => u.username === trimmedUsername)) {
      return res.status(409).json({ success: false, msg: "用户名已被占用" });
    }

    const clientIP = getClientIP(req);
    const sameIPCount = users.filter(u => u.registerIP === clientIP).length;
    if (sameIPCount >= MAX_REGISTER_PER_IP) {
      return res.status(429).json({ success: false, msg: `当前 IP 注册账号数已达上限（${MAX_REGISTER_PER_IP}）` });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newUser = {
      id: "user_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2),
      username: trimmedUsername,
      passwordHash,
      isAdmin: false,
      registerIP: clientIP,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    await writeUsers(users);

    res.json({ success: true, code: 200, msg: "注册成功" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, msg: "注册失败" });
  }
});

// 登录（设置 Cookie）
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, msg: "用户名和密码不能为空" });
    }

    const users = await readUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(401).json({ success: false, msg: "用户名或密码错误" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, msg: "用户名或密码错误" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie("access_token", accessToken, {
      httpOnly: true,
      sameSite: "strict",
      // secure: true,   // 仅在 HTTPS 时开启
      maxAge: 15 * 60 * 1000
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      path: "/api/refresh",
      // secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      code: 200,
      username: user.username,
      userId: user.id,
      isAdmin: user.isAdmin || false
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, msg: "登录失败" });
  }
});

// 刷新 access token
app.post("/api/refresh", async (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ success: false, msg: "缺少刷新令牌" });
  }
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    if (decoded.type !== "refresh") throw new Error("Invalid token type");

    const users = await readUsers();
    const user = users.find(u => u.id === decoded.userId);
    if (!user) throw new Error("User not found");

    const newAccessToken = generateAccessToken(user);

    res.cookie("access_token", newAccessToken, {
      httpOnly: true,
      sameSite: "strict",
      // secure: true,
      maxAge: 15 * 60 * 1000
    });

    res.json({ success: true, code: 200 });
  } catch (error) {
    res.status(401).json({ success: false, msg: "刷新令牌无效或已过期" });
  }
});

// 退出登录
app.post("/api/logout", async (req, res) => {
  res.clearCookie("access_token");
  res.clearCookie("refresh_token", { path: "/api/refresh" });
  res.json({ success: true });
});

// 管理员重置密码
app.post("/api/reset-password", async (req, res) => {
  try {
    const { adminKey, username, newPassword } = req.body;
    if (!adminKey || !username || !newPassword) {
      return res.status(400).json({ success: false, msg: "参数不完整" });
    }

    const requiredAdminKey = process.env.ADMIN_RESET_KEY;
    if (!requiredAdminKey) {
      return res.status(500).json({ success: false, msg: "服务器未配置管理员重置密钥" });
    }

    if (adminKey !== requiredAdminKey) {
      return res.status(403).json({ success: false, msg: "管理员密钥错误" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, msg: "新密码至少6个字符" });
    }

    const users = await readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex === -1) {
      return res.status(404).json({ success: false, msg: "用户不存在" });
    }

    const salt = await bcrypt.genSalt(10);
    users[userIndex].passwordHash = await bcrypt.hash(newPassword, salt);
    await writeUsers(users);

    res.json({ success: true, code: 200, msg: `用户 ${username} 的密码已重置` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, msg: "重置密码失败" });
  }
});

// 管理员重置用户当日用量
app.post("/api/reset-usage", async (req, res) => {
  try {
    const { adminKey, username } = req.body;
    if (!adminKey || !username) {
      return res.status(400).json({ success: false, msg: "参数不完整" });
    }

    const requiredAdminKey = process.env.ADMIN_RESET_KEY;
    if (!requiredAdminKey) {
      return res.status(500).json({ success: false, msg: "服务器未配置管理员重置密钥" });
    }

    if (adminKey !== requiredAdminKey) {
      return res.status(403).json({ success: false, msg: "管理员密钥错误" });
    }

    await resetTodayUsage(username);
    res.json({ success: true, code: 200, msg: `用户 ${username} 的当日用量已重置` });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, msg: error.message || "重置失败" });
  }
});

// 查看今日用量
app.get("/api/my-usage", verifyClientHeader, requireAccess, async (req, res) => {
  try {
    const usage = await getTodayUsage(req.userId);
    const remaining = Math.max(0, DAILY_TOKEN_LIMIT - usage.total_tokens);
    res.json({ success: true, total_used: usage.total_tokens, limit: DAILY_TOKEN_LIMIT, remaining });
  } catch (error) {
    res.status(500).json({ success: false, msg: "获取用量失败" });
  }
});

// 聊天（受保护 + 用量检查）
app.post("/api/chat", verifyClientHeader, requireAccess, async (req, res) => {
  try {
    const userId = req.userId;
    const isAdmin = req.isAdmin;
    const { character, message, model, temperature, max_tokens } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, code: 400, msg: "消息不能为空" });
    }

    // 每日用量检查（管理员跳过）
    if (!isAdmin) {
      const todayUsage = await getTodayUsage(userId);
      if (todayUsage.total_tokens >= DAILY_TOKEN_LIMIT) {
        return res.status(429).json({
          success: false,
          code: 429,
          msg: `您今日的 token 用量已达上限（${DAILY_TOKEN_LIMIT}），请明天再试或联系管理员重置。`
        });
      }
    }

    const selectedModel = normalizeModel(model);
    const selectedTemperature = clampNumber(temperature, 0, 2, DEFAULT_TEMPERATURE);
    const selectedMaxTokens = clampInteger(max_tokens, 1, 30000, DEFAULT_MAX_TOKENS);

    const histories = await readHistories();
    const key = getHistoryKey(userId, character);
    const history = normalizeHistoryArray(histories[key] || []);

    const llmMessages = normalizeMessagesForLLM(history, message);

    const completion = await getLLMClient().chat.completions.create({
      model: selectedModel,
      messages: llmMessages,
      temperature: selectedTemperature,
      max_tokens: selectedMaxTokens
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "（模型接口没有返回有效内容。）";
    const usageData = normalizeUsage(completion.usage) || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };

    await addTodayUsage(userId, usageData.total_tokens);

    const settings = {
      model: selectedModel,
      temperature: selectedTemperature,
      max_tokens: selectedMaxTokens
    };

    const userMessage = {
      id: createMessageId(),
      role: "user",
      content: message,
      time: new Date().toISOString(),
      usage: null,
      model: selectedModel,
      settings
    };

    const assistantMessage = {
      id: createMessageId(),
      role: "assistant",
      content: reply,
      time: new Date().toISOString(),
      usage: usageData,
      model: selectedModel,
      settings
    };

    history.push(userMessage);
    history.push(assistantMessage);
    histories[key] = history;
    await writeHistories(histories);

    res.json({
      success: true,
      code: 200,
      reply,
      usage: usageData,
      model: selectedModel,
      settings,
      assistantMessage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      code: 500,
      msg: "模型接口请求失败",
      detail: error.message
    });
  }
});

// 获取历史
app.post("/api/history", verifyClientHeader, requireAccess, async (req, res) => {
  try {
    const userId = req.userId;
    const { character } = req.body;
    const histories = await readHistories();
    const key = getHistoryKey(userId, character);
    const data = normalizeHistoryArray(histories[key] || []);
    histories[key] = data;
    await writeHistories(histories);
    res.json({ success: true, code: 200, data });
  } catch (error) {
    res.status(500).json({ success: false, code: 500, msg: error.message });
  }
});

// 清空历史
app.post("/api/clear-history", verifyClientHeader, requireAccess, async (req, res) => {
  try {
    const userId = req.userId;
    const { character } = req.body;
    const histories = await readHistories();
    const key = getHistoryKey(userId, character);
    histories[key] = [];
    await writeHistories(histories);
    res.json({ success: true, code: 200, msg: "后端聊天记录已清空" });
  } catch (error) {
    res.status(500).json({ success: false, code: 500, msg: error.message });
  }
});

// 导入历史
app.post("/api/import-history", verifyClientHeader, requireAccess, async (req, res) => {
  try {
    const userId = req.userId;
    const { character, text, mode } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, code: 400, msg: "导入内容为空" });
    }

    const imported = parseImportedContent(text);
    const histories = await readHistories();
    const key = getHistoryKey(userId, character);

    if (mode === "clear") {
      histories[key] = imported;
    } else {
      histories[key] = [
        ...normalizeHistoryArray(histories[key] || []),
        ...imported
      ];
    }
    await writeHistories(histories);

    res.json({
      success: true,
      code: 200,
      msg: `导入完成，共导入 ${imported.length} 条消息`,
      data: histories[key]
    });
  } catch (error) {
    res.status(500).json({ success: false, code: 500, msg: error.message });
  }
});

// ---------- 导入解析函数 ----------
function tryParseJsonImport(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return normalizeHistoryArray(parsed);
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.messages)) return normalizeHistoryArray(parsed.messages);
      if (Array.isArray(parsed.history)) return normalizeHistoryArray(parsed.history);
      if (Array.isArray(parsed.data)) return normalizeHistoryArray(parsed.data);
    }
    return [];
  } catch { return []; }
}

function parseUsageLine(line) {
  const promptMatch = line.match(/prompt[_\s-]*tokens?\s*[:：=]\s*(\d+)/i) || line.match(/输入\s*[:：=]\s*(\d+)/);
  const completionMatch = line.match(/completion[_\s-]*tokens?\s*[:：=]\s*(\d+)/i) || line.match(/输出\s*[:：=]\s*(\d+)/);
  const totalMatch = line.match(/total[_\s-]*tokens?\s*[:：=]\s*(\d+)/i) || line.match(/总计\s*[:：=]\s*(\d+)/);

  const usage = {
    prompt_tokens: promptMatch ? Number(promptMatch[1]) : 0,
    completion_tokens: completionMatch ? Number(completionMatch[1]) : 0,
    total_tokens: totalMatch ? Number(totalMatch[1]) : 0
  };

  if (!usage.prompt_tokens && !usage.completion_tokens && !usage.total_tokens) {
    return null;
  }

  return usage;
}

function parseReadableTxtImport(text) {
  const result = [];

  const lines = text.split(/\r?\n/);
  const userLabelPattern = escapeRegExp(characterConfig.userLabel || DEFAULT_CHARACTER_CONFIG.userLabel);
  const assistantLabelPattern = escapeRegExp(characterConfig.displayName || DEFAULT_CHARACTER_CONFIG.displayName);
  const userLinePattern = new RegExp(`^${userLabelPattern}\\s*>`);
  const assistantLinePattern = new RegExp(`^${assistantLabelPattern}\\s*>`);
  const userLineReplacePattern = new RegExp(`^${userLabelPattern}\\s*>\\s*`);
  const assistantLineReplacePattern = new RegExp(`^${assistantLabelPattern}\\s*>\\s*`);

  let currentRole = null;
  let buffer = [];
  let currentUsage = null;

  function flush() {
    if (!currentRole) {
      buffer = [];
      currentUsage = null;
      return;
    }

    const content = buffer.join("\n").trim();

    if (content) {
      result.push({
        id: createMessageId(),
        role: currentRole,
        content,
        time: new Date().toISOString(),
        usage: currentUsage,
        model: "",
        settings: null
      });
    }

    currentRole = null;
    buffer = [];
    currentUsage = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (userLinePattern.test(trimmed)) {
      flush();
      currentRole = "user";

      const rest = trimmed.replace(userLineReplacePattern, "").trim();

      if (rest) buffer.push(rest);

      continue;
    }

    if (assistantLinePattern.test(trimmed)) {
      flush();
      currentRole = "assistant";

      const rest = trimmed.replace(assistantLineReplacePattern, "").trim();

      if (rest) buffer.push(rest);

      continue;
    }

    if (/^\[Token\s*Usage\]/i.test(trimmed) || /^Token\s*Usage/i.test(trimmed) || /^用量\s*[:：]/.test(trimmed)) {
      currentUsage = parseUsageLine(trimmed);
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      continue;
    }

    if (/^【.*】$/.test(trimmed)) {
      continue;
    }

    if (/^生成时间\s*[:：]/.test(trimmed)) {
      continue;
    }

    if (/^设置\s*[:：]/.test(trimmed)) {
      continue;
    }

    if (currentRole) {
      buffer.push(line);
    }
  }

  flush();

  return normalizeHistoryArray(result);
}

function parseImportedContent(text) {
  const jsonItems = tryParseJsonImport(text);

  if (jsonItems.length) {
    return jsonItems;
  }

  return parseReadableTxtImport(text);
}

// ---------- 启动服务 ----------
async function start() {
  validateSecurityConfig();
  characterConfig = await loadCharacterConfig();
  await initAdminUser();
  app.listen(PORT, () => {
    console.log(`${characterConfig.appTitle} running at http://localhost:${PORT}`);
  });
}

start();
