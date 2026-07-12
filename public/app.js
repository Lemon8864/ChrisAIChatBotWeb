const API = {
  login: "/api/login",
  register: "/api/register",
  refresh: "/api/refresh",
  logout: "/api/logout",
  myUsage: "/api/my-usage",
  resetPassword: "/api/reset-password",
  resetUsage: "/api/reset-usage",
  chat: "/api/chat",
  history: "/api/history",
  clearHistory: "/api/clear-history",
  importHistory: "/api/import-history",
  clientConfig: "/api/client-config"
};

const DEFAULT_CLIENT_CONFIG = {
  character: {
    id: "assistant",
    displayName: "Assistant",
    userLabel: "User",
    appTitle: "AI Chat Terminal",
    moduleLabel: "CUSTOM ASSISTANT MODULE",
    bootText: "Conversation module is ready.",
    avatarUrl: "",
    initialAssistantMessage: "Hello, I am your configurable assistant. Edit server/config/character.json to replace this opening message."
  },
  models: ["your-model-name"],
  defaultModel: "your-model-name",
  defaultTemperature: 0.8,
  defaultMaxTokens: 4096,
  dailyTokenLimit: 30000
};

let clientConfig = JSON.parse(JSON.stringify(DEFAULT_CLIENT_CONFIG));
let CHARACTER = clientConfig.character.id;
let AUTH_USER_KEY = "chat_template_auth_user";
let LOCAL_CHAT_KEY = "chat_template_assistant_local_chat_history";
let SETTINGS_KEY = "chat_template_assistant_model_settings";
let USER_AVATAR_KEY = "chat_template_user_avatar";
let INITIAL_ASSISTANT_MESSAGE = clientConfig.character.initialAssistantMessage;


const accessGate = document.getElementById("accessGate");
const bootLoader = document.getElementById("bootLoader");
const chatShell = document.getElementById("chatShell");

const authSubtitle = document.getElementById("authSubtitle");
const authNormal = document.getElementById("authNormal");
const authReset = document.getElementById("authReset");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const resetAdminKeyInput = document.getElementById("resetAdminKeyInput");
const resetUsernameInput = document.getElementById("resetUsernameInput");
const resetNewPasswordInput = document.getElementById("resetNewPasswordInput");
const resetSubmitBtn = document.getElementById("resetSubmitBtn");
const backToLoginLink = document.getElementById("backToLoginLink");
const authError = document.getElementById("authError");

