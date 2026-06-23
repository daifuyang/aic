---
name: aic
description: Cloud resources management CLI for Qiniu storage, CDN, DNS, SSL certificates, and WeChat notifications
---

## Overview

AIC is a command-line tool for managing cloud resources including Qiniu storage, CDN domains, Aliyun DNS, Aliyun CAS (SSL certificates), SSL certificates via ACME DNS verification, and WeChat template message notifications.

## Installation

```bash
npm install -g @zerocmf/aic

# or from source
git clone https://github.com/daifuyang/aic.git
cd aic
npm install
npm run build
npm install -g .
```

## Configuration

Create `~/.config/aic/config.toml`:

```toml
[qiniu]
accessKey = "your_access_key"
secretKey = "your_secret_key"
bucket = "your_bucket"
domain = "cdn.example.com"
region = "z0"

# Aliyun - Multiple profiles support
[aliyun]
default-profile = "personal"

[aliyun.personal]
accessKeyId = "your_personal_access_key_id"
accessKeySecret = "your_personal_access_key_secret"

[aliyun.enterprise]
accessKeyId = "your_enterprise_access_key_id"
accessKeySecret = "your_enterprise_access_key_secret"

[acme]
path = "~/.acme.sh/acme.sh"
dnsProvider = "aliyun"
email = "your@email.com"

[wechat]
appId = "your_wechat_appid"
appSecret = "your_wechat_appsecret"
templateId = "your_template_id"
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AIC_CONFIG` | Custom config file path (overrides default) |
| `AIC_ALIYUN_PROFILE` | Default Aliyun profile name |

### Profile Priority

```
CLI --profile > AIC_ALIYUN_PROFILE > default-profile in config > [aliyun] section
```

## Commands

### Storage Operations

#### Upload file
```bash
aic upload <file> [options]
```
- `-k, --key <key>` - Custom filename in storage
- `-p, --prefix <prefix>` - Prefix to prepend to filename

```bash
aic upload ./photo.jpg
aic upload ./screenshot.png --key "images/2024/screenshot.png"
aic upload ./photo.jpg --prefix images
```

#### List files
```bash
aic list [options]
```
- `-p, --prefix <prefix>` - Filter by prefix
- `-l, --limit <limit>` - Max items (default: 100)

```bash
aic list
aic list --prefix images/
aic list --prefix images/ --limit 50
```

#### Generate private URL
```bash
aic url <key> [options]
```
- `-e, --expires <seconds>` - URL expiration (default: 3600)

```bash
aic url photo.jpg
aic url images/photo.jpg --expires 86400
```

#### Delete file
```bash
aic delete <key>
```

```bash
aic delete photo.jpg
```

#### File info
```bash
aic stat <key>
```

#### Copy file
```bash
aic copy <src> <dest>
```

#### Move file
```bash
aic move <src> <dest>
```

### CDN Management

#### Create CDN domain
```bash
aic cdn:create <domain> [options]
```
- `-b, --bucket <bucket>` - Qiniu bucket name
- `--geo <geo>` - Geographic coverage: china/foreign/global (default: china)
- `--protocol <protocol>` - Protocol: http/https (default: http)

```bash
aic cdn:create cdn.example.com --bucket my-bucket
aic cdn:create cdn.example.com -b my-bucket --geo foreign
```

#### List CDN domains
```bash
aic cdn:list
```

#### CDN domain info
```bash
aic cdn:info <domain>
```

#### Online/Offline domain
```bash
aic cdn:online <domain>
aic cdn:offline <domain>
```

#### Delete CDN domain
```bash
aic cdn:delete <domain>
```

### SSL Certificates (Qiniu)

#### Issue certificate (ACME DNS)
```bash
aic cert:issue <domains...> [options]
```
- `-d, --dns-provider <provider>` - DNS provider: aliyun/cloudflare/dnspod (default: aliyun)
- `-k, --key-length <length>` - RSA key length (default: 4096)
- `-e, --ECC` - Use ECC certificate
- `-p, --profile <profile>` - Aliyun profile name

```bash
aic cert:issue cdn.example.com
aic cert:issue "*.example.com"
aic cert:issue cdn.example.com -e
aic cert:issue cdn.example.com -d cloudflare
aic cert:issue cdn.example.com -p personal
```

#### Upload certificate to Qiniu
```bash
aic cert:upload <name> <commonName> <certFile> <keyFile>
```

```bash
aic cert:upload my-cert cdn.example.com ~/.acme.sh/cdn.example.com/fullchain.cer ~/.acme.sh/cdn.example.com/cdn.example.com.key
```

#### Bind certificate to CDN
```bash
aic cert:bind <domain> <certId> [options]
```
- `--force-https` - Force HTTPS redirect (default: true)
- `--http2` - Enable HTTP/2 (default: true)

```bash
aic cert:bind cdn.example.com 69ddc973c38c3cb928dc359b
```

#### List certificates (Qiniu)
```bash
aic cert:list
```

### Aliyun CAS (SSL Certificate Management)

Upload and manage SSL certificates in Aliyun Certificate Authority Service. Useful for deploying certificates to FC (Function Compute), SLB, CDN, WAF, etc.

#### Upload certificate to Aliyun CAS
```bash
aic aliyun-cert:upload <name> <certFile> <keyFile> [options]
```
- `-p, --profile <profile>` - Aliyun profile name

