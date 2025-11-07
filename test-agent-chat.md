# Agent Chat v1 前端验证与快速上手

本指南帮助你在 Terre 前端中体验“对话 + 工具”工作流：只读工具自动执行；写入类操作（write_to_file / replace_in_file）采用 Dry‑run → 预览 Diff → 手动确认 Apply 的安全流程。

## 0. 前置准备

- 启动后端（默认 4101）：
  ```bash
  cd WebGAL_Terre/packages/terre2
  yarn start:dev
  ```
- 启动前端（默认 4100）：
  ```bash
  cd WebGAL_Terre/packages/origine2
  yarn dev
  ```
- 模板项目根（示例）：
  `/Users/<you>/Developer/webgal_agent/WebGAL_Terre/packages/terre2/assets/templates/WebGAL_Template`

## 1. 连接 MCP

1) 打开 Terre，进入智能助手（Agent）面板 → 点“连接”。
2) 输入项目根路径并确认；连接成功后可在“运行环境”卡片看到：工具清单、Sandbox 限制（maxReadBytes）等。

## 2. 只读链路（自动执行）

在对话中发送：
```
列出 game/scene 目录下的文件，并读取 start.txt 的前 30 行。
```
预期：
- 回复文本 + “执行步骤”列表（绿色勾）
- 步骤包含 list_files、read_file 等，只读工具自动执行

## 3. 写入确认流（Dry‑run → 预览 Diff → Apply）

示例一：追加写入
```
请把字符串「; Chat V1 Apply Test」追加到文件 game/scene/start.txt 的末尾。
只需准备写入：先给我 diff，不要直接写入。
```
操作：
- 消息下方“执行步骤”会出现 write_to_file（黄色“已阻止执行”）和“预览变更”按钮
- 点击“预览变更”弹窗中先显示 diff；确认后点击“确认写入”
- 写入成功后返回 snapshotId / bytesWritten，并自动刷新编辑器与模板预览

示例二：正则替换
```
请用 replace_in_file 将 game/scene/start.txt 中的 "Start" 全部替换为 "Begin"（大小写敏感）。
先给我 Diff，不要直接写入。
```
- 会显示“预览替换”按钮；弹窗会统计命中次数，并基于 write_to_file(dryRun) 给出精准 diff；确认后 Apply

说明：
- 写入类工具始终先 Dry‑run，等待你在 UI 中确认后才会真正写入
- 并发写入会被检测，必要时需重新 Dry‑run

## 4. 错误与重试

- 对话失败（如 LLM 502/网络抖动）会在消息下显示错误横幅（带“一键重试”）
- 过大读取（E_TOO_LARGE）展开详情后会显示当前 maxReadBytes，便于调整策略

## 5. 历史折叠与会话持久化

- 每条消息的“执行步骤”可“折叠/展开”
- 会话自动保存在浏览器本地（localStorage），刷新页面仍会保留；点击“清空对话”可一键重置

## 6. 最小 E2E 验收清单

- [ ] 只读：list_files → read_file 显示绿色完成
- [ ] 写入：write_to_file（Dry‑run 显示 diff → Apply 返回 snapshotId）且编辑器自动刷新
- [ ] 替换：replace_in_file（Dry‑run diff → Apply）正常
- [ ] 错误：模拟失败后出现错误横幅，并可一键重试
- [ ] 折叠：步骤可折叠；刷新后会话记录仍在；“清空对话”可清除记录

## 7. 使用建议与限制

- 建议优先使用 replace_in_file 做小改，全文重写/新建用 write_to_file
- 仅编辑 `game/**` 文本；不要动 `.webgal_agent/**`、`.git/**`、`node_modules/**`
- 写入前尽量校验脚本（validate_script）
- 当前对话历史仅本地持久化（后续可接后端会话存储）

