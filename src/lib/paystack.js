/**
 * Paystack client for OkumuTraders (from LavernAI paystack.service.ts).
 */

const getBaseUrl = () => {
  let url = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  if (!url.endsWith("/api")) {
    url = url.replace(/\/$/, "");
    if (!url.endsWith("/api")) url += "/api";
  }
  return url.replace(/\/api$/, "");
};

const API_ROOT = getBaseUrl();

function authHeaders(token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export const MIN_DEPOSIT_KES = 200;
export const MIN_WITHDRAWAL_KES = 500;

export async function getPublicKey(token) {
  const res = await fetch(`${API_ROOT}/api/payments/paystack/public-key`, {
    headers: authHeaders(token),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to load Paystack");
  return data.data.publicKey;
}

export async function initializeMpesa(amountKes, phone, email, token, metadata = {}) {
  const res = await fetch(`${API_ROOT}/api/payments/paystack/mpesa`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ amount: amountKes, phone, email, metadata }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "M-Pesa failed");
  const ref = data.data?.reference;
  if (!ref) throw new Error(data.message || "No payment reference");
  return { reference: ref, message: data.message };
}

export async function verifyPayment(reference, token) {
  const res = await fetch(
    `${API_ROOT}/api/payments/paystack/verify/${encodeURIComponent(reference)}`,
    { headers: authHeaders(token) },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Verify failed");
  if (data.success && data.data?.status === "success") {
    return { status: "success", newBalance: data.data.newBalance, amount: data.data.amount };
  }
  if (data.data?.status === "failed" || data.data?.status === "abandoned") {
    return { status: "failed" };
  }
  return { status: "pending" };
}

export async function requestWithdrawal(amountKes, token) {
  const res = await fetch(`${API_ROOT}/api/transactions/withdrawal/request`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ amount: amountKes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Withdrawal failed");
  return data;
}

export function loadPaystackScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window"));
    if (window.PaystackPop) return resolve();
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Paystack script failed"));
    document.head.appendChild(s);
  });
}

export async function openPaystackCard({ publicKey, email, amountKes, token, onSuccess, onCancel }) {
  await loadPaystackScript();
  const initRes = await fetch(`${API_ROOT}/api/payments/paystack/initialize`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      amount: amountKes,
      email,
      metadata: { purpose: "deposit" },
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok) throw new Error(initData.message || "Could not start card payment");

  const ref = initData.data?.reference;
  window.PaystackPop.setup({
    key: publicKey,
    email,
    amount: amountKes * 100,
    currency: "KES",
    ref,
    channels: ["card"],
    callback: (response) => onSuccess?.(response.reference || ref),
    onClose: () => onCancel?.(),
  }).openIframe();
}

export async function pollUntilPaid(reference, token, { maxAttempts = 50, intervalMs = 3000 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    const r = await verifyPayment(reference, token);
    if (r.status === "success") return r;
    if (r.status === "failed") throw new Error("Payment failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Payment timed out. If you paid, check History or contact support.");
}
