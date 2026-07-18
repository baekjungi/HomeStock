const BASE_STORAGE_KEY = "homestock_v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const FIREBASE_WRITE_DEBOUNCE_MS = 1200;
const BARCODE_BOOK = {
  "8801007051043": { name: "치약", unit: "count", threshold: 1 },
  "8801043014835": { name: "샴푸", unit: "percent", threshold: 20 },
  "8801115114906": { name: "세제", unit: "count", threshold: 1 },
};
const VIEW_STORAGE_KEY = "homestock_view_v1";
const PROFILE_STORAGE_KEY = "homestock_profile_v1";
const USERS_STORAGE_KEY = "homestock_users_v1";
const SESSION_STORAGE_KEY = "homestock_session_v1";
const ITEM_TEMPLATES = {
  tissue: { name: "휴지", unit: "roll", threshold: 3, quantity: 8 },
  shampoo: { name: "샴푸", unit: "percent", threshold: 20, quantity: 70 },
  detergent: { name: "세제", unit: "count", threshold: 1, quantity: 2 },
};

const els = {
  itemForm: document.getElementById("itemForm"),
  familyCode: document.getElementById("familyCode"),
  connectFamilyBtn: document.getElementById("connectFamilyBtn"),
  exportDataBtn: document.getElementById("exportDataBtn"),
  importDataBtn: document.getElementById("importDataBtn"),
  syncPayload: document.getElementById("syncPayload"),
  syncStatus: document.getElementById("syncStatus"),
  quickSearch: document.getElementById("quickSearch"),
  quickSearchBtn: document.getElementById("quickSearchBtn"),
  focusSearchBtn: document.getElementById("focusSearchBtn"),
  jumpAddBtn: document.getElementById("jumpAddBtn"),
  quickResult: document.getElementById("quickResult"),
  startScanBtn: document.getElementById("startScanBtn"),
  stopScanBtn: document.getElementById("stopScanBtn"),
  scanVideo: document.getElementById("scanVideo"),
  scanResult: document.getElementById("scanResult"),
  inventoryList: document.getElementById("inventoryList"),
  alertList: document.getElementById("alertList"),
  shoppingList: document.getElementById("shoppingList"),
  report: document.getElementById("report"),
  seedBtn: document.getElementById("seedBtn"),
  itemCardTemplate: document.getElementById("itemCardTemplate"),
  inventoryFilterInput: document.getElementById("inventoryFilterInput"),
  inventorySortSelect: document.getElementById("inventorySortSelect"),
  lowStockOnly: document.getElementById("lowStockOnly"),
  restoreDeletedBtn: document.getElementById("restoreDeletedBtn"),
  templateItemBtns: document.querySelectorAll("[data-template-item]"),
  menuItems: document.querySelectorAll("[data-view-btn]"),
  viewPanels: document.querySelectorAll(".view-panel"),
  statTotalItems: document.getElementById("statTotalItems"),
  statRiskCount: document.getElementById("statRiskCount"),
  statShoppingCount: document.getElementById("statShoppingCount"),
  statEstimatedCost: document.getElementById("statEstimatedCost"),
  recentUsageList: document.getElementById("recentUsageList"),
  footerYear: document.getElementById("footerYear"),
  profileModeText: document.getElementById("profileModeText"),
  profileItemCount: document.getElementById("profileItemCount"),
  profileSyncState: document.getElementById("profileSyncState"),
  profileNicknameInput: document.getElementById("profileNicknameInput"),
  profileAvatarInput: document.getElementById("profileAvatarInput"),
  profileAvatarPreview: document.getElementById("profileAvatarPreview"),
  profileSaveBtn: document.getElementById("profileSaveBtn"),
  profileResetBtn: document.getElementById("profileResetBtn"),
  startGate: document.getElementById("startGate"),
  startGateStatus: document.getElementById("startGateStatus"),
  authStep: document.getElementById("authStep"),
  roomStep: document.getElementById("roomStep"),
  loginIdInput: document.getElementById("loginIdInput"),
  loginPwInput: document.getElementById("loginPwInput"),
  loginBtn: document.getElementById("loginBtn"),
  signupBtn: document.getElementById("signupBtn"),
  anonStartBtn: document.getElementById("anonStartBtn"),
  realEmailInput: document.getElementById("realEmailInput"),
  realPwInput: document.getElementById("realPwInput"),
  realSignupBtn: document.getElementById("realSignupBtn"),
  realLoginBtn: document.getElementById("realLoginBtn"),
  googleLoginBtn: document.getElementById("googleLoginBtn"),
  githubLoginBtn: document.getElementById("githubLoginBtn"),
  facebookLoginBtn: document.getElementById("facebookLoginBtn"),
  appleLoginBtn: document.getElementById("appleLoginBtn"),
  microsoftLoginBtn: document.getElementById("microsoftLoginBtn"),
  twitterLoginBtn: document.getElementById("twitterLoginBtn"),
  yahooLoginBtn: document.getElementById("yahooLoginBtn"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  soloStartBtn: document.getElementById("soloStartBtn"),
  inventoryFormPanel: document.getElementById("inventoryFormPanel"),
  aiLauncherBtn: document.getElementById("aiLauncherBtn"),
  aiAssistantPanel: document.getElementById("aiAssistantPanel"),
  aiCloseBtn: document.getElementById("aiCloseBtn"),
  aiMessages: document.getElementById("aiMessages"),
  aiInput: document.getElementById("aiInput"),
  aiSendBtn: document.getElementById("aiSendBtn"),
};

let activeStorageKey = BASE_STORAGE_KEY;
let state = loadState();
let scanStream = null;
let scanTimer = null;
let zxingReader = null;
let nativeScanStartedAt = 0;
let currentView = localStorage.getItem(VIEW_STORAGE_KEY) || "dashboard";
let profileState = loadProfile();
let inventoryViewState = {
  query: "",
  sort: "recent",
  lowStockOnly: false,
};
let lastDeletedItem = null;
let currentUser = loadSessionUser();
const firebaseSync = {
  enabled: false,
  userId: null,
  db: null,
  unsubscribe: null,
  writeTimer: null,
  applyingRemote: false,
};

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function loadSessionUser() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSessionUser(user) {
  if (!user) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    currentUser = null;
    return;
  }
  currentUser = user;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

function isFirebaseAuthAvailable() {
  return Boolean(window.firebase && window.firebase.auth && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
}

function isValidEmail(value) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function ensureFirebaseInitialized() {
  if (!window.firebase || !window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
    throw new Error("Firebase 설정이 없어 실계정 인증을 사용할 수 없습니다.");
  }
  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(window.FIREBASE_CONFIG);
  }
}

function applyLoggedInUser(user, type, successText) {
  const email = user && user.email ? user.email : `${type}-user`;
  const displayName = user && user.displayName ? user.displayName : email.split("@")[0];
  saveSessionUser({ id: email, type });
  profileState.nickname = displayName || "사용자";
  saveProfile();
  showRoomStep();
  setStartStatus(successText);
}

function isPopupIssue(code) {
  const c = String(code || "");
  return (
    c.includes("popup-blocked") ||
    c.includes("popup-closed-by-user") ||
    c.includes("cancelled-popup-request") ||
    c.includes("operation-not-supported-in-this-environment")
  );
}

function extractFirebaseAuthDetail(error) {
  const direct = String(error && error.message ? error.message : "");
  const responseMessage = String(
    error && error.customData && error.customData._tokenResponse && error.customData._tokenResponse.error
      ? error.customData._tokenResponse.error.message
      : ""
  );
  const serverMessage = String(
    error && error.customData && error.customData._serverResponse && error.customData._serverResponse.error
      ? error.customData._serverResponse.error.message
      : ""
  );

  const merged = [responseMessage, serverMessage, direct]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" | ");

  return merged;
}

