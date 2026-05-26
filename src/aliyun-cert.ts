import crypto from "crypto";
import https from "https";
import fs from "fs";
import { getAliyunProfile } from "./config";

export interface AliyunCertConfig {
  accessKeyId: string;
  accessKeySecret: string;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\*/g, "%2A")
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

export interface CertificateOrder {
  CertificateId: number;
  Name: string;
  CommonName: string;
  Fingerprint: string;
  Sha2: string;
  SerialNo: string;
  Issuer: string;
  OrgName: string;
  Province: string;
  City: string;
  Country: string;
  Sans: string;
  Expired: boolean;
  Upload: boolean;
  StartDate: string;
  EndDate: string;
  Status: string;
  InstanceId: string;
  ResourceGroupId?: string;
}

export class AliyunCasClient {
  private accessKeyId: string;
  private accessKeySecret: string;

  constructor(profile?: string) {
    const cfg = getAliyunProfile(profile);
    this.accessKeyId = cfg.accessKeyId;
    this.accessKeySecret = cfg.accessKeySecret;
  }

  private sign(params: Record<string, string>): string {
    const sorted = Object.keys(params).sort();
    const canonicalized = sorted.map((k) => percentEncode(k) + "=" + percentEncode(params[k] ?? "")).join("&");
    const stringToSign = "GET&%2F&" + percentEncode(canonicalized);
    return crypto.createHmac("sha1", this.accessKeySecret + "&").update(stringToSign).digest("base64");
  }

  private async request(actionParams: Record<string, string>): Promise<any> {
    const params: Record<string, string> = { ...actionParams };
    params.AccessKeyId = this.accessKeyId;
    params.SignatureMethod = "HMAC-SHA1";
    params.SignatureVersion = "1.0";
    params.SignatureNonce = Math.random().toString();
    params.Timestamp = new Date().toISOString();
    params.Version = "2020-04-07";
    params.Format = "JSON";

    const signatureParams = { ...params };
    delete signatureParams.Signature;
    params.Signature = this.sign(signatureParams);

    const queryString = Object.keys(params)
      .map((k) => percentEncode(k) + "=" + percentEncode(params[k]))
      .join("&");

    const url = `https://cas.aliyuncs.com/?${queryString}`;

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

  async uploadCertificate(
    name: string,
    certFile: string,
    keyFile: string
  ): Promise<{ certId: number; requestId: string; resourceId: string }> {
    const certContent = fs.readFileSync(certFile, "utf8");
    const keyContent = fs.readFileSync(keyFile, "utf8");

    const result = await this.request({
      Action: "UploadUserCertificate",
      Name: name,
      Cert: certContent,
      Key: keyContent,
    });

    if (result.Code || result.Message) {
      throw new Error(`UploadUserCertificate failed: ${result.Message || JSON.stringify(result)}`);
    }

    return {
      certId: result.CertId,
      requestId: result.RequestId,
      resourceId: result.ResourceId,
    };
  }

  async listCertificates(orderType: "CERT" | "UPLOAD" = "UPLOAD"): Promise<CertificateOrder[]> {
    const result = await this.request({
      Action: "ListUserCertificateOrder",
      OrderType: orderType,
    });

    if (result.Code || result.Message) {
      throw new Error(`ListUserCertificateOrder failed: ${result.Message || JSON.stringify(result)}`);
    }

    return result.CertificateOrderList || [];
  }

  async deleteCertificate(certId: number): Promise<{ requestId: string }> {
    const result = await this.request({
      Action: "DeleteUserCertificate",
      CertId: certId.toString(),
    });

    if (result.Code || result.Message) {
      throw new Error(`DeleteUserCertificate failed: ${result.Message || JSON.stringify(result)}`);
    }

    return {
      requestId: result.RequestId,
    };
  }
}

export function createCasClient(profile?: string): AliyunCasClient {
  return new AliyunCasClient(profile);
}
