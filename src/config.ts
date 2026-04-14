import * as fs from "fs";
import * as path from "path";
import { parse } from "@iarna/toml";

export interface Config {
  qiniu: {
    accessKey: string;
    secretKey: string;
    bucket: string;
    domain: string;
    region: string;
  };
  aliyun: {
    accessKeyId: string;
    accessKeySecret: string;
  };
  acme: {
    path: string;
    dnsProvider: string;
    email: string;
  };
}

export function loadConfig(): Config | null {
  const configPaths = [
    path.join(process.env.HOME || "", ".config/aic/config.toml"),
    path.join(process.env.HOME || "", ".aic.toml"),
    path.join(process.env.HOME || "", ".aic/config.toml"),
    "./.env",
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        if (configPath.endsWith(".toml")) {
          return parse(content) as unknown as Config;
        } else {
          // .env fallback
          const envContent = fs.readFileSync(configPath, "utf-8");
          const lines = envContent.split("\n");
          const config: any = { qiniu: {}, aliyun: {}, acme: {} };
          
          for (const line of lines) {
            const [key, ...valueParts] = line.split("=");
            if (!key || !valueParts.length) continue;
            const value = valueParts.join("=").trim();
            
            if (key.startsWith("QINIU_")) {
              const k = key.slice(6).toLowerCase();
              config.qiniu[k] = value;
            } else if (key.startsWith("ALIYUN_")) {
              const k = key.slice(7).toLowerCase();
              if (k === "access_key_id") config.aliyun.accessKeyId = value;
              else if (k === "access_key_secret") config.aliyun.accessKeySecret = value;
            } else if (key.startsWith("ACME_")) {
              const k = key.slice(5).toLowerCase();
              config.acme[k.replace("_", "")] = value;
            }
          }
          
          return config as Config;
        }
      } catch (e) {
        console.error(`Failed to load config from ${configPath}:`, e);
      }
    }
  }

  return null;
}

export function getConfig(): Config {
  const config = loadConfig();
  if (!config) {
    throw new Error("No config file found. Please create ~/.config/aic/config.toml");
  }
  return config;
}