async function hydrateRedirectAuthResult() {
  try {
    if (!isFirebaseAuthAvailable()) return;
    await ensureFirebaseInitialized();
    const result = await window.firebase.auth().getRedirectResult();
    const user = result && result.user ? result.user : null;
    if (!user) return;
    applyLoggedInUser(user, "redirect", "소셜 로그인 완료. 방을 선택하세요.");
  } catch {
    // noop
  }
}

async function loginWithSocialProvider(providerName, providerFactory) {
  try {
    await ensureFirebaseInitialized();
    const provider = providerFactory();
    const auth = window.firebase.auth();

    try {
      const result = await auth.signInWithPopup(provider);
      const user = result && result.user ? result.user : null;
      applyLoggedInUser(user, providerName.toLowerCase(), `${providerName} 로그인 완료. 방을 선택하세요.`);
      return;
    } catch (popupError) {
      const popupCode = String(popupError && popupError.code ? popupError.code : "");
      if (isPopupIssue(popupCode)) {
        setStartStatus(`${providerName} 팝업이 닫혀서 전체화면 로그인으로 전환합니다...`);
        await auth.signInWithRedirect(provider);
        return;
      }
      throw popupError;
    }
  } catch (error) {
    const code = String(error && error.code ? error.code : "");
    const detail = extractFirebaseAuthDetail(error);
    let message = error && error.message ? error.message : "알 수 없는 오류";
    if (code.includes("operation-not-allowed")) {
      message = `${providerName} 로그인 설정이 꺼져 있어요. Firebase 콘솔에서 ${providerName} 공급자를 활성화해 주세요.`;
    } else if (code.includes("unauthorized-domain")) {
      message = `현재 도메인(${window.location.hostname})이 Firebase Authorized domains에 없어 로그인할 수 없어요. Firebase Authentication > Settings > Authorized domains에 이 도메인을 추가해 주세요.`;
    } else if (code.includes("internal-error")) {
      if (detail.includes("CONFIGURATION_NOT_FOUND") || detail.includes("INVALID_PROVIDER_ID")) {
        message = `${providerName} 제공자 설정이 완성되지 않았어요. Firebase Authentication > Sign-in method에서 ${providerName}를 활성화하고, 프로젝트 지원 이메일을 저장해 주세요.`;
      } else if (detail.includes("API_KEY") || detail.includes("API_KEY_SERVICE_BLOCKED")) {
        message = `Firebase Web API 키 설정 문제예요. Firebase 프로젝트의 웹 앱 API 키가 유효한지 확인해 주세요.`;
      } else {
        message = `${providerName} 인증 내부 오류가 발생했어요. Firebase Authentication 설정(Provider/Authorized domains/지원 이메일)을 확인해 주세요.`;
      }
    } else if (code.includes("popup-blocked")) {
      message = "팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해 주세요.";
    } else if (code.includes("cancelled-popup-request") || code.includes("popup-closed-by-user")) {
      message = "로그인 창이 닫혀 취소되었습니다.";
    }
    const debugHint = detail ? ` (상세: ${detail})` : "";
    setStartStatus(`${providerName} 로그인 실패: ${message}${debugHint}`);
  }
}

function createRoomCode() {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

function setStartStatus(text) {
  if (els.startGateStatus) {
    els.startGateStatus.textContent = text;
  }
}

function showRoomStep() {
  if (els.authStep) els.authStep.classList.add("is-hidden");
  if (els.roomStep) els.roomStep.classList.remove("is-hidden");
  if (els.roomCodeInput && state.familyCode) {
    els.roomCodeInput.value = state.familyCode;
  }
}

function showAuthStep() {
  if (els.authStep) els.authStep.classList.remove("is-hidden");
  if (els.roomStep) els.roomStep.classList.add("is-hidden");
}

function finishStartFlow() {
  if (els.startGate) {
    els.startGate.classList.add("is-hidden");
  }
  if (currentUser && currentUser.id) {
    profileState.nickname = currentUser.id;
    saveProfile();
  }
  renderAll();
}

function initializeStartFlow() {
  if (!els.startGate) {
    renderAll();
    return;
  }

  if (currentUser && currentUser.id) {
    setStartStatus(`${currentUser.id}님, 방을 선택하세요.`);
    showRoomStep();
    if (state.familyCode) {
      finishStartFlow();
      return;
    }
    return;
  }

  setStartStatus("로그인 후 방을 선택하세요.");
  showAuthStep();
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { nickname: "사용자", avatarDataUrl: "" };
    const parsed = JSON.parse(raw);
    if (typeof parsed.nickname !== "string") parsed.nickname = "사용자";
    if (typeof parsed.avatarDataUrl !== "string") parsed.avatarDataUrl = "";
    return parsed;
  } catch {
    return { nickname: "사용자", avatarDataUrl: "" };
  }
}

function saveProfile() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileState));
}

function sanitizeCode(value) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

function normalizeLoginId(value) {
  return String(value || "")
    .trim()
    .slice(0, 40);
}

