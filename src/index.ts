#!/usr/bin/env node

import { Command } from "commander";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import { QiniuClient, QiniuCdnClient } from "./qiniu";
import { AliyunDnsClient } from "./aliyun-dns";
import { loadConfig as loadGlobalConfig } from "./config";

const program = new Command();

program.name("aic").description("Cloud resources management CLI").version("0.1.0");

// ============ Storage Commands ============

program.command("upload").description("Upload a file to cloud storage").argument("<file>", "Local file path to upload").option("-k, --key <key>", "Custom key (filename) in storage").option("-p, --prefix <prefix>", "Prefix to prepend to the filename").action(async (file: string, opts: { key?: string; prefix?: string }) => {
  try {
    if (!fs.existsSync(file)) {
      console.error(`Error: File not found: ${file}`);
      process.exit(1);
    }

    const client = new QiniuClient();
    let key = opts.key || path.basename(file);

    if (opts.prefix) {
      key = opts.prefix.replace(/\/$/, "") + "/" + key;
    }

    console.error(`Uploading ${file} as ${key}...`);
    const result = await client.uploadFile(file, key);

    console.log(JSON.stringify({
      success: true,
      key: result.key,
      hash: result.hash,
      fsize: result.fsize,
      bucket: result.bucket,
    }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("list").description("List files in storage").option("-p, --prefix <prefix>", "Filter by prefix").option("-l, --limit <limit>", "Max items to return", "100").action(async (opts: { prefix?: string; limit?: string }) => {
  try {
    const client = new QiniuClient();
    const result = await client.list(opts.prefix, parseInt(opts.limit || "100", 10));

    console.log(JSON.stringify({
      success: true,
      items: result.items.map((item) => ({
        key: item.key,
        fsize: item.fsize,
        hash: item.hash,
        mimeType: item.mimeType,
        putTime: new Date(item.putTime / 10000).toISOString(),
      })),
      marker: result.marker,
      count: result.items.length,
    }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("url").description("Get a temporary access URL for a file").argument("<key>", "File key in storage").option("-e, --expires <seconds>", "URL expiration time in seconds", "3600").action(async (key: string, opts: { expires?: string }) => {
  try {
    const client = new QiniuClient();
    const url = client.getPrivateUrl(key, parseInt(opts.expires || "3600", 10));
    console.log(url);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("delete").description("Delete a file from storage").argument("<key>", "File key to delete").action(async (key: string) => {
  try {
    const client = new QiniuClient();
    await client.delete(key);
    console.log(JSON.stringify({ success: true, key }));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("stat").description("Get file metadata").argument("<key>", "File key").action(async (key: string) => {
  try {
    const client = new QiniuClient();
    const stat = await client.stat(key);

    console.log(JSON.stringify({
      success: true,
      key,
      fsize: stat.fsize,
      hash: stat.hash,
      mimeType: stat.mimeType,
      putTime: new Date(stat.putTime / 10000).toISOString(),
      type: stat.type,
    }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("copy").description("Copy a file within storage").argument("<src>", "Source file key").argument("<dest>", "Destination file key").action(async (src: string, dest: string) => {
  try {
    const client = new QiniuClient();
    await client.copy(src, dest);
    console.log(JSON.stringify({ success: true, src, dest }));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("move").description("Move/rename a file within storage").argument("<src>", "Source file key").argument("<dest>", "Destination file key").action(async (src: string, dest: string) => {
  try {
    const client = new QiniuClient();
    await client.move(src, dest);
    console.log(JSON.stringify({ success: true, src, dest }));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

// ============ CDN Commands ============

program.command("cdn:create").description("Create a CDN domain for qiniu bucket").argument("<domain>", "CDN domain name (e.g., cdn.example.com)").option("-b, --bucket <bucket>", "Qiniu bucket name").option("--geo <geo>", "Geographic coverage (china/foreign/global)", "china").option("--protocol <protocol>", "Protocol (http/https)", "http").action(async (domain: string, opts: { bucket?: string; geo?: string; protocol?: string }) => {
  try {
    const cdn = new QiniuCdnClient();
    const bucket = opts.bucket || process.env.QINIU_BUCKET;
    if (!bucket) {
      throw new Error("Bucket not specified and QINIU_BUCKET not set");
    }

    console.error(`Creating CDN domain ${domain} for bucket ${bucket}...`);
    const result = await cdn.createDomain(domain, bucket, { geoCover: opts.geo, protocol: opts.protocol });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("cdn:list").description("List CDN domains").action(async () => {
  try {
    const cdn = new QiniuCdnClient();
    const result = await cdn.listDomains();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("cdn:info").description("Get CDN domain info").argument("<domain>", "CDN domain name").action(async (domain: string) => {
  try {
    const cdn = new QiniuCdnClient();
    const result = await cdn.getDomain(domain);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("cdn:online").description("Online a CDN domain").argument("<domain>", "CDN domain name").action(async (domain: string) => {
  try {
    const cdn = new QiniuCdnClient();
    const result = await cdn.onlineDomain(domain);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("cdn:offline").description("Offline a CDN domain").argument("<domain>", "CDN domain name").action(async (domain: string) => {
  try {
    const cdn = new QiniuCdnClient();
    const result = await cdn.offlineDomain(domain);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("cdn:delete").description("Delete a CDN domain").argument("<domain>", "CDN domain name").action(async (domain: string) => {
  try {
    const cdn = new QiniuCdnClient();
    const result = await cdn.deleteDomain(domain);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

// ============ Certificate Commands ============

program.command("cert:issue").description("Issue SSL certificate via ACME DNS verification").argument("<domains...>", "Domain(s) to issue certificate for (comma-separated or multiple args)").option("-d, --dns-provider <provider>", "DNS provider (aliyun, cloudflare, dnspod)", "aliyun").option("-k, --key-length <length>", "Key length for RSA certificates", "4096").option("-e, --ECC", "Use ECC certificate").action(async (domains: string[], opts: { dnsProvider?: string; keyLength?: string; ECC?: boolean }) => {
  try {
    const globalConfig = loadGlobalConfig();
    const domainList = domains.join(",");
    const dnsProvider = opts.dnsProvider || globalConfig?.acme?.dnsProvider || "aliyun";
    const acmePath = globalConfig?.acme?.path || `${process.env.HOME}/.acme.sh/acme.sh`;
    const email = globalConfig?.acme?.email || "";
    
    console.error(`Issuing certificate for: ${domainList}`);
    console.error(`DNS Provider: ${dnsProvider}`);
    console.error(`ACME Path: ${acmePath}`);
    
    // Set DNS provider environment variables
    const env = { ...process.env };
    
    if (dnsProvider === "aliyun") {
      if (!globalConfig?.aliyun?.accessKeyId || !globalConfig?.aliyun?.accessKeySecret) {
        throw new Error("Aliyun DNS credentials not configured in ~/.config/aic/config.toml");
      }
      env.Ali_Key = globalConfig.aliyun.accessKeyId;
      env.Ali_Secret = globalConfig.aliyun.accessKeySecret;
    } else if (dnsProvider === "cloudflare") {
      if (!process.env.CLOUDFLARE_API_KEY) {
        throw new Error("Cloudflare API key not configured. Set CLOUDFLARE_API_KEY in environment");
      }
      env.CF_Token = process.env.CLOUDFLARE_API_KEY;
    } else if (dnsProvider === "dnspod") {
      if (!process.env.DNSPOD_API_KEY) {
        throw new Error("DNSPod API key not configured. Set DNSPOD_API_KEY in environment");
      }
      env.DP_Key = process.env.DNSPOD_API_KEY.split(",")[0];
      env.DP_Token = process.env.DNSPOD_API_KEY.split(",")[1];
    }
    
    // Build acme.sh command
    // Map DNS provider names to acme.sh DNS hook names
    const dnsHookMap: Record<string, string> = {
      aliyun: "dns_ali",
      cloudflare: "dns_cf",
      dnspod: "dns_dp"
    };
    const acmeDnsHook = dnsHookMap[dnsProvider] || `dns_${dnsProvider}`;
    let cmd = `${acmePath} --issue --dns ${acmeDnsHook}`;
    
    // Add domains
    domainList.split(",").forEach(d => {
      cmd += ` -d ${d}`;
    });
    
    // Add email if configured
    if (email) {
      cmd += ` --email ${email}`;
    }
    
    // Add key length for RSA
    if (!opts.ECC) {
      cmd += ` --keylength ${opts.keyLength || "4096"}`;
    }
    
    console.error(`\nRunning: ${cmd}\n`);
    
    const output = execSync(cmd, { 
      env,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120000
    }).toString();
    
    console.error(output);
    
    // Find the certificate path - acme.sh uses first domain as directory name
    const domain = domainList.split(",")[0];
    const isEcc = opts.ECC;
    const certDir = isEcc ? `${process.env.HOME}/.acme.sh/${domain}_ecc` : `${process.env.HOME}/.acme.sh/${domain}`;
    
    const result = {
      success: true,
      domains: domainList.split(","),
      dnsProvider,
      isEcc,
      certPath: `${certDir}/fullchain.cer`,
      keyPath: `${certDir}/${domain}.key`,
      caPath: `${certDir}/ca.cer`,
      message: "Certificate issued successfully. Use 'cert:upload' to upload to Qiniu, or 'cert:upload --help' for other platforms."
    };
    
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    if (err instanceof Error && err.message.includes("does not exist")) {
      console.error(`Error: acme.sh not found. Install it with: curl https://get.acme.sh | sh`);
    } else {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
});

program.command("cert:upload").description("Upload SSL certificate to Qiniu").argument("<name>", "Certificate name").argument("<commonName>", "Common name (domain)").argument("<certFile>", "Certificate file path (PEM format)").argument("<keyFile>", "Private key file path (PEM format)").action(async (name: string, commonName: string, certFile: string, keyFile: string) => {
  try {
    if (!fs.existsSync(certFile)) {
      throw new Error(`Certificate file not found: ${certFile}`);
    }
    if (!fs.existsSync(keyFile)) {
      throw new Error(`Private key file not found: ${keyFile}`);
    }

    const certContent = fs.readFileSync(certFile, "utf8");
    const keyContent = fs.readFileSync(keyFile, "utf8");

    const cdn = new QiniuCdnClient();
    const result = await cdn.uploadCert(name, commonName, keyContent, certContent);
    console.log(JSON.stringify({ success: true, ...result }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("cert:bind").description("Bind SSL certificate to CDN domain").argument("<domain>", "CDN domain name").argument("<certId>", "Certificate ID").option("--force-https", "Force HTTPS redirect", "true").option("--http2", "Enable HTTP/2", "true").action(async (domain: string, certId: string, opts: { forceHttps?: string; http2?: string }) => {
  try {
    const cdn = new QiniuCdnClient();
    const result = await cdn.bindCert(domain, certId, opts.forceHttps !== "false", opts.http2 !== "false");
    console.log(JSON.stringify({ success: true, domain, certId, ...result }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("cert:list").description("List SSL certificates").action(async () => {
  try {
    const cdn = new QiniuCdnClient();
    const result = await cdn.listCerts();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

// ============ DNS Commands ============

program.command("dns:list").description("List DNS records for a domain").argument("<domain>", "Domain name").action(async (domain: string) => {
  try {
    const dns = new AliyunDnsClient();
    const result = await dns.describeDomainRecords(domain);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("dns:add").description("Add a DNS record").argument("<domain>", "Domain name").argument("<rr>", "Host record (e.g., cdn)").argument("<type>", "Record type (A/CNAME/TXT)").argument("<value>", "Record value").option("--ttl <ttl>", "TTL in seconds", "600").action(async (domain: string, rr: string, type: string, value: string, opts: { ttl?: string }) => {
  try {
    const dns = new AliyunDnsClient();
    const result = await dns.addRecord(domain, rr, type, value, { ttl: parseInt(opts.ttl || "600", 10) });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("dns:delete").description("Delete a DNS record").argument("<recordId>", "Record ID").action(async (recordId: string) => {
  try {
    const dns = new AliyunDnsClient();
    const result = await dns.deleteRecord(recordId);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("dns:info").description("Get DNS record info").argument("<recordId>", "Record ID").action(async (recordId: string) => {
  try {
    const dns = new AliyunDnsClient();
    const result = await dns.describeRecordInfo(recordId);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

// ============ Setup Command ============

program.command("setup:cname").description("Setup CDN domain with DNS (interactive)").argument("<cdnDomain>", "CDN domain (e.g., cdn.example.com)").option("-b, --bucket <bucket>", "Qiniu bucket name").action(async (cdnDomain: string, opts: { bucket?: string }) => {
  try {
    const bucket = opts.bucket || process.env.QINIU_BUCKET;
    if (!bucket) {
      throw new Error("Bucket not specified and QINIU_BUCKET not set");
    }

    console.error("Step 1: Creating CDN domain in Qiniu...");
    const cdn = new QiniuCdnClient();
    const createResult = await cdn.createDomain(cdnDomain, bucket, { geoCover: "foreign", protocol: "http" });
    console.error("CDN creation result:", JSON.stringify(createResult));

    if (createResult.code && createResult.code !== 200) {
      throw new Error(`Failed to create CDN domain: ${createResult.error}`);
    }

    console.error("\nStep 2: Waiting for domain to be ready...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.error("\nStep 3: Getting CDN domain info to retrieve CNAME...");
    const domainInfo = await cdn.getDomain(cdnDomain);
    console.error("CDN domain info:", JSON.stringify(domainInfo, null, 2));

    const cname = domainInfo.cname;
    if (!cname) {
      throw new Error("CNAME not found in domain info. Domain may still be processing.");
    }

    console.error(`\nStep 4: Adding DNS CNAME record...`);
    const mainDomain = cdnDomain.replace(/^[^.]+\./, "");
    const rr = cdnDomain.split(".")[0];

    const dns = new AliyunDnsClient();
    const dnsResult = await dns.addRecord(mainDomain, rr, "CNAME", cname);
    console.log(JSON.stringify({
      success: true,
      cdnDomain,
      cname,
      dnsRecord: dnsResult,
      message: `CDN domain ${cdnDomain} created and CNAME ${rr}.${mainDomain} -> ${cname} added`,
    }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.parse();
