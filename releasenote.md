## 发布日志

### 新增（Terre 后端 API - webgal_agent 配套）

- 场景读取：GET `/api/manageGame/readScene/:gameName/:sceneName`
  - `sceneName` 可带或不带 `.txt`，返回 `{ sceneName, content }`
- 场景插入：POST `/api/manageGame/insertScene`
  - 支持 `start | end | afterLine` 三种插入模式（`afterLine` 为 1 基，下标 0 表示文件开头，超出自动追加到末尾）
- 场景列表：GET `/api/manageGame/listScenes/:gameName`
  - 返回当前游戏 `game/scene` 目录下的 `.txt` 场景文件

> 以上接口与既有接口保持兼容：创建场景 `POST /createNewScene`，覆盖编辑 `POST /editScene`。

---

### 在此版本中

#### 新功能

新增全局暗色主题，并优化各编辑器和资源视图的暗色样式

新增模板和字体配置

新增快速同步特效

动画编辑器支持舞台等更多目标，扩展动画能力

集成 Steamworks.js，提供 Steam 功能的图形化编辑器

导出游戏增加展示到 WebGAL 主页的示例提示和指引链接

#### 修复

修复资源路径编码问题，提升多平台打包稳定性

优化模板编辑器侧边栏样式

修复提交参数顺序问题

修复误改 say 命令的问题

<!-- English Translation -->
## Release Notes

### In this version

#### New Features

Added a global dark theme and polished dark-mode styles across editors and resource views

Added template and font configuration

Added a fast sync effect

Animation editor now supports stage and other targets to expand animation capabilities

Integrated Steamworks.js with a graphical editor for Steam functions

Added showcase hints and a guide link on the export tab to feature games on the WebGAL homepage

#### Fixes

Fixed resource path encoding to stabilize multi-platform packaging

Improved template editor sidebar styling

Fixed submit argument order

Fixed accidental change from `say` to comment

<!-- Japanese Translation -->
## リリースノート

### このバージョンでは

#### 新機能

グローバルなダークテーマを追加し、各エディターやリソース表示のダークモードスタイルを整えました

テンプレートとフォントの設定を追加しました

高速同期エフェクトを追加しました

アニメーションエディターでステージなどのターゲットを選べるようにし、表現を拡張しました

Steamworks.js を統合し、Steam 機能のグラフィカルエディターを追加しました

エクスポートタブに WebGAL ホームページ掲載用のショーケースヒントとガイドリンクを追加しました

#### 修正

リソースパスのエンコードを修正し、マルチプラットフォームのパッケージングを安定させました

テンプレートエディターのサイドバー表示を修正しました

送信引数の順序を修正しました

誤って `say` を comment に置き換えた問題を修正しました