const chatLog = document.getElementById("chatLog");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const avatarBtn = document.getElementById("avatarBtn");
const avatarInput = document.getElementById("avatarInput");
const downloadBtn = document.getElementById("downloadBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const importBtn = document.getElementById("importBtn");
const clearBtn = document.getElementById("clearBtn");
const resetUsageBtn = document.getElementById("resetUsageBtn");
const lockBtn = document.getElementById("lockBtn");
const fileInput = document.getElementById("fileInput");

const modelSelect = document.getElementById("modelSelect");
const temperatureInput = document.getElementById("temperatureInput");

const messageCount = document.getElementById("messageCount");
const lastTokenCount = document.getElementById("lastTokenCount");
const tokenRemainingBig = document.getElementById("tokenRemainingBig");
const tokenUsed = document.getElementById("tokenUsed");
const tokenLimit = document.getElementById("tokenLimit");
const tokenProgressFill = document.getElementById("tokenProgressFill");

const resetUsageDialog = document.getElementById("resetUsageDialog");
const resetUsageAdminKey = document.getElementById("resetUsageAdminKey");
const resetUsageUsername = document.getElementById("resetUsageUsername");
const resetUsageConfirm = document.getElementById("resetUsageConfirm");
const resetUsageCancel = document.getElementById("resetUsageCancel");
const resetUsageError = document.getElementById("resetUsageError");
const accessLogo = document.querySelector(".access-logo");
const brandMark = document.querySelector(".brand-mark");
const brandTitle = document.querySelector(".brand-text h1");
const brandSubtitle = document.querySelector(".brand-text p");
const glitchText = document.querySelector(".glitch-text");
const inputPrefix = document.querySelector(".input-prefix");
const settingHint = document.querySelector(".setting-hint");

let isSending = false;
let currentMode = "login";
let currentUserIsAdmin = false;
let currentUserAvatar = "";

/* ===== 界面切换 ===== */
function setView(viewName) {
  accessGate.classList.remove("active");
  bootLoader.classList.remove("active");
  chatShell.classList.remove("active");

  document.body.classList.remove("view-login", "view-boot", "view-chat");

  if (viewName === "login") {
    accessGate.classList.add("active");
    document.body.classList.add("view-login");
  }

  if (viewName === "boot") {
    bootLoader.classList.add("active");
    document.body.classList.add("view-boot");
  }

  if (viewName === "chat") {
    chatShell.classList.add("active");
    document.body.classList.add("view-chat");
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeClientConfig(data) {
  const config = JSON.parse(JSON.stringify(DEFAULT_CLIENT_CONFIG));
  const character = data?.character && typeof data.character === "object" ? data.character : {};

  config.character = {
    ...config.character,
    ...character
  };
  config.character.id = safeText(config.character.id, DEFAULT_CLIENT_CONFIG.character.id);
  config.character.displayName = safeText(config.character.displayName, DEFAULT_CLIENT_CONFIG.character.displayName);
  config.character.userLabel = safeText(config.character.userLabel, DEFAULT_CLIENT_CONFIG.character.userLabel);
  config.character.appTitle = safeText(config.character.appTitle, DEFAULT_CLIENT_CONFIG.character.appTitle);
  config.character.moduleLabel = safeText(config.character.moduleLabel, DEFAULT_CLIENT_CONFIG.character.moduleLabel);
  config.character.bootText = safeText(config.character.bootText, DEFAULT_CLIENT_CONFIG.character.bootText);
  config.character.initialAssistantMessage = safeText(
    config.character.initialAssistantMessage,
    DEFAULT_CLIENT_CONFIG.character.initialAssistantMessage
  );

  const models = Array.isArray(data?.models) ? data.models.map(String).map(item => item.trim()).filter(Boolean) : [];
  config.models = models.length ? models : DEFAULT_CLIENT_CONFIG.models;
  config.defaultModel = safeText(data?.defaultModel, config.models[0]);
  config.defaultTemperature = Number.isFinite(Number(data?.defaultTemperature))
    ? Number(data.defaultTemperature)
    : DEFAULT_CLIENT_CONFIG.defaultTemperature;
  config.defaultMaxTokens = Number.isFinite(Number(data?.defaultMaxTokens))
    ? Number(data.defaultMaxTokens)
    : DEFAULT_CLIENT_CONFIG.defaultMaxTokens;
  config.dailyTokenLimit = Number.isFinite(Number(data?.dailyTokenLimit))
    ? Number(data.dailyTokenLimit)
    : DEFAULT_CLIENT_CONFIG.dailyTokenLimit;

  return config;
}

function setStorageKeys() {
  const safeId = clientConfig.character.id.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  CHARACTER = clientConfig.character.id;
  AUTH_USER_KEY = "chat_template_auth_user";
  LOCAL_CHAT_KEY = `chat_template_${safeId}_local_chat_history`;
  SETTINGS_KEY = `chat_template_${safeId}_model_settings`;
  USER_AVATAR_KEY = "chat_template_user_avatar";
  INITIAL_ASSISTANT_MESSAGE = clientConfig.character.initialAssistantMessage;
}

function setText(node, text) {
  if (node) node.textContent = text;
}

function applyClientConfig() {
  const character = clientConfig.character;
  const mark = character.displayName.slice(0, 1).toUpperCase() || "A";

  document.title = character.appTitle;
  setText(accessLogo, mark);
  setText(brandMark, mark);
  setText(brandTitle, character.appTitle);
  setText(brandSubtitle, character.moduleLabel);
  setText(glitchText, character.bootText);
  if (glitchText) glitchText.dataset.text = character.bootText;
  setText(inputPrefix, `${character.userLabel} >`);
  setText(settingHint, "当前参数会随每次请求发送给配置的模型接口。");

  modelSelect.innerHTML = "";
  const modelValues = clientConfig.models.includes(clientConfig.defaultModel)
    ? clientConfig.models
    : [clientConfig.defaultModel, ...clientConfig.models];

  for (const model of modelValues) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  }
  modelSelect.value = clientConfig.defaultModel;
  temperatureInput.value = String(clientConfig.defaultTemperature);
  tokenLimit.textContent = formatNumber(clientConfig.dailyTokenLimit);
}

async function loadClientConfig() {
  try {
    const res = await fetch(API.clientConfig, {
      headers: { "X-Requested-With": "AI-Chat-Template" },
      credentials: "include"
    });
    if (!res.ok) throw new Error("配置接口不可用");
    clientConfig = normalizeClientConfig(await res.json());
  } catch (error) {
    console.warn("使用默认前端配置：", error.message);
    clientConfig = normalizeClientConfig(DEFAULT_CLIENT_CONFIG);
  }

  setStorageKeys();
  applyClientConfig();
}

/* ===== 工具函数 ===== */
function createMessageId() {
  return "msg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderMarkdown(text) {
  if (!window.marked || !window.DOMPurify) {
    return escapeHtml(text);
  }

  marked.setOptions({
    breaks: true,
    gfm: true
  });

  let source = String(text || "");

  source = source.replace(/^```(?:html|markdown|md)?\s*\n([\s\S]*?)\n```$/i, "$1");

  source = source
    .replace(/&lt;(\/?details.*?)&gt;/gi, "<$1>")
    .replace(/&lt;(\/?summary.*?)&gt;/gi, "<$1>")
    .replace(/<details&gt;/gi, "<details>")
    .replace(/<\/details&gt;/gi, "</details>")
    .replace(/<summary&gt;/gi, "<summary>")
    .replace(/<\/summary&gt;/gi, "</summary>");

  if (
    source.includes("【时间】") &&
    source.includes("【地点】") &&
    !/<details[\s>]/i.test(source)
  ) {
    source = `<details class="status-details"><summary>当前状态（点击展开）</summary>\n\n${source}\n\n</details>`;
  }

  const rawHtml = marked.parse(source);

  return DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ["details", "summary"],
    ADD_ATTR: ["class"],
    FORBID_ATTR: ["style", "onclick", "onload", "onerror"]
  });
}


