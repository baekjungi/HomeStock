import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));

app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net https://www.gstatic.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.gstatic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://www.googleapis.com https://*.firebaseapp.com https://accounts.google.com",
      "frame-src 'self' https://*.firebaseapp.com https://apis.google.com https://accounts.google.com",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  next();
});

app.use((req, res, next) => {
  const p = String(req.path || "").toLowerCase();
  const blocked = ["/.env", "/package.json", "/package-lock.json", "/.gitignore", "/.git/"];
  if (blocked.some((x) => p.startsWith(x))) {
    return res.status(404).send("Not found");
  }
  return next();
});

app.use(
  express.static(__dirname, {
    dotfiles: "deny",
    etag: true,
    maxAge: "1h",
  })
);

const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "";
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "";
const apiKey = process.env.AZURE_OPENAI_API_KEY || "";
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
const port = Number(process.env.PORT || 5501);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const aiRateMap = new Map();

const SUPPORTED_UNITS = {
  개: "count",
  count: "count",
  롤: "roll",
  roll: "roll",
  "%": "percent",
  퍼센트: "percent",
  percent: "percent",
};

function hasAzureConfig() {
  return Boolean(endpoint && deployment && apiKey);
}

function getDefaultThreshold(unit) {
  if (unit === "roll") return 2;
  if (unit === "percent") return 20;
  return 1;
}

function normalizeUnit(rawUnit) {
  if (!rawUnit) return "count";
  const key = String(rawUnit).trim().toLowerCase();
  return SUPPORTED_UNITS[key] || SUPPORTED_UNITS[String(rawUnit).trim()] || "count";
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductName(rawName) {
  let value = stripMarkdown(rawName);
  value = value
    .replace(/\s*\d+\s*(개|롤|%|퍼센트|percent|count|roll)?\s*(?:를|을)?\s*(추가|등록|넣어|넣어줘|저장|담아|올려|올려줘).*/i, "")
    .replace(/^(품목명?|상품)(?:에|은|을|는|:)?\s*/i, "")
    .trim();
  return value.slice(0, 40);
}

function parseAddItemAction(message) {
  const text = stripMarkdown(message);
  const addIntent = /(추가|등록|넣어|넣어줘|저장|담아|올려|올려줘)/.test(text);
  if (!addIntent) return null;

  const quantityByField = text.match(/수량(?:에|은|을|는|:)?\s*(\d+)\s*(개|롤|%|퍼센트|percent|count|roll)?/i);
  const quantityByVerb = text.match(
    /(\d+)\s*(개|롤|%|퍼센트|percent|count|roll)?\s*(?:를|을)?\s*(추가|등록|넣어|넣어줘|저장|담아|올려|올려줘)/i
  );

  const quantityMatch = quantityByField || quantityByVerb;
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
  if (!quantity || quantity <= 0) return null;

  const unitRaw = quantityMatch && quantityMatch[2] ? quantityMatch[2] : "개";
  const unit = normalizeUnit(unitRaw);

  const byInputProduct = text.match(/입력한\s*상품(?:은|:)?\s*([^,\.\n]+?)(?:,|\.|\n|$)/i);
  const byField = text.match(/품목(?:명)?(?:에|은|을|는|:)?\s*([^,\.\n]+?)(?:,|\.|\n|$)/i);
  const byPattern = text.match(
    /([^,\.\n]{1,40})\s*\d+\s*(개|롤|%|퍼센트|percent|count|roll)?\s*(?:를|을)?\s*(추가|등록|넣어|넣어줘|저장|담아|올려|올려줘)/i
  );
  const byQuote = text.match(/["'“”‘’]([^"'“”‘’]{1,40})["'“”‘’]/);

  const name =
    (byInputProduct && byInputProduct[1] ? byInputProduct[1] : "") ||
    (byField && byField[1] ? byField[1] : "") ||
    (byPattern && byPattern[1] ? byPattern[1] : "") ||
    (byQuote && byQuote[1] ? byQuote[1] : "");

  const productName = cleanProductName(name);
  if (!productName) return null;

  const dateMatch = text.match(/(20\d{2}-\d{2}-\d{2})/);
  const expiryDate = dateMatch ? dateMatch[1] : null;

  const dateType = /소비기한/.test(text)
    ? "소비기한"
    : /유통기한/.test(text)
      ? "유통기한"
      : null;

  const missingFields = [];
  if (!dateType) {
    missingFields.push("해당 날짜가 소비기한인지 유통기한인지");
  }
  if (!dateMatch) {
    missingFields.push("기한 날짜");
  }

  return {
    type: "add_item",
    item: {
      name: productName,
      quantity,
      unit,
      threshold: getDefaultThreshold(unit),
      barcode: "",
      expiryDate,
      dateType,
    },
    missingFields,
  };
}

function getClientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || req.socket?.remoteAddress || "unknown";
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const row = aiRateMap.get(ip);
  if (!row || now - row.start > RATE_LIMIT_WINDOW_MS) {
    aiRateMap.set(ip, { start: now, count: 1 });
    return true;
  }
  if (row.count >= RATE_LIMIT_MAX) {
    return false;
  }
  row.count += 1;
  aiRateMap.set(ip, row);
  return true;
}

