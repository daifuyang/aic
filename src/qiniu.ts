import qiniu from "qiniu";
import https from "https";
import { createHmac } from "crypto";
import { loadConfig as loadGlobalConfig } from "./config";

export interface QiniuConfig {
  accessKey: string;
  secretKey: string;
  bucket: string;
  domain: string;
  region: string;
}

export interface QiniuCdnConfig {
  accessKey: string;
  secretKey: string;
}

function loadConfig(): QiniuConfig {
  const globalConfig = loadGlobalConfig();
  if (globalConfig?.qiniu) {
    const { accessKey, secretKey, bucket, domain, region } = globalConfig.qiniu;
    if (!accessKey || !secretKey || !bucket || !domain) {
      throw new Error("Missing required qiniu config fields");
    }
    return { accessKey, secretKey, bucket, domain, region: region || "z0" };
  }
  throw new Error("No qiniu config found. Please configure ~/.config/aic/config.toml");
}

function loadCdnConfig(): QiniuCdnConfig {
  const globalConfig = loadGlobalConfig();
  if (globalConfig?.qiniu) {
    return {
      accessKey: globalConfig.qiniu.accessKey,
      secretKey: globalConfig.qiniu.secretKey
    };
  }
  throw new Error("No qiniu config found. Please configure ~/.config/aic/config.toml");
}

export class QiniuClient {
  private config: QiniuConfig;
  private mac: qiniu.auth.digest.Mac;
  private configObj: qiniu.conf.Config;
  private bucketManager: qiniu.rs.BucketManager;