function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    prompt_tokens: Number(usage.prompt_tokens || usage.promptTokens || 0),
    completion_tokens: Number(usage.completion_tokens || usage.completionTokens || 0),
    total_tokens: Number(usage.total_tokens || usage.totalTokens || 0)
  };
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString();
}

function getCurrentSettings() {
  const model = modelSelect.value || clientConfig.defaultModel;
  const temperature = clampNumber(temperatureInput.value, 0, 2, clientConfig.defaultTemperature);
  return { model, temperature };
}

function saveSettings() {
  const settings = getCurrentSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const settings = JSON.parse(raw);
    if (settings.model) modelSelect.value = settings.model;
    if (settings.temperature !== undefined) temperatureInput.value = settings.temperature;
  } catch {}
}

function normalizeMessageItem(item) {
  if (!item || typeof item !== "object") return null;
  const role =
    item.role === "assistant"
      ? "assistant"
      : item.role === "user"
      ? "user"
      : null;
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
    settings:
      item.settings && typeof item.settings === "object"
        ? item.settings
        : null
  };
}

function normalizeHistoryArray(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeMessageItem).filter(Boolean);
}

function scrollToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateMessageCount() {
  const count = chatLog.querySelectorAll(".message-row").length;
  messageCount.textContent = count;
}

function updateLastTokenCount(usage) {
  const normalized = normalizeUsage(usage);
  if (!normalized) {
    lastTokenCount.textContent = "0";
    return;
  }
  lastTokenCount.textContent = String(normalized.total_tokens || 0);
}

function updateTokenPanel(data) {
  if (!data || !data.success) return;

  const used = Number(data.total_used || 0);
  const limit = Number(data.limit || 30000);
  const remaining = Math.max(0, Number(data.remaining || 0));
  const percentUsed = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;

  tokenRemainingBig.textContent = formatNumber(remaining);
  tokenUsed.textContent = formatNumber(used);
  tokenLimit.textContent = formatNumber(limit);
  tokenProgressFill.style.width = `${percentUsed}%`;

  if (remaining <= limit * 0.15) {
    tokenRemainingBig.classList.add("low");
    tokenProgressFill.classList.add("danger");
  } else {
    tokenRemainingBig.classList.remove("low");
    tokenProgressFill.classList.remove("danger");
  }
}

function addSystemLine(text) {
  const div = document.createElement("div");
  div.className = "system-line";
  div.innerHTML = `<span class="system-prefix">›</span>${escapeHtml(text)}`;
  chatLog.appendChild(div);
  scrollToBottom();
}

function createUsageLine(usage, model) {
  const normalized = normalizeUsage(usage);
  if (!normalized) return null;
  const line = document.createElement("div");
  line.className = "usage-line";
  const chip = document.createElement("span");
  chip.className = "usage-chip";
  chip.textContent =
    `Token: prompt ${normalized.prompt_tokens || 0}` +
    ` / completion ${normalized.completion_tokens || 0}` +
    ` / total ${normalized.total_tokens || 0}` +
    (model ? ` · ${model}` : "");
  line.appendChild(chip);
  return line;
}