app.post("/api/ai-chat", async (req, res) => {
  if (!checkRateLimit(req)) {
    return res.status(429).json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." });
  }

  if (!hasAzureConfig()) {
    return res.status(503).json({
      error: "Azure OpenAI 환경변수가 비어 있어요. .env 또는 시스템 환경변수를 설정해 주세요.",
    });
  }

  const message = String(req.body?.message || "").trim().slice(0, 1000);
  const inventoryContext = req.body?.inventoryContext || {};

  if (!message) {
    return res.status(400).json({ error: "message 값이 필요합니다." });
  }

  const addItemAction = parseAddItemAction(message);
  if (addItemAction) {
    const item = addItemAction.item;
    const unitLabel = item.unit === "roll" ? "롤" : item.unit === "percent" ? "%" : "개";
    const dateText = item.expiryDate ? ` 기한(${item.dateType || "미지정"})은 ${item.expiryDate}로 저장할게요.` : "";
    const missingText =
      addItemAction.missingFields && addItemAction.missingFields.length
        ? `\n확인이 필요한 항목: ${addItemAction.missingFields.join(", ")}`
        : "";
    return res.json({
      text: `${item.name} ${item.quantity}${unitLabel}를 재고에 추가할게요.${dateText} 등록 후 기한 알림은 자동으로 반영됩니다.${missingText}`,
      action: addItemAction,
    });
  }

  const systemPrompt = [
    "당신은 HomeStock 재고 도우미입니다.",
    "답변은 한국어로, 중학생도 이해할 수 있게 짧고 명확하게 작성하세요.",
    "무조건 실행 가능한 행동 순서(번호 목록)를 포함하세요.",
    "과도한 추측은 금지하고, 데이터 부족 시 확인이 필요한 항목을 분리해 말하세요.",
  ].join(" ");

  const userPayload = {
    question: message,
    inventory: inventoryContext,
    now: new Date().toISOString(),
  };

  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  try {
    const azureResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        max_completion_tokens: 500,
      }),
    });

    const data = await azureResponse.json();
    if (!azureResponse.ok) {
      const detail = data?.error?.message || "Azure OpenAI 호출 실패";
      return res.status(azureResponse.status).json({ error: detail });
    }

    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    return res.json({ text: text || "응답이 비어 있어요. 질문을 더 구체적으로 입력해 주세요." });
  } catch {
    return res.status(500).json({ error: "AI 서버 처리 중 오류가 발생했습니다." });
  }
});

app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`HomeStock server running: http://localhost:${port}`);
});