```bash
# Upload to enterprise account
aic aliyun-cert:upload my-cert ~/.acme.sh/example.com/fullchain.cer ~/.acme.sh/example.com/example.com.key -p enterprise
```

**Note:** The certificate file should contain the full chain (server certificate + intermediate certificates). Use `fullchain.cer` from acme.sh.

#### List certificates in Aliyun CAS
```bash
aic aliyun-cert:list [options]
```
- `-t, --type <type>` - Certificate type: UPLOAD (uploaded only) or CERT (all certificates, default: UPLOAD)
- `-p, --profile <profile>` - Aliyun profile name

```bash
# List uploaded certificates
aic aliyun-cert:list -p enterprise

# List all certificates (including issued by Aliyun)
aic aliyun-cert:list -t CERT -p enterprise
```

#### Delete certificate from Aliyun CAS
```bash
aic aliyun-cert:delete <certId> [options]
```
- `-p, --profile <profile>` - Aliyun profile name

```bash
aic aliyun-cert:delete 123456 -p enterprise
```

### DNS Management

#### List DNS records
```bash
aic dns:list <domain> [options]
```
- `-p, --profile <profile>` - Aliyun profile name

```bash
aic dns:list example.com
aic dns:list example.com -p personal
```

#### Add DNS record
```bash
aic dns:add <domain> <rr> <type> <value> [options]
```
- `--ttl <ttl>` - TTL in seconds (default: 600)
- `-p, --profile <profile>` - Aliyun profile name

```bash
aic dns:add example.com @ A 192.168.1.1
aic dns:add example.com cdn CNAME cdn.qiniudns.com
aic dns:add example.com www A 192.168.1.1 --ttl 300
aic dns:add example.com @ A 192.168.1.1 -p personal
```

#### Delete DNS record
```bash
aic dns:delete <recordId> [options]
```
- `-p, --profile <profile>` - Aliyun profile name

```bash
aic dns:delete 123456789 -p personal
```

#### DNS record info
```bash
aic dns:info <recordId> [options]
```
- `-p, --profile <profile>` - Aliyun profile name

```bash
aic dns:info 123456789
```

### Notification Commands

#### Send WeChat notification (simplified)
```bash
aic notify:send <openid> <title> <content> [options]
```
- `-u, --url <url>` - Link URL
- `-r, --remark <remark>` - Remark text
- `-t, --type <type>` - Notification type (default: 系统通知)

```bash
aic notify:send oXXXXXX "证书到期提醒" "您的SSL证书将在7天后到期" -t "证书提醒"
aic notify:send oXXXXXX "操作成功" "文件已上传完成" --url https://example.com
```

#### Send WeChat template message (raw)
```bash
aic notify:wechat <openid> <data> [options]
```
- `-u, --url <url>` - Link URL
- `-t, --template <templateId>` - Template ID (overrides config)

```bash
aic notify:wechat oXXXXXX '{"first":{"value":"标题"},"thing01":{"value":"内容"}}'
```

#### Send email
```bash
aic notify:email <to> <subject> <content>
```

```bash
aic notify:email user@example.com "邮件主题" "邮件内容"
```

#### Send SMS
```bash
aic notify:sms <phone> <params>
```

```bash
aic notify:sms 13800138000 '{"code":"1234"}'
```

## Common Workflows

### Complete CDN + HTTPS setup (Qiniu)

```bash
# 1. Create CDN domain
aic cdn:create cdn.example.com --bucket my-bucket

# 2. Add DNS CNAME record (get CNAME from cdn:info)
aic dns:add example.com cdn CNAME cdn-xxx.qiniudns.com

# 3. Issue SSL certificate
aic cert:issue cdn.example.com

# 4. Upload certificate to Qiniu
aic cert:upload my-cert cdn.example.com \
  ~/.acme.sh/cdn.example.com/fullchain.cer \
  ~/.acme.sh/cdn.example.com/cdn.example.com.key

# 5. Bind certificate to CDN
aic cert:bind cdn.example.com <certId>

# Wait 5-10 minutes for HTTPS to take effect
```

### Upload and share file

```bash
# 1. Upload file
aic upload ./image.png --prefix images

# 2. Generate signed URL (valid for 24 hours)
aic url images/image.png --expires 86400
```

### Issue certificate + Upload to Aliyun CAS (Multi-account)

When domain is in personal account and you want to deploy certificate to enterprise account (FC, SLB, etc.):

```bash
# 1. Issue certificate using personal account (DNS verification)
aic cert:issue cdn.example.com -p personal

# 2. Upload to enterprise CAS account
aic aliyun-cert:upload my-cert \
  ~/.acme.sh/cdn.example.com/fullchain.cer \
  ~/.acme.sh/cdn.example.com/cdn.example.com.key \
  -p enterprise

# 3. List to get CertId
aic aliyun-cert:list -p enterprise

# 4. Deploy to FC (using enterprise account)
# ... FC deployment steps
```

## DNS Providers

Supported providers for ACME DNS verification:
- `aliyun` - Aliyun DNS (default, uses credentials from config)
- `cloudflare` - Cloudflare (requires CLOUDFLARE_API_KEY env var)
- `dnspod` - DNSPod (requires DNSPOD_API_KEY env var)

## Notes

- All commands output JSON to stdout
- Status messages and progress go to stderr
- Private bucket URLs are automatically signed
- File keys are case-sensitive
- DNS changes take effect immediately, CDN changes take 5-10 minutes
- Use `--profile` to specify which Aliyun account to use when managing multiple accounts