/* ===== 头像 ===== */
function loadUserAvatar() {
  currentUserAvatar = localStorage.getItem(USER_AVATAR_KEY) || "";
}

function saveUserAvatar(dataUrl) {
  currentUserAvatar = dataUrl;
  localStorage.setItem(USER_AVATAR_KEY, dataUrl);
}

function createUserAvatarElement() {
  if (currentUserAvatar) {
    const avatar = document.createElement("img");
    avatar.className = "user-avatar-img";
    avatar.src = currentUserAvatar;
    avatar.alt = clientConfig.character.userLabel;
    avatar.onerror = () => {
      avatar.remove();
      currentUserAvatar = "";
      localStorage.removeItem(USER_AVATAR_KEY);
    };
    return avatar;
  }

  const avatar = document.createElement("div");
  avatar.className = "user-avatar";
  avatar.textContent = clientConfig.character.userLabel.slice(0, 1).toUpperCase() || "U";
  return avatar;
}

function createAssistantAvatarElement() {
  const avatarUrl = clientConfig.character.avatarUrl;
  if (avatarUrl) {
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = avatarUrl;
    avatar.alt = clientConfig.character.displayName;
    avatar.onerror = () => { avatar.style.display = "none"; };
    return avatar;
  }

  const avatar = document.createElement("div");
  avatar.className = "avatar user-avatar";
  avatar.textContent = clientConfig.character.displayName.slice(0, 1).toUpperCase() || "A";
  return avatar;
}

function handleAvatarUpload(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    addSystemLine("头像上传失败：请选择图片文件。");
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    addSystemLine("头像上传失败：图片不能超过 2MB。");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    if (!dataUrl.startsWith("data:image/")) {
      addSystemLine("头像上传失败：图片格式无法识别。");
      return;
    }
    saveUserAvatar(dataUrl);
    addSystemLine(`${clientConfig.character.userLabel}头像已更新。新的头像会在后续消息中显示。`);
  };
  reader.onerror = () => addSystemLine("头像上传失败：无法读取文件。");
  reader.readAsDataURL(file);
}

/* ===== 消息渲染 ===== */
function addMessage(role, content, options = {}) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  if (role === "assistant") {
    const avatar = createAssistantAvatarElement();

    const contentWrap = document.createElement("div");
    contentWrap.className = "message-content";

    const name = document.createElement("div");
    name.className = "message-name";
    name.textContent = clientConfig.character.displayName;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble markdown-body";
    bubble.innerHTML = renderMarkdown(content);
 
    bubble.querySelectorAll("details").forEach(details => {
     details.removeAttribute("open");
   });



    contentWrap.appendChild(name);
    contentWrap.appendChild(bubble);

    const usageLine = createUsageLine(options.usage, options.model);
    if (usageLine) contentWrap.appendChild(usageLine);

    row.appendChild(avatar);
    row.appendChild(contentWrap);
  } else {
    const contentWrap = document.createElement("div");
    contentWrap.className = "message-content";

    const name = document.createElement("div");
    name.className = "message-name";
    name.textContent = clientConfig.character.userLabel;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.innerHTML = renderMarkdown(content);

    const avatar = createUserAvatarElement();

    contentWrap.appendChild(name);
    contentWrap.appendChild(bubble);

    row.appendChild(contentWrap);
    row.appendChild(avatar);
  }

  chatLog.appendChild(row);
  updateMessageCount();
  scrollToBottom();
}

function showTyping() {
  const row = document.createElement("div");
  row.className = "message-row assistant";
  row.id = "typingRow";

  const avatar = createAssistantAvatarElement();

  const contentWrap = document.createElement("div");
  contentWrap.className = "message-content";

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = clientConfig.character.displayName;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = "正在响应……";

  contentWrap.appendChild(name);
  contentWrap.appendChild(bubble);

  row.appendChild(avatar);
  row.appendChild(contentWrap);

  chatLog.appendChild(row);
  scrollToBottom();
}

function removeTyping() {
  const typing = document.getElementById("typingRow");
  if (typing) typing.remove();
}

/* ===== 本地历史 ===== */
function getLocalHistory() {
  try {
    const raw = localStorage.getItem(LOCAL_CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeHistoryArray(parsed);
  } catch {
    return [];
  }
}

function setLocalHistory(history) {
  const normalized = normalizeHistoryArray(history);
  localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(normalized));
}

function saveLocalMessage(message) {
  const history = getLocalHistory();
  const normalized = normalizeMessageItem(message);
  if (!normalized) return;
  history.push(normalized);
  setLocalHistory(history);
}

