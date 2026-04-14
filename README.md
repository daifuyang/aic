# AIC - Cloud Resources CLI

云资源管理命令行工具，支持七牛云存储、CDN、阿里云 DNS 以及 SSL 证书管理。

## 安装

```bash
# 克隆项目
git clone https://github.com/your-repo/aic.git
cd aic

# 安装依赖
npm install

# 编译
npm run build

# 全局安装
npm install -g

# 或开发模式（修改代码后立即生效）
npm link
```

安装后，在任何目录直接使用 `aic` 命令。

## 配置

配置文件位置：`~/.config/aic/config.toml`

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

## 命令

### 存储操作
```bash
aic upload file.png                    # 上传文件
aic list                               # 列出文件
aic url image.png                      # 生成私有 URL
aic url image.png -e 86400            # 24 小时有效期
aic delete image.png                   # 删除文件
aic stat image.png                     # 文件信息
aic copy src.png dest.png             # 复制
aic move old.png new.png              # 移动
```

### CDN 管理
```bash
aic cdn:create cdn.example.com --bucket my-bucket
aic cdn:list
aic cdn:info cdn.example.com
aic cdn:online cdn.example.com
aic cdn:offline cdn.example.com
aic cdn:delete cdn.example.com
```

### SSL 证书
```bash
aic cert:issue cdn.example.com          # 申请证书
aic cert:issue "*.example.com"        # 泛域名
aic cert:issue cdn.example.com -e      # ECC 证书
aic cert:issue cdn.example.com -d cloudflare  # 指定 DNS
aic cert:upload my-cert domain.com cert.pem key.pem
aic cert:bind cdn.example.com <certId>
aic cert:list
```

### DNS 管理
```bash
aic dns:list example.com
aic dns:add example.com @ A 192.168.1.1
aic dns:add example.com cdn CNAME cdn.qiniudns.com
aic dns:delete <recordId>
```

## DNS Provider

支持的 DNS 提供商：aliyun、cloudflare、dnspod

## License

MIT
