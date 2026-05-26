import * as fs from "fs";
import * as path from "path";
import { parse } from "@iarna/toml";
import nodemailer from "nodemailer";

interface WechatConfig {
  appId: string;
  appSecret: string;
  templateId: string;
}

function loadWechatConfig(): WechatConfig {
  const configPath = path.join(process.env.HOME || "", ".config/aic/config.toml");
  if (!fs.existsSync(configPath)) {
    throw new Error("Wechat config not found. Create ~/.config/aic/config.toml");
  }
  const content = fs.readFileSync(configPath, "utf-8");
  const config = parse(content) as unknown as { wechat: WechatConfig };
  return config.wechat;
}

interface WechatTemplateData {
  [key: string]: {
    value: string;
    color?: string;
  };
}

interface SendMessageResult {
  success: boolean;
  errcode?: number;
  errmsg?: string;
  msgid?: number;
}

async function getWechatAccessToken(): Promise<string> {
  const config = loadWechatConfig();

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.appId}&secret=${config.appSecret}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.access_token) {
    return data.access_token;
  }

  throw new Error(`Failed to get access token: ${data.errmsg}`);
}

export async function sendWechatTemplateMessage(
  toUser: string,
  data: WechatTemplateData,
  url?: string,
  templateId?: string
): Promise<SendMessageResult> {
  const config = loadWechatConfig();
  const tmplId = templateId || config.templateId;

  if (!tmplId) {
    throw new Error("Wechat templateId not configured");
  }

  const accessToken = await getWechatAccessToken();
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`;

  const payload: Record<string, unknown> = {
    touser: toUser,
    template_id: tmplId,
    data,
  };

  if (url) {
    payload.url = url;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (result.errcode === 0) {
    return { success: true, errcode: 0, errmsg: "ok", msgid: result.msgid };
  }

  return { success: false, errcode: result.errcode, errmsg: result.errmsg };
}

export interface NotifyOptions {
  title: string;
  content: string;
  type?: string;
  time?: string;
  remark?: string;
  url?: string;
}

export async function sendWechatNotify(
  toUser: string,
  opts: NotifyOptions
): Promise<SendMessageResult> {
  const { title, content, type, time, remark, url } = opts;
  const templateData: WechatTemplateData = {
    first: { value: title, color: "#173077" },
    const01: { value: type || "系统通知", color: "#1890FF" },
    thing01: { value: content, color: "#333333" },
    time01: { value: time || new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }), color: "#999999" },
    remark: { value: remark || "如有疑问请联系我们", color: "#FF6B6B" },
  };
  return sendWechatTemplateMessage(toUser, templateData, url);
}

export async function sendEmail(
  to: string,
  subject: string,
  content: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { loadConfig } = await import("./config");
  const config = loadConfig();

  if (!config?.email?.host) {
    throw new Error("Email not configured in ~/.config/aic/config.toml");
  }

  const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.ssl,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });

  const mailOptions = {
    from: config.email.from,
    to,
    subject,
    text: content,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendSms(
  phone: string,
  params: Record<string, string>
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  const { loadConfig } = await import("./config");
  const config = loadConfig();

  if (!config?.sms?.provider) {
    throw new Error("SMS provider not configured in ~/.config/aic/config.toml");
  }

  if (config.sms.provider === "aliyun") {
    return sendAliyunSms(phone, params, config);
  }

  throw new Error(`Unsupported SMS provider: ${config.sms.provider}`);
}

interface SmsConfig {
  sms: {
    provider: string;
    accessKeyId: string;
    accessKeySecret: string;
    signName: string;
    templateCode: string;
  };
}

async function sendAliyunSms(
  phone: string,
  params: Record<string, string>,
  config: SmsConfig
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  const { accessKeyId, accessKeySecret, signName, templateCode } = config.sms!;

  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error("Aliyun SMS credentials not configured");
  }

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const nonce = Math.random().toString(36).substring(2);

  const payload = JSON.stringify({
    phone_numbers: [phone],
    sign_name: signName,
    template_code: templateCode,
    template_param: params,
  });

  const stringToSign = `POST&%2F&encodeURIComponent(${encodeURIComponent(payload)})}&access_key_id=${accessKeyId}&timestamp=${encodeURIComponent(timestamp)}&nonce=${nonce}&signature_method=HMAC-SHA1&signature_version=1.0`;

  const cryptoModule = await import("crypto");
  const signature = cryptoModule
    .createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");

  const url = `https://dysmsapi.aliyuncs.com/?AccessKeyId=${accessKeyId}&Timestamp=${encodeURIComponent(timestamp)}&Nonce=${nonce}&Signature=${encodeURIComponent(signature)}&SignatureVersion=1.0&SignatureMethod=HMAC-SHA1&Format=JSON`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
    });

    const result = await response.json();

    if (result.Code === "OK") {
      return { success: true, requestId: result.RequestId };
    }

    return { success: false, error: result.Message || result.Code };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