function clearLocalHistory() {
  localStorage.removeItem(LOCAL_CHAT_KEY);
}

function clearChatViewOnly() {
  chatLog.innerHTML = "";
  addSystemLine(`${clientConfig.character.appTitle} 已启动，已连接 ${clientConfig.character.displayName} 对话模块。`);
  addSystemLine("输入内容后按 Enter 发送，Shift + Enter 换行。");
  addSystemLine("输入 /clear 可清空当前本地记录。");
  updateMessageCount();
}

function renderLocalHistory() {
  const history = getLocalHistory();
  if (!history.length) return false;

  clearChatViewOnly();

  for (const item of history) {
    addMessage(item.role, item.content, {
      usage: item.usage,
      model: item.model
    });
  }

  const lastAssistant = [...history]
    .reverse()
    .find(item => item.role === "assistant" && item.usage);

  if (lastAssistant) updateLastTokenCount(lastAssistant.usage);
  addSystemLine("已从本地记录恢复先前聊天。");

  return true;
}

function renderInitialAssistantMessage() {
  const initialMessage = {
    id: createMessageId(),
    role: "assistant",
    content: INITIAL_ASSISTANT_MESSAGE,
    time: new Date().toISOString(),
    usage: null,
    model: "",
    settings: null
  };

  addMessage("assistant", initialMessage.content, {
    usage: initialMessage.usage,
    model: initialMessage.model
  });

  saveLocalMessage(initialMessage);
}

function renderInitialAssistantMessageIfNeeded() {
  const history = getLocalHistory();
  if (history.length) return;

  const initialMessage = {
    id: createMessageId(),
    role: "assistant",
    content: INITIAL_ASSISTANT_MESSAGE,
    time: new Date().toISOString(),
    usage: null,
    model: "",
    settings: null
  };

  addMessage("assistant", initialMessage.content, {
    usage: initialMessage.usage,
    model: initialMessage.model
  });

  saveLocalMessage(initialMessage);
}

/* ===== API 与认证 ===== */
async function apiFetch(url, options = {}) {
  const headers = {
    ...options.headers,
    "X-Requested-With": "AI-Chat-Template"
  };

  let res = await fetch(url, {
    ...options,
    headers,
    credentials: "include"
  });

  if (res.status === 401 && !url.includes(API.refresh)) {
    const refreshRes = await fetch(API.refresh, {
      method: "POST",
      credentials: "include"
    });

    if (refreshRes.ok) {
      res = await fetch(url, {
        ...options,
        headers,
        credentials: "include"
      });
    } else {
      lockTerminal();
      throw new Error("登录已过期，请重新登录");
    }
  }

  return res;
}

function lockTerminal() {
  localStorage.removeItem(AUTH_USER_KEY);
  fetch(API.logout, {
    method: "POST",
    credentials: "include"
  }).finally(() => location.reload());
}

async function checkAuthStatus() {
  try {
    const res = await apiFetch(API.refresh, { method: "POST" });
    if (!res.ok) return false;

    const user = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "{}");
    currentUserIsAdmin = !!user.isAdmin;
    resetUsageBtn.style.display = "inline-block";
    return true;
  } catch {
    return false;
  }
}

function setAuthMode(mode) {
  currentMode = mode;

  if (mode === "login") {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    authSubtitle.textContent = "登录以继续";
    authSubmitBtn.textContent = "登录";
    passwordInput.autocomplete = "current-password";
  } else {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    authSubtitle.textContent = "注册新账号";
    authSubmitBtn.textContent = "注册";
    passwordInput.autocomplete = "new-password";
  }

  authError.textContent = "";
}

function showResetForm() {
  authNormal.style.display = "none";
  authReset.style.display = "block";
  authError.textContent = "";
}

function showNormalForm() {
  authReset.style.display = "none";
  authNormal.style.display = "block";
  authError.textContent = "";
}

async function enterChatAfterLogin(data) {
  localStorage.setItem(
    AUTH_USER_KEY,
    JSON.stringify({
      username: data.username,
      userId: data.userId,
      isAdmin: data.isAdmin
    })
  );

  currentUserIsAdmin = data.isAdmin;
  resetUsageBtn.style.display = "inline-block";

  setView("boot");
  await wait(2100);

  setView("chat");
  addSystemLine(`欢迎，${data.username}。`);

  const hasHistory = renderLocalHistory();
   if (!hasHistory) {
    renderInitialAssistantMessage();
  }

fetchMyUsage();
  setTimeout(() => messageInput.focus(), 100);
}

