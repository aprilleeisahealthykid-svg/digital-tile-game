# 数字牌局

一个可以直接部署、分享房间链接、2–4 人实时游玩的在线数字牌游戏。没有账号、广告或任何官方 Rummikub 品牌素材。

## 已实现

- 106 张牌：1–13、四色各两套、2 张 Joker
- Group、Run、Joker、首次 30 分、整桌合法性校验
- 服务器权威发牌、摸牌、提交、回合切换和胜利判断
- 6 位房间码和 `/room/房间码` 分享链接
- 创建房间时可选择「55 秒模式」或「自由模式」
- 55 秒模式由服务器权威计时，超时自动摸 1 张牌并切换回合
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

## 部署到公网（Railway）

本项目已经部署到 Railway，正式地址是：

<https://digital-tile-game-production.up.railway.app>

Railway 能运行本项目的 Node.js 与 WebSocket 服务，并自动提供 HTTPS。当前服务只保留一个东南亚节点，并已开启 Serverless 空闲休眠，以降低中国用户的延迟并尽量控制在免费额度内。

### 已完成的账号与项目

- GitHub 源码：<https://github.com/aprilleeisahealthykid-svg/digital-tile-game>
- Railway 项目名：`digital-tile-game`
- 公网域名：`digital-tile-game-production.up.railway.app`
- 健康检查：<https://digital-tile-game-production.up.railway.app/api/health>

### Windows 上重新部署

平时不需要重新部署。只有修改代码后才执行下面的步骤：

1. 打开项目文件夹，在空白处按住 `Shift` 再点鼠标右键，选择“在终端中打开”。
2. 安装 Railway 官方工具并登录：

```powershell
npm install -g @railway/cli
railway login
```

3. 如果当前文件夹尚未连接项目，执行 `railway link`，选择 `digital-tile-game`。
4. 运行测试和构建：

```powershell
npm test
npm run typecheck
npm run build
```

5. 上传新版本：

```powershell
railway up
```

6. 在 Railway 的服务页面等待状态变成 `Success`，再打开正式地址检查。

部署或服务器重启会清空正在进行的内存房间，因此请在没有开局时更新。

### 免费额度说明

新账号当前先使用 30 天或 5 美元的试用额度；试用结束后会回到每月 1 美元免费额度。项目已开启 `Settings → Deploy → Serverless`，没有玩家时服务约 10 分钟后休眠，休眠时不产生计算用量。休眠后的第一次打开可能稍慢，极少数情况下首次请求可能需要刷新一次。正式约朋友玩之前，房主先打开链接等待首页出现。

官方说明：[Railway 免费试用](https://docs.railway.com/pricing/free-trial)、[套餐与免费额度](https://docs.railway.com/pricing/plans)、[Serverless 休眠](https://docs.railway.com/deployments/serverless)。免费额度和平台规则可能调整，请偶尔查看 Railway 的 `Usage` 页面。

## 微信与 iPhone 测试

1. 用 iPhone Safari 先打开 <https://digital-tile-game-production.up.railway.app>，确认首页能显示。
2. 房主点击“创建房间”，再点“分享链接”。
3. 选择微信好友；也可以复制地址后粘贴到微信。
4. 好友在微信内点击，页面会直接进入 `/room/六位房间码`，输入昵称即可加入。
5. 房主看到至少两名在线玩家后点击“开始游戏”。
6. 竖屏检查：顶部房间号、当前玩家、牌堆，中间公共牌桌，底部手牌和四个操作按钮都应完整可见。
7. 长按牌约半秒再拖动，验证页面本身不会跟着滚动；也可以点击牌后用“出牌”和“加入所选手牌”。
8. 让一台 iPhone 把微信切到后台 20–30 秒再回来，手牌、牌桌和当前回合应自动恢复。
9. 刷新页面再检查一次恢复。若微信回收了页面，重新点原房间链接即可。

不要在微信里分享 `localhost` 或 `192.168...` 地址；只有部署后的 HTTPS 公网链接能让朋友正常打开。

2026 年 8 月 19 日已从当前中国网络完成 HTTP、HTTPS 和 WebSocket 双玩家实测，并将服务部署在东南亚节点。海外免费域名无法保证中国所有地区、运营商或微信版本始终可达；如果个别朋友打不开，先在 Safari 打开一次或切换移动网络/Wi-Fi。若未来需要面向中国大陆长期、稳定、可承诺的访问，应使用自己的域名、完成 ICP 备案并迁移到中国大陆云服务，这通常不是免费的。

## 基本操作

- 创建房间前选择模式：55 秒模式适合快节奏对局；自由模式不限思考时间。
- 点击多张手牌，再点“出牌”：创建一个临时牌组。
- 长按并拖动：调整手牌顺序，或在牌桌各组之间移动牌。
- “加入所选手牌”：把选中的手牌放到指定桌面牌组。
- “从选中处拆分”与“并入前组”：重新组合桌面。
- “撤销本回合”：恢复到回合开始时。
- “提交回合”：服务器重新检查整张牌桌，合法才会同步给其他玩家。
- 不出牌时点“摸牌”：服务器随机发 1 张并结束回合。
- 55 秒模式倒计时归零时，服务器会自动摸牌并结束当前玩家的回合；尚未提交的临时操作不会生效。

## 重要说明

第一版房间保存在服务器内存中，因此服务器重启、重新部署或免费实例被平台回收时，房间会消失。这符合当前 MVP 设定。代码中的 `RoomStore` 已与游戏逻辑分开，后续可替换为 Redis；扩展到多台服务器时还需要 Socket.IO Redis Adapter 和共享房间存储。

其他玩家只能收到自己的手牌。摸到哪张牌、牌堆内容、回合归属、首次 30 分、整桌合法性和胜利均由服务器判断；客户端提交伪造牌、重复牌、别人的牌或过期回合都会被拒绝。

## 项目结构

```text
src/       React 手机端界面
server/    Express、Socket.IO、房间与权威游戏逻辑
shared/    前后端共享类型、牌组生成、规则引擎
```
