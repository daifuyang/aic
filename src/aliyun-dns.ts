import crypto from "crypto";
import https from "https";
import { loadConfig as loadGlobalConfig } from "./config";

export interface AliyunDnsConfig {
  accessKeyId: string;
  accessKeySecret: string;
}

function loadConfig(): AliyunDnsConfig {
  const globalConfig = loadGlobalConfig();
  if (globalConfig?.aliyun) {
    const { accessKeyId, accessKeySecret } = globalConfig.aliyun;
    if (!accessKeyId || !accessKeySecret) {
      throw new Error("Missing required aliyun config fields");
    }
    return { accessKeyId, accessKeySecret };
  }
  throw new Error("No aliyun config found. Please configure ~/.config/aic/config.toml");
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\*/g, "%2A")
    .replace(/%20/g, "+")
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

export class AliyunDnsClient {
  private accessKeyId: string;
  private accessKeySecret: string;

  constructor(config?: Partial<AliyunDnsConfig>) {
    const cfg = config || loadConfig();
    this.accessKeyId = cfg.accessKeyId!;
    this.accessKeySecret = cfg.accessKeySecret!;
  }

  private sign(params: Record<string, string>): string {
    const sorted = Object.keys(params).sort();
    const canonicalized = sorted.map((k) => percentEncode(k) + "=" + percentEncode(params[k] ?? "")).join("&");
    const stringToSign = "GET&%2F&" + percentEncode(canonicalized);
    return crypto.createHmac("sha1", this.accessKeySecret + "&").update(stringToSign).digest("base64");
  }

  private async request(actionParams: Record<string, string>): Promise<any> {
    const params = { ...actionParams };
    params.AccessKeyId = this.accessKeyId;
    params.SignatureMethod = "HMAC-SHA1";
    params.SignatureVersion = "1.0";
    params.SignatureNonce = Math.random().toString();
    params.Timestamp = new Date().toISOString();
    params.Version = "2015-01-09";
    params.Format = "JSON";

    const signatureParams = { ...params };
    delete signatureParams.Signature;
    params.Signature = this.sign(signatureParams);

    const queryString = Object.keys(params)
      .map((k) => percentEncode(k) + "=" + percentEncode(params[k]))
      .join("&");

    const url = `https://alidns.aliyuncs.com?${queryString}`;

    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      }).on("error", reject);
    });
  }

  async describeDomainInfo(domainName: string): Promise<any> {
    return this.request({
      Action: "DescribeDomainInfo",
      DomainName: domainName,
    });
  }

  async describeDomainRecords(domainName: string): Promise<any> {
    return this.request({
      Action: "DescribeDomainRecords",
      DomainName: domainName,
    });
  }

  async addRecord(domainName: string, rr: string, type: string, value: string, options?: { ttl?: number; priority?: number; line?: string }): Promise<any> {
    const params: Record<string, string> = {
      Action: "AddDomainRecord",
      DomainName: domainName,
      RR: rr,
      Type: type,
      Value: value,
    };

    if (options?.ttl) params.TTL = options.ttl.toString();
    if (options?.priority) params.Priority = options.priority.toString();
    if (options?.line) params.Line = options.line;

    return this.request(params);
  }

  async deleteRecord(recordId: string): Promise<any> {
    return this.request({
      Action: "DeleteDomainRecord",
      RecordId: recordId,
    });
  }

  async updateRecord(recordId: string, rr: string, type: string, value: string, options?: { ttl?: number; priority?: number }): Promise<any> {
    const params: Record<string, string> = {
      Action: "UpdateDomainRecord",
      RecordId: recordId,
      RR: rr,
      Type: type,
      Value: value,
    };

    if (options?.ttl) params.TTL = options.ttl.toString();
    if (options?.priority) params.Priority = options.priority.toString();

    return this.request(params);
  }

  async describeRecordInfo(recordId: string): Promise<any> {
    return this.request({
      Action: "DescribeDomainRecordInfo",
      RecordId: recordId,
    });
  }
}

export function createDnsClient(config?: Partial<AliyunDnsConfig>): AliyunDnsClient {
  return new AliyunDnsClient(config);
}