async function handleAuth() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    authError.textContent = "请填写用户名和密码";
    return;
  }

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = currentMode === "login" ? "登录中…" : "注册中…";
  authError.textContent = "";

  const endpoint = currentMode === "login" ? API.login : API.register;

  try {
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.msg || "操作失败");

    if (currentMode === "login") {
      await enterChatAfterLogin(data);
    } else {
      authError.textContent = "注册成功，请登录。";
      setAuthMode("login");
      usernameInput.value = "";
      passwordInput.value = "";
      usernameInput.focus();
    }
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = currentMode === "login" ? "登录" : "注册";
  }
}

async function handleResetPassword() {
  const adminKey = resetAdminKeyInput.value.trim();
  const username = resetUsernameInput.value.trim();
  const newPassword = resetNewPasswordInput.value.trim();

  if (!adminKey || !username || !newPassword) {
    authError.textContent = "请填写所有字段";
    return;
  }

  resetSubmitBtn.disabled = true;
  resetSubmitBtn.textContent = "重置中…";
  authError.textContent = "";

  try {
    const res = await apiFetch(API.resetPassword, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminKey, username, newPassword })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.msg || "重置失败");
    authError.textContent = "密码重置成功，请返回登录。";
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    resetSubmitBtn.disabled = false;
    resetSubmitBtn.textContent = "重置密码";
  }
}

/* ===== 用量 ===== */
async function fetchMyUsage() {
  try {
    const res = await apiFetch(API.myUsage);
    const data = await res.json();
    if (data.success) updateTokenPanel(data);
  } catch {}
}

function openResetUsageDialog() {
  resetUsageAdminKey.value = "";
  resetUsageUsername.value = "";
  resetUsageError.textContent = "";
  resetUsageDialog.style.display = "flex";
}

function closeResetUsageDialog() {
  resetUsageDialog.style.display = "none";
}

async function handleResetUsage() {
  const adminKey = resetUsageAdminKey.value.trim();
  const username = resetUsageUsername.value.trim();

  if (!adminKey || !username) {
    resetUsageError.textContent = "请填写所有字段";
    return;
  }

  resetUsageConfirm.disabled = true;
  resetUsageConfirm.textContent = "重置中…";
  resetUsageError.textContent = "";

  try {
    const res = await apiFetch(API.resetUsage, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminKey, username })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.msg || "重置失败");

    alert(data.msg);
    closeResetUsageDialog();

    if (JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "{}")?.username === username) {
      fetchMyUsage();
    }
  } catch (error) {
    resetUsageError.textContent = error.message;
  } finally {
    resetUsageConfirm.disabled = false;
    resetUsageConfirm.textContent = "确认重置";
  }
}

/* ===== 聊天发送 ===== */
async function sendMessage() {
  if (isSending) return;

  const text = messageInput.value.trim();
  if (!text) return;

  if (text === "/clear") {
  clearLocalHistory();
  clearChatViewOnly();
  addSystemLine("本地记录已清空。");
  renderInitialAssistantMessage();
  messageInput.value = "";
  autoResizeInput();
  return;
  }

  isSending = true;
  sendBtn.disabled = true;

  const settings = getCurrentSettings();
  saveSettings();

  const userMessage = {
    id: createMessageId(),
    role: "user",
    content: text,
    time: new Date().toISOString(),
    usage: null,
    model: settings.model,
    settings
  };

  addMessage("user", text);
  saveLocalMessage(userMessage);

  messageInput.value = "";
  autoResizeInput();

  showTyping();

  try {
    const res = await apiFetch(API.chat, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        character: CHARACTER,
        message: text,
        model: settings.model,
        temperature: settings.temperature
      })
    });

    const data = await res.json();
    removeTyping();

    if (!res.ok || !data.success) {
      throw new Error(data.msg || data.detail || "对话请求失败");
    }

    const assistantMessage = {
      id: data.assistantMessage?.id || createMessageId(),
      role: "assistant",
      content: data.reply,
      time: data.assistantMessage?.time || new Date().toISOString(),
      usage: normalizeUsage(data.usage),
      model: data.model || settings.model,
      settings: data.settings || settings
    };

    addMessage("assistant", assistantMessage.content, {
      usage: assistantMessage.usage,
      model: assistantMessage.model
    });

    saveLocalMessage(assistantMessage);
    updateLastTokenCount(assistantMessage.usage);
    fetchMyUsage();
  } catch (error) {
    removeTyping();

    let msg = "错误：" + error.message;
    if (error.message.includes("用量已达上限")) {
      msg += "\n请联系管理员使用管理员密钥重置当日用量。";
    }

    addSystemLine(msg);

    if (error.message.includes("未登录") || error.message.includes("令牌")) {
      lockTerminal();
    }
  } finally {
    isSending = false;
    sendBtn.disabled = false;
  }
}

