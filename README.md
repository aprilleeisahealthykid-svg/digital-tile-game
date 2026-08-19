# 数字牌局

一个可以直接部署、分享房间链接、2–4 人实时游玩的在线数字牌游戏。没有账号、广告或任何官方 Rummikub 品牌素材。

## 已实现

- 106 张牌：1–13、四色各两套、2 张 Joker
- Group、Run、Joker、首次 30 分、整桌合法性校验
- 服务器权威发牌、摸牌、提交、回合切换和胜利判断
- 6 位房间码和 `/room/房间码` 分享链接
- 断线、刷新、微信切后台后的身份与手牌恢复
- 本回合草稿、拖动、点选、拆分、合并、撤销、数字/颜色排序
- 手机安全区、触控防滚页、iPhone 竖屏布局
- 规则单元测试和 Socket.IO 双玩家流程测试

## 本地运行（Windows）

### 第一次运行

1. 安装 [Node.js 20 或更高版本](https://nodejs.org/zh-cn/download)。安装时保持默认选项。
2. 打开这个项目文件夹。
3. 在文件夹空白处按住 `Shift` 再点鼠标右键，选择“在终端中打开”。
4. 依次执行：

```powershell
npm install
npm run dev
```

5. 浏览器打开：<http://localhost:5173>

终端窗口不要关闭。停止游戏服务时，在终端按 `Ctrl + C`。

### 本地模拟两名玩家

一个浏览器打开 <http://127.0.0.1:5173>，另一个浏览器或无痕窗口打开 <http://localhost:5173>。两个地址的本地身份互不干扰，可以分别输入昵称加入同一房间。

### 自动测试

```powershell
npm test
npm run typecheck
npm run build
```

## 部署到公网（推荐 Render）

Render 适合这个项目，因为它能运行常驻 Node.js 服务、支持公网 WebSocket，并自动提供 HTTPS。项目根目录已经包含 `render.yaml` 和 `Dockerfile`。

### 第一步：把项目放到 GitHub

Windows 用户最简单的方法是使用 [GitHub Desktop](https://desktop.github.com/)：

1. 登录 GitHub Desktop。
2. 选择 `File → Add local repository`，选中本项目文件夹。
3. 如果提示这不是仓库，点击 `create a repository`。
4. 提交全部文件，再点击 `Publish repository`。

仓库设为公开或私有都可以。

### 第二步：在 Render 部署

1. 打开 [Render 控制台](https://dashboard.render.com/) 并用 GitHub 登录。
2. 点击右上角 `New +`，选择 `Blueprint`。
3. 连接刚才发布的 GitHub 仓库。
4. Render 会读取项目中的 `render.yaml`。确认后点击部署。
5. 等待状态变成 `Live`，打开 Render 给出的 `https://数字牌局名称.onrender.com` 地址。
6. 页面出现“数字牌局”首页，就部署成功了。

Render 官方说明：[部署 Node/Express](https://render.com/docs/deploy-node-express-app)、[WebSocket 支持](https://render.com/docs/websocket)、[Blueprint 配置](https://render.com/docs/blueprint-spec)。

> 免费实例适合朋友试玩，但连续 15 分钟没有 HTTP 请求或 WebSocket 消息后会休眠，下一次打开可能需要约一分钟唤醒。正式约朋友玩之前，房主先打开一次链接。付费实例不会因空闲休眠。详见 [Render 免费实例说明](https://render.com/docs/free)。

### 以后更新

在 GitHub Desktop 提交并推送新代码，Render 会自动重新部署。部署或服务器重启会清空正在进行的内存房间，请在没有开局时更新。

## 微信与 iPhone 测试

1. 用 iPhone Safari 先打开 Render 的 `https://...onrender.com` 链接，确认首页能显示。
2. 房主点击“创建房间”，再点“分享链接”。
3. 选择微信好友；也可以复制地址后粘贴到微信。
4. 好友在微信内点击，页面会直接进入 `/room/六位房间码`，输入昵称即可加入。
5. 房主看到至少两名在线玩家后点击“开始游戏”。
6. 竖屏检查：顶部房间号、当前玩家、牌堆，中间公共牌桌，底部手牌和四个操作按钮都应完整可见。
7. 长按牌约半秒再拖动，验证页面本身不会跟着滚动；也可以点击牌后用“出牌”和“加入所选手牌”。
8. 让一台 iPhone 把微信切到后台 20–30 秒再回来，手牌、牌桌和当前回合应自动恢复。
9. 刷新页面再检查一次恢复。若微信回收了页面，重新点原房间链接即可。

不要在微信里分享 `localhost` 或 `192.168...` 地址；只有部署后的 HTTPS 公网链接能让朋友正常打开。

## 基本操作

- 点击多张手牌，再点“出牌”：创建一个临时牌组。
- 长按并拖动：调整手牌顺序，或在牌桌各组之间移动牌。
- “加入所选手牌”：把选中的手牌放到指定桌面牌组。
- “从选中处拆分”与“并入前组”：重新组合桌面。
- “撤销本回合”：恢复到回合开始时。
- “提交回合”：服务器重新检查整张牌桌，合法才会同步给其他玩家。
- 不出牌时点“摸牌”：服务器随机发 1 张并结束回合。

## 重要说明

第一版房间保存在服务器内存中，因此服务器重启、重新部署或免费实例被平台回收时，房间会消失。这符合当前 MVP 设定。代码中的 `RoomStore` 已与游戏逻辑分开，后续可替换为 Redis；扩展到多台服务器时还需要 Socket.IO Redis Adapter 和共享房间存储。

其他玩家只能收到自己的手牌。摸到哪张牌、牌堆内容、回合归属、首次 30 分、整桌合法性和胜利均由服务器判断；客户端提交伪造牌、重复牌、别人的牌或过期回合都会被拒绝。

## 项目结构

```text
src/       React 手机端界面
server/    Express、Socket.IO、房间与权威游戏逻辑
shared/    前后端共享类型、牌组生成、规则引擎
```