  constructor(config?: Partial<QiniuConfig>) {
    this.config = config ? { ...loadConfig(), ...config } : loadConfig();
    this.mac = new qiniu.auth.digest.Mac(this.config.accessKey, this.config.secretKey);
    this.configObj = new qiniu.conf.Config({
      regionsProvider: qiniu.httpc.Region.fromRegionId(this.config.region),
    });
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, this.configObj);
  }

  private getUploadToken(expires = 3600): string {
    const options: qiniu.rs.PutPolicyOptions = {
      scope: this.config.bucket,
      expires,
    };
    const putPolicy = new qiniu.rs.PutPolicy(options);
    return putPolicy.uploadToken(this.mac);
  }

  async uploadFile(localFile: string, key?: string): Promise<{ key: string; hash: string; fsize: number; bucket: string }> {
    const token = this.getUploadToken();
    const formUploader = new qiniu.form_up.FormUploader(this.configObj);
    const putExtra = new qiniu.form_up.PutExtra();
    const actualKey = key || localFile.split("/").pop() || "file";

    return new Promise((resolve, reject) => {
      formUploader.putFile(token, actualKey, localFile, putExtra, (err, respBody, respInfo) => {
        if (err) {
          reject(err);
        } else if (respInfo.statusCode === 200) {
          resolve(respBody as { key: string; hash: string; fsize: number; bucket: string });
        } else {
          reject(new Error(`Upload failed: ${respInfo.statusCode} - ${JSON.stringify(respBody)}`));
        }
      });
    });
  }

  async stat(key: string): Promise<{ fsize: number; hash: string; mimeType: string; putTime: number; type: number }> {
    return new Promise((resolve, reject) => {
      this.bucketManager.stat(this.config.bucket, key, (err, respBody, respInfo) => {
        if (err) {
          reject(err);
        } else if (respInfo.statusCode === 200) {
          resolve(respBody as { fsize: number; hash: string; mimeType: string; putTime: number; type: number });
        } else {
          reject(new Error(`Stat failed: ${respInfo.statusCode} - ${JSON.stringify(respBody)}`));
        }
      });
    });
  }

  async delete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.bucketManager.delete(this.config.bucket, key, (err, respBody, respInfo) => {
        if (err) {
          reject(err);
        } else if (respInfo.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Delete failed: ${respInfo.statusCode} - ${JSON.stringify(respBody)}`));
        }
      });
    });
  }

  async list(prefix?: string, limit = 100): Promise<{ items: Array<{ key: string; fsize: number; hash: string; mimeType: string; putTime: number; type: number }>; marker?: string }> {
    const options: qiniu.rs.ListPrefixOptions = {
      prefix: prefix || "",
      limit,
    };

    return new Promise((resolve, reject) => {
      this.bucketManager.listPrefix(this.config.bucket, options, (err, respBody, respInfo) => {
        if (err) {
          reject(err);
        } else if (respInfo.statusCode === 200) {
          const data = respBody as { items?: any[]; marker?: string };
          resolve({
            items: (data.items || []).map((item: any) => ({
              key: item.key,
              fsize: item.fsize,
              hash: item.hash,
              mimeType: item.mimeType,
              putTime: item.putTime,
              type: item.type,
            })),
            marker: data.marker,
          });
        } else {
          reject(new Error(`List failed: ${respInfo.statusCode} - ${JSON.stringify(respBody)}`));
        }
      });
    });
  }

  async copy(srcKey: string, destKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.bucketManager.copy(this.config.bucket, srcKey, this.config.bucket, destKey, { force: false }, (err, respBody, respInfo) => {
        if (err) {
          reject(err);
        } else if ((respInfo as any).statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Copy failed: ${(respInfo as any).statusCode} - ${JSON.stringify(respBody)}`));
        }
      });
    });
  }

  async move(srcKey: string, destKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.bucketManager.move(this.config.bucket, srcKey, this.config.bucket, destKey, { force: false }, (err, respBody, respInfo) => {
        if (err) {
          reject(err);
        } else if ((respInfo as any).statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Move failed: ${(respInfo as any).statusCode} - ${JSON.stringify(respBody)}`));
        }
      });
    });
  }

  getPrivateUrl(key: string, expiresIn = 3600): string {
    const deadline = Math.floor(Date.now() / 1000) + expiresIn;
    const encodedKey = encodeURIComponent(key);
    const baseUrl = `https://${this.config.domain}/${encodedKey}`;
    const urlToSign = `${baseUrl}?e=${deadline}`;

    const signature = createHmac("sha1", this.config.secretKey)
      .update(urlToSign)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    return `${urlToSign}&token=${this.config.accessKey}:${signature}`;
  }

  getConfig(): QiniuConfig {
    return { ...this.config };
  }
}

export class QiniuCdnClient {
  private mac: qiniu.auth.digest.Mac;

  constructor(config?: Partial<QiniuCdnConfig>) {
    const cfg = config || loadCdnConfig();
    this.mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey);
  }

  private generateToken(method: string, url: string, contentType: string, body: string): string {
    const date = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z/, "Z");
    const headers: Record<string, string> = { "X-Qiniu-Date": date };
    return qiniu.util.generateAccessTokenV2(this.mac, url, method, contentType, body, headers);
  }

  private async request(method: string, url: string, body?: string): Promise<any> {
    const contentType = body ? "application/json" : "application/x-www-form-urlencoded";
    const token = this.generateToken(method, url, contentType, body || "");

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        "Content-Type": contentType,
        Authorization: token,
        "X-Qiniu-Date": new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z/, "Z"),
      },
    } as any;

    if (body) {
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async createDomain(domainName: string, bucket: string, options?: { geoCover?: string; protocol?: string }): Promise<any> {
    const url = `https://api.qiniu.com/domain/${domainName}`;
    const body = JSON.stringify({
      type: "normal",
      platform: "web",
      geoCover: options?.geoCover || "china",
      protocol: options?.protocol || "http",
      source: {
        sourceType: "qiniuBucket",
        sourceQiniuBucket: bucket,
      },
      cache: {
        cacheControls: [{ time: 1, timeunit: 5, type: "all", rule: "*" }],
      },
      testURLPath: "/test.png",
    });

    return this.request("POST", url, body);
  }

  async getDomain(domainName: string): Promise<any> {
    return this.request("GET", `https://api.qiniu.com/domain/${domainName}`);
  }

  async listDomains(): Promise<any> {
    return this.request("GET", "https://api.qiniu.com/domain");
  }

  async deleteDomain(domainName: string): Promise<any> {
    return this.request("DELETE", `https://api.qiniu.com/domain/${domainName}`);
  }

  async onlineDomain(domainName: string): Promise<any> {
    return this.request("POST", `https://api.qiniu.com/domain/${domainName}/online`);
  }

  async offlineDomain(domainName: string): Promise<any> {
    return this.request("POST", `https://api.qiniu.com/domain/${domainName}/offline`);
  }

  async uploadCert(name: string, commonName: string, pri: string, ca: string): Promise<{ certID: string }> {
    const body = JSON.stringify({ name, commonName, pri, ca });
    return this.request("POST", "https://fusion.qiniuapi.com/sslcert", body);
  }

  async bindCert(domainName: string, certId: string, forceHttps = true, http2Enable = true): Promise<any> {
    const body = JSON.stringify({ certId, forceHttps, http2Enable });
    return this.request("PUT", `https://api.qiniu.com/domain/${domainName}/sslize`, body);
  }

  async listCerts(): Promise<any> {
    return this.request("GET", "https://fusion.qiniuapi.com/sslcert");
  }

  async getCert(certId: string): Promise<any> {
    return this.request("GET", `https://fusion.qiniuapi.com/sslcert/${certId}`);
  }
}

export function createClient(config?: Partial<QiniuConfig>): QiniuClient {
  return new QiniuClient(config);
}

export function createCdnClient(config?: Partial<QiniuCdnConfig>): QiniuCdnClient {
  return new QiniuCdnClient(config);
}