async function clearAllHistory() {
  const ok = confirm("确定要清空本地和后端聊天记录吗？");
  if (!ok) return;

  try {
    await apiFetch(API.clearHistory, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character: CHARACTER })
    });
  } catch {}

  clearLocalHistory();
  clearChatViewOnly();
  updateLastTokenCount(null);
  addSystemLine("本地与后端记录已请求清空。");
  renderInitialAssistantMessage();
}

/* ===== 下载/导入 ===== */
function buildReadableTxt(history) {
  const normalized = normalizeHistoryArray(history);
  let text = "";

  text += `【${clientConfig.character.appTitle} - ${clientConfig.character.displayName} 对话记录】\n`;
  text += "生成时间：" + new Date().toLocaleString() + "\n";
  text += "说明：此文件为可读 TXT；导入器可自动解析为规范 JSON 聊天记录。\n";
  text += "----------------------------------------\n\n";

  for (const item of normalized) {
    if (item.role === "user") {
      text += `${clientConfig.character.userLabel} >\n`;
      text += item.content + "\n";
    } else if (item.role === "assistant") {
      text += `${clientConfig.character.displayName} >\n`;
      text += item.content + "\n";

      if (item.usage) {
        text += "\n";
        text += `[Token Usage] prompt_tokens=${item.usage.prompt_tokens || 0}; `;
        text += `completion_tokens=${item.usage.completion_tokens || 0}; `;
        text += `total_tokens=${item.usage.total_tokens || 0}\n`;
      }

      if (item.model) {
        text += `[Model] ${item.model}\n`;
      }
    }

    text += "\n----------------------------------------\n\n";
  }

  return text;
}

function downloadHistoryTxt() {
  const history = getLocalHistory();
  const text = buildReadableTxt(history);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `${CHARACTER}_chat_history_${Date.now()}.txt`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  addSystemLine("可读 TXT 聊天记录已下载。");
}

function downloadHistoryJson() {
  const history = getLocalHistory();
  const payload = {
    format: "configurable-chat-history",
    version: 1,
    character: CHARACTER,
    exported_at: new Date().toISOString(),
    messages: normalizeHistoryArray(history)
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `${CHARACTER}_chat_history_${Date.now()}.json`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  addSystemLine("规范 JSON 聊天记录已下载。");
}

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
  } catch {
    return [];
  }
}

function parseUsageLine(line) {
  const promptMatch =
    line.match(/prompt[_\s-]*tokens?\s*[:：=]\s*(\d+)/i) ||
    line.match(/输入\s*[:：=]\s*(\d+)/);

  const completionMatch =
    line.match(/completion[_\s-]*tokens?\s*[:：=]\s*(\d+)/i) ||
    line.match(/输出\s*[:：=]\s*(\d+)/);

  const totalMatch =
    line.match(/total[_\s-]*tokens?\s*[:：=]\s*(\d+)/i) ||
    line.match(/总计\s*[:：=]\s*(\d+)/);

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
  const userLabelPattern = escapeRegExp(clientConfig.character.userLabel);
  const assistantLabelPattern = escapeRegExp(clientConfig.character.displayName);
  const userLinePattern = new RegExp(`^${userLabelPattern}\\s*>`);
  const assistantLinePattern = new RegExp(`^${assistantLabelPattern}\\s*>`);
  const userLineReplacePattern = new RegExp(`^${userLabelPattern}\\s*>\\s*`);
  const assistantLineReplacePattern = new RegExp(`^${assistantLabelPattern}\\s*>\\s*`);

  let currentRole = null;
  let buffer = [];
  let currentUsage = null;
  let currentModel = "";

  function flush() {
    if (!currentRole) {
      buffer = [];
      currentUsage = null;
      currentModel = "";
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
        model: currentModel,
        settings: null
      });
    }

    currentRole = null;
    buffer = [];
    currentUsage = null;
    currentModel = "";
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

    if (
      /^\[Token\s*Usage\]/i.test(trimmed) ||
      /^Token\s*Usage/i.test(trimmed) ||
      /^用量\s*[:：]/.test(trimmed)
    ) {
      currentUsage = parseUsageLine(trimmed);
      continue;
    }

    if (/^\[Model\]/i.test(trimmed)) {
      currentModel = trimmed.replace(/^\[Model\]\s*/i, "").trim();
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) continue;
    if (/^【.*】$/.test(trimmed)) continue;
    if (/^生成时间\s*[:：]/.test(trimmed)) continue;
    if (/^说明\s*[:：]/.test(trimmed)) continue;

    if (currentRole) buffer.push(line);
  }

  flush();
  return normalizeHistoryArray(result);
}