function getStorageKeyByCode(code) {
  if (!code) return BASE_STORAGE_KEY;
  return `${BASE_STORAGE_KEY}_${code}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(activeStorageKey);
    if (!raw) return { items: [], familyCode: "", updatedAt: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed.items || !Array.isArray(parsed.items)) return { items: [], familyCode: "", updatedAt: 0 };
    if (typeof parsed.familyCode !== "string") parsed.familyCode = "";
    if (typeof parsed.updatedAt !== "number") parsed.updatedAt = 0;
    return parsed;
  } catch {
    return { items: [], familyCode: "", updatedAt: 0 };
  }
}

function saveState() {
  state.updatedAt = Date.now();
  localStorage.setItem(activeStorageKey, JSON.stringify(state));
  scheduleFirebaseWrite();
}

function getFamilyDocRef() {
  if (!firebaseSync.enabled || !state.familyCode) return null;
  return firebaseSync.db.collection("families").doc(state.familyCode);
}

function detachFamilyListener() {
  if (firebaseSync.unsubscribe) {
    firebaseSync.unsubscribe();
    firebaseSync.unsubscribe = null;
  }
}

function attachFamilyListener() {
  detachFamilyListener();
  const ref = getFamilyDocRef();
  if (!ref) return;

  firebaseSync.unsubscribe = ref.onSnapshot((snapshot) => {
    const remote = snapshot.data();
    if (!remote || !Array.isArray(remote.items)) return;
    const remoteUpdatedAt = Number(remote.updatedAt || 0);
    if (remoteUpdatedAt <= Number(state.updatedAt || 0)) return;

    firebaseSync.applyingRemote = true;
    state.items = remote.items;
    state.updatedAt = remoteUpdatedAt;
    localStorage.setItem(activeStorageKey, JSON.stringify(state));
    firebaseSync.applyingRemote = false;
    renderAll();
    els.syncStatus.textContent = `가족 모드 (${state.familyCode}) 실시간 동기화 완료`;
  });
}

function scheduleFirebaseWrite() {
  if (!firebaseSync.enabled || !state.familyCode || firebaseSync.applyingRemote) return;

  if (firebaseSync.writeTimer) {
    clearTimeout(firebaseSync.writeTimer);
  }

  firebaseSync.writeTimer = setTimeout(async () => {
    const ref = getFamilyDocRef();
    if (!ref) return;
    try {
      await ref.set(
        {
          familyCode: state.familyCode,
          items: state.items,
          updatedAt: state.updatedAt,
          updatedBy: firebaseSync.userId || "anonymous",
        },
        { merge: true }
      );
    } catch (error) {
      els.syncStatus.textContent = `Firebase 동기화 실패: ${error.message}`;
    }
  }, FIREBASE_WRITE_DEBOUNCE_MS);
}

async function initFirebaseSync() {
  if (!window.firebase || !window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
    els.syncStatus.textContent = "Firebase 미설정: 로컬/복사 동기화 모드로 동작합니다.";
    return;
  }

  try {
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(window.FIREBASE_CONFIG);
    }

    const auth = window.firebase.auth();
    const db = window.firebase.firestore();
    const credential = await auth.signInAnonymously();

    firebaseSync.enabled = true;
    firebaseSync.db = db;
    firebaseSync.userId = credential.user ? credential.user.uid : null;

    if (state.familyCode) {
      attachFamilyListener();
      scheduleFirebaseWrite();
    }

    els.syncStatus.textContent = state.familyCode
      ? `가족 모드 (${state.familyCode}) Firebase 실시간 동기화 연결됨`
      : "Firebase 연결됨: 공유코드를 입력하면 실시간 동기화가 시작됩니다.";
  } catch (error) {
    els.syncStatus.textContent = `Firebase 초기화 실패: ${error.message}`;
  }
}

function applyFamilyMode(code) {
  const safeCode = sanitizeCode(code);
  activeStorageKey = getStorageKeyByCode(safeCode);
  state = loadState();
  state.familyCode = safeCode;
  saveState();
  els.familyCode.value = safeCode;
  els.syncStatus.textContent = safeCode
    ? `가족 모드 연결됨: ${safeCode}`
    : "개인 모드로 동작 중입니다.";

  if (firebaseSync.enabled) {
    if (safeCode) {
      attachFamilyListener();
      scheduleFirebaseWrite();
    } else {
      detachFamilyListener();
    }
  }

  renderAll();
}

function toDateString(date) {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysBetween(a, b) {
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / DAY_MS));
}

function unitLabel(unit) {
  if (unit === "roll") return "롤";
  if (unit === "percent") return "%";
  return "개";
}

function getUnitEstimatedPrice(unit) {
  if (unit === "roll") return 850;
  if (unit === "percent") return 280;
  return 1800;
}

function getUseStep(unit) {
  if (unit === "percent") return 5;
  return 1;
}

function getBuyStep(unit) {
  if (unit === "percent") return 20;
  return 1;
}

function getTotalSpent(items) {
  return items.reduce((sum, item) => {
    const logs = Array.isArray(item.purchaseLogs) ? item.purchaseLogs : [];
    const unitPrice = getUnitEstimatedPrice(item.unit);
    const itemTotal = logs.reduce((acc, log) => acc + Number(log.amount || 0) * unitPrice, 0);
    return sum + itemTotal;
  }, 0);
}

function getDailyUsage(item) {
  const logs = (item.usageLogs || []).slice(-10);
  if (logs.length < 2) return null;

  const first = logs[0].at;
  const last = logs[logs.length - 1].at;
  const spanDays = daysBetween(first, last);
  const totalUsed = logs.reduce((sum, log) => sum + Number(log.amount || 0), 0);
  if (totalUsed <= 0) return null;
  return totalUsed / spanDays;
}

function getDepletionInfo(item) {
  const daily = getDailyUsage(item);
  if (!daily) return null;
  if (item.quantity <= 0) {
    return { daysLeft: 0, depletionDate: new Date() };
  }

  const daysLeft = Math.max(0, Math.ceil(item.quantity / daily));
  const depletionDate = new Date(Date.now() + daysLeft * DAY_MS);
  return { daysLeft, depletionDate };
}

function getExpiryInfo(item) {
  if (!item.expiryDate) return null;
  const diff = Math.ceil((new Date(item.expiryDate) - new Date()) / DAY_MS);
  return { daysLeft: diff };
}

function isLowStockItem(item) {
  const dep = getDepletionInfo(item);
  return item.quantity <= item.threshold || (dep && dep.daysLeft <= 7);
}

function getInventoryItemsForView() {
  const query = inventoryViewState.query.trim().toLowerCase();
  let items = state.items.filter((item) => {
    if (!query) return true;
    return (
      String(item.name || "")
        .toLowerCase()
        .includes(query) || String(item.barcode || "").includes(query)
    );
  });

  if (inventoryViewState.lowStockOnly) {
    items = items.filter((item) => isLowStockItem(item));
  }

  const sorted = [...items];
  if (inventoryViewState.sort === "name_asc") {
    sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  } else if (inventoryViewState.sort === "qty_asc") {
    sorted.sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0));
  } else if (inventoryViewState.sort === "qty_desc") {
    sorted.sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0));
  } else if (inventoryViewState.sort === "expiry_soon") {
    sorted.sort((a, b) => {
      const aDays = a.expiryDate ? Math.ceil((new Date(a.expiryDate) - new Date()) / DAY_MS) : Number.MAX_SAFE_INTEGER;
      const bDays = b.expiryDate ? Math.ceil((new Date(b.expiryDate) - new Date()) / DAY_MS) : Number.MAX_SAFE_INTEGER;
      return aDays - bDays;
    });
  } else {
    sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  return sorted;
}

function getAlerts(items) {
  const alerts = [];
  items.forEach((item) => {
    const dep = getDepletionInfo(item);
    const exp = getExpiryInfo(item);

    if (item.quantity <= 0) {
      alerts.push({
        type: "urgent",
        message: `${item.name}: 재고가 0입니다. 바로 구매가 필요해요.`,
      });
      return;
    }

    if (exp && exp.daysLeft <= 7) {
      alerts.push({
        type: exp.daysLeft <= 3 ? "urgent" : "warn",
        message: `${item.name}: 유통기한이 ${Math.max(exp.daysLeft, 0)}일 남았어요.`,
      });
    }

    if (dep && dep.daysLeft <= 7) {
      alerts.push({
        type: dep.daysLeft <= 3 ? "urgent" : "warn",
        message: `${item.name}: 약 ${dep.daysLeft}일 후 소진 예정입니다.`,
      });
    } else if (item.quantity <= item.threshold) {
      alerts.push({
        type: "warn",
        message: `${item.name}: 최소 보유 기준(${item.threshold}${unitLabel(item.unit)}) 이하입니다.`,
      });
    }
  });
  return alerts;
}

function buildShoppingTargets(items) {
  return items.filter((item) => {
    const dep = getDepletionInfo(item);
    const lowStock = item.quantity <= item.threshold;
    const dueSoon = dep && dep.daysLeft <= 7;
    return lowStock || dueSoon;
  });
}

function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthlyUsageMap(item) {
  const map = {};
  (item.usageLogs || []).forEach((log) => {
    const key = getMonthKey(log.at);
    map[key] = (map[key] || 0) + Number(log.amount || 0);
  });
  return map;
}

function getCurrentPrevMonthKeys() {
  const now = new Date();
  const current = getMonthKey(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev = getMonthKey(prevDate);
  return { current, prev };
}

function renderAlerts() {
  els.alertList.innerHTML = "";
  const alerts = getAlerts(state.items);
  if (!alerts.length) {
    els.alertList.innerHTML = "<li>오늘은 위험 알림이 없어요. 아주 좋아요.</li>";
    return;
  }

  alerts.forEach((alert) => {
    const li = document.createElement("li");
    li.className = alert.type;
    li.textContent = alert.message;
    els.alertList.appendChild(li);
  });
}

function renderShoppingList() {
  els.shoppingList.innerHTML = "";
  const targets = buildShoppingTargets(state.items);
  if (!targets.length) {
    els.shoppingList.innerHTML = "<li>자동 추가된 품목이 없어요.</li>";
    return;
  }

  targets.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `□ ${item.name} (현재 ${item.quantity}${unitLabel(item.unit)})`;
    els.shoppingList.appendChild(li);
  });
}

function renderReport() {
  els.report.innerHTML = "";
  const { current, prev } = getCurrentPrevMonthKeys();
  let hasData = false;

  state.items.forEach((item) => {
    const usageMap = getMonthlyUsageMap(item);
    const currentVal = usageMap[current] || 0;
    const prevVal = usageMap[prev] || 0;

    if (!currentVal && !prevVal) return;

    hasData = true;
    let changeText = "변화 없음";
    let changeClass = "";

    if (prevVal === 0 && currentVal > 0) {
      changeText = `이번 달 사용 시작 (${currentVal}${unitLabel(item.unit)})`;
      changeClass = "up";
    } else if (prevVal > 0) {
      const delta = ((currentVal - prevVal) / prevVal) * 100;
      const rounded = Math.round(Math.abs(delta));
      if (delta > 0) {
        changeText = `▲ ${rounded}% (${prevVal} -> ${currentVal})`;
        changeClass = "up";
      } else if (delta < 0) {
        changeText = `▼ ${rounded}% (${prevVal} -> ${currentVal})`;
        changeClass = "down";
      }
    }

    const div = document.createElement("div");
    div.className = "report-item";
    div.innerHTML = `<strong>${item.name}</strong><p class="${changeClass}">${changeText}</p>`;
    els.report.appendChild(div);
  });

  if (!hasData) {
    els.report.innerHTML = "<p class='muted'>아직 소비 리포트를 만들 데이터가 부족해요. 사용 기록을 쌓아보세요.</p>";
  }
}

function renderDashboardSummary() {
  if (!els.statTotalItems) return;

  const alerts = getAlerts(state.items);
  const shoppingTargets = buildShoppingTargets(state.items);
  const totalSpent = getTotalSpent(state.items);

  els.statTotalItems.textContent = String(state.items.length);
  els.statRiskCount.textContent = String(alerts.length);
  els.statShoppingCount.textContent = String(shoppingTargets.length);
  els.statEstimatedCost.textContent = `₩${Math.round(totalSpent).toLocaleString("ko-KR")}`;

  if (!els.recentUsageList) return;

  const logs = [];
  state.items.forEach((item) => {
    (item.usageLogs || []).forEach((log) => {
      logs.push({
        itemName: item.name,
        at: log.at,
        amount: Number(log.amount || 0),
        unit: item.unit,
      });
    });
  });

  logs.sort((a, b) => new Date(b.at) - new Date(a.at));
  const recentLogs = logs.slice(0, 5);

  els.recentUsageList.innerHTML = "";
  if (!recentLogs.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "아직 사용 기록이 없어요. 품목 카드에서 사용 기록 +1을 눌러 시작해보세요.";
    els.recentUsageList.appendChild(li);
    return;
  }

  recentLogs.forEach((log) => {
    const li = document.createElement("li");
    li.textContent = `${log.itemName}: ${log.amount}${unitLabel(log.unit)} 사용 · ${toDateString(log.at)}`;
    els.recentUsageList.appendChild(li);
  });
}

function renderProfileSummary() {
  if (!els.profileModeText) return;

  const modeText = state.familyCode ? `가족 모드 (${state.familyCode})` : "개인 모드";
  els.profileModeText.textContent = modeText;
  els.profileItemCount.textContent = `${profileState.nickname || "사용자"} · ${state.items.length}개`;

  let syncText = "로컬 모드";
  if (firebaseSync.enabled && state.familyCode) {
    syncText = "Firebase 실시간 동기화 연결";
  } else if (firebaseSync.enabled) {
    syncText = "Firebase 연결됨 (가족코드 대기)";
  }
  els.profileSyncState.textContent = syncText;

  if (els.profileNicknameInput) {
    els.profileNicknameInput.value = profileState.nickname || "";
  }

  if (els.profileAvatarPreview) {
    els.profileAvatarPreview.src = profileState.avatarDataUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='100%25' height='100%25' fill='%23d8e3fb'/%3E%3Ctext x='50%25' y='54%25' text-anchor='middle' font-size='52' fill='%23045abf'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";
  }
}

async function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지 파일을 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}

async function resetAllAppData() {
  detachFamilyListener();

  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key === BASE_STORAGE_KEY || key.startsWith(`${BASE_STORAGE_KEY}_`) || key === PROFILE_STORAGE_KEY) {
      localStorage.removeItem(key);
    }
  });

  profileState = { nickname: "사용자", avatarDataUrl: "" };
  activeStorageKey = BASE_STORAGE_KEY;
  state = { items: [], familyCode: "", updatedAt: 0 };
  saveState();
  saveProfile();
  setView("dashboard");
  renderAll();

  if (window.firebase && window.firebase.auth) {
    try {
      await window.firebase.auth().signOut();
    } catch {
      // noop
    }
  }

  await initFirebaseSync();
  saveSessionUser(null);
  setStartStatus("로그인 후 방을 선택하세요.");
  showAuthStep();
  if (els.startGate) {
    els.startGate.classList.remove("is-hidden");
  }
}

function renderInventory() {
  els.inventoryList.innerHTML = "";
  const list = getInventoryItemsForView();
  if (!list.length) {
    const emptyText = state.items.length
      ? "조건에 맞는 품목이 없어요. 검색어나 필터를 바꿔보세요."
      : "등록된 품목이 없습니다. 첫 품목을 추가해보세요.";
    els.inventoryList.innerHTML = `<p class='muted'>${emptyText}</p>`;
    return;
  }

  list.forEach((item) => {
    const card = els.itemCardTemplate.content.cloneNode(true);
    card.querySelector(".item-name").textContent = item.name;
    card.querySelector(".item-unit").textContent = `단위: ${unitLabel(item.unit)}`;
    card.querySelector(".qty").textContent = `현재 재고: ${Math.max(item.quantity, 0)}${unitLabel(item.unit)}`;

    const dep = getDepletionInfo(item);
    const forecastEl = card.querySelector(".forecast");
    if (dep) {
      forecastEl.textContent = `예상 소진: ${dep.daysLeft}일 후 (${toDateString(dep.depletionDate)})`;
    } else {
      forecastEl.textContent = "예상 소진: 기록이 더 필요해요.";
    }

    const expiryEl = card.querySelector(".expiry");
    if (item.expiryDate) {
      expiryEl.textContent = `유통기한: ${toDateString(item.expiryDate)}`;
    } else {
      expiryEl.textContent = "유통기한: 미입력";
    }

    card.querySelector(".use-btn").addEventListener("click", () => {
      const amount = getUseStep(item.unit);
      item.quantity = Math.max(0, Number(item.quantity) - amount);
      item.usageLogs = item.usageLogs || [];
      item.usageLogs.push({ at: new Date().toISOString(), amount });
      saveState();
      renderAll();
    });

    card.querySelector(".buy-btn").addEventListener("click", () => {
      const amount = getBuyStep(item.unit);
      item.quantity = Number(item.quantity) + amount;
      item.purchaseLogs = item.purchaseLogs || [];
      item.purchaseLogs.push({ at: new Date().toISOString(), amount });
      saveState();
      renderAll();
    });

    card.querySelector(".delete-btn").addEventListener("click", () => {
      lastDeletedItem = { ...item };
      state.items = state.items.filter((x) => x.id !== item.id);
      saveState();
      renderAll();
      els.quickResult.textContent = `${item.name} 항목을 삭제했어요. 필요하면 복구 버튼을 눌러주세요.`;
    });

    els.inventoryList.appendChild(card);
  });
}

function applyItemTemplate(templateKey) {
  const template = ITEM_TEMPLATES[templateKey];
  if (!template) return;
  document.getElementById("name").value = template.name;
  document.getElementById("unit").value = template.unit;
  document.getElementById("threshold").value = String(template.threshold);
  document.getElementById("quantity").value = String(template.quantity);
  els.quickResult.textContent = `${template.name} 템플릿을 채웠어요. 필요한 값만 바꾼 뒤 등록하세요.`;
}

function restoreLastDeletedItem() {
  if (!lastDeletedItem) {
    els.quickResult.textContent = "복구할 최근 삭제 항목이 없어요.";
    return;
  }

  const exists = state.items.some((item) => item.id === lastDeletedItem.id || item.name === lastDeletedItem.name);
  if (exists) {
    els.quickResult.textContent = "같은 항목이 이미 있어 복구를 건너뛰었어요.";
    lastDeletedItem = null;
    renderAll();
    return;
  }

  state.items.push({ ...lastDeletedItem, id: crypto.randomUUID() });
  const restoredName = lastDeletedItem.name;
  lastDeletedItem = null;
  saveState();
  renderAll();
  els.quickResult.textContent = `${restoredName} 항목을 복구했어요.`;
}

function bindInventoryToolbar() {
  if (els.inventoryFilterInput) {
    els.inventoryFilterInput.addEventListener("input", (e) => {
      inventoryViewState.query = String(e.target.value || "");
      renderInventory();
    });
  }

  if (els.inventorySortSelect) {
    els.inventorySortSelect.addEventListener("change", (e) => {
      inventoryViewState.sort = String(e.target.value || "recent");
      renderInventory();
    });
  }

  if (els.lowStockOnly) {
    els.lowStockOnly.addEventListener("change", (e) => {
      inventoryViewState.lowStockOnly = Boolean(e.target.checked);
      renderInventory();
    });
  }
}

function syncInventoryToolbarState() {
  if (els.inventoryFilterInput && els.inventoryFilterInput.value !== inventoryViewState.query) {
    els.inventoryFilterInput.value = inventoryViewState.query;
  }
  if (els.inventorySortSelect && els.inventorySortSelect.value !== inventoryViewState.sort) {
    els.inventorySortSelect.value = inventoryViewState.sort;
  }
  if (els.lowStockOnly && els.lowStockOnly.checked !== inventoryViewState.lowStockOnly) {
    els.lowStockOnly.checked = inventoryViewState.lowStockOnly;
  }
  if (els.restoreDeletedBtn) {
    els.restoreDeletedBtn.disabled = !lastDeletedItem;
  }
}

function renderAll() {
  const modeText = state.familyCode ? `가족 모드 (${state.familyCode})` : "개인 모드";
  els.syncStatus.textContent = `${modeText}로 저장 중입니다.`;
  renderAlerts();
  renderInventory();
  syncInventoryToolbarState();
  renderShoppingList();
  renderReport();
  renderDashboardSummary();
  renderProfileSummary();
}

function setView(view) {
  const nextView = view || "dashboard";
  currentView = nextView;
  localStorage.setItem(VIEW_STORAGE_KEY, nextView);

  els.menuItems.forEach((item) => {
    const isActive = item.dataset.viewBtn === nextView;
    item.classList.toggle("active", isActive);
  });

  els.viewPanels.forEach((panel) => {
    const views = (panel.dataset.view || "").split(",").map((x) => x.trim());
    panel.classList.toggle("is-hidden", !views.includes(nextView));
  });

  if (window.matchMedia("(max-width: 860px)").matches) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function setAiPanelOpen(open) {
  if (!els.aiAssistantPanel || !els.aiLauncherBtn) return;
  els.aiAssistantPanel.classList.toggle("is-open", open);
  els.aiAssistantPanel.setAttribute("aria-hidden", open ? "false" : "true");
  els.aiLauncherBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function pushAiMessage(role, text) {
  if (!els.aiMessages) return;
  const div = document.createElement("div");
  div.className = `ai-msg ${role}`;
  div.textContent = text;
  els.aiMessages.appendChild(div);
  els.aiMessages.scrollTop = els.aiMessages.scrollHeight;
}

function summarizeInventoryForAi() {
  const items = Array.isArray(state.items) ? state.items : [];
  const lowStockItems = items.filter((item) => isLowStockItem(item)).slice(0, 8);
  const expiringSoonItems = items
    .filter((item) => {
      if (!item.expiryDate) return false;
      const days = Math.ceil((new Date(item.expiryDate) - new Date()) / DAY_MS);
      return days <= 14;
    })
    .slice(0, 8);

  return {
    familyMode: Boolean(state.familyCode),
    familyCode: state.familyCode || "",
    totalItems: items.length,
    shoppingTargets: buildShoppingTargets(items).map((x) => ({
      name: x.name,
      quantity: Number(x.quantity || 0),
      threshold: Number(x.threshold || 0),
      unit: x.unit,
    })),
    lowStockItems: lowStockItems.map((x) => ({
      name: x.name,
      quantity: Number(x.quantity || 0),
      threshold: Number(x.threshold || 0),
      unit: x.unit,
    })),
    expiringSoonItems: expiringSoonItems.map((x) => ({
      name: x.name,
      expiryDate: x.expiryDate,
      quantity: Number(x.quantity || 0),
      unit: x.unit,
    })),
  };
}

function normalizeUnitForState(unit) {
  const value = String(unit || "count").toLowerCase();
  if (value === "roll") return "roll";
  if (value === "percent") return "percent";
  return "count";
}

function applyAiAction(action) {
  if (!action || action.type !== "add_item" || !action.item) return "";

  const incomingName = String(action.item.name || "").trim();
  const incomingQty = Number(action.item.quantity || 0);
  if (!incomingName || !incomingQty || incomingQty <= 0) {
    return "AI 추가 요청을 해석하지 못해 저장하지 않았어요.";
  }

  const unit = normalizeUnitForState(action.item.unit);
  const threshold = Number(action.item.threshold || (unit === "percent" ? 20 : unit === "roll" ? 2 : 1));
  const barcode = String(action.item.barcode || "").trim();
  const expiryDate = action.item.expiryDate ? String(action.item.expiryDate) : null;

  const existing = state.items.find((item) => String(item.name || "").toLowerCase() === incomingName.toLowerCase());
  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + incomingQty;
    existing.unit = unit;
    existing.threshold = threshold;
    if (barcode) {
      existing.barcode = barcode;
    }
    if (expiryDate) {
      existing.expiryDate = expiryDate;
    }
    existing.purchaseLogs = Array.isArray(existing.purchaseLogs) ? existing.purchaseLogs : [];
    existing.purchaseLogs.push({ at: new Date().toISOString(), amount: incomingQty });
    saveState();
    renderAll();
    const unitLabelText = unit === "roll" ? "롤" : unit === "percent" ? "%" : "개";
    return `AI가 기존 품목 ${incomingName}에 ${incomingQty}${unitLabelText}를 추가했어요.`;
  }

  state.items.push({
    id: crypto.randomUUID(),
    name: incomingName,
    barcode,
    unit,
    quantity: incomingQty,
    threshold,
    expiryDate,
    usageLogs: [],
    purchaseLogs: [{ at: new Date().toISOString(), amount: incomingQty }],
    createdAt: new Date().toISOString(),
  });

  saveState();
  renderAll();
  const unitLabelText = unit === "roll" ? "롤" : unit === "percent" ? "%" : "개";
  return `AI가 ${incomingName} ${incomingQty}${unitLabelText}를 재고에 등록했어요.`;
}

async function askInventoryAi(prefilledPrompt) {
  if (!els.aiInput) return;
  const question = String(prefilledPrompt || els.aiInput.value || "").trim();
  if (!question) {
    pushAiMessage("system", "질문을 입력해 주세요.");
    return;
  }

  setAiPanelOpen(true);
  pushAiMessage("user", question);
  if (!prefilledPrompt) {
    els.aiInput.value = "";
  }

  if (els.aiSendBtn) {
    els.aiSendBtn.disabled = true;
  }

  try {
    const response = await fetch("/api/ai-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: question,
        inventoryContext: summarizeInventoryForAi(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const errorText = data && data.error ? data.error : "AI 응답에 실패했어요.";
      pushAiMessage("system", `오류: ${errorText}`);
      return;
    }

    const answer = data && data.text ? String(data.text).trim() : "답변이 비어 있어요.";
    if (data && data.action) {
      const actionResultText = applyAiAction(data.action);
      if (actionResultText) {
        pushAiMessage("system", actionResultText);
      }
    }
    pushAiMessage("assistant", answer);
  } catch {
    pushAiMessage(
      "system",
      "AI 서버에 연결할 수 없어요. Node 서버를 켜고, Azure 환경변수 설정을 확인해 주세요."
    );
  } finally {
    if (els.aiSendBtn) {
      els.aiSendBtn.disabled = false;
    }
  }
}

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const temp = document.createElement("textarea");
  temp.value = text;
  document.body.appendChild(temp);
  temp.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(temp);
  return ok;
}

function mergeItemByName(items, incoming) {
  const found = items.find((x) => x.name.toLowerCase() === incoming.name.toLowerCase());
  if (!found) {
    items.push(incoming);
    return;
  }

  found.quantity = Number(incoming.quantity);
  found.threshold = Number(incoming.threshold);
  found.unit = incoming.unit;
  found.barcode = incoming.barcode || found.barcode || "";
  found.expiryDate = incoming.expiryDate || found.expiryDate || null;
  found.usageLogs = incoming.usageLogs || found.usageLogs || [];
  found.purchaseLogs = incoming.purchaseLogs || found.purchaseLogs || [];
}

function isCameraPermissionDenied(error) {
  const name = String(error && error.name ? error.name : "").toLowerCase();
  const message = String(error && error.message ? error.message : "").toLowerCase();
  return (
    name.includes("notallowed") ||
    name.includes("permission") ||
    message.includes("permission denied") ||
    message.includes("permission") ||
    message.includes("denied")
  );
}

function getCameraTroubleshootingText(prefix) {
  const host = String(window.location.hostname || "").toLowerCase();
  const secureTip =
    window.isSecureContext || host === "localhost" || host === "127.0.0.1"
      ? "브라우저 주소창의 카메라 아이콘에서 이 사이트를 허용으로 바꾼 뒤 다시 시도해 주세요."
      : "카메라는 보안 주소에서만 동작해요. file:// 대신 http://localhost 로 실행해 주세요.";

  return `${prefix} 카메라 권한이 거부되었습니다. ${secureTip} 급하면 위의 바코드 입력칸에 숫자를 직접 입력해도 됩니다.`;
}

async function startScanner() {
  stopScanner();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    els.scanResult.textContent = "이 브라우저는 카메라 접근을 지원하지 않아요. 바코드를 직접 입력해 주세요.";
    return;
  }

  // Native API를 우선 사용하고, 일정 시간 인식이 없으면 ZXing으로 폴백한다.
  if ("BarcodeDetector" in window) {
    await startNativeScanner();
    return;
  }

  await startZxingScanner("네이티브 스캐너 미지원으로 호환 모드(ZXing)로 시작합니다.");
}

function onScanDetected(rawValue) {
  const value = (rawValue || "").trim();
  if (!value) return;

  document.getElementById("barcode").value = value;
  const matched = BARCODE_BOOK[value];
  if (matched) {
    document.getElementById("name").value = matched.name;
    document.getElementById("unit").value = matched.unit;
    document.getElementById("threshold").value = String(matched.threshold);
    els.scanResult.textContent = `스캔 성공: ${value} (${matched.name})`;

    const existing = state.items.find((item) => item.barcode === value || item.name === matched.name);
    if (existing && existing.quantity > existing.threshold * 2) {
      els.quickResult.textContent = `중복 구매 주의: ${existing.name}이(가) 이미 ${existing.quantity}${unitLabel(existing.unit)} 있어요.`;
    }
  } else {
    els.scanResult.textContent = `스캔 성공: ${value} (품목명을 확인 후 등록하세요)`;
  }

  stopScanner();
}

async function startNativeScanner() {
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    els.scanVideo.srcObject = scanStream;
    await els.scanVideo.play();
    nativeScanStartedAt = Date.now();
    els.scanResult.textContent = "스캔 중... 바코드를 화면 중앙에 맞춰주세요.";

    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    scanTimer = setInterval(async () => {
      if (!els.scanVideo.videoWidth) return;
      const codes = await detector.detect(els.scanVideo);
      if (codes.length) {
        onScanDetected(codes[0].rawValue || "");
        return;
      }

      // 네이티브 인식이 느릴 때 자동 폴백
      if (Date.now() - nativeScanStartedAt > 6000) {
        stopScanner();
        await startZxingScanner("인식률 향상을 위해 호환 모드(ZXing)로 전환했습니다.");
      }
    }, 500);
  } catch (error) {
    if (isCameraPermissionDenied(error)) {
      els.scanResult.textContent = getCameraTroubleshootingText("네이티브 스캐너 시작 실패:");
      document.getElementById("barcode").focus();
      return;
    }
    await startZxingScanner(`네이티브 스캐너 시작 실패: ${error.message}. ZXing으로 전환합니다.`);
  }
}

async function startZxingScanner(message) {
  try {
    if (!window.ZXing || !window.ZXing.BrowserMultiFormatReader) {
      els.scanResult.textContent = "호환 스캐너를 불러오지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.";
      return;
    }

    els.scanResult.textContent = message || "ZXing 스캐너로 인식 중입니다.";
    zxingReader = new window.ZXing.BrowserMultiFormatReader();
    await zxingReader.decodeFromVideoDevice(undefined, els.scanVideo, (result, error) => {
      if (result && result.getText) {
        onScanDetected(result.getText());
      } else if (error && error.name !== "NotFoundException") {
        if (isCameraPermissionDenied(error)) {
          els.scanResult.textContent = getCameraTroubleshootingText("호환 스캐너 실행 중 오류:");
          document.getElementById("barcode").focus();
          return;
        }
        els.scanResult.textContent = `스캔 중: ${error.message || "바코드를 찾는 중입니다."}`;
      }
    });
  } catch (error) {
    if (isCameraPermissionDenied(error)) {
      els.scanResult.textContent = getCameraTroubleshootingText("ZXing 시작 실패:");
      document.getElementById("barcode").focus();
      return;
    }
    els.scanResult.textContent = `ZXing 시작 실패: ${error.message}`;
  }
}

function stopScanner() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  if (zxingReader) {
    try {
      zxingReader.reset();
    } catch {
      // noop
    }
    zxingReader = null;
  }
  if (scanStream) {
    scanStream.getTracks().forEach((track) => track.stop());
    scanStream = null;
  }
  els.scanVideo.srcObject = null;
}

els.itemForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  const barcode = document.getElementById("barcode").value.trim();
  const unit = document.getElementById("unit").value;
  const quantity = Number(document.getElementById("quantity").value);
  const threshold = Number(document.getElementById("threshold").value);
  const expiryDate = document.getElementById("expiryDate").value || null;

  if (!name) return;
  if (quantity < 0 || threshold < 0) return;

  const duplicated = state.items.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (duplicated) {
    els.quickResult.textContent = `이미 ${name}이(가) 등록되어 있어요.`;
    return;
  }

  state.items.push({
    id: crypto.randomUUID(),
    name,
    barcode,
    unit,
    quantity,
    threshold,
    expiryDate,
    usageLogs: [],
    purchaseLogs: [],
    createdAt: new Date().toISOString(),
  });

  els.itemForm.reset();
  document.getElementById("threshold").value = "2";
  saveState();
  renderAll();
});

els.quickSearchBtn.addEventListener("click", () => {
  const keyword = els.quickSearch.value.trim().toLowerCase();
  if (!keyword) {
    els.quickResult.textContent = "품목명을 입력해 주세요.";
    return;
  }

  const found = state.items.find(
    (item) => item.name.toLowerCase().includes(keyword) || String(item.barcode || "").includes(keyword)
  );
  if (!found) {
    els.quickResult.textContent = `"${els.quickSearch.value}" 품목은 등록되어 있지 않아요.`;
    return;
  }

  const dep = getDepletionInfo(found);
  const depText = dep ? `약 ${dep.daysLeft}일 사용 가능` : "사용 기록이 더 필요";
  els.quickResult.textContent = `${found.name}: ${found.quantity}${unitLabel(found.unit)} 남음 (${depText})`;
});

els.connectFamilyBtn.addEventListener("click", () => {
  const code = sanitizeCode(els.familyCode.value);
  applyFamilyMode(code);
  els.quickResult.textContent = code
    ? `가족 공유코드 ${code}로 저장소를 연결했어요.`
    : "개인 모드로 전환했어요.";
});

els.exportDataBtn.addEventListener("click", async () => {
  const payload = JSON.stringify(
    {
      version: 1,
      familyCode: state.familyCode || "",
      exportedAt: new Date().toISOString(),
      items: state.items,
    },
    null,
    2
  );

  els.syncPayload.value = payload;
  const ok = await copyText(payload);
  els.syncStatus.textContent = ok ? "공유 데이터가 복사되었습니다." : "복사에 실패했습니다. 텍스트를 직접 복사해 주세요.";
});

els.importDataBtn.addEventListener("click", () => {
  const text = els.syncPayload.value.trim();
  if (!text) {
    els.syncStatus.textContent = "붙여넣을 데이터가 없습니다.";
    return;
  }

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.items)) {
      els.syncStatus.textContent = "데이터 형식이 올바르지 않습니다.";
      return;
    }

    if (parsed.familyCode) {
      applyFamilyMode(parsed.familyCode);
    }

    parsed.items.forEach((incoming) => {
      if (!incoming.id) incoming.id = crypto.randomUUID();
      mergeItemByName(state.items, incoming);
    });

    saveState();
    renderAll();
    els.syncStatus.textContent = "가족 데이터 동기화가 완료되었습니다.";
  } catch {
    els.syncStatus.textContent = "JSON 파싱 실패: 데이터 문자열을 확인해 주세요.";
  }
});

els.startScanBtn.addEventListener("click", startScanner);
els.stopScanBtn.addEventListener("click", () => {
  stopScanner();
  els.scanResult.textContent = "스캔을 중지했습니다.";
});

els.seedBtn.addEventListener("click", () => {
  if (state.items.length) {
    els.quickResult.textContent = "이미 데이터가 있어요. 필요하면 기존 품목을 삭제 후 사용하세요.";
    return;
  }

  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * DAY_MS).toISOString();

  state.items = [
    {
      id: crypto.randomUUID(),
      name: "휴지",
      barcode: "8801043011117",
      unit: "roll",
      quantity: 6,
      threshold: 3,
      expiryDate: null,
      usageLogs: [
        { at: daysAgo(25), amount: 1 },
        { at: daysAgo(20), amount: 1 },
        { at: daysAgo(15), amount: 1 },
        { at: daysAgo(10), amount: 1 },
        { at: daysAgo(5), amount: 1 },
      ],
      purchaseLogs: [{ at: daysAgo(26), amount: 12 }],
      createdAt: now.toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: "샴푸",
      barcode: "8801043014835",
      unit: "percent",
      quantity: 45,
      threshold: 20,
      expiryDate: "2027-06-01",
      usageLogs: [
        { at: daysAgo(21), amount: 5 },
        { at: daysAgo(14), amount: 5 },
        { at: daysAgo(7), amount: 5 },
      ],
      purchaseLogs: [{ at: daysAgo(30), amount: 100 }],
      createdAt: now.toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: "치약",
      barcode: "8801007051043",
      unit: "count",
      quantity: 2,
      threshold: 1,
      expiryDate: "2027-03-10",
      usageLogs: [
        { at: daysAgo(40), amount: 1 },
        { at: daysAgo(10), amount: 1 },
      ],
      purchaseLogs: [{ at: daysAgo(50), amount: 3 }],
      createdAt: now.toISOString(),
    },
  ];

  saveState();
  renderAll();
  els.quickResult.textContent = "샘플 데이터를 추가했어요. 바로 사용해보세요.";
});

if (els.profileAvatarInput) {
  els.profileAvatarInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      els.quickResult.textContent = "이미지 파일만 업로드할 수 있어요.";
      return;
    }

    try {
      profileState.avatarDataUrl = await readImageFileAsDataUrl(file);
      saveProfile();
      renderProfileSummary();
      els.quickResult.textContent = "프로필 이미지가 반영되었어요.";
    } catch {
      els.quickResult.textContent = "이미지 반영에 실패했어요.";
    }
  });
}

if (els.profileSaveBtn) {
  els.profileSaveBtn.addEventListener("click", () => {
    const nickname = (els.profileNicknameInput.value || "").trim();
    profileState.nickname = nickname || "사용자";
    saveProfile();
    renderProfileSummary();
    els.quickResult.textContent = "프로필이 저장되었어요.";
  });
}

if (els.profileResetBtn) {
  els.profileResetBtn.addEventListener("click", async () => {
    const ok = window.confirm("로그아웃하고 로컬 데이터를 모두 초기화할까요?");
    if (!ok) return;

    await resetAllAppData();
    els.quickResult.textContent = "로그아웃과 데이터 초기화가 완료되었어요.";
  });
}

if (els.focusSearchBtn) {
  els.focusSearchBtn.addEventListener("click", () => {
    setView("dashboard");
    if (els.quickSearch) {
      els.quickSearch.focus();
      els.quickSearch.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

if (els.jumpAddBtn) {
  els.jumpAddBtn.addEventListener("click", () => {
    setView("inventory");
    if (els.inventoryFormPanel) {
      els.inventoryFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const nameInput = document.getElementById("name");
    if (nameInput) {
      nameInput.focus();
    }
  });
}

if (els.aiLauncherBtn) {
  els.aiLauncherBtn.addEventListener("click", () => {
    const isOpen = Boolean(els.aiAssistantPanel && els.aiAssistantPanel.classList.contains("is-open"));
    setAiPanelOpen(!isOpen);
    if (!isOpen && els.aiMessages && !els.aiMessages.childElementCount) {
      pushAiMessage("system", "안녕하세요. 재고 상황을 분석해 필요한 구매/소비 우선순위를 도와드릴게요.");
    }
  });
}

if (els.aiCloseBtn) {
  els.aiCloseBtn.addEventListener("click", () => {
    setAiPanelOpen(false);
  });
}

if (els.aiSendBtn) {
  els.aiSendBtn.addEventListener("click", async () => {
    await askInventoryAi();
  });
}

if (els.aiInput) {
  els.aiInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await askInventoryAi();
    }
  });
}

if (els.signupBtn) {
  els.signupBtn.addEventListener("click", () => {
    const id = normalizeLoginId(els.loginIdInput ? els.loginIdInput.value : "");
    const pw = String(els.loginPwInput ? els.loginPwInput.value : "").trim();
    if (!id || !pw) {
      setStartStatus("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    const users = loadUsers();
    if (users[id]) {
      setStartStatus("이미 있는 아이디입니다. 로그인해 주세요.");
      return;
    }

    users[id] = { password: pw, createdAt: Date.now() };
    saveUsers(users);
    setStartStatus("회원가입 완료. 로그인 버튼을 눌러 시작하세요.");
  });
}

if (els.loginBtn) {
  els.loginBtn.addEventListener("click", () => {
    const id = normalizeLoginId(els.loginIdInput ? els.loginIdInput.value : "");
    const pw = String(els.loginPwInput ? els.loginPwInput.value : "").trim();
    if (!id || !pw) {
      setStartStatus("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    const users = loadUsers();
    if (!users[id]) {
      users[id] = { password: pw, createdAt: Date.now() };
      saveUsers(users);
    } else if (users[id].password !== pw) {
      setStartStatus("로그인 실패: 비밀번호를 확인해 주세요.");
      return;
    }

    saveSessionUser({ id });
    profileState.nickname = id;
    saveProfile();
    showRoomStep();
    setStartStatus(`${id}님, 방을 선택하세요.`);
  });
}

if (els.anonStartBtn) {
  els.anonStartBtn.addEventListener("click", async () => {
    try {
      if (isFirebaseAuthAvailable()) {
        await ensureFirebaseInitialized();
        await window.firebase.auth().signInAnonymously();
      }
      const anonId = `guest-${Math.random().toString(36).slice(2, 6)}`;
      saveSessionUser({ id: anonId, type: "anonymous" });
      profileState.nickname = anonId;
      saveProfile();
      showRoomStep();
      setStartStatus("익명 로그인 완료. 방을 선택하세요.");
    } catch (error) {
      setStartStatus(`익명 로그인 실패: ${error.message}`);
    }
  });
}

if (els.realSignupBtn) {
  els.realSignupBtn.addEventListener("click", async () => {
    const email = String(els.realEmailInput ? els.realEmailInput.value : "").trim();
    const pw = String(els.realPwInput ? els.realPwInput.value : "").trim();
    if (!isValidEmail(email)) {
      setStartStatus("유효한 이메일을 입력해 주세요.");
      return;
    }
    if (pw.length < 6) {
      setStartStatus("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    try {
      await ensureFirebaseInitialized();
      await window.firebase.auth().createUserWithEmailAndPassword(email, pw);
      saveSessionUser({ id: email, type: "firebase" });
      profileState.nickname = email.split("@")[0] || email;
      saveProfile();
      showRoomStep();
      setStartStatus("실계정 회원가입 완료. 방을 선택하세요.");
    } catch (error) {
      setStartStatus(`실계정 회원가입 실패: ${error.message}`);
    }
  });
}

if (els.realLoginBtn) {
  els.realLoginBtn.addEventListener("click", async () => {
    const email = String(els.realEmailInput ? els.realEmailInput.value : "").trim();
    const pw = String(els.realPwInput ? els.realPwInput.value : "").trim();
    if (!isValidEmail(email)) {
      setStartStatus("유효한 이메일을 입력해 주세요.");
      return;
    }
    if (!pw) {
      setStartStatus("비밀번호를 입력해 주세요.");
      return;
    }

    try {
      await ensureFirebaseInitialized();
      await window.firebase.auth().signInWithEmailAndPassword(email, pw);
      saveSessionUser({ id: email, type: "firebase" });
      profileState.nickname = email.split("@")[0] || email;
      saveProfile();
      showRoomStep();
      setStartStatus("실계정 로그인 완료. 방을 선택하세요.");
    } catch (error) {
      setStartStatus(`실계정 로그인 실패: ${error.message}`);
    }
  });
}

if (els.googleLoginBtn) {
  els.googleLoginBtn.addEventListener("click", async () => {
    await loginWithSocialProvider("Google", () => new window.firebase.auth.GoogleAuthProvider());
  });
}

if (els.githubLoginBtn) {
  els.githubLoginBtn.addEventListener("click", async () => {
    await loginWithSocialProvider("GitHub", () => new window.firebase.auth.GithubAuthProvider());
  });
}

if (els.facebookLoginBtn) {
  els.facebookLoginBtn.addEventListener("click", async () => {
    await loginWithSocialProvider("Facebook", () => new window.firebase.auth.FacebookAuthProvider());
  });
}

if (els.appleLoginBtn) {
  els.appleLoginBtn.addEventListener("click", async () => {
    await loginWithSocialProvider("Apple", () => new window.firebase.auth.OAuthProvider("apple.com"));
  });
}

if (els.microsoftLoginBtn) {
  els.microsoftLoginBtn.addEventListener("click", async () => {
    await loginWithSocialProvider("Microsoft", () => new window.firebase.auth.OAuthProvider("microsoft.com"));
  });
}

if (els.twitterLoginBtn) {
  els.twitterLoginBtn.addEventListener("click", async () => {
    await loginWithSocialProvider("Twitter", () => new window.firebase.auth.TwitterAuthProvider());
  });
}

if (els.yahooLoginBtn) {
  els.yahooLoginBtn.addEventListener("click", async () => {
    await loginWithSocialProvider("Yahoo", () => new window.firebase.auth.OAuthProvider("yahoo.com"));
  });
}

if (els.createRoomBtn) {
  els.createRoomBtn.addEventListener("click", () => {
    const roomCode = createRoomCode();
    if (els.roomCodeInput) {
      els.roomCodeInput.value = roomCode;
    }
    applyFamilyMode(roomCode);
    setStartStatus(`새 방 생성 완료: ${roomCode}`);
    finishStartFlow();
  });
}

if (els.joinRoomBtn) {
  els.joinRoomBtn.addEventListener("click", () => {
    const code = sanitizeCode(els.roomCodeInput ? els.roomCodeInput.value : "");
    if (!code) {
      setStartStatus("방 코드를 입력해 주세요.");
      return;
    }
    applyFamilyMode(code);
    setStartStatus(`방 입장 완료: ${code}`);
    finishStartFlow();
  });
}

if (els.soloStartBtn) {
  els.soloStartBtn.addEventListener("click", () => {
    applyFamilyMode("");
    setStartStatus("개인 모드로 시작합니다.");
    finishStartFlow();
  });
}

els.menuItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    setView(item.dataset.viewBtn);
  });
});

document.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;

  const templateBtn = target.closest("[data-template-item]");
  if (templateBtn) {
    e.preventDefault();
    applyItemTemplate(templateBtn.dataset.templateItem);
    return;
  }

  const restoreBtn = target.closest("#restoreDeletedBtn");
  if (restoreBtn) {
    e.preventDefault();
    restoreLastDeletedItem();
    return;
  }

  const aiPromptBtn = target.closest("[data-ai-prompt]");
  if (aiPromptBtn) {
    e.preventDefault();
    const prompt = String(aiPromptBtn.getAttribute("data-ai-prompt") || "").trim();
    if (prompt) {
      askInventoryAi(prompt);
    }
  }
});

document.addEventListener("input", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id !== "inventoryFilterInput") return;
  inventoryViewState.query = String(target.value || "");
  renderInventory();
});

document.addEventListener("change", (e) => {
  const target = e.target;
  if (target instanceof HTMLSelectElement && target.id === "inventorySortSelect") {
    inventoryViewState.sort = String(target.value || "recent");
    renderInventory();
    return;
  }

  if (target instanceof HTMLInputElement && target.id === "lowStockOnly") {
    inventoryViewState.lowStockOnly = Boolean(target.checked);
    renderInventory();
  }
});

bindInventoryToolbar();
renderAll();
setView(currentView);
initFirebaseSync();
initializeStartFlow();
hydrateRedirectAuthResult();

if (els.footerYear) {
  els.footerYear.textContent = String(new Date().getFullYear());
}

window.addEventListener("beforeunload", stopScanner);
