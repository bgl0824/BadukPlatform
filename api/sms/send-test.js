/**
 * Vercel Serverless: Aligo SMS 테스트 발송
 *
 * GET  /api/sms/send-test  — 설정 여부 확인 (시크릿 미노출)
 * POST /api/sms/send-test  — 테스트 문자 1건 발송
 *
 * Env (Vercel):
 *   ALIGO_API_KEY   — API Key
 *   ALIGO_USER_ID   — 알리고 로그인 ID
 *   ALIGO_SENDER    — 등록된 발신번호 (숫자만 또는 하이픈)
 */

const ALIGO_SEND_URL = "https://apis.aligo.in/send/";

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readAligoConfig() {
  const key = String(process.env.ALIGO_API_KEY ?? "").trim();
  const userId = String(process.env.ALIGO_USER_ID ?? "").trim();
  const sender = String(process.env.ALIGO_SENDER ?? "").trim();
  return { key, userId, sender };
}

function maskPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 7) {
    return digits ? "***" : "";
  }
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function maskUserId(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  if (text.length <= 2) {
    return "*".repeat(text.length);
  }
  return `${text.slice(0, 1)}***${text.slice(-1)}`;
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function buildConfigStatus() {
  const { key, userId, sender } = readAligoConfig();
  const configured = Boolean(key && userId && sender);
  const missing = [];
  if (!key) missing.push("ALIGO_API_KEY");
  if (!userId) missing.push("ALIGO_USER_ID");
  if (!sender) missing.push("ALIGO_SENDER");

  return {
    configured,
    missing,
    senderMasked: sender ? maskPhone(sender) : "",
    userIdMasked: userId ? maskUserId(userId) : "",
    hasApiKey: Boolean(key),
  };
}

function formatTestMessage(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `[바둑 플랫폼 테스트]\n문자 API 정상 발송 테스트입니다.\n시간 :\n${stamp}`;
}

function parseRequestBody(request) {
  if (!request.body) {
    return {};
  }
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }
  return request.body;
}

async function sendAligoSms({ key, userId, sender, receiver, msg }) {
  const body = new URLSearchParams();
  body.set("key", key);
  body.set("user_id", userId);
  body.set("sender", normalizePhone(sender));
  body.set("receiver", normalizePhone(receiver));
  body.set("msg", msg);
  // 실제 발송 검증이 목적이므로 테스트모드 비활성
  body.set("testmode_yn", "N");

  const requestPreview = {
    url: ALIGO_SEND_URL,
    user_id: maskUserId(userId),
    sender: maskPhone(sender),
    receiver: maskPhone(receiver),
    msgPreview: String(msg).slice(0, 80),
    testmode_yn: "N",
  };
  console.log("[api/sms/send-test] Aligo request", requestPreview);

  const upstream = await fetch(ALIGO_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: body.toString(),
  });

  const rawText = await upstream.text();
  let data = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = null;
  }

  console.log("[api/sms/send-test] Aligo response", {
    httpStatus: upstream.status,
    body: data ?? rawText.slice(0, 500),
  });

  return {
    httpStatus: upstream.status,
    rawText,
    data,
  };
}

function interpretAligoResult(payload) {
  const data = payload.data;
  if (!data || typeof data !== "object") {
    return {
      ok: false,
      message: payload.rawText
        ? `알리고 응답 파싱 실패: ${String(payload.rawText).slice(0, 200)}`
        : `알리고 HTTP ${payload.httpStatus}`,
      resultCode: null,
      aligo: null,
    };
  }

  const resultCode = data.result_code ?? data.resultCode ?? null;
  const codeNumber = Number(resultCode);
  const ok = codeNumber === 1;
  const message = String(data.message ?? data.msg ?? (ok ? "success" : "발송 실패"));

  return {
    ok,
    message,
    resultCode,
    aligo: data,
  };
}

module.exports = async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method === "GET") {
    const status = buildConfigStatus();
    console.log("[api/sms/send-test] config status", status);
    response.status(200).json(status);
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  const config = readAligoConfig();
  const status = buildConfigStatus();
  if (!status.configured) {
    console.error("[api/sms/send-test] missing env", status.missing);
    response.status(503).json({
      ok: false,
      message: `Aligo API 설정이 없습니다. Vercel 환경변수 확인: ${status.missing.join(", ")}`,
      config: status,
    });
    return;
  }

  const body = parseRequestBody(request);
  const receiver = normalizePhone(body.receiver);
  if (receiver.length < 10 || receiver.length > 11) {
    response.status(400).json({
      ok: false,
      message: "수신번호는 휴대폰 번호 10~11자리로 입력해 주세요.",
    });
    return;
  }

  const msg = String(body.msg ?? "").trim() || formatTestMessage();

  try {
    const upstream = await sendAligoSms({
      key: config.key,
      userId: config.userId,
      sender: config.sender,
      receiver,
      msg,
    });
    const interpreted = interpretAligoResult(upstream);

    if (!interpreted.ok) {
      console.error("[api/sms/send-test] send failed", interpreted);
      response.status(502).json({
        ok: false,
        message: interpreted.message,
        resultCode: interpreted.resultCode,
        aligo: interpreted.aligo,
        config: {
          senderMasked: status.senderMasked,
          userIdMasked: status.userIdMasked,
        },
      });
      return;
    }

    console.log("[api/sms/send-test] send success", {
      resultCode: interpreted.resultCode,
      msgId: interpreted.aligo?.msg_id ?? null,
    });

    response.status(200).json({
      ok: true,
      message: interpreted.message || "문자 발송 성공",
      resultCode: interpreted.resultCode,
      aligo: interpreted.aligo,
      config: {
        senderMasked: status.senderMasked,
        userIdMasked: status.userIdMasked,
      },
    });
  } catch (error) {
    console.error("[api/sms/send-test] exception", {
      message: error?.message,
      stack: error?.stack,
    });
    response.status(500).json({
      ok: false,
      message: error?.message || "문자 발송 중 오류가 발생했습니다.",
    });
  }
};
