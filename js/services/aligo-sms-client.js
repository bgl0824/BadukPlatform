/**
 * Aligo 문자 API 클라이언트 (프론트)
 * — API Key는 서버(/api/sms/send-test)에만 두고, 브라우저는 프록시만 호출합니다.
 */

const DEFAULT_SMS_TEST_API_URL = "/api/sms/send-test";

function getSmsTestApiUrl() {
  const configured = String(window.BadukConfig?.smsTestApiUrl ?? "").trim();
  return configured || DEFAULT_SMS_TEST_API_URL;
}

export function normalizeSmsPhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatSmsPhoneDisplay(value) {
  const digits = normalizeSmsPhone(value);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export function buildAligoTestMessage(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `[바둑 플랫폼 테스트]\n문자 API 정상 발송 테스트입니다.\n시간 :\n${stamp}`;
}

export async function fetchAligoSmsConfigStatus() {
  const url = getSmsTestApiUrl();
  console.log("[aligo-sms] config request", { url, method: "GET" });

  try {
    const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    console.log("[aligo-sms] config response", { httpStatus: response.status, data });
    return {
      ok: response.ok,
      httpStatus: response.status,
      ...data,
    };
  } catch (error) {
    console.error("[aligo-sms] config error", error);
    return {
      ok: false,
      configured: false,
      message: error?.message || "설정 상태를 확인할 수 없습니다.",
    };
  }
}

/**
 * @param {{ receiver: string, msg?: string }} payload
 */
export async function sendAligoTestSms(payload) {
  const url = getSmsTestApiUrl();
  const receiver = normalizeSmsPhone(payload.receiver);
  const msg = String(payload.msg ?? "").trim() || buildAligoTestMessage();

  const requestBody = { receiver, msg };
  console.log("[aligo-sms] send request", {
    url,
    method: "POST",
    receiver: formatSmsPhoneDisplay(receiver),
    msg,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json().catch(() => ({}));
    console.log("[aligo-sms] send response", { httpStatus: response.status, data });

    if (!response.ok || !data?.ok) {
      const message =
        data?.message ||
        data?.aligo?.message ||
        `문자 발송 실패 (HTTP ${response.status})`;
      console.error("[aligo-sms] send failed", { message, data });
      return {
        ok: false,
        message,
        resultCode: data?.resultCode ?? data?.aligo?.result_code ?? null,
        aligo: data?.aligo ?? null,
        httpStatus: response.status,
      };
    }

    return {
      ok: true,
      message: data.message || "문자 발송 성공",
      resultCode: data.resultCode ?? data.aligo?.result_code ?? null,
      aligo: data.aligo ?? null,
      httpStatus: response.status,
    };
  } catch (error) {
    console.error("[aligo-sms] send error", error);
    return {
      ok: false,
      message: error?.message || "네트워크 오류로 문자 발송에 실패했습니다.",
    };
  }
}
