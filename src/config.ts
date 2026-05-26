import * as fs from "fs";
import * as path from "path";
import { parse } from "@iarna/toml";

export interface AliyunProfile {
  accessKeyId: string;
  accessKeySecret: string;
}

export interface Config {
  qiniu: {
    accessKey: string;
    secretKey: string;
    bucket: string;
    domain: string;
    region: string;
  };
  aliyun: {
    accessKeyId?: string;
    accessKeySecret?: string;
    "default-profile"?: string;
    profiles?: Record<string, AliyunProfile>;
  } & Record<string, AliyunProfile>;
  acme: {
    path: string;
    dnsProvider: string;
    email: string;
  };
  email: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
    ssl: boolean;
  };
  sms: {
    provider: string;
    accessKeyId: string;
    accessKeySecret: string;
    signName: string;
    templateCode: string;
  };
  wechat: {
    appId: string;
    appSecret: string;
    templateId: string;
  };
}

let cachedConfig: Config | null = null;

export function loadConfig(): Config | null {
  const envConfigPath = process.env.AIC_CONFIG;
  if (envConfigPath) {
    if (fs.existsSync(envConfigPath)) {
      try {
        const content = fs.readFileSync(envConfigPath, "utf-8");
        cachedConfig = parse(content) as unknown as Config;
        return cachedConfig;
      } catch (e) {
        console.error(`Failed to load config from AIC_CONFIG (${envConfigPath}):`, e);
      }
    } else {
      console.error(`Config file specified by AIC_CONFIG not found: ${envConfigPath}`);
    }
  }

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
          cachedConfig = parse(content) as unknown as Config;
          return cachedConfig;
        } else {
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

          cachedConfig = config as Config;
          return cachedConfig;
        }
      } catch (e) {
        console.error(`Failed to load config from ${configPath}:`, e);
      }
    }
  }

  return null;
}

export function getConfig(): Config {
  const envConfigPath = process.env.AIC_CONFIG;
  if (envConfigPath) {
    if (fs.existsSync(envConfigPath)) {
      try {
        const content = fs.readFileSync(envConfigPath, "utf-8");
        return parse(content) as unknown as Config;
      } catch (e) {
        throw new Error(`Failed to load config from AIC_CONFIG (${envConfigPath}): ${e}`);
      }
    } else {
      throw new Error(`Config file specified by AIC_CONFIG not found: ${envConfigPath}`);
    }
  }

  if (cachedConfig) return cachedConfig;
  const config = loadConfig();
  if (!config) {
    throw new Error("No config file found. Please create ~/.config/aic/config.toml");
  }
  return config;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function getAliyunProfile(profileName?: string): AliyunProfile {
  const config = getConfig();
  const aliyun = config.aliyun || {};

  if (profileName) {
    if (profileName === "default" || profileName === "") {
      const defaultProfile = aliyun["default-profile"] || "default";
      return getAliyunProfileByName(config, defaultProfile);
    }
    return getAliyunProfileByName(config, profileName);
  }

  const envProfile = process.env.AIC_ALIYUN_PROFILE;
  if (envProfile) {
    return getAliyunProfileByName(config, envProfile);
  }

  const defaultProfile = aliyun["default-profile"];
  if (defaultProfile) {
    return getAliyunProfileByName(config, defaultProfile);
  }

  if (aliyun.accessKeyId && aliyun.accessKeySecret) {
    return {
      accessKeyId: aliyun.accessKeyId,
      accessKeySecret: aliyun.accessKeySecret,
    };
  }

  throw new Error("No aliyun profile specified and no default profile configured");
}

function getAliyunProfileByName(config: Config, profileName: string): AliyunProfile {
  const aliyun = config.aliyun || {};

  if (profileName === "default") {
    if (aliyun.accessKeyId && aliyun.accessKeySecret) {
      return {
        accessKeyId: aliyun.accessKeyId,
        accessKeySecret: aliyun.accessKeySecret,
      };
    }
  }

  if (aliyun.profiles && aliyun.profiles[profileName]) {
    return aliyun.profiles[profileName];
  }

  if ((aliyun as any)[profileName]) {
    return (aliyun as any)[profileName];
  }

  throw new Error(`Aliyun profile "${profileName}" not found in config`);
}
