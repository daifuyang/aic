---
name: aic
description: Cloud resources management CLI for Qiniu storage, CDN, DNS, and SSL certificates
---

## Overview

AIC is a command-line tool for managing cloud resources including Qiniu storage, CDN domains, Aliyun DNS, and SSL certificates via ACME DNS verification.

## Installation

```bash
git clone https://github.com/your-repo/aic.git
cd aic
npm install
npm run build
npm install -g  # or npm link for development
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

[aliyun]
accessKeyId = "your_access_key_id"
accessKeySecret = "your_access_key_secret"

[acme]
path = "~/.acme.sh/acme.sh"
dnsProvider = "aliyun"
email = "your@email.com"
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

### SSL Certificates

#### Issue certificate (ACME DNS)
```bash
aic cert:issue <domains...> [options]
```
- `-d, --dns-provider <provider>` - DNS provider: aliyun/cloudflare/dnspod (default: aliyun)
- `-k, --key-length <length>` - RSA key length (default: 4096)
- `-e, --ECC` - Use ECC certificate

```bash
aic cert:issue cdn.example.com
aic cert:issue "*.example.com"
aic cert:issue cdn.example.com -e
aic cert:issue cdn.example.com -d cloudflare
```

#### Upload certificate
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

#### List certificates
```bash
aic cert:list
```

### DNS Management

#### List DNS records
```bash
aic dns:list <domain>
```

#### Add DNS record
```bash
aic dns:add <domain> <rr> <type> <value> [options]
```
- `--ttl <ttl>` - TTL in seconds (default: 600)

```bash
aic dns:add example.com @ A 192.168.1.1
aic dns:add example.com cdn CNAME cdn.qiniudns.com
aic dns:add example.com www A 192.168.1.1 --ttl 300
```

#### Delete DNS record
```bash
aic dns:delete <recordId>
```

#### DNS record info
```bash
aic dns:info <recordId>
```

## Common Workflows

### Complete CDN + HTTPS setup

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