function parseImportedContent(text) {
  const jsonHistory = tryParseJsonImport(text);
  if (jsonHistory.length) return jsonHistory;
  return parseReadableTxtImport(text);
}

function importHistoryFile(file) {
  const reader = new FileReader();

  reader.onload = async () => {
    const text = String(reader.result || "");

    if (!text.trim()) {
      addSystemLine("导入失败：文件为空。");
      return;
    }

    const imported = parseImportedContent(text);

    if (!imported.length) {
      addSystemLine("导入失败：未识别到有效聊天记录。");
      return;
    }

    const modeClear = confirm("是否清空原有记录后导入？\n确定：清空后导入\n取消：追加导入");

    try {
      const res = await apiFetch(API.importHistory, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: CHARACTER,
          text,
          mode: modeClear ? "clear" : "append"
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || "导入失败");

      if (modeClear) {
        setLocalHistory(imported);
      } else {
        setLocalHistory([...getLocalHistory(), ...imported]);
      }

      renderLocalHistory();
      addSystemLine(data.msg || `导入完成，共导入 ${imported.length} 条消息。`);
    } catch (error) {
      addSystemLine("导入失败：" + error.message);
    }
  };

  reader.readAsText(file, "utf-8");
}

/* ===== 移动端适配 ===== */
function autoResizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + "px";
}

function setMobileViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}

function fixMobileInputScroll() {
  setTimeout(() => scrollToBottom(), 120);
  setTimeout(() => scrollToBottom(), 320);
}

/* ===== 初始化 ===== */
async function init() {
  setView("login");

  await loadClientConfig();
  loadSettings();
  loadUserAvatar();

  const loggedIn = await checkAuthStatus();

  if (loggedIn) {
    const user = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "{}");
    setView("chat");
    addSystemLine(`已登录：${user.username || "用户"}`);
    const hasHistory = renderLocalHistory();
     if (!hasHistory) {
      renderInitialAssistantMessage();
     }
    fetchMyUsage();
  } else {
    setView("login");
    setTimeout(() => usernameInput.focus(), 100);
  }

  updateMessageCount();

  const history = getLocalHistory();
  const lastAssistant = [...history]
    .reverse()
    .find(item => item.role === "assistant" && item.usage);

  if (lastAssistant) updateLastTokenCount(lastAssistant.usage);
}

/* ===== 事件绑定 ===== */
tabLogin.addEventListener("click", () => setAuthMode("login"));
tabRegister.addEventListener("click", () => setAuthMode("register"));

authSubmitBtn.addEventListener("click", handleAuth);

usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") passwordInput.focus();
});

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleAuth();
});

forgotPasswordLink.addEventListener("click", showResetForm);
backToLoginLink.addEventListener("click", showNormalForm);
resetSubmitBtn.addEventListener("click", handleResetPassword);

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener("input", autoResizeInput);

modelSelect.addEventListener("change", saveSettings);
temperatureInput.addEventListener("change", saveSettings);

avatarBtn.addEventListener("click", () => avatarInput.click());

avatarInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) handleAvatarUpload(file);
  avatarInput.value = "";
});

clearBtn.addEventListener("click", clearAllHistory);
downloadBtn.addEventListener("click", downloadHistoryTxt);
downloadJsonBtn.addEventListener("click", downloadHistoryJson);
importBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importHistoryFile(file);
  fileInput.value = "";
});

lockBtn.addEventListener("click", lockTerminal);

resetUsageBtn.addEventListener("click", openResetUsageDialog);
resetUsageCancel.addEventListener("click", closeResetUsageDialog);
resetUsageConfirm.addEventListener("click", handleResetUsage);

window.addEventListener("resize", () => {
  setMobileViewportHeight();
  fixMobileInputScroll();
});

window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    setMobileViewportHeight();
    fixMobileInputScroll();
  }, 300);
});

messageInput.addEventListener("focus", () => fixMobileInputScroll());
messageInput.addEventListener("blur", () => fixMobileInputScroll());

setMobileViewportHeight();
init();
