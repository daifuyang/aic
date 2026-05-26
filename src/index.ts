#!/usr/bin/env node

import { Command } from "commander";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import { QiniuClient, QiniuCdnClient } from "./qiniu";
import { AliyunDnsClient } from "./aliyun-dns";
import { AliyunCasClient } from "./aliyun-cert";
import { loadConfig as loadGlobalConfig, getAliyunProfile } from "./config";
import { sendWechatTemplateMessage, sendWechatNotify, sendEmail, sendSms } from "./notify";

const program = new Command();

program.name("aic").description("Cloud resources management CLI").version("0.1.2-dev");

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

program.command("cert:issue").description("Issue SSL certificate via ACME DNS verification").argument("<domains...>", "Domain(s) to issue certificate for (comma-separated or multiple args)").option("-d, --dns-provider <provider>", "DNS provider (aliyun, cloudflare, dnspod)", "aliyun").option("-k, --key-length <length>", "Key length for RSA certificates", "4096").option("-e, --ECC", "Use ECC certificate").option("-p, --profile <profile>", "Aliyun profile name").action(async (domains: string[], opts: { dnsProvider?: string; keyLength?: string; ECC?: boolean; profile?: string }) => {
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
      const aliyunProfile = getAliyunProfile(opts.profile);
      env.Ali_Key = aliyunProfile.accessKeyId;
      env.Ali_Secret = aliyunProfile.accessKeySecret;
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

program.command("cert:delete").description("Delete SSL certificate").argument("<certId>", "Certificate ID").action(async (certId: string) => {
  try {
    const cdn = new QiniuCdnClient();
    const result = await cdn.deleteCert(certId);
    console.log(JSON.stringify({ success: true, certId, ...result }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("cert:renew").description("Auto-renew expiring CDN certificates").option("--days <days>", "Renew if cert expires within N days", "30").option("--dry-run", "Show what would be renewed without making changes", false).action(async (opts: { days?: string; dryRun?: boolean }) => {
  try {
    const cdn = new QiniuCdnClient();
    const domains = await cdn.listDomains();
    const domainList = Array.isArray(domains?.domains) ? domains.domains : [];
    const certs = await cdn.listCerts();
    const certList = Array.isArray(certs?.certs) ? certs.certs : [];

    const renewDays = parseInt(opts.days || "30", 10);
    const now = Math.floor(Date.now() / 1000);
    const renewThreshold = now + renewDays * 24 * 60 * 60;

    const needRenew: Array<{ domain: string; cert: any; expiresAt: number }> = [];

    for (const cert of certList) {
      if (cert.enable === false && typeof cert.not_after === "number" && cert.not_after < renewThreshold) {
        const boundDomain = domainList.find((d: any) => d.name === cert.common_name);
        if (boundDomain) {
          needRenew.push({ domain: cert.common_name, cert, expiresAt: cert.not_after });
        }
      }
    }

    if (needRenew.length === 0) {
      console.log(JSON.stringify({ success: true, dryRun: Boolean(opts.dryRun), renewDays, message: "No certificates need renewal" }, null, 2));
      return;
    }

    console.error(`Found ${needRenew.length} certificate(s) expiring within ${renewDays} days:`);
    for (const item of needRenew) {
      const expDate = new Date(item.expiresAt * 1000).toISOString();
      console.error(`  - ${item.domain} (expires: ${expDate})`);
    }

    if (opts.dryRun) {
      console.log(JSON.stringify({ success: true, dryRun: true, renewDays, needRenew: needRenew.map(r => ({ domain: r.domain, expiresAt: r.expiresAt })) }, null, 2));
      return;
    }

    const globalConfig = loadGlobalConfig();
    const acmePath = globalConfig?.acme?.path || `${process.env.HOME}/.acme.sh/acme.sh`;
    const email = globalConfig?.acme?.email || "";
    const dnsProvider = globalConfig?.acme?.dnsProvider || "aliyun";

    const results: Array<{ domain: string; success: boolean; certId?: string; error?: string }> = [];

    for (const item of needRenew) {
      const domain = item.domain;
      console.error(`\nRenewing certificate for: ${domain}`);

      try {
        const env = { ...process.env };
        if (dnsProvider === "aliyun") {
          const aliyunProfile = getAliyunProfile();
          env.Ali_Key = aliyunProfile.accessKeyId;
          env.Ali_Secret = aliyunProfile.accessKeySecret;
        }

        const dnsHookMap: Record<string, string> = { aliyun: "dns_ali", cloudflare: "dns_cf", dnspod: "dns_dp" };
        const acmeDnsHook = dnsHookMap[dnsProvider] || `dns_${dnsProvider}`;
        let cmd = `${acmePath} --issue --dns ${acmeDnsHook} -d ${domain}`;
        if (email) cmd += ` --email ${email}`;
        cmd += ` --keylength 4096 --force`;

        console.error(`Running: ${cmd}`);
        execSync(cmd, { env, stdio: ["pipe", "pipe", "pipe"], timeout: 180000 });

        const certDir = `${process.env.HOME}/.acme.sh/${domain}`;
        const certPath = `${certDir}/fullchain.cer`;
        const keyPath = `${certDir}/${domain}.key`;

        const uploadResult = await cdn.uploadCert(`${domain}-auto`, domain, fs.readFileSync(keyPath, "utf8"), fs.readFileSync(certPath, "utf8"));
        await cdn.bindCert(domain, uploadResult.certID);

        console.error(`Success: certID=${uploadResult.certID}`);
        results.push({ domain, success: true, certId: uploadResult.certID });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Failed: ${errMsg}`);
        results.push({ domain, success: false, error: errMsg });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(JSON.stringify({ success: failCount === 0, dryRun: false, renewDays, total: needRenew.length, successCount, failCount, results }, null, 2));

    if (failCount > 0) process.exit(1);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("cert:prune-expired").description("Delete expired SSL certificates").option("--dry-run", "Show expired certificates without deleting", false).action(async (opts: { dryRun?: boolean }) => {
  try {
    const cdn = new QiniuCdnClient();
    const result = await cdn.listCerts();
    const certs = Array.isArray(result?.certs) ? result.certs : [];
    const now = Math.floor(Date.now() / 1000);
    const expired = certs.filter((cert: any) => typeof cert?.not_after === "number" && cert.not_after < now);

    if (expired.length === 0) {
      console.log(JSON.stringify({ success: true, dryRun: Boolean(opts.dryRun), now, total: certs.length, expiredCount: 0, deletedCount: 0, deleted: [] }, null, 2));
      return;
    }

    if (opts.dryRun) {
      console.log(JSON.stringify({
        success: true,
        dryRun: true,
        now,
        total: certs.length,
        expiredCount: expired.length,
        expired: expired.map((cert: any) => ({
          certId: cert.certid,
          name: cert.name,
          commonName: cert.common_name,
          notAfter: cert.not_after,
        })),
      }, null, 2));
      return;
    }

    const deleted: Array<{ certId: string; code: number; error: string }> = [];
    const failed: Array<{ certId: string; error: string }> = [];

    for (const cert of expired) {
      const certId = cert.certid;
      try {
        const deleteResult = await cdn.deleteCert(certId);
        deleted.push({
          certId,
          code: Number(deleteResult?.code || 0),
          error: String(deleteResult?.error || ""),
        });
      } catch (err) {
        failed.push({ certId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const output = {
      success: failed.length === 0,
      dryRun: false,
      now,
      total: certs.length,
      expiredCount: expired.length,
      deletedCount: deleted.length,
      failedCount: failed.length,
      deleted,
      failed,
    };

    console.log(JSON.stringify(output, null, 2));

    if (failed.length > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

// ============ Aliyun Certificate Commands ============

program.command("aliyun-cert:upload").description("Upload SSL certificate to Aliyun CAS").argument("<name>", "Certificate name").argument("<certFile>", "Certificate file path (PEM format)").argument("<keyFile>", "Private key file path (PEM format)").option("-p, --profile <profile>", "Aliyun profile name").action(async (name: string, certFile: string, keyFile: string, opts: { profile?: string }) => {
  try {
    if (!fs.existsSync(certFile)) {
      throw new Error(`Certificate file not found: ${certFile}`);
    }
    if (!fs.existsSync(keyFile)) {
      throw new Error(`Private key file not found: ${keyFile}`);
    }

    const cas = new AliyunCasClient(opts.profile);
    const result = await cas.uploadCertificate(name, certFile, keyFile);
    console.log(JSON.stringify({ success: true, ...result }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("aliyun-cert:list").description("List SSL certificates in Aliyun CAS").option("-t, --type <type>", "Certificate type: UPLOAD (uploaded only) or CERT (all certificates)", "UPLOAD").option("-p, --profile <profile>", "Aliyun profile name").action(async (opts: { type?: string; profile?: string }) => {
  try {
    const cas = new AliyunCasClient(opts.profile);
    const orderType = opts.type === "CERT" ? "CERT" : "UPLOAD";
    const certs = await cas.listCertificates(orderType);
    console.log(JSON.stringify({
      success: true,
      certificates: certs.map((cert) => ({
        certId: cert.CertificateId,
        name: cert.Name,
        commonName: cert.CommonName,
        issuer: cert.Issuer,
        startDate: cert.StartDate,
        endDate: cert.EndDate,
        expired: cert.Expired,
        upload: cert.Upload,
        status: cert.Status,
        fingerprint: cert.Fingerprint,
      })),
      count: certs.length,
    }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("aliyun-cert:delete").description("Delete SSL certificate from Aliyun CAS").argument("<certId>", "Certificate ID (integer)").option("-p, --profile <profile>", "Aliyun profile name").action(async (certId: string, opts: { profile?: string }) => {
  try {
    const cas = new AliyunCasClient(opts.profile);
    const id = parseInt(certId, 10);
    if (isNaN(id)) {
      throw new Error("CertId must be an integer");
    }
    const result = await cas.deleteCertificate(id);
    console.log(JSON.stringify({ success: true, certId: id, requestId: result.requestId }, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

// ============ DNS Commands ============

program.command("dns:list").description("List DNS records for a domain").argument("<domain>", "Domain name").option("-p, --profile <profile>", "Aliyun profile name").action(async (domain: string, opts: { profile?: string }) => {
  try {
    const dns = new AliyunDnsClient(opts.profile);
    const result = await dns.describeDomainRecords(domain);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("dns:add").description("Add a DNS record").argument("<domain>", "Domain name").argument("<rr>", "Host record (e.g., cdn)").argument("<type>", "Record type (A/CNAME/TXT)").argument("<value>", "Record value").option("--ttl <ttl>", "TTL in seconds", "600").option("-p, --profile <profile>", "Aliyun profile name").action(async (domain: string, rr: string, type: string, value: string, opts: { ttl?: string; profile?: string }) => {
  try {
    const dns = new AliyunDnsClient(opts.profile);
    const result = await dns.addRecord(domain, rr, type, value, { ttl: parseInt(opts.ttl || "600", 10) });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("dns:delete").description("Delete a DNS record").argument("<recordId>", "Record ID").option("-p, --profile <profile>", "Aliyun profile name").action(async (recordId: string, opts: { profile?: string }) => {
  try {
    const dns = new AliyunDnsClient(opts.profile);
    const result = await dns.deleteRecord(recordId);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("dns:info").description("Get DNS record info").argument("<recordId>", "Record ID").option("-p, --profile <profile>", "Aliyun profile name").action(async (recordId: string, opts: { profile?: string }) => {
  try {
    const dns = new AliyunDnsClient(opts.profile);
    const result = await dns.describeRecordInfo(recordId);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

// ============ Notify Commands ============

program.command("notify:send").description("Send WeChat notification (simplified)").argument("<openid>", "User OpenID").argument("<title>", "Notification title").argument("<content>", "Notification content").option("-u, --url <url>", "Link URL").option("-r, --remark <remark>", "Remark text").option("-t, --type <type>", "Notification type (default: 系统通知)").action(async (openid: string, title: string, content: string, opts: { url?: string; remark?: string; type?: string }) => {
  try {
    const result = await sendWechatNotify(openid, {
      title,
      content,
      url: opts.url,
      remark: opts.remark,
      type: opts.type,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("notify:wechat").description("Send WeChat template message").argument("<openid>", "User OpenID").argument("<data>", "Template data as JSON string").option("-u, --url <url>", "Link URL").option("-t, --template <templateId>", "Template ID").action(async (openid: string, data: string, opts: { url?: string; template?: string }) => {
  try {
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch {
      throw new Error("Invalid JSON format for data");
    }

    const result = await sendWechatTemplateMessage(openid, parsedData, opts.url, opts.template);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("notify:email").description("Send email").argument("<to>", "Recipient email address").argument("<subject>", "Email subject").argument("<content>", "Email content").action(async (to: string, subject: string, content: string) => {
  try {
    const result = await sendEmail(to, subject, content);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});

program.command("notify:sms").description("Send SMS").argument("<phone>", "Recipient phone number").argument("<params>", "Template params as JSON string").action(async (phone: string, params: string) => {
  try {
    let parsedParams;
    try {
      parsedParams = JSON.parse(params);
    } catch {
      throw new Error("Invalid JSON format for params");
    }

    const result = await sendSms(phone, parsedParams);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
});


program.parse();
