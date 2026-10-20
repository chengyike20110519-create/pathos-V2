// Single source of truth for the contact details and service promises we
// show to users.
//
// Every value is opt-in via environment variables. When a channel is not
// configured we render nothing instead of a placeholder: a fake address
// like support@pathos.example is worse than an absent one, because a
// paying customer will try it.

function envValue(name: string): string | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  // Guard against example/placeholder values reaching production.
  if (/(^|[@.])example(\.|$)|\bchangeme\b|\bTODO\b/i.test(raw)) return null;
  return raw;
}

export interface ContactChannels {
  email: string | null;
  wechatId: string | null;
  wechatQrUrl: string | null;
  phone: string | null;
  hours: string | null;
  hasAnyChannel: boolean;
}

export function getContactChannels(): ContactChannels {
  const email = envValue("NEXT_PUBLIC_SUPPORT_EMAIL");
  const wechatId = envValue("NEXT_PUBLIC_SUPPORT_WECHAT_ID");
  const wechatQrUrl = envValue("NEXT_PUBLIC_WECHAT_QR_URL");
  const phone = envValue("NEXT_PUBLIC_SUPPORT_PHONE");
  const hours = envValue("NEXT_PUBLIC_SUPPORT_HOURS");
  return {
    email,
    wechatId,
    wechatQrUrl,
    phone,
    hours,
    hasAnyChannel: Boolean(email || wechatId || wechatQrUrl || phone),
  };
}

// Commercial capabilities that are only real once the matching system
// exists. Pages read these instead of hard-coding claims, so we cannot
// promise invoices or SLAs that nothing backs.
export interface CommercialCapabilities {
  onlinePayment: boolean;
  invoices: boolean;
  webhooks: boolean;
  selfServeApiKeys: boolean;
}

function flag(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

export function getCommercialCapabilities(): CommercialCapabilities {
  return {
    onlinePayment: flag("PATHOS_FEATURE_ONLINE_PAYMENT"),
    invoices: flag("PATHOS_FEATURE_INVOICES"),
    webhooks: flag("PATHOS_FEATURE_WEBHOOKS"),
    selfServeApiKeys: flag("PATHOS_FEATURE_SELF_SERVE_API_KEYS"),
  };
}
