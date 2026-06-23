# AIC - Cloud Resources CLI

[![CI](https://github.com/daifuyang/aic/actions/workflows/ci.yml/badge.svg)](https://github.com/daifuyang/aic/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@zerocmf/aic.svg)](https://www.npmjs.com/package/@zerocmf/aic)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

云资源管理命令行工具，支持七牛云存储、CDN、阿里云 DNS、SSL 证书以及通知服务（微信公众号、邮件、短信）。

## 功能特性

- **存储操作**: 上传、下载、列表、私有 URL、复制、移动、删除、查看元信息
- **CDN 管理**: 创建、列表、详情、上线、下线、删除域名
- **SSL 证书（七牛云）**: ACME DNS 验证申请证书（支持阿里云/Cloudflare/DNSPod）、上传、绑定、列表、删除、自动续期、清理过期证书
- **SSL 证书（阿里云 CAS）**: 上传、列表、删除
- **DNS 管理**: 列出、添加、删除、查询 DNS 记录
- **通知服务**: 微信公众号模板消息、邮件、短信
- **多 Profile 支持**: 阿里云支持多账号管理

## 安装

```bash
# 从 npm 安装
npm install -g @zerocmf/aic

# 或从源码安装
git clone https://github.com/daifuyang/aic.git
cd aic
npm install
npm run build
npm link
```

## 配置

配置文件位置：`~/.config/aic/config.toml`

可通过环境变量 `AIC_CONFIG` 指定自定义配置文件路径。

完整配置示例请参考 [`config.toml.example`](./config.toml.example)。

```toml
[qiniu]
accessKey = "your_access_key"
secretKey = "your_secret_key"
bucket = "your_bucket"
domain = "cdn.example.com"
region = "z0"

# 阿里云 - 支持多 Profile
# [aliyun] 为默认 profile（只有一个 profile 时可省略 name）
[aliyun]
accessKeyId = "your_access_key_id"
accessKeySecret = "your_access_key_secret"
default-profile = "personal"  # 可选，指定默认 profile 名称

# 命名 profile（使用 --profile 参数指定）
[aliyun.personal]
accessKeyId = "..."
accessKeySecret = "..."

[aliyun.enterprise]
accessKeyId = "..."
accessKeySecret = "..."

[acme]
path = "~/.acme.sh/acme.sh"
dnsProvider = "aliyun"  # aliyun, cloudflare, dnspod
email = "your@email.com"

# 邮件通知
[email]
host = "smtp.example.com"
port = 465
user = "your_email"
pass = "your_password"
from = "your@email.com"
ssl = true

# 短信通知
[sms]
provider = "aliyun"  # aliyun | tencent
accessKeyId = "your_access_key_id"
accessKeySecret = "your_access_key_secret"
signName = "YourSignName"
templateCode = "SMS_xxxxx"

# 微信公众号
[wechat]
appId = "your_app_id"
appSecret = "your_app_secret"
templateId = "your_template_id"
```

### 多 Profile 使用

```bash
# 使用默认 profile
aic dns:list example.com

# 使用指定 profile
aic dns:list example.com -p personal
aic aliyun-cert:list -p enterprise

# 通过环境变量指定
AIC_ALIYUN_PROFILE=personal aic dns:list example.com
```

## 命令

### 存储操作

```bash
aic upload file.png                    # 上传文件
aic upload file.png -k custom.png      # 自定义存储 key
aic upload file.png -p images          # 添加前缀
aic list                               # 列出文件
aic list -p images                     # 按前缀过滤
aic list -l 50                         # 限制返回数量
aic url image.png                      # 生成私有 URL（默认 1 小时）
aic url image.png -e 86400            # 24 小时有效期
aic stat image.png                     # 查看文件元信息
aic copy src.png dest.png             # 复制
aic move old.png new.png              # 移动
aic delete image.png                   # 删除
```

### CDN 管理

```bash
aic cdn:create cdn.example.com --bucket my-bucket
aic cdn:create cdn.example.com --geo global --protocol https
aic cdn:list
aic cdn:info cdn.example.com
aic cdn:online cdn.example.com
aic cdn:offline cdn.example.com
aic cdn:delete cdn.example.com
```

### SSL 证书（七牛云）

```bash
# 申请证书
aic cert:issue cdn.example.com
aic cert:issue "*.example.com"
aic cert:issue cdn.example.com -e                  # ECC 证书
aic cert:issue cdn.example.com -d cloudflare       # 指定 DNS 提供商
aic cert:issue cdn.example.com -k 2048             # 指定 RSA 密钥长度
aic cert:issue cdn.example.com -p enterprise       # 指定阿里云 profile

# 上传、绑定、列出
aic cert:upload my-cert domain.com cert.pem key.pem
aic cert:bind cdn.example.com <certId>
aic cert:bind cdn.example.com <certId> --force-https false
aic cert:list

# 删除
aic cert:delete <certId>

# 自动续期（默认 30 天内过期）
aic cert:renew
aic cert:renew --days 15
aic cert:renew --dry-run                          # 仅查看，不执行

# 清理过期证书
aic cert:prune-expired
aic cert:prune-expired --dry-run
```

### SSL 证书（阿里云 CAS）

```bash
aic aliyun-cert:upload my-cert cert.pem key.pem
aic aliyun-cert:upload my-cert cert.pem key.pem -p enterprise
aic aliyun-cert:list
aic aliyun-cert:list -t CERT                      # 包含所有证书
aic aliyun-cert:list -p enterprise
aic aliyun-cert:delete <certId>                   # certId 为整数
```

### DNS 管理

```bash
aic dns:list example.com
aic dns:list example.com -p enterprise
aic dns:add example.com @ A 192.168.1.1
aic dns:add example.com @ A 192.168.1.1 --ttl 300
aic dns:add example.com cdn CNAME cdn.qiniudns.com
aic dns:info <recordId>                            # 查看单条记录详情
aic dns:delete <recordId>
```

### 通知服务

```bash
# 微信公众号 - 简化通知
aic notify:send <openid> "标题" "内容"
aic notify:send <openid> "标题" "内容" -u "https://example.com"
aic notify:send <openid> "标题" "内容" -r "备注" -t "系统通知"

# 微信公众号 - 自定义模板
aic notify:wechat <openid> '{"first":{"value":"标题"}}' -t <templateId>
aic notify:wechat <openid> '{"first":{"value":"标题"}}' -u "https://example.com"

# 邮件
aic notify:email user@example.com "主题" "邮件内容"

# 短信
aic notify:sms 13800138000 '["参数1","参数2"]'
```

## DNS Provider

支持的 DNS 提供商：aliyun、cloudflare、dnspod

## License

MIT
