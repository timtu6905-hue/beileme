# 背了么

九年级英语单词在线背诵工具，提供单词卡片、发音、分单元学习、四轮考核、错题复习与学习进度保存。

在线网站：https://tznb.top/

## 开始使用

直接用浏览器打开 `site/index.html`，即可使用本机学习模式。使用“游客试学”可以体验；数据保存在当前浏览器，清理浏览器数据会影响本机记录，请使用页面的导出功能备份。浏览器与设备决定英文发音是否可用。

需要用 HTTP 访问时，可以在仓库目录运行 `python -m http.server 8000 --directory site`，然后打开 http://localhost:8000 。

## 文件结构

- `site/index.html`：单文件前端，包含页面样式、词汇、例句和学习逻辑。
- `site/_worker.js`：Cloudflare Pages 后端，处理注册、登录和进度保存。
- `site/_headers`：静态资源的响应头。
- `site/robots.txt`、`site/sitemap.xml`：搜索引擎配置。
- `backend/schema.sql`：D1 数据库建表语句，只有表结构，没有用户数据。
- `wrangler.example.toml`：部署配置示例，需要换成自己的数据库 ID。

## 部署到 Cloudflare Pages

1. 在自己的 Cloudflare 账号创建 D1 数据库，例如 `beileme-db`。
2. 在数据库控制台执行 `backend/schema.sql` 中的建表语句。
3. 将 `wrangler.example.toml` 复制为 `wrangler.toml`，填入刚创建的数据库 ID，并设置自己的 Pages 项目名称。
4. 安装当前版本的官方 Wrangler 工具并登录 Cloudflare，在此目录运行 `npx wrangler pages deploy site --project-name=beileme`；如果使用其他项目名称，请相应替换。
5. 确认 Pages 生产环境的 D1 绑定名称为 `DB`，指向自己的数据库；绑定变更后重新部署。
6. 访问 `/api/ping`，应返回 `{"ok":true,"mode":"cloud"}`。再注册一个自己的测试账号，检查学习进度在重新登录后能恢复。

前端请求同域名下的 `/api/*`。没有部署后端时使用本机模式；单独放到 GitHub Pages 不会获得云端账号和进度同步。仓库公开不等于自动发布网站。

使用自己的域名时，请更新 `site/index.html` 的 canonical / Open Graph 链接，以及 `robots.txt`、`sitemap.xml` 中的网址。

## 数据与实现说明

- 词汇按 Unit 1–8 组织，包含 486 个单词与短语。
- 发音使用浏览器 `speechSynthesis`，可用语音取决于设备。
- 本机模式使用 `localStorage`；云端模式使用 Cloudflare D1。
- 后端使用 PBKDF2 加盐处理密码，通过 Bearer 会话令牌认证进度接口。
- 这是面向学习的项目：现有后端未包含专门的登录限流、邮箱找回或管理员系统，公开运营时应按实际需要完善。

## 本次开源版本的来源

前端取自 2026 年 10 月 21 日公开网站的实际响应，去除了 Cloudflare 动态注入的挑战校验脚本；后端来自作者本地保存的 Pages Worker 源码，无法仅凭公开网页确认它与生产后端完全相同。

仓库不包含生产数据库、注册用户、会话令牌、Cloudflare 登录状态、真实数据库 ID、搜索引擎验证文件或微信小程序。现有网站和 DNS 设置没有因本次开源而改动。

## 许可

原创程序代码以 MIT 许可证开源，见 [LICENSE](LICENSE)。第三方教材名称、词汇释义及注明来源的例句等内容不因此获得新的授权，相关权利归原权利人。
